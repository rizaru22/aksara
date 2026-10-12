window.createAksaraAdminDashboard = function ({ $, api, htmlSafe }) {
    let reportClockTimer = null;

    // Memperbarui jam real-time yang tampil di rekap admin untuk menunjukkan status terkini secara live.
    function updateReportClock() {
        const clock = $('adminReportClock');
        if (!clock) return;
        clock.textContent = new Intl.DateTimeFormat('en-GB', {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hourCycle: 'h23', timeZone: 'Asia/Jakarta',
        }).format(new Date());
    }

    // Menampilkan daftar guru dalam kategori tertentu seperti hadir, izin, sakit, atau belum check-in.
    function renderTeacherList(teachers, emptyLabel = 'Tidak ada guru pada daftar ini.') {
        return teachers.length ? `<div class="admin-report-list">${teachers.map((teacher) => `<div class="admin-report-person"><i class="bi bi-person-circle text-secondary me-1"></i>${htmlSafe(teacher.nama)}${teacher.nip ? `<span class="text-secondary"> · ${htmlSafe(teacher.nip)}</span>` : ''}</div>`).join('')}</div>` : `<div class="admin-report-list small text-secondary">${htmlSafe(emptyLabel)}</div>`;
    }

    // Membuat bar chart ringkas untuk rekap presensi guru berdasarkan kategori yang dibutuhkan.
    function renderAdminChartRows(labels, values, colors = []) {
        const maxValue = Math.max(1, ...values);
        return labels.map((label, index) => `<div class="admin-chart-row"><span>${htmlSafe(label)}</span><div class="admin-chart-track"><div class="admin-chart-fill ${colors[index] || ''}" style="width:${Math.max(0, Math.min(100, (values[index] / maxValue) * 100))}%"></div></div><strong class="text-end">${htmlSafe(values[index])}</strong></div>`).join('');
    }

    // Mengambil rekap administratif hari ini dan merender ringkasan ke panel admin live report.
    async function loadAdminLiveReport() {
        const target = $('adminLiveReport');
        if (!target) return;
        target.innerHTML = '<div class="card"><div class="card-body text-secondary"><span class="spin"></span>Memuat rekap hari ini...</div></div>';
        try {
            const response = await api('/api/v1/dashboard/admin');
            if (!$('adminLiveReport')) return;
            const data = response.data;
            const chart = data.attendance_chart || { labels: [], values: [] };
            const cards = [
                ['Guru hadir di sekolah', data.present_count, renderTeacherList(data.present_teachers || []), 'present'],
                ['Guru sudah di dalam kelas', data.in_class_teacher_count, renderTeacherList(data.in_class_teachers || []), 'classroom'],
                ['Belum absen masuk', data.not_checked_in_count, renderTeacherList(data.not_checked_in_teachers || []), 'missing'],
                ['Izin', data.leave_count, renderTeacherList(data.leave_teachers || []), 'leave'],
                ['Sakit', data.sick_count, renderTeacherList(data.sick_teachers || []), 'sick'],
                ['Dinas luar', data.outside_duty_count, renderTeacherList(data.outside_duty_teachers || []), 'duty'],
            ];
            const incomplete = data.not_in_class_sessions || [];
            const completeSessions = data.in_class_sessions || [];
            $('adminLiveReport').innerHTML = `<div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3"><div><h2 class="admin-report-title mb-1">Rekap ${htmlSafe(data.date)} · <time id="adminReportClock">${htmlSafe(data.time)}</time></h2><div class="small text-secondary">${htmlSafe(data.meta?.hari || '')}${data.meta?.tahun_ajaran ? ` · Tahun ajaran ${htmlSafe(data.meta.tahun_ajaran)} / ${htmlSafe(data.meta.semester)} · Siklus ${htmlSafe(data.meta.siklus_minggu)}` : ''}</div></div><button class="btn btn-outline-primary btn-sm" id="refreshAdminReport"><i class="bi bi-arrow-clockwise"></i> Perbarui</button></div><div class="row g-3 mb-3">${cards.map(([title, count, people, tone]) => `<div class="col-12 col-md-6 col-xxl-4"><article class="card admin-kpi admin-kpi-${tone} h-100"><div class="card-body"><div class="admin-kpi-caption">${htmlSafe(title)}</div><div class="admin-kpi-number mt-2">${htmlSafe(count)}</div>${people}</div></article></div>`).join('')}</div><div class="row g-3 mb-3"><div class="col-12 col-xl-6"><article class="card h-100"><div class="card-body"><h3 class="card-title">Status presensi guru</h3><p class="small text-secondary">Sebaran guru berdasarkan presensi hari ini.</p>${renderAdminChartRows(chart.labels || [], chart.values || [], ['','warning','warning','danger','warning','danger',''])}</div></article></div><div class="col-12 col-xl-6"><article class="card h-100"><div class="card-body"><h3 class="card-title">Kehadiran pada jam mengajar sekarang</h3><p class="small text-secondary">Kelas berjalan: ${htmlSafe(data.current_sessions_count)} · Sudah lengkap: ${htmlSafe(data.in_class_sessions_count)} · Belum lengkap: ${htmlSafe(data.not_in_class_sessions_count)}</p>${renderAdminChartRows(['Jurnal + presensi siswa lengkap', 'Belum hadir / belum lengkap'], [data.in_class_sessions_count, data.not_in_class_sessions_count], ['', 'warning'])}</div></article></div></div><div class="row g-3"><div class="col-12 col-xl-6"><article class="card h-100"><div class="card-body"><h3 class="card-title">Guru sudah berada di kelas</h3><p class="small text-secondary mb-2">Jurnal terisi dan presensi seluruh siswa pada jadwal berjalan sudah tercatat.</p>${completeSessions.length ? `<div class="table-responsive"><table class="table table-sm admin-report-table"><thead><tr><th>Guru</th><th>Kelas / Mapel</th><th>Jam</th></tr></thead><tbody>${completeSessions.map((session) => `<tr><td>${htmlSafe(session.teacher_name)}</td><td>${htmlSafe(session.class_name)} · ${htmlSafe(session.subject_name)}</td><td>${htmlSafe(session.start)}–${htmlSafe(session.end)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="small text-secondary">Belum ada sesi yang memenuhi bukti jurnal dan presensi siswa lengkap.</div>'}</div></article></div><div class="col-12 col-xl-6"><article class="card h-100"><div class="card-body"><h3 class="card-title">Kelas dan guru belum hadir di kelas</h3><p class="small text-secondary mb-2">Daftar hanya mencakup jadwal yang sedang berlangsung.</p>${incomplete.length ? `<div class="table-responsive"><table class="table table-sm admin-report-table"><thead><tr><th>Kelas / Mapel</th><th>Guru</th><th>Status</th></tr></thead><tbody>${incomplete.map((session) => `<tr><td><strong>${htmlSafe(session.class_name)}</strong><br><span class="small text-secondary">${htmlSafe(session.subject_name)} · ${htmlSafe(session.start)}–${htmlSafe(session.end)}</span></td><td>${htmlSafe(session.teacher_name)}</td><td><span class="badge text-bg-warning admin-session-state">${session.journal_filled ? `Presensi ${htmlSafe(session.marked_students)}/${htmlSafe(session.expected_students)}` : 'Jurnal belum diisi'}</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="small text-secondary">Tidak ada jadwal mengajar yang sedang berjalan atau semua sesi sudah lengkap.</div>'}</div></article></div></div><p class="small text-secondary mt-3 mb-0">Hadir di sekolah dihitung dari presensi masuk berstatus VERIFIED/APPROVED. Izin, sakit, dan dinas luar dihitung dari pengajuan yang disetujui dan berlaku hari ini. Sakit dikenali dari kata “sakit” pada alasan izin yang disetujui.</p>`;
            if (data.holiday) {
                const holidayLabel = data.holiday.jenis === 'MINGGU' ? 'Hari Minggu' : data.holiday.jenis.replaceAll('_', ' ');
                $('adminLiveReport').querySelector('.admin-report-title')?.closest('.d-flex')?.insertAdjacentHTML('afterend', `<div class="alert alert-info"><strong>${htmlSafe(data.holiday.nama)}</strong> — ${htmlSafe(holidayLabel)}. Presensi tidak diharapkan dan tidak ada sesi mengajar yang dihitung hari ini.</div>`);
            }
            updateReportClock();
            if (!reportClockTimer) reportClockTimer = window.setInterval(updateReportClock, 1000);
            $('refreshAdminReport').addEventListener('click', loadAdminLiveReport);
        } catch (error) {
            const liveReport = $('adminLiveReport');
            if (liveReport) liveReport.innerHTML = `<div class="alert alert-danger d-flex flex-wrap justify-content-between gap-2"><span>${htmlSafe(error.message)}</span><button class="btn btn-sm btn-outline-danger" id="retryAdminReport">Coba lagi</button></div>`;
            $('retryAdminReport')?.addEventListener('click', loadAdminLiveReport);
        }
    }
    return { loadAdminLiveReport };
};
