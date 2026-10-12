window.createAksaraModeration = function ({ $, api, htmlSafe, setFeature, showToast, token }) {
    let photoUrl = null;

    async function openFlagged(page = 1, correctionPage = 1) {
        try {
            const [result, correctionResult] = await Promise.all([
                api(`/api/v1/admin/flagged-attendances?page=${page}`),
                api(`/api/v1/admin/attendance-corrections?page=${correctionPage}`),
            ]);
            const items = Array.isArray(result.data) ? result.data : [];
            const corrections = Array.isArray(correctionResult.data) ? correctionResult.data : [];
            const currentPage = Number(result.current_page || page);
            const lastPage = Math.max(1, Number(result.last_page || 1));
            const total = Number(result.total || 0);
            const correctionCurrentPage = Number(correctionResult.current_page || correctionPage);
            const correctionLastPage = Math.max(1, Number(correctionResult.last_page || 1));
            const waitingStatuses = ['PENDING', 'FLAGGED'];

            if (!items.length && currentPage > lastPage) return openFlagged(lastPage, correctionCurrentPage);
            if (!corrections.length && correctionCurrentPage > correctionLastPage) return openFlagged(currentPage, correctionLastPage);

            const records = items.map((item) => {
                const sessions = ['masuk', 'pulang'].filter((session) => waitingStatuses.includes(item[`status_verifikasi_${session}`]));
                const sessionContent = sessions.map((session) => {
                    const label = session === 'masuk' ? 'Absen masuk' : 'Absen pulang';
                    const status = item[`status_verifikasi_${session}`];
                    const time = item[`jam_${session}`] || 'Waktu tidak tercatat';
                    return `<details class="moderation-session border rounded p-3 mt-2"><summary class="d-flex flex-wrap align-items-center justify-content-between gap-2"><span><strong>${label}</strong> <span class="text-secondary">${htmlSafe(time)}</span></span><span class="badge text-bg-warning">${htmlSafe(status)}</span></summary><div class="pt-3">${item[`foto_${session}`] ? `<button class="btn btn-outline-primary btn-sm mb-2" type="button" data-attendance-photo="${item.id}" data-photo-session="${session}"><i class="bi bi-image"></i> Lihat foto</button>` : '<div class="small text-secondary mb-2">Foto bukti tidak tersedia.</div>'}<label class="form-label small mb-1" for="review-note-${item.id}-${session}">Catatan admin <span class="text-secondary">(opsional)</span></label><textarea class="form-control form-control-sm mb-2" rows="2" id="review-note-${item.id}-${session}" placeholder="Tambahkan catatan bila diperlukan"></textarea><div class="d-flex gap-2"><button class="btn btn-success btn-sm" data-review-id="${item.id}" data-review-session="${session}" data-decision="APPROVED">Setujui</button><button class="btn btn-outline-danger btn-sm" data-review-id="${item.id}" data-review-session="${session}" data-decision="REJECTED">Tolak</button></div></div></details>`;
                }).join('');
                return `<article class="card mb-2"><div class="card-body p-3"><div class="d-flex flex-wrap justify-content-between align-items-start gap-2"><div><h3 class="h6 mb-1">${htmlSafe(item.user?.nama || 'Nama tidak tersedia')}</h3><div class="small text-secondary">${htmlSafe(item.tanggal)}${item.user?.nip ? ` · NIP ${htmlSafe(item.user.nip)}` : ''}</div></div><span class="badge text-bg-primary">${sessions.length} sesi menunggu</span></div><div class="small mt-2">Masuk ${htmlSafe(item.jam_masuk || '—')} · Pulang ${htmlSafe(item.jam_pulang || '—')}${item.status_waktu_pulang ? ` · ${htmlSafe(item.status_waktu_pulang.replaceAll('_', ' '))}` : ''}</div>${sessionContent}</div></article>`;
            }).join('');

            const correctionCards = corrections.map((entry) => `<article class="card mb-2"><div class="card-body p-3"><div class="d-flex flex-wrap justify-content-between gap-2"><div><h3 class="h6 mb-1">${htmlSafe(entry.user?.nama || 'Nama tidak tersedia')} · Koreksi absen ${htmlSafe(entry.session)}</h3><div class="small text-secondary">${htmlSafe(entry.attendance?.tanggal || '')} · Waktu tercatat ${htmlSafe(entry.attendance?.[`jam_${entry.session}`] || '—')}</div></div><span class="badge text-bg-info">KOREKSI</span></div><p class="small my-2"><strong>Alasan guru:</strong> ${htmlSafe(entry.reason)}</p>${entry.evidence_photo ? `<button class="btn btn-outline-primary btn-sm mb-2" type="button" data-correction-evidence="${entry.id}"><i class="bi bi-image"></i> Lihat bukti tambahan</button>` : '<div class="small text-secondary mb-2">Tidak ada bukti tambahan.</div>'}<label class="form-label small mb-1" for="correction-review-note-${entry.id}">Catatan admin (opsional)</label><textarea class="form-control form-control-sm mb-2" rows="2" id="correction-review-note-${entry.id}" placeholder="Catatan untuk guru"></textarea><div class="d-flex gap-2"><button class="btn btn-success btn-sm" data-correction-review="${entry.id}" data-decision="APPROVED">Terima koreksi</button><button class="btn btn-outline-danger btn-sm" data-correction-review="${entry.id}" data-decision="REJECTED">Tolak koreksi</button></div></div></article>`).join('');
            const attendancePagination = total > 0 ? `<nav class="d-flex justify-content-between align-items-center gap-2 mt-3" aria-label="Halaman moderasi presensi"><span class="small text-secondary">${total} record · Halaman ${currentPage} dari ${lastPage}</span><div class="btn-group btn-group-sm"><button class="btn btn-outline-secondary" type="button" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>Sebelumnya</button><button class="btn btn-outline-secondary" type="button" data-page="${currentPage + 1}" ${currentPage >= lastPage ? 'disabled' : ''}>Berikutnya</button></div></nav>` : '';
            const correctionPagination = Number(correctionResult.total || 0) > 0 ? `<nav class="d-flex justify-content-between align-items-center gap-2 mt-3" aria-label="Halaman pengajuan koreksi"><span class="small text-secondary">${correctionResult.total} pengajuan · Halaman ${correctionCurrentPage} dari ${correctionLastPage}</span><div class="btn-group btn-group-sm"><button class="btn btn-outline-secondary" type="button" data-correction-page="${correctionCurrentPage - 1}" ${correctionCurrentPage <= 1 ? 'disabled' : ''}>Sebelumnya</button><button class="btn btn-outline-secondary" type="button" data-correction-page="${correctionCurrentPage + 1}" ${correctionCurrentPage >= correctionLastPage ? 'disabled' : ''}>Berikutnya</button></div></nav>` : '';
            const modal = `<div class="modal fade" id="moderationPhotoModal" tabindex="-1" aria-labelledby="moderationPhotoTitle" aria-hidden="true"><div class="modal-dialog modal-dialog-centered modal-lg"><div class="modal-content"><div class="modal-header"><h2 class="modal-title h5" id="moderationPhotoTitle">Foto bukti</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Tutup"></button></div><div class="modal-body text-center"><img id="moderationPhotoImage" class="img-fluid rounded" alt="Foto bukti presensi" style="max-height:75vh;object-fit:contain"><div id="moderationPhotoLoading" class="text-secondary py-5" hidden>Memuat foto...</div></div></div></div></div>`;

            setFeature('Moderasi Presensi', `<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><p class="small text-secondary mb-0">Tinjau presensi dan pengajuan koreksi guru.</p><button class="btn btn-outline-secondary btn-sm" type="button" data-refresh-moderation><i class="bi bi-arrow-clockwise"></i> Muat ulang</button></div><h2 class="h5">Presensi menunggu verifikasi</h2>${items.length ? `${records}${attendancePagination}` : '<p class="small text-secondary">Tidak ada presensi baru yang menunggu.</p>'}<h2 class="h5 mt-4">Pengajuan koreksi dari guru</h2>${corrections.length ? `${correctionCards}${correctionPagination}` : '<p class="small text-secondary">Tidak ada pengajuan koreksi yang menunggu.</p>'}${modal}`);

            document.querySelector('[data-refresh-moderation]')?.addEventListener('click', () => openFlagged(currentPage, correctionCurrentPage));
            document.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => openFlagged(Number(button.dataset.page), correctionCurrentPage)));
            document.querySelectorAll('[data-correction-page]').forEach((button) => button.addEventListener('click', () => openFlagged(currentPage, Number(button.dataset.correctionPage))));
            document.querySelectorAll('[data-review-id]').forEach((button) => button.addEventListener('click', async () => {
                const note = $(`review-note-${button.dataset.reviewId}-${button.dataset.reviewSession}`).value.trim();
                button.disabled = true;
                try {
                    await api(`/api/v1/admin/flagged-attendances/${button.dataset.reviewId}/review`, { method: 'POST', body: { session: button.dataset.reviewSession, decision: button.dataset.decision, note } });
                    await openFlagged(currentPage, correctionCurrentPage);
                } catch (error) { button.disabled = false; showToast(error.message); }
            }));
            document.querySelectorAll('[data-correction-review]').forEach((button) => button.addEventListener('click', async () => {
                button.disabled = true;
                try {
                    const note = $(`correction-review-note-${button.dataset.correctionReview}`).value.trim();
                    await api(`/api/v1/admin/attendance-corrections/${button.dataset.correctionReview}/review`, { method: 'POST', body: { decision: button.dataset.decision, note } });
                    await openFlagged(currentPage, correctionCurrentPage);
                } catch (error) { button.disabled = false; showToast(error.message); }
            }));
            document.querySelectorAll('[data-attendance-photo], [data-correction-evidence]').forEach((button) => button.addEventListener('click', async () => {
                const modalElement = document.getElementById('moderationPhotoModal');
                const image = document.getElementById('moderationPhotoImage');
                const loading = document.getElementById('moderationPhotoLoading');
                const modal = window.bootstrap?.Modal.getOrCreateInstance(modalElement);
                if (!modal) return showToast('Penampil foto tidak dapat dibuka. Muat ulang halaman.');
                image.hidden = true;
                loading.hidden = false;
                modal.show();
                button.disabled = true;
                try {
                    const path = button.dataset.attendancePhoto
                        ? `/api/v1/admin/flagged-attendances/${button.dataset.attendancePhoto}/photo/${button.dataset.photoSession}`
                        : `/api/v1/admin/attendance-corrections/${button.dataset.correctionEvidence}/evidence`;
                    const response = await fetch(window.aksaraApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
                    if (!response.ok) throw new Error('Foto bukti tidak dapat ditampilkan.');
                    if (photoUrl) URL.revokeObjectURL(photoUrl);
                    photoUrl = URL.createObjectURL(await response.blob());
                    image.src = photoUrl;
                    image.hidden = false;
                    loading.hidden = true;
                } catch (error) { modal.hide(); showToast(error.message); }
                finally { button.disabled = false; }
            }));
            document.getElementById('moderationPhotoModal')?.addEventListener('hidden.bs.modal', () => {
                if (photoUrl) URL.revokeObjectURL(photoUrl);
                photoUrl = null;
                document.getElementById('moderationPhotoImage')?.removeAttribute('src');
            }, { once: true });
        } catch (error) {
            setFeature('Moderasi Presensi', `<div class="alert alert-danger mb-0">${htmlSafe(error.message || 'Data moderasi gagal dimuat.')}</div>`);
        }
    }

    return { openFlagged };
};
