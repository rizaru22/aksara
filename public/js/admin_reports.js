window.createAksaraAdminReports = function ({ api, htmlSafe, setAdminPanel }) {
    let period = 'daily';

    const localDate = () => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    };
    const localMonth = () => localDate().slice(0, 7);
    const duration = (minutes) => `${Math.floor(Number(minutes || 0) / 60)} jam ${String(Number(minutes || 0) % 60).padStart(2, '0')} menit`;
    const empty = (columns, message) => `<tr><td colspan="${columns}" class="text-center text-secondary py-3">${htmlSafe(message)}</td></tr>`;

    function renderTable(headers, rows, emptyMessage) {
        return `<div class="table-responsive"><table class="table table-sm table-striped table-hover align-middle"><thead><tr>${headers.map((header) => `<th>${htmlSafe(header)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : empty(headers.length, emptyMessage)}</tbody></table></div>`;
    }

    function renderAttendanceTable(rows, weekly = false) {
        const headers = weekly
            ? ['Guru', 'NIP', 'Hari tercatat', 'Total jam minggu ini']
            : ['Guru', 'NIP', 'Status', 'Jam masuk', 'Jam pulang'];
        const body = rows.map((row) => weekly
            ? `<tr><td>${htmlSafe(row.teacher_name)}</td><td>${htmlSafe(row.nip || '—')}</td><td>${htmlSafe(row.days_with_attendance)}</td><td>${htmlSafe(row.total_duration)}</td></tr>`
            : `<tr><td>${htmlSafe(row.teacher_name)}</td><td>${htmlSafe(row.nip || '—')}</td><td><span class="badge ${row.status === 'HADIR' ? 'text-bg-success' : row.status === 'ALPHA' ? 'text-bg-danger' : row.status === 'LIBUR' ? 'text-bg-secondary' : 'text-bg-warning'}">${htmlSafe(row.status)}</span>${row.status_verifikasi ? `<div class="small text-secondary">${htmlSafe(row.status_verifikasi)}</div>` : ''}</td><td>${htmlSafe(row.jam_masuk || '—')}</td><td>${htmlSafe(row.jam_pulang || '—')}</td></tr>`);
        return renderTable(headers, body, 'Tidak ada data guru.');
    }

    function renderClassTable(rows) {
        return renderTable(
            ['Tanggal', 'Jam', 'Kelas', 'Mata pelajaran', 'Guru', 'Status jurnal', 'Materi / keterangan'],
            rows.map((row) => `<tr><td class="text-nowrap">${htmlSafe(row.date)}</td><td class="text-nowrap">${htmlSafe(row.start)}–${htmlSafe(row.end)}</td><td>${htmlSafe(row.class_name)}</td><td>${htmlSafe(row.subject_name)}</td><td>${htmlSafe(row.teacher_name)}</td><td><span class="badge ${row.journal_filled ? 'text-bg-success' : 'text-bg-warning'}">${row.journal_filled ? `Terisi · ${htmlSafe(row.journal_status)}` : 'Belum diisi'}</span>${row.journal_filled ? `<div class="small text-secondary">Foto ${row.has_photo ? 'ada' : 'belum ada'}</div>` : ''}</td><td>${htmlSafe([row.materi, row.catatan].filter(Boolean).join(' · ') || '—')}</td></tr>`),
            'Tidak ada jadwal kelas pada periode ini.',
        );
    }

    function renderMonthly(summary, meta, users) {
        const items = [
            ['Persentase kehadiran', `${summary.present_percentage}%`, `${summary.present_count} hari-guru hadir`],
            ['Izin dan sakit', `${summary.permission_sick_percentage}%`, `${summary.permission_count} izin · ${summary.sick_count} sakit`],
            ['Dinas luar', `${summary.outside_duty_percentage}%`, `${summary.outside_duty_count} hari-guru dinas`],
            ['Total kehadiran', summary.present_count, `${summary.teacher_count} guru · ${summary.workdays} hari kerja`],
        ];
        const summaryRows = [
            ['Kehadiran terverifikasi', summary.present_count, `${summary.present_percentage}%`],
            ['Izin', summary.permission_count, `${summary.expected_teacher_days ? (summary.permission_count / summary.expected_teacher_days * 100).toFixed(2) : '0.00'}%`],
            ['Sakit', summary.sick_count, `${summary.expected_teacher_days ? (summary.sick_count / summary.expected_teacher_days * 100).toFixed(2) : '0.00'}%`],
            ['Izin / sakit gabungan', summary.permission_sick_count, `${summary.permission_sick_percentage}%`],
            ['Dinas luar', summary.outside_duty_count, `${summary.outside_duty_percentage}%`],
            ['Belum hadir / alpha', summary.absent_count, `${summary.expected_teacher_days ? (summary.absent_count / summary.expected_teacher_days * 100).toFixed(2) : '0.00'}%`],
            ['Menunggu verifikasi', summary.pending_count, '—'], ['Ditolak', summary.rejected_count, '—'],
        ].map(([label, count, percentage]) => `<tr><td>${htmlSafe(label)}</td><td>${htmlSafe(count)}</td><td>${htmlSafe(percentage)}</td></tr>`);
        const userRows = (users || []).map((user) => `<tr><td>${htmlSafe(user.nama)}</td><td>${htmlSafe(user.nip || '—')}</td><td>${htmlSafe(user.present_count)}</td><td><strong>${htmlSafe(user.present_percentage)}%</strong></td><td>${htmlSafe(user.permission_count)}</td><td>${htmlSafe(user.sick_count)}</td><td>${htmlSafe(user.outside_duty_count)}</td><td>${htmlSafe(user.absent_count)}</td></tr>`);
        return `<div class="row g-3 mb-3">${items.map(([label, value, note]) => `<div class="col-12 col-sm-6 col-xl-3"><article class="card admin-kpi h-100"><div class="card-body"><div class="admin-kpi-caption">${htmlSafe(label)}</div><div class="admin-kpi-number mt-2">${htmlSafe(value)}</div><div class="small text-secondary mt-2">${htmlSafe(note)}</div></div></article></div>`).join('')}</div><section class="card mb-3"><div class="card-body"><h2 class="h5">Persentase kehadiran per user</h2><p class="small text-secondary">Persentase mencakup hari hadir terverifikasi dan hari dinas luar yang disetujui, dibanding hari kerja pada bulan terpilih.</p>${renderTable(['Nama', 'NIP', 'Total hadir', 'Persentase hadir', 'Izin', 'Sakit', 'Dinas luar', 'Alpha'], userRows, 'Tidak ada data user.')}</div></section><section class="card"><div class="card-body"><h2 class="h6">Rincian rekapitulasi</h2><p class="small text-secondary">${htmlSafe(meta.denominator || '')}</p>${renderTable(['Metrik', 'Jumlah hari-guru', 'Persentase'], summaryRows, 'Tidak ada data.')}</div></section>`;
    }

    function renderResults(data, selectedPeriod) {
        if (selectedPeriod === 'monthly') return renderMonthly(data.summary, data.meta, data.users);
        if (selectedPeriod === 'daily') {
            const holiday = data.holiday ? `<div class="alert alert-info">${htmlSafe(data.holiday.nama)}${data.holiday.jenis === 'MINGGU' ? '' : ` · ${htmlSafe(data.holiday.jenis)}`}</div>` : '';
            return `${holiday}<section class="card mb-3"><div class="card-body"><h2 class="h5">Kehadiran guru</h2>${renderAttendanceTable(data.attendance || [])}</div></section><section class="card"><div class="card-body"><h2 class="h5">Kelas dan jurnal mengajar</h2>${renderClassTable(data.classes || [])}</div></section>`;
        }
        const summary = data.class_summary || {};
        const missing = (data.teachers_missing_journal || []).map((item) => `<tr><td>${htmlSafe(item.teacher_name)}</td><td>${htmlSafe(item.missing_sessions)}</td><td>${htmlSafe(item.sessions.map((session) => `${session.date} · ${session.class_name} ${session.start}`).join('; '))}</td></tr>`);
        return `<section class="card mb-3"><div class="card-body"><h2 class="h5">Kehadiran guru dan total jam</h2><p class="small text-secondary">${htmlSafe(data.attendance_hours_note || 'Total jam dihitung dari durasi presensi tercatat.')}</p>${renderAttendanceTable(data.attendance || [], true)}</div></section><section class="card mb-3"><div class="card-body"><h2 class="h5">Rekap jurnal kelas</h2><p class="small text-secondary">${htmlSafe(summary.filled || 0)} dari ${htmlSafe(summary.total || 0)} sesi terjadwal terisi; ${htmlSafe(summary.missing || 0)} belum diisi.</p>${renderClassTable(data.classes || [])}</div></section><section class="card"><div class="card-body"><h2 class="h5">Guru yang belum mengisi jurnal</h2>${renderTable(['Guru', 'Sesi terlewat', 'Rincian jadwal'], missing, 'Semua jurnal pada jadwal minggu ini sudah diisi.')}</div></section>`;
    }

    async function fetchReport(selectedPeriod, value) {
        const target = document.getElementById('adminReportResults');
        if (!target) return;
        target.innerHTML = '<div class="card"><div class="card-body text-secondary"><span class="spin"></span>Memuat laporan...</div></div>';
        const query = new URLSearchParams({ period: selectedPeriod, [selectedPeriod === 'monthly' ? 'month' : 'date']: value });
        try {
            const result = await api(`/api/v1/admin/reports?${query.toString()}`);
            const data = result.data || {};
            document.getElementById('adminReportPeriodLabel').textContent = data.period?.label || `${data.period?.from || ''} – ${data.period?.to || ''}`;
            target.innerHTML = renderResults(data, selectedPeriod);
        } catch (error) {
            target.innerHTML = `<div class="alert alert-danger">${htmlSafe(error.message || 'Laporan gagal dimuat.')}</div>`;
        }
    }

    function open() {
        period = 'daily';
        setAdminPanel('Laporan', `<div class="admin-report-heading d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3"><div><h2 class="h4 mb-1" id="adminReportPeriodLabel" aria-live="polite">Laporan Harian</h2><p class="small text-secondary mb-0">Cetak langsung atau pilih Simpan sebagai PDF pada dialog berikutnya.</p></div><div class="admin-report-actions d-flex gap-2"><button type="button" class="btn btn-primary" id="pdfAdminReport"><i class="bi bi-printer"></i> Cetak / Ekspor PDF</button></div></div><div class="card mb-3 admin-report-controls"><div class="card-body"><div class="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Jenis laporan"><button type="button" class="btn btn-success" data-report-period="daily">Harian</button><button type="button" class="btn btn-outline-success" data-report-period="weekly">Mingguan</button><button type="button" class="btn btn-outline-success" data-report-period="monthly">Bulanan</button></div><form id="adminReportFilter" class="row g-2 align-items-end"><div class="col-12 col-sm-6 col-md-5"><label class="form-label" for="adminReportDate">Tanggal acuan</label><input class="form-control" id="adminReportDate" type="date" value="${localDate()}"></div><div class="col-12 col-sm-6 col-md-5" hidden><label class="form-label" for="adminReportMonth">Bulan laporan</label><input class="form-control" id="adminReportMonth" type="month" value="${localMonth()}"></div><div class="col-12 col-md-2"><button class="btn btn-primary w-100" type="submit">Tampilkan</button></div></form></div></div><div id="adminReportResults" class="admin-report-results" aria-live="polite"></div>`);
        const form = document.getElementById('adminReportFilter');
        const dateInput = document.getElementById('adminReportDate');
        const monthField = document.getElementById('adminReportMonth').parentElement;
        const monthInput = document.getElementById('adminReportMonth');
        const buttons = [...document.querySelectorAll('[data-report-period]')];
        const print = () => {
            const oldTitle = document.title;
            const label = document.getElementById('adminReportPeriodLabel')?.textContent || 'Laporan';
            document.title = `AKSARA - ${label}`;
            const restoreTitle = () => {
                document.title = oldTitle;
                window.removeEventListener('afterprint', restoreTitle);
            };
            window.addEventListener('afterprint', restoreTitle);
            window.print();
        };
        document.getElementById('pdfAdminReport').addEventListener('click', print);
        const load = () => fetchReport(period, period === 'monthly' ? monthInput.value : dateInput.value);
        buttons.forEach((button) => button.addEventListener('click', () => {
            period = button.dataset.reportPeriod;
            buttons.forEach((item) => item.className = `btn ${item === button ? 'btn-success' : 'btn-outline-success'}`);
            dateInput.parentElement.hidden = period === 'monthly';
            monthField.hidden = period !== 'monthly';
            load();
        }));
        form.addEventListener('submit', (event) => { event.preventDefault(); load(); });
        load();
    }

    return { open };
};
