window.createAksaraMaterialReport = function ({ api, htmlSafe, setAdminPanel }) {
    const escape = htmlSafe;
    const option = (item, labelKey, valueKey = 'id') =>
        `<option value="${escape(item[valueKey])}">${escape(item[labelKey] || '—')}</option>`;

    async function open() {
        setAdminPanel('Rekap Materi Jurnal Mengajar', `
            <div class="card mb-3">
                <div class="card-body">
                    <p class="text-secondary small mb-3">Tahun ajaran mengikuti konfigurasi aktif AKSARA. Pilih guru, mata pelajaran, kelas, dan semester untuk melihat urutan materi sebelum mencetak.</p>
                    <div id="materialReportYear" class="alert alert-info py-2">Memuat tahun ajaran aktif...</div>
                    <form id="materialReportForm" class="row g-3 align-items-end">
                        <div class="col-12 col-md-6 col-xl-3"><label class="form-label" for="materialReportTeacher">Guru</label><select class="form-select" id="materialReportTeacher" required><option value="">Pilih guru</option></select></div>
                        <div class="col-12 col-md-6 col-xl-3"><label class="form-label" for="materialReportSubject">Mata Pelajaran</label><select class="form-select" id="materialReportSubject" required disabled><option value="">Pilih mata pelajaran</option></select></div>
                        <div class="col-12 col-md-6 col-xl-3"><label class="form-label" for="materialReportClass">Kelas</label><select class="form-select" id="materialReportClass" required disabled><option value="">Pilih kelas</option></select></div>
                        <div class="col-12 col-md-6 col-xl-2"><label class="form-label" for="materialReportSemester">Semester</label><select class="form-select" id="materialReportSemester" required><option value="">Pilih semester</option><option value="Ganjil">Ganjil</option><option value="Genap">Genap</option></select></div>
                        <div class="col-12 col-xl-1"><button class="btn btn-primary w-100" type="submit">Tampilkan</button></div>
                    </form>
                </div>
            </div>
            <div id="materialReportResults" aria-live="polite"><div class="card"><div class="card-body text-secondary">Pilih filter untuk menampilkan rekap materi.</div></div></div>
            <div class="d-flex justify-content-end mt-3"><button type="button" class="btn btn-primary" id="printMaterialReport" disabled><i class="bi bi-printer"></i> Cetak</button></div>
        `);

        const teacher = document.getElementById('materialReportTeacher');
        const subject = document.getElementById('materialReportSubject');
        const klass = document.getElementById('materialReportClass');
        const semester = document.getElementById('materialReportSemester');
        const year = document.getElementById('materialReportYear');
        const results = document.getElementById('materialReportResults');
        const printButton = document.getElementById('printMaterialReport');
        let activeYear = '';
        let reportRows = [];

        const params = () => {
            const query = new URLSearchParams();
            if (teacher.value) query.set('teacher_id', teacher.value);
            if (subject.value) query.set('subject_id', subject.value);
            if (klass.value) query.set('class_id', klass.value);
            if (semester.value) query.set('semester', semester.value);
            return query.toString();
        };

        function fillSelect(select, items, labelKey, placeholder, selectedValue = '') {
            select.innerHTML = `<option value="">${escape(placeholder)}</option>` + items.map((item) => option(item, labelKey)).join('');
            if (selectedValue && [...select.options].some((item) => item.value === selectedValue)) select.value = selectedValue;
            select.disabled = items.length === 0;
        }

        async function loadOptions() {
            const response = await api(`/api/v1/admin/reports/material-journals?${params()}`);
            const data = response.data || {};
            activeYear = data.academic_year || '';
            year.textContent = activeYear ? `Tahun Ajaran Aktif: ${activeYear}` : (data.message || 'Tahun ajaran aktif belum tersedia.');
            year.className = activeYear ? 'alert alert-info py-2' : 'alert alert-warning py-2';

            const filters = data.filters || {};
            const selectedTeacher = teacher.value;
            const selectedSubject = subject.value;
            const selectedClass = klass.value;
            fillSelect(teacher, filters.teachers || [], 'nama', 'Pilih guru', selectedTeacher);
            fillSelect(subject, filters.subjects || [], 'nama_mapel', 'Pilih mata pelajaran', selectedSubject);
            fillSelect(klass, filters.classes || [], 'nama_kelas', 'Pilih kelas', selectedClass);
            subject.disabled = !teacher.value || !(filters.subjects || []).length;
            klass.disabled = !subject.value || !(filters.classes || []).length;
            return data;
        }

        function renderRows(rows) {
            if (!rows.length) {
                results.innerHTML = '<div class="alert alert-secondary">Belum ada jurnal materi untuk pilihan tersebut.</div>';
                printButton.disabled = true;
                return;
            }
            const statusLabel = (status) => ({ final: 'Final', finalisasi_susulan: 'Finalisasi Susulan', draft: 'Draft', kedaluwarsa: 'Kedaluwarsa' })[status] || status || '—';
            results.innerHTML = `
                <section class="card">
                    <div class="card-body">
                        <div class="d-flex flex-wrap justify-content-between gap-2 mb-3">
                            <div><h2 class="h5 mb-1">Riwayat Materi Pembelajaran</h2><p class="small text-secondary mb-0">${escape(teacher.selectedOptions[0]?.textContent || '')} · ${escape(subject.selectedOptions[0]?.textContent || '')} · ${escape(klass.selectedOptions[0]?.textContent || '')}</p></div>
                            <span class="badge text-bg-light border align-self-start">${rows.length} jurnal</span>
                        </div>
                        <div class="table-responsive"><table class="table table-sm table-bordered align-middle">
                            <thead><tr><th style="width:48px">No.</th><th style="width:120px">Tanggal</th><th style="width:120px">Waktu</th><th>Materi yang Diajarkan</th><th>Catatan</th><th>Status</th></tr></thead>
                            <tbody>${rows.map((row, index) => `<tr><td>${index + 1}</td><td>${escape(row.tanggal || '—')}</td><td>${escape([row.jam_mulai, row.jam_selesai].filter(Boolean).join('–') || '—')}</td><td>${escape(row.materi || '—')}</td><td>${escape(row.catatan || '—')}</td><td>${escape(statusLabel(row.status))}</td></tr>`).join('')}</tbody>
                        </table></div>
                        <p class="small text-secondary mb-0">Diurutkan dari tanggal dan waktu pembelajaran paling lama hingga terbaru.</p>
                    </div>
                </section>`;
            printButton.disabled = false;
        }

        async function refreshOptions() {
            try {
                await loadOptions();
                reportRows = [];
                results.innerHTML = '<div class="card"><div class="card-body text-secondary">Filter diperbarui. Tekan Tampilkan untuk memuat laporan.</div></div>';
                printButton.disabled = true;
            } catch (error) {
                results.innerHTML = `<div class="alert alert-danger">${escape(error.message || 'Filter laporan gagal dimuat.')}</div>`;
            }
        }

        teacher.addEventListener('change', async () => {
            subject.value = '';
            klass.value = '';
            await refreshOptions();
        });
        subject.addEventListener('change', async () => {
            klass.value = '';
            await refreshOptions();
        });
        klass.addEventListener('change', () => { printButton.disabled = true; });
        semester.addEventListener('change', refreshOptions);

        document.getElementById('materialReportForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!teacher.value || !subject.value || !klass.value || !semester.value) return;
            results.innerHTML = '<div class="card"><div class="card-body text-secondary"><span class="spin"></span>Memuat rekap materi...</div></div>';
            printButton.disabled = true;
            try {
                const data = await loadOptions();
                reportRows = data.journals || [];
                renderRows(reportRows);
            } catch (error) {
                results.innerHTML = `<div class="alert alert-danger">${escape(error.message || 'Rekap materi gagal dimuat.')}</div>`;
            }
        });

        printButton.addEventListener('click', () => {
            if (!reportRows.length) return;
            const printable = document.createElement('section');
            printable.id = 'aksaraMaterialReportPrint';
            printable.innerHTML = `
                <style>
                    @media screen { #aksaraMaterialReportPrint { display:none; } }
                    @media print {
                        body.aksara-material-printing > *:not(#aksaraMaterialReportPrint) { display:none !important; }
                        #aksaraMaterialReportPrint { display:block !important; padding: 12mm; color:#111; font: 11pt Arial,sans-serif; }
                        #aksaraMaterialReportPrint h1 { text-align:center; font-size:18pt; margin:0 0 4px; }
                        #aksaraMaterialReportPrint h2 { text-align:center; font-size:14pt; margin:0 0 16px; }
                        #aksaraMaterialReportPrint .meta { margin:0 0 12px; }
                        #aksaraMaterialReportPrint table { width:100%; border-collapse:collapse; }
                        #aksaraMaterialReportPrint th,#aksaraMaterialReportPrint td { border:1px solid #444; padding:6px; text-align:left; vertical-align:top; }
                        #aksaraMaterialReportPrint thead { display:table-header-group; }
                        #aksaraMaterialReportPrint tr { break-inside:avoid; }
                    }
                </style>
                <h1>AKSARA — Laporan Jurnal Mengajar</h1>
                <h2>Rekap Materi Pembelajaran</h2>
                <p class="meta"><strong>Tahun Ajaran:</strong> ${escape(activeYear)}<br><strong>Guru:</strong> ${escape(teacher.selectedOptions[0]?.textContent || '')}<br><strong>Mata Pelajaran:</strong> ${escape(subject.selectedOptions[0]?.textContent || '')}<br><strong>Kelas:</strong> ${escape(klass.selectedOptions[0]?.textContent || '')}<br><strong>Semester:</strong> ${escape(semester.value)}</p>
                ${results.querySelector('table')?.outerHTML || ''}
                <p>Materi diurutkan dari tanggal dan waktu pembelajaran paling lama hingga terbaru.</p>
            `;
            document.body.appendChild(printable);
            document.body.classList.add('aksara-material-printing');
            const cleanup = () => {
                document.body.classList.remove('aksara-material-printing');
                printable.remove();
                window.removeEventListener('afterprint', cleanup);
            };
            window.addEventListener('afterprint', cleanup, { once: true });
            window.print();
        });

        await refreshOptions();
    }

    return { open };
};
