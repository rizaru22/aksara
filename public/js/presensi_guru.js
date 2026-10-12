window.createAksaraTeacherAttendance = function ({ $, api, showToast, setFeature, setFeatureError, featureModal }) {
    let maxGpsAccuracy = 40;
    const captureModule = window.createAksaraAttendanceCapture();
    let checkInWindowTimer;

    async function refreshAttendance() {
        try {
            const result = await api('/api/v1/teacher/attendance/today');
            maxGpsAccuracy = Number(result.gps_accuracy_limit_meters) || 40;
            const item = result.data;
            const holiday = result.holiday;
            const leave = result.approved_leave;
            clearTimeout(checkInWindowTimer);
            const secondsUntilCheckIn = Number(result.check_in_seconds_until) || 0;
            if (secondsUntilCheckIn > 0 && secondsUntilCheckIn < 2147483) {
                checkInWindowTimer = setTimeout(refreshAttendance, secondsUntilCheckIn * 1000 + 500);
            }
            if (holiday) {
                const holidayType = { NASIONAL: 'Libur nasional', CUTI_BERSAMA: 'Cuti bersama', SEKOLAH: 'Libur sekolah', MINGGU: 'Hari Minggu' }[holiday.jenis] || 'Hari libur';
                $('checkIn').disabled = true;
                $('checkOut').disabled = true;
                $('attendanceState').textContent = `${holidayType}: ${holiday.nama}. Tombol absen masuk dan pulang dinonaktifkan hari ini.`;
                return;
            }
            if (leave) {
                const start = leave.tanggal_mulai;
                const end = leave.tanggal_selesai;
                const dateRange = start === end ? start : `${start}–${end}`;
                const existingCheckIn = Boolean(item?.jam_masuk);
                $('attendanceState').textContent = `Izin/cuti disetujui (${dateRange}). Absen masuk dinonaktifkan.${existingCheckIn && !item.jam_pulang ? ' Absen pulang tersedia untuk melengkapi presensi yang sudah tercatat.' : ''}`;
                $('checkIn').disabled = true;
                $('checkOut').disabled = !existingCheckIn || Boolean(item?.jam_pulang);
                return;
            }
            if (!item || !item.jam_masuk) {
                $('attendanceCorrectionActions').hidden = true;
                const opensAt = result.check_in_opens_at || '07:00';
                const tooEarly = result.check_in_available === false;
                $('attendanceState').textContent = tooEarly
                    ? `Absen masuk dibuka pukul ${opensAt}. Tombol akan aktif setelah waktu tersebut.`
                    : `Belum melakukan absen masuk hari ini. Absen dibuka pukul ${opensAt}.`;
                $('checkIn').disabled = tooEarly;
                $('checkOut').disabled = true;
                return;
            }
            const checkoutStatus = item.status_waktu_pulang ? ` · ${item.status_waktu_pulang.replaceAll('_', ' ')}` : '';
            $('attendanceState').textContent = `Masuk ${item.jam_masuk || '—'} · ${item.status_verifikasi_masuk} · Pulang ${item.jam_pulang || 'belum tercatat'}${item.jam_pulang ? ` · ${item.status_verifikasi_pulang || 'PENDING'}` : ''}${checkoutStatus}`;
            $('checkIn').disabled = Boolean(item.jam_masuk);
            $('checkOut').disabled = !item.jam_masuk || Boolean(item.jam_pulang);
            renderCorrectionActions(item);
        } catch (error) {
            $('attendanceState').textContent = error.message;
            $('checkIn').disabled = true;
            $('checkOut').disabled = true;
        }
    }

    function renderCorrectionActions(item) {
        const container = $('attendanceCorrectionActions');
        const sessions = ['masuk', 'pulang'].filter((session) => item[`status_verifikasi_${session}`] === 'REJECTED');
        if (!sessions.length) {
            container.hidden = true;
            container.innerHTML = '';
            return;
        }

        const corrections = item.corrections || [];
        container.hidden = false;
        container.innerHTML = `<div class="alert alert-danger py-2 small mb-2">Ada sesi presensi yang ditolak. Periksa catatan admin${item.catatan_admin ? `: ${escapeHtml(item.catatan_admin)}` : ''}, lalu ajukan koreksi jika diperlukan.</div>${sessions.map((session) => {
            const latest = corrections.find((entry) => entry.session === session);
            if (latest?.status === 'PENDING') return `<div class="small text-warning mb-2">Koreksi absen ${session} sedang menunggu tinjauan admin.</div>`;
            const previousDecision = latest?.status === 'REJECTED'
                ? `<div class="small text-secondary mb-2">Koreksi sebelumnya ditolak${latest.review_note ? `: ${escapeHtml(latest.review_note)}` : '.'}</div>`
                : '';
            return `${previousDecision}<button type="button" class="btn btn-outline-danger btn-sm me-2 mb-2" data-attendance-correction="${session}" data-attendance-id="${item.id}"><i class="bi bi-arrow-repeat"></i> Ajukan koreksi absen ${session}</button>`;
        }).join('')}`;
        container.querySelectorAll('[data-attendance-correction]').forEach((button) => button.addEventListener('click', () => openCorrectionForm(button.dataset.attendanceId, button.dataset.attendanceCorrection)));
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
    }

    function openCorrectionForm(attendanceId, session) {
        const label = session === 'masuk' ? 'Absen masuk' : 'Absen pulang';
        setFeature('Ajukan Koreksi Presensi', `<form id="attendanceCorrectionForm"><div class="alert alert-info small">Jelaskan mengapa keputusan penolakan perlu ditinjau ulang. Admin akan memeriksa alasan dan bukti tambahan Anda.</div><div class="mb-3"><label class="form-label" for="attendanceCorrectionReason">Alasan koreksi <span class="text-danger">*</span></label><textarea class="form-control" id="attendanceCorrectionReason" name="reason" rows="4" minlength="5" maxlength="2000" required placeholder="Tuliskan penjelasan dengan jelas"></textarea></div><div class="mb-3"><label class="form-label" for="attendanceCorrectionEvidence">Bukti tambahan (opsional)</label><input class="form-control" id="attendanceCorrectionEvidence" name="evidence" type="file" accept="image/jpeg,image/png,image/webp"><div class="form-text">JPG, PNG, atau WebP. Maksimal 5 MB.</div></div><div class="d-flex gap-2"><button class="btn btn-outline-secondary" type="button" data-dismiss-correction>Batal</button><button class="btn btn-primary" type="submit">Kirim koreksi ${label.toLowerCase()}</button></div></form>`);

        $('featureContent').querySelector('[data-dismiss-correction]').addEventListener('click', () => featureModal.hide());
        $('attendanceCorrectionForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const button = form.querySelector('[type="submit"]');
            const body = new FormData(form);
            body.append('session', session);
            button.disabled = true;
            try {
                await api(`/api/v1/teacher/attendance/${attendanceId}/corrections`, { method: 'POST', body });
                featureModal.hide();
                showToast('Koreksi terkirim dan menunggu tinjauan admin.');
                await refreshAttendance();
            } catch (error) {
                button.disabled = false;
                setFeatureError(error);
            }
        });
    }

    function findPreciseLocation(status, preflight, signal, action = 'check-in') {
        if (!navigator.geolocation) return Promise.reject(new Error('Browser ini tidak menyediakan GPS.'));
        if (signal?.aborted) return Promise.reject(new DOMException('Pencarian lokasi dibatalkan.', 'AbortError'));
        return new Promise((resolve, reject) => {
            let watchId;
            let timer;
            let checking = false;
            let settled = false;
            let abortHandler;
            const finish = (callback, value) => {
                if (settled) return;
                settled = true;
                if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
                clearTimeout(timer);
                if (abortHandler) signal?.removeEventListener('abort', abortHandler);
                callback(value);
            };
            abortHandler = () => finish(reject, new DOMException('Pencarian lokasi dibatalkan.', 'AbortError'));
            signal?.addEventListener('abort', abortHandler, { once: true });
            status.textContent = 'Mencari GPS akurasi tinggi. Tetap di area terbuka…';
            watchId = navigator.geolocation.watchPosition(async (position) => {
                const accuracy = Number(position.coords.accuracy);
                status.textContent = `Akurasi GPS saat ini ±${Math.ceil(accuracy)} m. Batas ≤${maxGpsAccuracy} m…`;
                if (accuracy > maxGpsAccuracy || checking) return;
                checking = true;
                const location = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy,
                    action,
                };
                try {
                    if (preflight) {
                        status.textContent = 'Akurasi GPS tercapai. Memeriksa jarak ke area sekolah…';
                        const check = await api('/api/v1/teacher/attendance/location-check', { method: 'POST', body: location });
                        if (!check.accepted) {
                            const distance = Math.round(check.distance_meters);
                            finish(reject, new Error(`Lokasi berada di luar area sekolah (${distance} m dari titik sekolah, batas ${check.radius_meters} m).`));
                            return;
                        }
                        if (!check.within) {
                            const distance = Math.round(check.distance_meters);
                            status.textContent = `Lokasi di luar area sekolah (${distance} m dari titik sekolah, batas ${check.radius_meters} m), tetapi mode non-strict aktif. Presensi akan ditandai untuk review admin.`;
                        }
                    }
                    finish(resolve, location);
                } catch (error) {
                    finish(reject, error);
                } finally {
                    checking = false;
                }
            }, (error) => {
                if (error.code === error.TIMEOUT) {
                    status.textContent = 'GPS belum mendapat posisi akurat. Tetap di area terbuka, sedang mencoba lagi…';
                    return;
                }
                const message = error.code === error.PERMISSION_DENIED
                    ? 'Izin lokasi ditolak. Aktifkan GPS dan izinkan lokasi untuk situs ini.'
                    : error.code === error.POSITION_UNAVAILABLE
                        ? 'Lokasi GPS belum tersedia. Periksa pengaturan lokasi perangkat dan coba lagi.'
                        : 'Pencarian GPS melewati batas waktu. Coba lagi di area terbuka.';
                finish(reject, new Error(message));
            }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
            if (settled) navigator.geolocation.clearWatch(watchId);
            timer = setTimeout(() => finish(reject, new Error('Akurasi GPS belum mencapai 3 meter setelah 60 detik. Pastikan GPS aktif dan coba lagi di area terbuka.')), 60000);
        });
    }

    async function submitAttendance(action, location, photo, livenessType) {
        const form = new FormData();
        form.append('latitude', location.latitude);
        form.append('longitude', location.longitude);
        form.append('accuracy', location.accuracy);
        if (photo) form.append('photo', photo, `presensi-${action}.jpg`);
        if (livenessType) form.append('liveness_type', livenessType);
        const reason = $('earlyReason')?.value?.trim();
        if (reason) form.append('reason', reason);
        await api(`/api/v1/teacher/attendance/${action}`, { method: 'POST', body: form });
        featureModal.hide();
        showToast(action === 'check-in' ? 'Absen masuk berhasil dicatat.' : 'Absen pulang berhasil dicatat.');
        refreshAttendance();
    }

    async function startCheckIn() {
        $('featureModal').querySelector('.modal-content').classList.remove('attendance-camera-active');
        setFeature('Absen Masuk · Verifikasi Lokasi dan Wajah', `
            <div class="attendance-long-help alert alert-info small">Aplikasi mencari GPS dengan akurasi maksimal ${maxGpsAccuracy} meter dan memeriksa area sekolah. Setelah lolos, ikuti arahan kamera dan kedipkan mata satu kali.</div>
            <div class="attendance-capture-status alert alert-secondary mb-3" id="attendanceCaptureStatus" role="status" aria-live="polite">Menyiapkan pencarian lokasi…</div>
            <div class="attendance-camera" id="attendanceCamera" hidden><div class="attendance-camera-frame"><video id="attendanceCameraVideo" autoplay muted playsinline></video><div class="attendance-face-guide" id="attendanceFaceGuide" aria-hidden="true"><span></span></div></div><p class="small text-secondary mt-2 mb-0">Pastikan wajah terang, tidak membelakangi jendela/cahaya, dan berada di dalam lingkaran.</p></div>
            <button type="button" class="btn btn-outline-secondary w-100 mt-3" id="cancelAttendanceCapture">Batal</button>`);

        const status = $('attendanceCaptureStatus');
        const camera = $('attendanceCamera');
        const cancel = $('cancelAttendanceCapture');
        const controller = new AbortController();
        const cancelCapture = () => controller.abort();
        $('featureModal').addEventListener('hidden.bs.modal', cancelCapture, { once: true });
        cancel.addEventListener('click', () => featureModal.hide());
        try {
            const location = await findPreciseLocation(status, true, controller.signal);
            if (controller.signal.aborted) return;
            $('featureModal').querySelector('.modal-content').classList.add('attendance-camera-active');
            camera.hidden = false;
            status.className = 'attendance-capture-status alert alert-primary mb-2';
            status.textContent = 'Lokasi sesuai geofence. Membuka kamera depan…';
            const result = await captureModule.capture($('attendanceCameraVideo'), $('attendanceFaceGuide'), status, controller.signal);
            if (controller.signal.aborted) return;
            cancel.disabled = true;
            status.textContent = 'Foto berhasil. Mengirim presensi…';
            await submitAttendance('check-in', location, result.photo, result.livenessType);
        } catch (error) {
            if (error.name !== 'AbortError') setFeatureError(error);
        } finally {
            $('featureModal').removeEventListener('hidden.bs.modal', cancelCapture);
        }
    }

    async function startCheckOut() {
        $('featureModal').querySelector('.modal-content').classList.remove('attendance-camera-active');
        setFeature('Absen Pulang · Verifikasi Lokasi dan Wajah', `
            <div class="attendance-long-help alert alert-info small">Cari GPS dengan akurasi maksimal ${maxGpsAccuracy} meter. Setelah lolos, ikuti arahan kamera dan kedipkan mata satu kali. Jika absen di luar jadwal, isi alasan yang diminta.</div>
            <div class="attendance-checkout-reason mb-3"><label class="form-label" for="earlyReason">Alasan di luar jadwal (isi bila diminta)</label><textarea class="form-control" id="earlyReason" rows="2" maxlength="2000" placeholder="Contoh: tugas sekolah / keperluan mendesak"></textarea></div>
            <div class="attendance-capture-status alert alert-secondary mb-3" id="attendanceCaptureStatus" role="status" aria-live="polite">Menyiapkan pencarian lokasi…</div>
            <div class="attendance-camera" id="attendanceCamera" hidden><div class="attendance-camera-frame"><video id="attendanceCameraVideo" autoplay muted playsinline></video><div class="attendance-face-guide" id="attendanceFaceGuide" aria-hidden="true"><span></span></div></div><p class="small text-secondary mt-2 mb-0">Pastikan wajah terang, tidak membelakangi jendela/cahaya, dan berada di dalam lingkaran.</p></div>
            <button type="button" class="btn btn-outline-secondary w-100 mt-3" id="cancelAttendanceCapture">Batal</button>`);

        const status = $('attendanceCaptureStatus');
        const camera = $('attendanceCamera');
        const cancel = $('cancelAttendanceCapture');
        const controller = new AbortController();
        const cancelCapture = () => controller.abort();
        $('featureModal').addEventListener('hidden.bs.modal', cancelCapture, { once: true });
        cancel.addEventListener('click', () => featureModal.hide());
        try {
            const location = await findPreciseLocation(status, true, controller.signal, 'check-out');
            if (controller.signal.aborted) return;
            $('featureModal').querySelector('.modal-content').classList.add('attendance-camera-active');
            camera.hidden = false;
            status.className = 'attendance-capture-status alert alert-primary mb-2';
            status.textContent = 'Lokasi sesuai geofence. Membuka kamera depan…';
            const result = await captureModule.capture($('attendanceCameraVideo'), $('attendanceFaceGuide'), status, controller.signal);
            if (controller.signal.aborted) return;
            cancel.disabled = true;
            status.textContent = 'Foto berhasil. Mengirim absen pulang…';
            await submitAttendance('check-out', location, result.photo, result.livenessType);
        } catch (error) {
            if (error.name !== 'AbortError') setFeatureError(error);
        } finally {
            $('featureModal').removeEventListener('hidden.bs.modal', cancelCapture);
        }
    }

    function attendanceDialog(action) {
        if (action === 'check-in') {
            startCheckIn();
            return;
        }
        startCheckOut();
    }

    return { refreshAttendance, attendanceDialog };
};
