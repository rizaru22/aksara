(() => {
    let rendered = false;
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
    const holidayTypes = { NASIONAL: 'Libur nasional', CUTI_BERSAMA: 'Cuti bersama', SEKOLAH: 'Libur sekolah', MINGGU: 'Hari Minggu' };

    // Mengembalikan bulan aktif dalam format YYYY-MM untuk default filter laporan presensi guru.
    function currentMonth() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    // Menghitung total menit kerja dari data absensi masuk dan pulang yang tercatat pada satu bulan.
    function durationMinutes(items) {
        return items.reduce((total, item) => {
            if (!item.jam_masuk || !item.jam_pulang || item.status === 'LIBUR') return total;
            const [inHour, inMinute] = String(item.jam_masuk).split(':').map(Number);
            const [outHour, outMinute] = String(item.jam_pulang).split(':').map(Number);
            const start = inHour * 60 + inMinute;
            let end = outHour * 60 + outMinute;
            if (end < start) end += 24 * 60;
            return total + end - start;
        }, 0);
    }

    // Mengubah menit menjadi string yang lebih mudah dibaca, misalnya 6 jam 30 menit.
    function formatDuration(minutes) {
        return `${Math.floor(minutes / 60)} jam ${String(minutes % 60).padStart(2, '0')} menit`;
    }

    // Menyusun ringkasan total jam kerja bulanan beserta rekap mingguan untuk laporan user.
    function renderDurationSummary(items, year, monthNumber) {
        const monthStart = new Date(year, monthNumber - 1, 1);
        const monthEnd = new Date(year, monthNumber, 0);
        const weeks = [];
        let cursor = new Date(monthStart);
        while (cursor <= monthEnd) {
            const weekStart = new Date(cursor);
            const dayOfWeek = weekStart.getDay();
            weekStart.setDate(weekStart.getDate() - ((dayOfWeek + 6) % 7));
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);
            const rangeStart = new Date(Math.max(weekStart.getTime(), monthStart.getTime()));
            const rangeEnd = new Date(Math.min(weekEnd.getTime(), monthEnd.getTime()));
            const inRange = items.filter((item) => {
                const date = new Date(`${item.tanggal}T12:00:00+07:00`);
                return date >= rangeStart && date <= rangeEnd;
            });
            const dateLabel = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' });
            weeks.push(`<li class="d-flex justify-content-between align-items-center gap-2 py-2 border-bottom"><span class="small text-secondary">${dateLabel.format(rangeStart)}–${dateLabel.format(rangeEnd)}</span><strong class="small text-nowrap">${formatDuration(durationMinutes(inRange))}</strong></li>`);
            cursor = new Date(rangeEnd);
            cursor.setDate(cursor.getDate() + 1);
        }
        const completeDays = items.filter((item) => item.jam_masuk && item.jam_pulang && item.status !== 'LIBUR').length;
        return `<section class="row g-3 mb-3" aria-label="Rekap durasi presensi"><div class="col-sm-12"><article class="card"><div class="card-body"><h2 class="h5 mb-1">Total jam kerja</h2><p class="small text-secondary mb-3">Durasi dihitung dari jam masuk hingga jam pulang yang tercatat.</p><div class="row g-3"><div class="col-12 col-md-5"><div class="border rounded-3 p-3 h-100"><div class="small text-secondary">Total bulan ini</div><strong class="fs-4">${formatDuration(durationMinutes(items))}</strong><div class="small text-secondary">${completeDays} hari dengan presensi masuk dan pulang</div></div></div><div class="col-12 col-md-7"><div class="small text-secondary fw-semibold mb-1">Rekap mingguan</div><ul class="list-unstyled mb-0">${weeks.join('')}</ul></div></div></div></article></div></section>`;
    }

    // Mengambil data laporan presensi dari backend dan merender ringkasan serta detail per tanggal.
    async function loadAttendanceReport(month) {
        const target = document.getElementById('attendanceReportList');
        if (!target) return;
        const [year, monthNumber] = month.split('-').map(Number);
        const from = `${month}-01`;
        const lastDay = new Date(year, monthNumber, 0).getDate();
        const to = `${month}-${String(lastDay).padStart(2, '0')}`;
        target.innerHTML = '<div class="text-secondary small"><span class="spin"></span> Memuat laporan...</div>';

        try {
            const response = await fetch(window.aksaraApiUrl(`/api/v1/reports/my-attendance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`), {
                headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.message || 'Laporan presensi tidak dapat dimuat.');
            const items = result.data || [];
            const durationSummary = renderDurationSummary(items, year, monthNumber);
            const dateFormatter = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
            const rows = items.map((item) => {
                const date = dateFormatter.format(new Date(`${item.tanggal}T12:00:00+07:00`));
                const attendanceDetail = item.status === 'LIBUR'
                    ? item.jenis_libur === 'MINGGU'
                        ? 'Minggu'
                        : `${holidayTypes[item.jenis_libur] || 'Hari libur'}: ${item.detail}`
                    : item.detail;
                const checkoutDetail = item.alasan_pulang
                    ? `Alasan pulang di luar jadwal: ${item.alasan_pulang}`
                    : null;
                const detail = [attendanceDetail, checkoutDetail].filter(Boolean).join(' · ');
                const time = item.jam_masuk || item.jam_pulang
                    ? `${item.jam_masuk || '—'} / ${item.jam_pulang || '—'}`
                    : '—';
                return `<tr><td class="text-nowrap">${escapeHtml(date)}</td><td>${escapeHtml(detail || '—')}</td><td class="text-nowrap">${escapeHtml(time)}</td></tr>`;
            }).join('');
            target.innerHTML = `${durationSummary}<div class="table-responsive"><table class="table table-sm table-striped align-middle"><thead><tr><th>Tanggal</th><th>Keterangan</th><th>Masuk / Pulang</th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="text-center text-secondary">Tidak ada data dalam periode ini.</td></tr>'}</tbody></table></div><p class="small text-secondary mb-0">Hari libur nasional, cuti bersama, dan libur sekolah dicantumkan pada kolom keterangan.</p>`;
        } catch (error) {
            target.innerHTML = `<div class="alert alert-warning mb-0">${escapeHtml(error.message)}</div>`;
        }
    }

    window.addEventListener('aksara:page-changed', (event) => {
        if (event.detail?.page !== 'reports') return;
        const target = document.getElementById('reportsContent');
        if (!target) return;

        if (!rendered) {
            target.innerHTML = `
                <article class="card"><div class="card-body">
                    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><div><h2 class="h5 mb-1">Laporan Presensi Harian</h2><p class="small text-secondary mb-0">Keterangan hari libur disertakan otomatis pada tanggal terkait.</p></div>
                    <form id="attendanceReportFilter" class="d-flex gap-2"><label class="visually-hidden" for="attendanceReportMonth">Bulan laporan</label><input class="form-control" id="attendanceReportMonth" type="month" value="${currentMonth()}" required><button class="btn btn-outline-primary" type="submit">Tampilkan</button></form></div>
                    <div id="attendanceReportList" aria-live="polite"></div>
                </div></article>
                <div class="report-grid mt-3 ">
                    <div class="report-tile" id="journalHistoryTile" role="button" tabindex="0"><i class="bi bi-journal-bookmark"></i><strong>Jurnal Mengajar</strong><span>Rekap kegiatan mengajar</span></div>
                </div>`;
            const journalHistoryTile = document.getElementById('journalHistoryTile');
            journalHistoryTile?.addEventListener('click', () => {
                if (typeof window.openTeacherJournalHistory === 'function') {
                    window.openTeacherJournalHistory();
                    return;
                }
                window.alert('Fungsi riwayat jurnal belum tersedia.');
            });
            journalHistoryTile?.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    journalHistoryTile.click();
                }
            });
            document.getElementById('attendanceReportFilter')?.addEventListener('submit', (submitEvent) => {
                submitEvent.preventDefault();
                loadAttendanceReport(document.getElementById('attendanceReportMonth').value);
            });
            rendered = true;
        }
        loadAttendanceReport(document.getElementById('attendanceReportMonth').value);
    });
})();
