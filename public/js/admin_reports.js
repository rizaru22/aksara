window.createAksaraAdminReports = function ({ api, htmlSafe, setAdminPanel }) {
    let period = 'daily';

    const localDate = () => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    };
    const localMonth = () => localDate().slice(0, 7);
    const duration = (minutes) => `${Math.floor(Number(minutes || 0) / 60)} jam ${String(Number(minutes || 0) % 60).padStart(2, '0')} menit`;
    const empty = (columns, message) => `<tr><td colspan="${columns}" class="text-center text-secondary py-3">${htmlSafe(message)}</td></tr>`;

    // Membuat template tabel laporan agar hasil rendering konsisten untuk laporan harian, mingguan, dan bulanan.
    function renderTable(headers, rows, emptyMessage) {
        const titleCase = (value) => String(value).replace(/\b\w/g, (char) => char.toUpperCase()).replace(/\bNip\b/g, 'NIP').replace(/\bNisn\b/g, 'NISN');
        const numberedHeaders = ['No.', ...headers];
        const numberedRows = rows.map((row, index) => row.replace('<tr>', `<tr><td>${index + 1}</td>`));
        return `<div class="table-responsive"><table class="table table-sm table-striped table-hover align-middle"><thead><tr>${numberedHeaders.map((header) => `<th>${htmlSafe(titleCase(header))}</th>`).join('')}</tr></thead><tbody>${numberedRows.length ? numberedRows.join('') : empty(numberedHeaders.length, emptyMessage)}</tbody></table></div>`;
    }

    // Menampilkan rekap kehadiran guru per hari atau per minggu sesuai kebutuhan laporan admin.
    function renderAttendanceTable(rows, weekly = false) {
        const headers = weekly
            ? ['Guru', 'NIP', 'Hari tercatat', 'Total jam minggu ini']
            : ['Guru', 'NIP', 'Status', 'Jam masuk', 'Jam pulang'];
        const body = rows.map((row) => weekly
            ? `<tr><td>${htmlSafe(row.teacher_name)}</td><td>${htmlSafe(row.nip || '—')}</td><td>${htmlSafe(row.days_with_attendance)}</td><td>${htmlSafe(row.total_duration)}</td></tr>`
            : `<tr><td>${htmlSafe(row.teacher_name)}</td><td>${htmlSafe(row.nip || '—')}</td><td><span class="badge ${row.status === 'HADIR' ? 'text-bg-success' : row.status === 'ALPHA' ? 'text-bg-danger' : row.status === 'LIBUR' ? 'text-bg-secondary' : 'text-bg-warning'}">${htmlSafe(row.status)}</span>${row.status_verifikasi ? `<div class="small text-secondary">${htmlSafe(row.status_verifikasi)}</div>` : ''}</td><td>${htmlSafe(row.jam_masuk || '—')}</td><td>${htmlSafe(row.jam_pulang || '—')}</td></tr>`);
        return renderTable(headers, body, 'Tidak ada data guru.');
    }

    // Menampilkan jadwal kelas dan status jurnal untuk memberi gambaran pembelajaran yang sedang berjalan.
    function renderClassTable(rows) {
        return renderTable(
            ['Tanggal', 'Kelas', 'Guru', 'Waktu', 'Status Jurnal'],
            rows.map((row) => { const isDraft = row.journal_status === 'berlangsung'; const status = row.journal_filled ? 'Terisi' : isDraft ? 'Berlangsung' : 'Tidak Diisi'; return `<tr><td class="text-nowrap">${htmlSafe(new Date(`${row.date}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }))}</td><td>${htmlSafe(row.class_name)}</td><td>${htmlSafe(row.teacher_name)}</td><td class="text-nowrap">${htmlSafe(row.start)} - ${htmlSafe(row.end)}</td><td><span class="badge ${row.journal_filled ? 'text-bg-success' : isDraft ? 'text-bg-info' : 'text-bg-danger'}">${status}</span></td></tr>`; }),
            'Tidak ada jadwal kelas pada periode ini.',
        );
    }

    // Membangun laporan bulanan dengan ringkasan KPI, detail persentase, dan list user per presensi.
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

    // Membangun laporan bulanan kehadiran siswa berdasarkan bulan dan kelas yang dipilih.
    function renderStudentMonthly(data) {
        const summary = data.summary || {};
        const statusBreakdown = summary.by_status || {};
        const rows = (data.students || []).map((student) => `<tr><td>${htmlSafe(student.nama)}</td><td>${htmlSafe(student.nisn || '—')}</td><td>${htmlSafe(student.kelas || '—')}</td><td>${htmlSafe(student.present_count)}</td><td>${htmlSafe(student.izin_count)}</td><td>${htmlSafe(student.sick_count)}</td><td>${htmlSafe(student.alpha_count)}</td><td>${htmlSafe(student.cabut_count)}</td><td><strong>${htmlSafe(student.attendance_percentage ?? 0)}%</strong></td></tr>`);
        const summaryCards = [
            ['Hadir', statusBreakdown.HADIR ?? 0, 'Catatan hadir siswa'],
            ['Alpha', statusBreakdown.ALPHA ?? 0, 'Tidak hadir tanpa keterangan'],
            ['Sakit', statusBreakdown.SAKIT ?? 0, 'Siswa sakit'],
            ['Izin', statusBreakdown.IZIN ?? 0, 'Izin mengikuti pembelajaran'],
        ];
        return `<div class="row g-3 mb-3"><div class="col-12 col-md-4"><article class="card admin-kpi h-100"><div class="card-body"><div class="admin-kpi-caption">Total siswa</div><div class="admin-kpi-number mt-2">${htmlSafe(summary.total_students ?? 0)}</div><div class="small text-secondary mt-2">${htmlSafe(summary.class_name || 'Semua kelas')}</div></div></article></div><div class="col-12 col-md-4"><article class="card admin-kpi h-100"><div class="card-body"><div class="admin-kpi-caption">Total hadir</div><div class="admin-kpi-number mt-2">${htmlSafe(summary.total_present ?? 0)}</div><div class="small text-secondary mt-2">Catatan presensi pada bulan ini</div></div></article></div><div class="col-12 col-md-4"><article class="card admin-kpi h-100"><div class="card-body"><div class="admin-kpi-caption">Total catatan</div><div class="admin-kpi-number mt-2">${htmlSafe(summary.total_records ?? 0)}</div><div class="small text-secondary mt-2">Data jurnal siswa yang telah diisi</div></div></article></div></div><div class="row g-3 mb-3">${summaryCards.map(([label, value, note]) => `<div class="col-12 col-sm-6 col-xl-3"><article class="card admin-kpi h-100"><div class="card-body"><div class="admin-kpi-caption">${htmlSafe(label)}</div><div class="admin-kpi-number mt-2">${htmlSafe(value)}</div><div class="small text-secondary mt-2">${htmlSafe(note)}</div></div></article></div>`).join('')}</div><section class="card"><div class="card-body"><h2 class="h5">Kehadiran siswa per kelas</h2><p class="small text-secondary mb-3">Persentase hadir dihitung dari catatan presensi siswa yang tercatat dalam jurnal pada bulan yang dipilih.</p>${renderTable(['Nama siswa', 'NISN', 'Kelas', 'Hadir', 'Izin', 'Sakit', 'Alpha', 'Cabut', 'Persentase'], rows, 'Tidak ada data kehadiran siswa pada filter ini.')}</div></section>`;
    }

    // Memilih komponen renderer yang cocok untuk periode laporan yang sedang dibuka oleh admin.
    function renderResults(data, selectedPeriod) {
        if (selectedPeriod === 'monthly') return renderMonthly(data.summary, data.meta, data.users);
        if (selectedPeriod === 'student-monthly') return renderStudentMonthly(data);
        if (selectedPeriod === 'daily') {
            const holiday = data.holiday ? `<div class="alert alert-info">${htmlSafe(data.holiday.nama)}${data.holiday.jenis === 'MINGGU' ? '' : ` · ${htmlSafe(data.holiday.jenis)}`}</div>` : '';
            return `${holiday}<section class="card mb-3"><div class="card-body"><h2 class="h5">Kehadiran guru</h2>${renderAttendanceTable(data.attendance || [])}</div></section><section class="card"><div class="card-body"><h2 class="h5">Kelas dan jurnal mengajar</h2>${renderClassTable(data.classes || [])}</div></section>`;
        }
        const summary = data.class_summary || {};
        const missing = (data.teachers_missing_journal || []).map((item) => `<tr><td>${htmlSafe(item.teacher_name)}</td><td>${htmlSafe(item.missing_sessions)}</td><td>${htmlSafe(item.sessions.map((session) => `${session.date} · ${session.class_name} ${session.start}`).join('; '))}</td></tr>`);
        const teacherSessionRows = Object.values((data.classes || []).reduce((acc, row) => { const key = row.teacher_name; if (!acc[key]) acc[key] = { name: key, total: 0, filled: 0 }; acc[key].total += 1; if (row.journal_filled) acc[key].filled += 1; return acc; }, {})).map((item) => `<tr><td>${htmlSafe(item.name)}</td><td>${item.total}</td><td>${item.filled}</td><td>${item.total - item.filled}</td><td><strong>${item.total ? (item.filled / item.total * 100).toFixed(2) : '0.00'}%</strong></td></tr>`);
        return `<section class="card mb-3"><div class="card-body"><h2 class="h5">Kehadiran guru dan total jam</h2><p class="small text-secondary">${htmlSafe(data.attendance_hours_note || 'Total jam dihitung dari durasi presensi tercatat.')}</p>${renderAttendanceTable(data.attendance || [], true)}</div></section><section class="card mb-3"><div class="card-body"><h2 class="h5">Rekap Kehadiran Guru di Kelas</h2><p class="small text-secondary">Persentase dihitung dari jurnal terisi dibanding total jadwal guru pada minggu terpilih. Jurnal kosong dihitung sebagai tidak mengisi jurnal.</p>${renderTable(['Guru', 'Total Jadwal', 'Jurnal Terisi', 'Tidak Mengisi', 'Persentase Kehadiran'], teacherSessionRows, 'Tidak ada jadwal kelas pada minggu ini.')}</div></section><section class="card mb-3"><div class="card-body"><h2 class="h5">Rincian Jadwal Mingguan</h2><p class="small text-secondary">${htmlSafe(summary.filled || 0)} jurnal terisi dari ${htmlSafe(summary.total || 0)} sesi terjadwal.</p>${renderClassTable(data.classes || [])}</div></section><section class="card"><div class="card-body"><h2 class="h5">Guru yang jurnalnya belum selesai</h2>${renderTable(['Guru', 'Sesi belum selesai', 'Rincian jadwal'], missing, 'Semua jurnal pada jadwal minggu ini sudah selesai.')}</div></section>`;
    }

    // Mengambil data laporan dari backend sesuai periode yang dipilih dan me-render hasil ke panel admin.
    async function fetchReport(selectedPeriod, value, classId = '') {
        const target = document.getElementById('adminReportResults');
        if (!target) return;
        target.innerHTML = '<div class="card"><div class="card-body text-secondary"><span class="spin"></span>Memuat laporan...</div></div>';
        const query = new URLSearchParams({ period: selectedPeriod, [selectedPeriod === 'monthly' || selectedPeriod === 'student-monthly' ? 'month' : 'date']: value });
        if (['daily', 'weekly', 'student-monthly'].includes(selectedPeriod) && classId) {
            query.set('class_id', classId);
        }
        const endpoint = selectedPeriod === 'student-monthly' ? '/api/v1/admin/reports/student-attendance' : '/api/v1/admin/reports';
        try {
            const result = await api(`${endpoint}?${query.toString()}`);
            const data = result.data || {};
            document.getElementById('adminReportPeriodLabel').textContent = data.period?.label || `${data.period?.from || ''} – ${data.period?.to || ''}`;
            target.innerHTML = renderResults(data, selectedPeriod);
        } catch (error) {
            target.innerHTML = `<div class="alert alert-danger">${htmlSafe(error.message || 'Laporan gagal dimuat.')}</div>`;
        }
    }

    // Menyiapkan UI pelaporan admin dengan pilihan harian, mingguan, dan bulanan serta tombol cetak.
    async function open(initialPeriod = 'daily', options = {}) {
        const dedicatedStudent = Boolean(options.dedicatedStudent);
        period = initialPeriod;
        const initialTitle = initialPeriod === 'student-monthly' ? 'Laporan Presensi Siswa' : 'Laporan';
        const initialHeading = initialPeriod === 'student-monthly' ? 'Laporan Presensi Siswa' : 'Laporan Harian';
        const tabButtons = dedicatedStudent
            ? '<button type="button" class="btn btn-success" data-report-period="student-monthly">Presensi Siswa</button>'
            : `<button type="button" class="btn ${initialPeriod === 'daily' ? 'btn-success' : 'btn-outline-success'}" data-report-period="daily">Harian</button><button type="button" class="btn ${initialPeriod === 'weekly' ? 'btn-success' : 'btn-outline-success'}" data-report-period="weekly">Mingguan</button><button type="button" class="btn ${initialPeriod === 'monthly' ? 'btn-success' : 'btn-outline-success'}" data-report-period="monthly">Bulanan</button><button type="button" class="btn ${initialPeriod === 'student-monthly' ? 'btn-success' : 'btn-outline-success'}" data-report-period="student-monthly">Siswa</button>`;
        setAdminPanel(initialTitle, `<div class="admin-report-heading d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3"><div><h2 class="h4 mb-1" id="adminReportPeriodLabel" aria-live="polite">${initialHeading}</h2><p class="small text-secondary mb-0">Cetak langsung atau pilih Simpan sebagai PDF pada dialog berikutnya.</p></div><div class="admin-report-actions d-flex gap-2"><button type="button" class="btn btn-primary" id="pdfAdminReport"><i class="bi bi-printer"></i> Cetak / Ekspor PDF</button></div></div><div class="card mb-3 admin-report-controls"><div class="card-body"><div class="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Jenis laporan">${tabButtons}</div><form id="adminReportFilter" class="row g-2 align-items-end"><div class="col-12 col-sm-6 col-md-4"><label class="form-label" for="adminReportDate">Tanggal acuan</label><input class="form-control" id="adminReportDate" type="date" value="${localDate()}"></div><div class="col-12 col-sm-6 col-md-4" hidden><label class="form-label" for="adminReportMonth">Bulan laporan</label><input class="form-control" id="adminReportMonth" type="month" value="${localMonth()}"></div><div class="col-12 col-sm-6 col-md-4" hidden><label class="form-label" for="adminReportClass">Kelas</label><select class="form-select" id="adminReportClass"><option value="">Semua kelas</option></select></div><div class="col-12 col-md-2"><button class="btn btn-primary w-100" type="submit">Tampilkan</button></div></form></div></div><div id="adminReportResults" class="admin-report-results" aria-live="polite"></div>`);
        const form = document.getElementById('adminReportFilter');
        const dateInput = document.getElementById('adminReportDate');
        const monthField = document.getElementById('adminReportMonth').parentElement;
        const monthInput = document.getElementById('adminReportMonth');
        const classField = document.getElementById('adminReportClass').parentElement;
        const classInput = document.getElementById('adminReportClass');
        const buttons = [...document.querySelectorAll('[data-report-period]')];
        const print = () => {
            const results = document.getElementById('adminReportResults');
            const targetTable = results?.querySelector('table');
            if (targetTable && window.DataTable && window.DataTable.isDataTable(targetTable)) {
                const dt = new window.DataTable(targetTable);
                dt.destroy();
            }
            const printableTable = results?.querySelector('table')?.cloneNode(true);
            if (printableTable) {
                printableTable.querySelectorAll('*').forEach((node) => {
                    ['id', 'data-dt-order', 'data-dt-length', 'aria-controls', 'aria-label', 'tabindex', 'role'].forEach((attr) => node.removeAttribute(attr));
                    node.classList?.remove('sorting', 'sorting_asc', 'sorting_desc', 'dt-head-center', 'dt-orderable-asc', 'dt-orderable-desc', 'dt-body-center');
                });
                printableTable.removeAttribute('style');
                printableTable.querySelectorAll('thead th, tbody td').forEach((cell) => cell.removeAttribute('style'));
                const printWindow = window.open('', '_blank', 'width=1200,height=900');
                if (!printWindow) {
                    const oldTitle = document.title;
                    const label = document.getElementById('adminReportPeriodLabel')?.textContent || 'Laporan';
                    document.title = `AKSARA - ${label}`;
                    const restoreTitle = () => {
                        document.title = oldTitle;
                        window.removeEventListener('afterprint', restoreTitle);
                    };
                    window.addEventListener('afterprint', restoreTitle);
                    window.print();
                    return;
                }
                printWindow.document.write(`<!doctype html><html><head><title>AKSARA - ${htmlSafe(document.getElementById('adminReportPeriodLabel')?.textContent || 'Laporan')}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #d1d5db;padding:8px 10px;text-align:left;vertical-align:top}thead th{background:#f3f4f6;font-weight:700}.badge{display:inline-block;padding:2px 8px;border-radius:999px;background:#e5e7eb;color:#111;font-size:11px}.text-secondary{color:#4b5563}.small{font-size:11px}.text-center{text-align:center}.text-nowrap{white-space:nowrap}</style></head><body>${printableTable.outerHTML}</body></html>`);
                printWindow.document.close();
                printWindow.focus();
                printWindow.print();
                printWindow.onafterprint = () => printWindow.close();
                return;
            }
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
        const loadClasses = async () => {
            try {
                const result = await api('/api/v1/academic/classes');
                const classes = Array.isArray(result) ? result : (result.data || result.items || []);
                classInput.innerHTML = '<option value="">Semua kelas</option>' + classes.map((item) => `<option value="${item.id}">${htmlSafe(item.nama_kelas || item.name || 'Kelas')}</option>`).join('');
            } catch {
                classInput.innerHTML = '<option value="">Semua kelas</option>';
            }
        };
        document.getElementById('pdfAdminReport').addEventListener('click', print);
        const load = async () => {
            const activeValue = period === 'student-monthly' || period === 'monthly' ? monthInput.value : dateInput.value;
            await fetchReport(period, activeValue, classInput.value);
        };
        buttons.forEach((button) => {
            const isAllowed = !dedicatedStudent || button.dataset.reportPeriod === 'student-monthly';
            if (!isAllowed) {
                button.disabled = true;
                button.style.display = 'none';
                return;
            }
            button.addEventListener('click', () => {
                period = button.dataset.reportPeriod;
                buttons.forEach((item) => item.className = `btn ${item === button ? 'btn-success' : 'btn-outline-success'}`);
                const isDatePeriod = period === 'daily' || period === 'weekly';
                const isMonthPeriod = period === 'monthly' || period === 'student-monthly';
                dateInput.parentElement.hidden = !isDatePeriod;
                monthField.hidden = !isMonthPeriod;
                classField.hidden = !['daily', 'weekly', 'student-monthly'].includes(period);
                load();
            });
        });
        form.addEventListener('submit', (event) => { event.preventDefault(); load(); });
        classInput.addEventListener('change', load);
        dateInput.parentElement.hidden = !(period === 'daily' || period === 'weekly');
        monthField.hidden = !(period === 'monthly' || period === 'student-monthly');
        classField.hidden = !['daily', 'weekly', 'student-monthly'].includes(period);
        if (initialPeriod === 'student-monthly') {
            dateInput.parentElement.hidden = true;
            monthField.hidden = false;
            classField.hidden = false;
        }
        if (dedicatedStudent) {
            buttons.forEach((button) => {
                if (button.dataset.reportPeriod !== 'student-monthly') {
                    button.style.display = 'none';
                }
            });
        }
        await loadClasses();
        load();
    }

    return { open };
};
