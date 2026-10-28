window.createAksaraAcademicData = function ({ $, api, htmlSafe, setFeature, setFeatureError, showToast, token }) {
    const masterDefinitions = {
        'academic-years': { title: 'Tahun Ajaran', columns: ['tahun_ajaran', 'is_active'], columnLabels: { tahun_ajaran: 'Tahun Ajaran', is_active: 'Status' }, fields: [{ name: 'tahun_ajaran', label: 'Tahun ajaran', required: true }] },
        classes: { title: 'Kelas', columns: ['nama_kelas', 'tingkat', 'jurusan', 'tahun_ajaran.tahun_ajaran', 'wali_kelas.nama'], columnLabels: { nama_kelas: 'Nama Kelas', tingkat: 'Tingkat', jurusan: 'Jurusan', 'tahun_ajaran.tahun_ajaran': 'Tahun Ajaran', 'wali_kelas.nama': 'Nama Wali Kelas' }, fields: [
            { name: 'tahun_ajaran_id', label: 'Tahun ajaran', type: 'select', options: 'academic-years', required: true, value: 'tahun_ajaran' },
            { name: 'nama_kelas', label: 'Nama kelas', required: true }, { name: 'tingkat', label: 'Tingkat', required: true }, { name: 'jurusan', label: 'Jurusan', required: true },
            { name: 'wali_kelas_id', label: 'Wali kelas', type: 'select', options: 'teachers', optional: true },
        ] },
        students: { title: 'Siswa', columns: ['nisn', 'nama', 'kelas_aktif', 'tahun_ajaran_aktif', 'jenis_kelamin'], columnLabels: { nisn: 'NISN', nama: 'Nama Siswa', kelas_aktif: 'Kelas aktif', tahun_ajaran_aktif: 'Tahun ajaran', jenis_kelamin: 'Jenis Kelamin' }, fields: [
            { name: 'nisn', label: 'NISN', required: true }, { name: 'nama', label: 'Nama siswa', required: true },
            { name: 'tahun_ajaran_id', label: 'Tahun ajaran penempatan', type: 'select', options: 'academic-years', required: true, value: 'tahun_ajaran' },
            { name: 'kelas_id', label: 'Kelas', type: 'select', options: 'classes', required: true, value: 'nama_kelas' },
            { name: 'jenis_kelamin', label: 'Jenis kelamin', type: 'select', required: true, options: [['L', 'Laki-laki'], ['P', 'Perempuan']] },
        ] },
        subjects: { title: 'Mata Pelajaran', columns: ['kode_mapel', 'nama_mapel'], columnLabels: { kode_mapel: 'Kode Mata Pelajaran', nama_mapel: 'Nama Mata Pelajaran' }, fields: [{ name: 'kode_mapel', label: 'Kode mapel', required: true }, { name: 'nama_mapel', label: 'Nama mata pelajaran', required: true }] },
        materials: { title: 'Materi Pelajaran', columns: ['judul_bab', 'urutan_bab', 'target_jjp', 'mata_pelajaran_id'], columnLabels: { judul_bab: 'Judul Bab', urutan_bab: 'Urutan Bab', target_jjp: 'Target JJP', mata_pelajaran_id: 'Mata Pelajaran' }, fields: [
            { name: 'mata_pelajaran_id', label: 'Mata pelajaran', type: 'select', options: 'subjects', required: true, value: 'nama_mapel' },
            { name: 'urutan_bab', label: 'Urutan bab', type: 'number', required: true }, { name: 'judul_bab', label: 'Judul bab', required: true }, { name: 'target_jjp', label: 'Target JJP', type: 'number', required: true },
        ] },
        schedules: { title: 'Jadwal Pelajaran', columns: ['hari', 'jam_mulai', 'jam_selesai', 'kelas.nama_kelas', 'guru.nama', 'mata_pelajaran.nama_mapel'], columnLabels: { hari: 'Hari', jam_mulai: 'Jam Mulai', jam_selesai: 'Jam Selesai', 'kelas.nama_kelas': 'Kelas', 'guru.nama': 'Nama Guru', 'mata_pelajaran.nama_mapel': 'Mata Pelajaran' }, fields: [
            { name: 'tahun_ajaran_id', label: 'Tahun ajaran', type: 'select', options: 'academic-years', required: true, value: 'tahun_ajaran' },
            { name: 'semester', label: 'Semester', type: 'select', required: true, options: [['Ganjil', 'Ganjil'], ['Genap', 'Genap']] },
            { name: 'user_id', label: 'Guru', type: 'select', options: 'teachers', required: true, value: 'nama' },
            { name: 'kelas_id', label: 'Kelas', type: 'select', options: 'classes', required: true, value: 'nama_kelas' },
            { name: 'mata_pelajaran_id', label: 'Mata pelajaran', type: 'select', options: 'subjects', required: true, value: 'nama_mapel' },
            { name: 'siklus_minggu', label: 'Siklus (kosong = mingguan)', type: 'select', optional: true, options: [['', 'Mingguan'], ['1', 'Siklus 1'], ['2', 'Siklus 2'], ['3', 'Siklus 3']] },
            { name: 'hari', label: 'Hari', type: 'select', required: true, options: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map((x) => [x, x]) },
            { name: 'periode_mulai', label: 'Periode mulai', type: 'period', optional: true },
            { name: 'periode_selesai', label: 'Periode selesai', type: 'period', optional: true },
        ] },
        agendas: { title: 'Agenda Sekolah', columns: ['nama_agenda', 'tanggal', 'jam_mulai', 'jam_selesai', 'override_kbm'], columnLabels: { nama_agenda: 'Nama Agenda', tanggal: 'Tanggal', jam_mulai: 'Jam Mulai', jam_selesai: 'Jam Selesai', override_kbm: 'Override KBM' }, fields: [
            { name: 'nama_agenda', label: 'Nama agenda', required: true }, { name: 'tanggal', label: 'Tanggal', type: 'date', required: true },
            { name: 'jam_mulai', label: 'Jam mulai', type: 'time', required: true }, { name: 'jam_selesai', label: 'Jam selesai', type: 'time', required: true },
            { name: 'scope', label: 'Cakupan', type: 'select', required: true, options: [['SEKOLAH', 'Seluruh sekolah']] },
            { name: 'override_kbm', label: 'Menangguhkan KBM', type: 'select', required: true, options: [['1', 'Ya'], ['0', 'Tidak']] },
            { name: 'lat_temporary', label: 'Latitude sementara', type: 'number', optional: true }, { name: 'long_temporary', label: 'Longitude sementara', type: 'number', optional: true }, { name: 'radius_meters', label: 'Radius sementara (m)', type: 'number', optional: true },
        ] },
    };

    // Menormalkan nama hanya untuk tampilan; nilai asli dari API/database tidak diubah.
    function formatPersonName(value) {
        return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID')
            .replace(/(^|[\s'-])(\p{L})/gu, (_, separator, letter) => separator + letter.toLocaleUpperCase('id-ID'));
    }

    // Mengekstrak nilai nested dari object yang berasal dari API master data dan relasi model.
    function nestedValue(item, path) { return path.split('.').reduce((value, key) => value?.[key], item); }

    // Mengunduh template Excel untuk import data master yang didukung oleh modul akademik.
    async function downloadTemplate(resource) {
        const response = await fetch(window.aksaraApiUrl(`/api/v1/academic/imports/templates/${resource}`), { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || `Template gagal diunduh (${response.status}).`);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `template_${resource}.xlsx`;
        link.click();
        URL.revokeObjectURL(url);
    }
    // Mengambil daftar referensi untuk dropdown select seperti kelas, guru, dan mata pelajaran.
    async function loadOptions(optionKey) {
        const path = optionKey === 'teachers'
            ? '/api/v1/academic/teachers'
            : `/api/v1/academic/${optionKey}`;
        return window.aksaraFetchAllPages(api, path);
    }

    // Menyiapkan CRUD master data akademik sesuai resource yang dipilih: tahun ajaran, kelas, siswa, mapel, materi, jadwal, atau agenda.
    async function openMaster(resource, current = null) {
        const definition = masterDefinitions[resource];
        const items = await window.aksaraFetchAllPages(api, `/api/v1/academic/${resource}`);
        const references = {};
        let activeCalendar = null;
        if (resource === 'schedules') {
            try { activeCalendar = (await api('/api/v1/academic/calendars/active')).data || null; }
            catch (error) { activeCalendar = null; }
            references.periods = activeCalendar?.detail_periode || [];
        }
        for (const field of definition.fields) if (field.options && typeof field.options === 'string') references[field.options] = await loadOptions(field.options);
        const fieldMarkup = definition.fields.map((field) => {
            let oldValue = current ? nestedValue(current, field.name) ?? current[field.name] ?? '' : '';
            if (field.type === 'time' && oldValue) oldValue = String(oldValue).slice(0, 5);
            if (field.name === 'override_kbm') oldValue = oldValue ? '1' : '0';
            const required = field.required ? 'required' : '';
            let control;
            if (field.type === 'select' || field.type === 'period') {
                const optionItems = typeof field.options === 'string' ? (references[field.options] || []) : [];
                const scopedItems = resource === 'students' && field.name === 'kelas_id'
                    ? optionItems.filter((item) => String(item.tahun_ajaran_id) === String(current?.tahun_ajaran_id ?? current?.penempatans?.find((p) => p.tahun_ajaran?.is_active)?.tahun_ajaran_id ?? ''))
                    : resource === 'classes' && field.name === 'tahun_ajaran_id' ? optionItems : optionItems;
                const options = field.type === 'period' ? [] : typeof field.options === 'string'
                    ? scopedItems.map((item) => [item.id, item[field.value || 'nama']]) : field.options;
                control = `<select class="form-select" name="${field.name}" ${required}><option value="">Pilih…</option>${options.map(([value, label]) => `<option value="${htmlSafe(value)}" ${String(oldValue) === String(value) ? 'selected' : ''}>${htmlSafe(label)}</option>`).join('')}</select>`;
            } else {
                const isCoordinate = field.type === 'number' && /lat|long|latitude|longitude/i.test(field.name);
                const coordinateAttrs = isCoordinate
                    ? /lat|latitude/i.test(field.name)
                        ? 'step="any" inputmode="decimal" min="-90" max="90"'
                        : 'step="any" inputmode="decimal" min="-180" max="180"'
                    : field.type === 'number'
                        ? 'step="1" inputmode="numeric"'
                        : '';
                control = `<input class="form-control" name="${field.name}" type="${field.type || 'text'}" value="${htmlSafe(oldValue)}" ${required} ${coordinateAttrs}>`;
            }
            const wrapperId = resource === 'schedules' && ['periode_mulai', 'periode_selesai'].includes(field.name) ? ` data-schedule-field="${field.name}"` : '';
            return `<div class="col-sm-12"${wrapperId}><label class="form-label">${htmlSafe(field.label)}</label>${control}</div>`;
        }).join('');
        const heading = current ? `Ubah ${definition.title}` : `Tambah ${definition.title}`;
        const importable = ['classes', 'students', 'subjects', 'materials', 'schedules'].includes(resource);
        const studentYears = references['academic-years'] || [];
        const studentClasses = references.classes || [];
        const studentImportYearSelect = resource === 'students'
            ? `<div><label class="form-label small mb-1" for="studentImportYear">Tahun ajaran tujuan</label><select class="form-select" id="studentImportYear"><option value="">Pilih tahun ajaran</option>${studentYears.map((item) => `<option value="${htmlSafe(item.id)}" ${item.is_active ? 'selected' : ''}>${htmlSafe(item.tahun_ajaran)}${item.is_active ? ' (aktif)' : ''}</option>`).join('')}</select></div>` : '';
        const studentImportClassSelect = resource === 'students'
            ? `<div><label class="form-label small mb-1" for="studentImportClass">Kelas tujuan impor</label><select class="form-select" id="studentImportClass" disabled><option value="">Pilih tahun ajaran terlebih dahulu</option></select></div>` : '';
        const studentPrintControls = resource === 'students'
            ? `<div class="border rounded p-3 mb-3"><div class="fw-semibold mb-2"><i class="bi bi-printer"></i> Cetak daftar siswa per kelas</div><div class="d-flex flex-wrap align-items-end gap-2"><div><label class="form-label small mb-1" for="studentPrintYear">Tahun ajaran</label><select class="form-select" id="studentPrintYear"><option value="">Pilih tahun ajaran</option>${studentYears.map((item) => `<option value="${htmlSafe(item.id)}" ${item.is_active ? 'selected' : ''}>${htmlSafe(item.tahun_ajaran)}${item.is_active ? ' (aktif)' : ''}</option>`).join('')}</select></div><div><label class="form-label small mb-1" for="studentPrintClass">Kelas</label><select class="form-select" id="studentPrintClass" disabled><option value="">Pilih tahun ajaran dahulu</option></select></div><button class="btn btn-outline-dark" type="button" id="studentPrintButton"><i class="bi bi-printer"></i> Cetak daftar</button></div><div class="small text-secondary mt-2">Daftar memuat siswa yang memiliki penempatan pada kelas dan tahun ajaran yang dipilih.</div></div>` : '';
        const importActions = importable ? `${studentImportYearSelect}${studentImportClassSelect}<button class="btn btn-outline-success align-self-end" type="button" id="masterImportButton"><i class="bi bi-upload"></i> Import Excel</button><button class="btn btn-outline-primary align-self-end" type="button" id="masterTemplateButton"><i class="bi bi-download"></i> Template Excel</button>${resource === 'classes' ? '<button class="btn btn-outline-primary align-self-end" type="button" id="dapodikRombelButton"><i class="bi bi-file-earmark-spreadsheet"></i> Import Kelas dari Dapodik</button><input class="d-none" type="file" id="dapodikRombelFile" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">' : ''}${resource === 'students' ? '<button class="btn btn-outline-primary align-self-end" type="button" id="dapodikSiswaButton"><i class="bi bi-people"></i> Import Siswa dari Dapodik</button><input class="d-none" type="file" id="dapodikSiswaFile" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">' : ''} : ''}<input class="d-none" type="file" id="masterImportFile" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">` : '';
        const calendarNotice = resource === 'schedules' ? (activeCalendar ? `<div class="alert alert-info small">Kalender aktif: <strong>${htmlSafe(activeCalendar.nama)}</strong>. Pilih hari, lalu tentukan periode mulai dan selesai. Jam jadwal dihitung otomatis dari detail kalender.</div>` : '<div class="alert alert-warning small">Belum ada kalender jam pelajaran aktif. Aktifkan kalender terlebih dahulu sebelum menambahkan jadwal.</div>') : '';
        setFeature(definition.title, `${studentPrintControls}${calendarNotice}<div class="d-flex flex-wrap align-items-end gap-2 mb-3"><button class="btn btn-success align-self-end" id="showMasterForm" ${current ? 'hidden' : ''}><i class="bi bi-plus-lg"></i> Tambah data</button>${importActions}</div>${resource === 'students' ? '<div class="alert alert-info small mb-3">Template siswa memakai kolom wajib: tahun_ajaran, nisn, nama, jenis_kelamin. Nilai tahun_ajaran pada setiap baris harus sama dengan tahun ajaran penempatan dan kelas tujuan yang dipilih. Jenis kelamin gunakan L atau P. Perubahan penempatan tidak menghapus riwayat presensi.</div><div class="alert alert-secondary small mb-3"><strong>Import Siswa dari Dapodik:</strong> gunakan file export Daftar Peserta Didik (.xlsx). Siswa ditempatkan ke tahun ajaran aktif berdasarkan kolom NISN, Nama, JK, dan Rombel Saat Ini. Pastikan kelas-kelas Dapodik sudah diimpor terlebih dahulu dan nama rombel cocok dengan nama kelas di AKSARA.</div>' : resource === 'classes' ? '<div class="alert alert-info small mb-3">Template kelas wajib memuat kolom tahun_ajaran. Isi dengan nama tahun ajaran yang sudah terdaftar, misalnya 2026/2027. Nama kelas yang sama diperbolehkan pada tahun ajaran berbeda.</div><div class="alert alert-secondary small mb-3"><strong>Import Dapodik:</strong> unggah file export Rombongan Belajar. Rombel akan ditambahkan ke tahun ajaran aktif; rombel yang sudah ada dilewati dan data lama tidak ditimpa. Kolom Kurikulum dipetakan ke Jurusan; wali kelas dicocokkan berdasarkan nama jika tersedia.</div>' : ''}<div id="masterImportResult" class="mb-3"></div><form class="card mb-4 admin-form-card" id="masterForm" ${current ? `data-id="${current.id}"` : ''} ${current ? '' : 'hidden'}><div class="card-body"><h3 class="h6 mb-3">${heading}</h3><div class="row g-3 admin-form-grid">${fieldMarkup}<div class="col-sm-12 d-flex gap-2 form-actions"><button class="btn btn-primary" type="submit">Simpan</button><button class="btn btn-outline-secondary" type="button" id="cancelMasterForm">Batal</button></div></div></div></form>${resource === 'schedules' ? `<div class="row g-2 mb-3" id="scheduleTableFilters"><div class="col-md-4"><label class="form-label small mb-1" for="scheduleFilterClass">Filter Kelas</label><select class="form-select form-select-sm" id="scheduleFilterClass"><option value="">Semua kelas</option>${[...new Set(items.map((item) => item.kelas?.nama_kelas).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id')).map((name) => `<option value="${htmlSafe(name)}">${htmlSafe(name)}</option>`).join('')}</select></div><div class="col-md-4"><label class="form-label small mb-1" for="scheduleFilterTeacher">Filter Nama Guru</label><select class="form-select form-select-sm" id="scheduleFilterTeacher"><option value="">Semua guru</option>${[...new Set(items.map((item) => item.guru?.nama).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id')).map((name) => `<option value="${htmlSafe(name)}">${htmlSafe(name)}</option>`).join('')}</select></div><div class="col-md-4"><label class="form-label small mb-1" for="scheduleFilterDay">Filter Hari</label><select class="form-select form-select-sm" id="scheduleFilterDay"><option value="">Semua hari</option>${[...new Set(items.map((item) => item.hari).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id')).map((day) => `<option value="${htmlSafe(day)}">${htmlSafe(day)}</option>`).join('')}</select></div><div class="col-12"><button class="btn btn-sm btn-outline-secondary" type="button" id="resetScheduleFilters"><i class="bi bi-arrow-counterclockwise"></i> Reset filter</button><span class="small text-secondary ms-2" id="scheduleFilterCount"></span></div></div>` : ''}
<div class="table-responsive"><table class="table table-sm align-middle mobile-table"><thead><tr><th>No.</th>${definition.columns.map((column) => `<th>${htmlSafe(definition.columnLabels?.[column] || column.split('.').pop().replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase()))}</th>`).join('')}<th>Aksi</th></tr></thead><tbody>${items.map((item, index) => `<tr ${resource === 'schedules' ? `data-schedule-class="${htmlSafe(item.kelas?.nama_kelas || '')}" data-schedule-teacher="${htmlSafe(item.guru?.nama || '')}" data-schedule-day="${htmlSafe(item.hari || '')}"` : ''}><td>${index + 1}</td>${definition.columns.map((column) => `<td>${htmlSafe((resource === 'schedules' && column === 'jam_mulai' ? (item.jam_mulai_resolved ?? 'Tidak tersedia') : resource === 'schedules' && column === 'jam_selesai' ? (item.jam_selesai_resolved ?? 'Tidak tersedia') : (resource === 'students' && column === 'kelas_aktif' ? (item.penempatans?.find((p) => p.tahun_ajaran?.is_active)?.kelas?.nama_kelas || 'Belum ditempatkan') : resource === 'students' && column === 'tahun_ajaran_aktif' ? (item.penempatans?.find((p) => p.tahun_ajaran?.is_active)?.tahun_ajaran?.tahun_ajaran || '—') : (resource === 'students' && column === 'nama' ? formatPersonName(item.nama) : nestedValue(item, column))) ?? item[column] ?? '—'))}</td>`).join('')}<td class="d-flex gap-1">${resource === 'academic-years' ? `<button class="btn btn-sm btn-outline-success" data-activate="${item.id}" ${item.is_active ? 'disabled' : ''}>${item.is_active ? 'Aktif' : 'Aktifkan'}</button>` : ''}<button class="btn btn-sm btn-outline-primary" data-edit="${item.id}">Ubah</button><button class="btn btn-sm btn-outline-danger" data-delete="${item.id}">Hapus</button></td></tr>`).join('') || `<tr><td colspan="${definition.columns.length + 2}" class="text-center text-secondary py-4">Belum ada data.</td></tr>`}</tbody></table></div>${resource === 'agendas' ? '<div class="alert alert-warning small">Scope tingkat/kelas belum tersedia karena skema tidak memiliki target kelas/tingkat.</div>' : ''}`);
        if (resource === 'students') {
            const yearField = $('masterForm')?.querySelector('[name="tahun_ajaran_id"]');
            const classField = $('masterForm')?.querySelector('[name="kelas_id"]');
            const refreshClasses = () => {
                if (!classField) return;
                const selected = classField.value;
                const filtered = studentClasses.filter((item) => String(item.tahun_ajaran_id) === String(yearField?.value || ''));
                classField.innerHTML = `<option value="">Pilih kelas…</option>${filtered.map((item) => `<option value="${htmlSafe(item.id)}">${htmlSafe(item.nama_kelas)}</option>`).join('')}`;
                if (filtered.some((item) => String(item.id) === String(selected))) classField.value = selected;
                classField.disabled = !yearField?.value || filtered.length === 0;
            };
            yearField?.addEventListener('change', refreshClasses);
            refreshClasses();
            const printYear = $('studentPrintYear');
            const printClass = $('studentPrintClass');
            const refreshPrintClasses = () => {
                if (!printClass) return;
                const yearId = printYear?.value || '';
                const filtered = studentClasses.filter((item) => String(item.tahun_ajaran_id) === String(yearId));
                printClass.innerHTML = `<option value="">${yearId ? (filtered.length ? 'Pilih kelas' : 'Belum ada kelas pada tahun ajaran ini') : 'Pilih tahun ajaran dahulu'}</option>${filtered.map((item) => `<option value="${htmlSafe(item.id)}">${htmlSafe(item.nama_kelas)}</option>`).join('')}`;
                printClass.disabled = !yearId || filtered.length === 0;
            };
            printYear?.addEventListener('change', refreshPrintClasses);
            refreshPrintClasses();
            $('studentPrintButton')?.addEventListener('click', () => {
                const yearId = printYear?.value || '';
                const classId = printClass?.value || '';
                if (!yearId || !classId) { $('masterImportResult').innerHTML = '<div class="alert alert-warning mb-0">Pilih tahun ajaran dan kelas untuk mencetak daftar siswa.</div>'; return; }
                const year = studentYears.find((item) => String(item.id) === String(yearId));
                const klass = studentClasses.find((item) => String(item.id) === String(classId));
                const rows = items.filter((student) => (student.penempatans || []).some((placement) => String(placement.tahun_ajaran_id) === String(yearId) && String(placement.kelas_id) === String(classId))).sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id'));
                const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
                const tableRows = rows.map((student, index) => '<tr><td>' + (index + 1) + '</td><td>' + esc(student.nisn) + '</td><td>' + esc(formatPersonName(student.nama)) + '</td><td>' + esc(student.jenis_kelamin) + '</td></tr>').join('') || '<tr><td colspan="4" style="text-align:center">Tidak ada siswa pada kelas ini.</td></tr>';
                const printFrame = document.createElement('iframe');
                printFrame.setAttribute('title', 'Pratinjau cetak daftar siswa');
                printFrame.style.position = 'fixed';
                printFrame.style.right = '0';
                printFrame.style.bottom = '0';
                printFrame.style.width = '0';
                printFrame.style.height = '0';
                printFrame.style.border = '0';
                document.body.appendChild(printFrame);
                const printDocument = printFrame.contentDocument;
                printDocument.open();
                printDocument.write('<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Daftar Siswa</title><style>body{font-family:Arial,sans-serif;color:#111;margin:24px}h2,p{text-align:center;margin:4px}table{width:100%;border-collapse:collapse;margin-top:22px;font-size:12px}th,td{border:1px solid #333;padding:6px 8px}th{background:#eee}.signature{margin:36px 30px 0 auto;width:220px;text-align:center}@media print{body{margin:10mm}}</style></head><body><h2>DAFTAR SISWA</h2><p>TAHUN AJARAN ' + esc(year?.tahun_ajaran || '') + '</p><p>Kelas: <strong>' + esc(klass?.nama_kelas || '') + '</strong></p><p>Jumlah siswa: ' + rows.length + '</p><table><thead><tr><th>No.</th><th>NISN</th><th>Nama Siswa</th><th>L/P</th></tr></thead><tbody>' + tableRows + '</tbody></table><div class="signature"><p>Mengetahui,</p><p>Wali Kelas</p><br><br><p>(' + esc(klass?.wali_kelas?.nama ? formatPersonName(klass.wali_kelas.nama) : 'Belum ditentukan') + ')</p></div></body></html>');
                printDocument.close();
                const cleanupPrintFrame = () => { printFrame.remove(); };
                printFrame.onload = () => {
                    printFrame.contentWindow.focus();
                    printFrame.contentWindow.print();
                    printFrame.contentWindow.addEventListener('afterprint', cleanupPrintFrame, { once: true });
                };
            });
            const importYear = $('studentImportYear');
            const importClass = $('studentImportClass');
            const refreshImportClasses = async () => {
                if (!importClass) return;
                const yearId = importYear?.value || '';
                const filtered = studentClasses.filter((item) => String(item.tahun_ajaran_id) === String(yearId));
                importClass.innerHTML = `<option value="">${yearId ? (filtered.length ? 'Pilih kelas' : 'Belum ada kelas untuk tahun ini') : 'Pilih tahun ajaran terlebih dahulu'}</option>${filtered.map((item) => `<option value="${htmlSafe(item.id)}">${htmlSafe(item.nama_kelas)}</option>`).join('')}`;
                importClass.disabled = !yearId || filtered.length === 0;
            };
            importYear?.addEventListener('change', refreshImportClasses);
            refreshImportClasses();
            document.querySelectorAll('tbody tr').forEach((row) => { /* keep table rows untouched */ });
        }
        if (resource === 'schedules') {
            const yearField = $('masterForm')?.querySelector('[name="tahun_ajaran_id"]');
            const classField = $('masterForm')?.querySelector('[name="kelas_id"]');
            const refreshScheduleClasses = () => {
                if (!classField) return;
                const selected = classField.value;
                const filtered = (references.classes || []).filter((item) => String(item.tahun_ajaran_id) === String(yearField?.value || ''));
                classField.innerHTML = `<option value="">Pilih kelas…</option>${filtered.map((item) => `<option value="${htmlSafe(item.id)}">${htmlSafe(item.nama_kelas)}</option>`).join('')}`;
                if (filtered.some((item) => String(item.id) === String(selected))) classField.value = selected;
                classField.disabled = !yearField?.value || filtered.length === 0;
            };
            yearField?.addEventListener('change', refreshScheduleClasses);
            refreshScheduleClasses();
            const filterClass = $('scheduleFilterClass');
            const filterTeacher = $('scheduleFilterTeacher');
            const filterDay = $('scheduleFilterDay');
            const filterCount = $('scheduleFilterCount');
            const scheduleRows = Array.from(document.querySelectorAll('tr[data-schedule-class]'));
            const applyScheduleFilters = () => {
                const classValue = filterClass?.value || '';
                const teacherValue = filterTeacher?.value || '';
                const dayValue = filterDay?.value || '';
                let visible = 0;
                scheduleRows.forEach((row) => {
                    const matches = (!classValue || row.dataset.scheduleClass === classValue)
                        && (!teacherValue || row.dataset.scheduleTeacher === teacherValue)
                        && (!dayValue || row.dataset.scheduleDay === dayValue);
                    row.hidden = !matches;
                    if (matches) visible++;
                });
                if (filterCount) filterCount.textContent = `Menampilkan ${visible} dari ${scheduleRows.length} jadwal`;
            };
            [filterClass, filterTeacher, filterDay].forEach((select) => select?.addEventListener('change', applyScheduleFilters));
            $('resetScheduleFilters')?.addEventListener('click', () => {
                if (filterClass) filterClass.value = '';
                if (filterTeacher) filterTeacher.value = '';
                if (filterDay) filterDay.value = '';
                applyScheduleFilters();
            });
            applyScheduleFilters();
        }

        $('masterImportButton')?.addEventListener('click', () => {
            if (resource === 'students' && !$('studentImportClass')?.value) {
                $('masterImportResult').innerHTML = '<div class="alert alert-warning mb-0">Pilih kelas tujuan terlebih dahulu.</div>';
                return;
            }
            $('masterImportResult').replaceChildren();
            $('masterImportFile').click();
        });
        $('dapodikSiswaButton')?.addEventListener('click', () => {
            $('masterImportResult').replaceChildren();
            $('dapodikSiswaFile')?.click();
        });
        $('dapodikSiswaFile')?.addEventListener('change', async (event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            const resultBox = $('masterImportResult');
            if (!window.confirm('Import peserta didik dari Dapodik ke tahun ajaran aktif berdasarkan kolom Rombel Saat Ini? Siswa dengan NISN yang sudah ada tidak akan diduplikasi.')) { event.currentTarget.value = ''; return; }
            resultBox.innerHTML = '<div class="alert alert-info mb-0">Memvalidasi dan mengimpor peserta didik Dapodik...</div>';
            try {
                const data = new FormData();
                data.append('file', file);
                const result = await api('/api/v1/academic/imports/dapodik/siswa', { method: 'POST', body: data });
                await openMaster(resource);
                $('masterImportResult').innerHTML = '<div class="alert alert-success mb-0">' + htmlSafe(result.message) + '</div>';
            } catch (error) {
                resultBox.innerHTML = '<div class="alert alert-danger mb-0">' + htmlSafe(error.message) + '</div>';
            } finally { event.currentTarget.value = ''; }
        });
        $('dapodikRombelButton')?.addEventListener('click', () => {
            $('masterImportResult').replaceChildren();
            $('dapodikRombelFile')?.click();
        });
        $('dapodikRombelFile')?.addEventListener('change', async (event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            const resultBox = $('masterImportResult');
            if (!window.confirm('Import rombel dari Dapodik ke tahun ajaran aktif? Rombel yang sudah ada akan dilewati dan tidak ditimpa.')) {
                event.currentTarget.value = '';
                return;
            }
            resultBox.innerHTML = '<div class="alert alert-info mb-0">Memvalidasi dan mengimpor rombel Dapodik...</div>';
            try {
                const data = new FormData();
                data.append('file', file);
                const result = await api('/api/v1/academic/imports/dapodik/rombel', { method: 'POST', body: data });
                await openMaster(resource);
                $('masterImportResult').innerHTML = `<div class="alert alert-success mb-0">${htmlSafe(result.message)}</div>`;
            } catch (error) {
                resultBox.innerHTML = `<div class="alert alert-danger mb-0">${htmlSafe(error.message)}</div>`;
            } finally {
                event.currentTarget.value = '';
            }
        });
        $('masterTemplateButton')?.addEventListener('click', async () => {
            try { await downloadTemplate(resource); }
            catch (error) { $('masterImportResult').innerHTML = `<div class="alert alert-danger mb-0">${htmlSafe(error.message)}</div>`; }
        });
        $('masterImportFile')?.addEventListener('change', async (event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            const resultBox = $('masterImportResult');
            const classId = resource === 'students' ? $('studentImportClass')?.value : null;
            const yearId = resource === 'students' ? $('studentImportYear')?.value : null;
            if (resource === 'students' && (!yearId || !classId)) {
                resultBox.innerHTML = '<div class="alert alert-warning mb-0">Pilih tahun ajaran dan kelas tujuan terlebih dahulu.</div>';
                event.currentTarget.value = '';
                return;
            }
            resultBox.innerHTML = '<div class="alert alert-info mb-0">Memeriksa dan mengimpor file Excel...</div>';
            try {
                const result = await api(`/api/v1/academic/imports/${resource}`, { method: 'POST', body: (() => { const data = new FormData(); data.append('file', file); if (classId) data.append('class_id', classId); if (yearId) data.append('tahun_ajaran_id', yearId); return data; })() });
                await openMaster(resource);
                $('masterImportResult').innerHTML = `<div class="alert alert-success mb-0">${htmlSafe(result.message)}</div>`;
            } catch (error) {
                resultBox.innerHTML = `<div class="alert alert-danger mb-0">${htmlSafe(error.message)}</div>`;
                event.currentTarget.value = '';
            }
        });
        if (resource === 'schedules') {
            const startPeriod = $('masterForm').querySelector('[name="periode_mulai"]');
            const endPeriod = $('masterForm').querySelector('[name="periode_selesai"]');
            const day = $('masterForm').querySelector('[name="hari"]');
            const renderPeriodOptions = () => {
                const selectedStart = startPeriod?.value || '';
                const selectedEnd = endPeriod?.value || '';
                const periods = (activeCalendar?.detail_periode || [])
                    .filter((period) => period.hari === day?.value)
                    .sort((a, b) => Number(a.nomor_periode) - Number(b.nomor_periode));
                const options = periods.map((period) => {
                    const start = String(period.jam_mulai || '').slice(0, 5);
                    const end = String(period.jam_selesai || '').slice(0, 5);
                    const label = `Periode ${period.nomor_periode} (${start}–${end})`;
                    return `<option value="${htmlSafe(period.nomor_periode)}">${htmlSafe(label)}</option>`;
                }).join('');
                for (const [select, value] of [[startPeriod, selectedStart], [endPeriod, selectedEnd]]) {
                    if (!select) continue;
                    select.innerHTML = `<option value="">Pilih periode…</option>${options}`;
                    if (periods.some((period) => String(period.nomor_periode) === String(value))) select.value = value;
                    select.disabled = !activeCalendar || !day?.value || periods.length === 0;
                    select.required = Boolean(activeCalendar);
                }
                if (startPeriod && endPeriod && startPeriod.value && endPeriod.value && Number(endPeriod.value) < Number(startPeriod.value)) {
                    endPeriod.setCustomValidity('Periode selesai harus sama dengan atau setelah periode mulai.');
                } else {
                    endPeriod?.setCustomValidity('');
                }
            };
            if (day && current?.hari) day.value = current.hari;
            day?.addEventListener('change', renderPeriodOptions);
            startPeriod?.addEventListener('change', renderPeriodOptions);
            endPeriod?.addEventListener('change', renderPeriodOptions);
            renderPeriodOptions();
        }
        $('showMasterForm').addEventListener('click', () => { $('masterForm').hidden = false; });
        $('cancelMasterForm').addEventListener('click', () => {
            if (current) openMaster(resource);
            else $('masterForm').hidden = true;
        });
        $('masterForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const values = Object.fromEntries(new FormData(event.currentTarget).entries());
            for (const field of definition.fields) {
                if (field.type === 'time' && values[field.name]) values[field.name] = values[field.name].slice(0, 5);
            }
            delete values.jam_mulai;
            delete values.jam_selesai;
            delete values.mode_waktu;
            if (values.siklus_minggu === '') values.siklus_minggu = null;
            if (values.wali_kelas_id === '') values.wali_kelas_id = null;
            if (values.tahun_ajaran_id === '') values.tahun_ajaran_id = null;
            if (values.lat_temporary === '') values.lat_temporary = null;
            if (values.long_temporary === '') values.long_temporary = null;
            if (values.radius_meters === '') values.radius_meters = null;
            if ('override_kbm' in values) values.override_kbm = values.override_kbm === '1';
            const id = event.currentTarget.dataset.id;
            try {
                if (resource === 'students') {
                    const placement = { kelas_id: Number(values.kelas_id), tahun_ajaran_id: Number(values.tahun_ajaran_id) };
                    delete values.kelas_id; delete values.tahun_ajaran_id;
                    if (id) {
                        await api(`/api/v1/academic/${resource}/${id}`, { method: 'PATCH', body: { ...values, ...placement } });
                    } else {
                        await api(`/api/v1/academic/${resource}`, { method: 'POST', body: { ...values, ...placement } });
                    }
                } else {
                    await api(`/api/v1/academic/${resource}${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: values });
                }
                showToast('Data berhasil disimpan.');
                openMaster(resource);
            } catch (error) { setFeatureError(error); }
        });
        document.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => {
            const item = items.find((entry) => String(entry.id) === button.dataset.edit);
            if (resource === 'students' && item) {
                const activePlacement = item.penempatans?.find((p) => p.tahun_ajaran?.is_active) || item.penempatans?.[0];
                openMaster(resource, { ...item, kelas_id: activePlacement?.kelas_id || '', tahun_ajaran_id: activePlacement?.tahun_ajaran_id || '' });
            } else openMaster(resource, item);
        }));
        document.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', async () => {
            if (!confirm('Hapus data ini? Data yang masih memiliki relasi akan ditolak server.')) return;
            try { await api(`/api/v1/academic/${resource}/${button.dataset.delete}`, { method: 'DELETE' }); openMaster(resource); }
            catch (error) { showToast(error.message); }
        }));
        document.querySelectorAll('[data-activate]').forEach((button) => button.addEventListener('click', async () => {
            try { await api(`/api/v1/academic/academic-years/${button.dataset.activate}/activate`, { method: 'POST', body: {} }); openMaster(resource); }
            catch (error) { showToast(error.message); }
        }));
    }
    async function openCalendars(calendarId = null) {
        let calendarsResponse;
        let detailResponse = null;
        try {
            calendarsResponse = await api('/api/v1/academic/calendars');
            if (calendarId) detailResponse = await api(`/api/v1/academic/calendars/${calendarId}`);
        } catch (error) {
            setFeature('Kalender Jam Pelajaran', `<div class="alert alert-danger"><h2 class="h6">Kalender gagal dimuat</h2><p class="mb-2">${htmlSafe(error.message || 'Terjadi kesalahan saat memuat kalender.')}</p><button type="button" class="btn btn-outline-primary btn-sm" id="calendarRetry">Coba lagi</button></div>`);
            $('calendarRetry')?.addEventListener('click', () => openCalendars(calendarId));
            return;
        }

        const calendars = calendarsResponse.data || [];
        const selected = calendarId ? detailResponse?.data : null;
        if (calendarId && !selected) {
            setFeature('Kalender Jam Pelajaran', '<div class="alert alert-danger">Kalender tidak ditemukan.</div>');
            return;
        }
        const list = calendars.map((calendar) => {
            const isSelected = String(calendar.id) === String(calendarId);
            return `<tr class="${isSelected ? 'table-active' : ''}">
                <td><strong>${htmlSafe(calendar.nama)}</strong>${isSelected ? ' <span class="badge text-bg-primary">Dipilih</span>' : ''}</td>
                <td><span class="badge ${calendar.status === 'AKTIF' ? 'text-bg-success' : 'text-bg-secondary'}">${htmlSafe(calendar.status)}</span></td>
                <td>${(calendar.detail_periode || []).length}</td>
                <td class="text-nowrap"><button class="btn btn-sm ${isSelected ? 'btn-secondary' : 'btn-outline-primary'}" data-calendar-edit="${calendar.id}">${isSelected ? 'Terpilih' : 'Kelola detail'}</button>${calendar.status === 'AKTIF' ? ` <button class="btn btn-sm btn-outline-warning" data-calendar-deactivate="${calendar.id}">Nonaktifkan</button>` : ` <button class="btn btn-sm btn-success" data-calendar-activate="${calendar.id}">Aktifkan</button>`}</td>
            </tr>`;
        }).join('');
        const periods = (selected?.detail_periode || []).map((period) => ({...period, jam_mulai: String(period.jam_mulai).slice(0,5), jam_selesai: String(period.jam_selesai).slice(0,5)}));
        const periodRows = periods.map((period, index) => calendarPeriodRow(period, index)).join('');

        setFeature('Kalender Jam Pelajaran', `
            <form id="calendarCreateForm" class="card mb-3"><div class="card-body"><h2 class="h6">Buat kalender</h2><div class="row g-2"><div class="col-md-4"><label class="form-label">Nama kalender</label><input class="form-control" name="nama" maxlength="100" required></div><div class="col-md-6"><label class="form-label">Catatan (opsional)</label><input class="form-control" name="catatan"></div><div class="col-md-2 d-flex align-items-end"><button class="btn btn-success w-100" type="submit"><i class="bi bi-plus-lg"></i> Tambah data</button></div></div></div></form>

            <div class="card mb-3"><div class="card-header"><strong>Daftar Kalender</strong></div><div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead><tr><th>Nama</th><th>Status</th><th>Jumlah detail periode</th><th>Aksi</th></tr></thead><tbody>${list || '<tr><td colspan="4" class="text-center text-secondary py-3">Belum ada kalender. Buat kalender di atas.</td></tr>'}</tbody></table></div></div>

            ${selected ? `
                <div class="card mb-3"><div class="card-body">
                    <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                        <div><h2 class="h6 mb-1">Detail Kalender: ${htmlSafe(selected.nama)}</h2><div class="small text-secondary">Status: ${htmlSafe(selected.status)}. Kalender aktif harus dinonaktifkan sebelum periode diubah.</div></div>
                        <div class="d-flex flex-wrap gap-2">
                            <button class="btn btn-outline-primary btn-sm" type="button" id="calendarImportTemplate"><i class="bi bi-download"></i> Template Excel</button>
                            <button class="btn btn-outline-success btn-sm" type="button" id="calendarImportExcel" ${selected.status === 'AKTIF' ? 'disabled' : ''}><i class="bi bi-upload"></i> Import Excel</button>
                            <input class="d-none" type="file" id="calendarImportFile" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
                            <button class="btn btn-success btn-sm" type="button" id="calendarAddPeriod" ${selected.status === 'AKTIF' ? 'disabled' : ''}><i class="bi bi-plus-lg"></i> Tambah data</button>
                            <button class="btn btn-primary btn-sm" type="submit" form="calendarPeriodsForm" ${selected.status === 'AKTIF' ? 'disabled' : ''}><i class="bi bi-save"></i> Simpan periode</button>
                        </div>
                    </div>
                    <div class="alert alert-info small mb-0">Atur jam tiap periode per hari. Jeda istirahat cukup dibuat sebagai selisih waktu antarkolom periode; tidak perlu dibuat sebagai periode tersendiri. Jadwal periode 1–3 otomatis menggunakan jam mulai periode 1 dan jam selesai periode 3.</div>
                </div></div>
                <form id="calendarPeriodsForm" class="card mb-3"><div class="card-body"><div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Hari</th><th>Nomor periode</th><th>Jam mulai</th><th>Jam selesai</th><th>Label (opsional)</th><th></th></tr></thead><tbody id="calendarPeriodRows">${periodRows || calendarPeriodRow({hari:'Senin',nomor_periode:1,jam_mulai:'07:30',jam_selesai:'08:15',label:''},0)}</tbody></table></div></div></form>
            ` : '<div class="alert alert-info">Pilih <strong>Kelola detail</strong> pada daftar kalender untuk mengatur periode.</div>'}
        `);

        $('calendarCreateForm')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const values = Object.fromEntries(new FormData(event.currentTarget).entries());
            try { const created = await api('/api/v1/academic/calendars', {method:'POST', body:values}); showToast(created.message); openCalendars(created.data.id); }
            catch (error) { setFeatureError(error); }
        });
        $('calendarImportTemplate')?.addEventListener('click', async () => {
            try {
                const response = await fetch(window.aksaraApiUrl('/api/v1/academic/calendars/periods/template'), {
                    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
                });
                if (!response.ok) {
                    const error = await response.json().catch(() => ({}));
                    throw new Error(error.message || `Template gagal diunduh (${response.status}).`);
                }
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'template_detail_kalender.xlsx';
                link.click();
                URL.revokeObjectURL(url);
            } catch (error) { setFeatureError(error); }
        });
        $('calendarImportExcel')?.addEventListener('click', () => $('calendarImportFile')?.click());
        $('calendarImportFile')?.addEventListener('change', async (event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file) return;
            if (!confirm('Impor Excel akan mengganti seluruh detail periode pada kalender ini. Lanjutkan?')) {
                input.value = '';
                return;
            }
            const formData = new FormData();
            formData.append('file', file);
            try {
                const response = await fetch(window.aksaraApiUrl(`/api/v1/academic/calendars/${selected.id}/periods/import`), {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
                    body: formData,
                });
                const result = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const details = result.errors ? Object.values(result.errors).flat().join(' ') : '';
                    throw new Error(details || result.message || `Impor gagal (${response.status}).`);
                }
                showToast(result.message || 'Detail kalender berhasil diimpor.');
                openCalendars(selected.id);
            } catch (error) { setFeatureError(error); }
            finally { input.value = ''; }
        });
        $('calendarAddPeriod')?.addEventListener('click', () => {
            const rows = $('calendarPeriodRows');
            const next = rows.querySelectorAll('tr').length + 1;
            rows.insertAdjacentHTML('beforeend', calendarPeriodRow({hari:'Senin',nomor_periode:next,jam_mulai:'',jam_selesai:'',label:''}, Date.now()));
        });
        $('calendarPeriodRows')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-period-remove]');
            if (button) button.closest('tr')?.remove();
        });
        $('calendarPeriodsForm')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const periods = Array.from(event.currentTarget.querySelectorAll('#calendarPeriodRows tr')).map((row) => ({
                hari: row.querySelector('[name="hari"]').value,
                nomor_periode: Number(row.querySelector('[name="nomor_periode"]').value),
                jam_mulai: row.querySelector('[name="jam_mulai"]').value,
                jam_selesai: row.querySelector('[name="jam_selesai"]').value,
                label: row.querySelector('[name="label"]').value || null,
            }));
            try { const saved = await api(`/api/v1/academic/calendars/${selected.id}/periods`, {method:'PUT', body:{periods}}); showToast(saved.message); openCalendars(selected.id); }
            catch (error) { setFeatureError(error); }
        });
        document.querySelectorAll('[data-calendar-edit]').forEach((button) => button.addEventListener('click', () => openCalendars(button.dataset.calendarEdit)));
        document.querySelectorAll('[data-calendar-activate]').forEach((button) => button.addEventListener('click', async () => {
            if (!confirm('Aktifkan kalender ini? Kalender aktif sebelumnya akan dinonaktifkan.')) return;
            try { const result = await api(`/api/v1/academic/calendars/${button.dataset.calendarActivate}/activate`, {method:'POST', body:{}}); showToast(result.message); openCalendars(calendarId); }
            catch (error) { setFeatureError(error); }
        }));
        document.querySelectorAll('[data-calendar-deactivate]').forEach((button) => button.addEventListener('click', async () => {
            if (!confirm('Nonaktifkan kalender ini? Jadwal berbasis periode tidak dapat di-resolve sampai kalender lain diaktifkan.')) return;
            try { const result = await api(`/api/v1/academic/calendars/${button.dataset.calendarDeactivate}/deactivate`, {method:'POST', body:{}}); showToast(result.message); openCalendars(calendarId); }
            catch (error) { setFeatureError(error); }
        }));
    }

    function calendarPeriodRow(period, key) {
        const days = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
        return `<tr data-period-row="${htmlSafe(key)}"><td><select class="form-select form-select-sm" name="hari">${days.map((day) => `<option value="${day}" ${period.hari === day ? 'selected' : ''}>${day}</option>`).join('')}</select></td><td><input class="form-control form-control-sm" type="number" name="nomor_periode" min="1" max="30" value="${htmlSafe(period.nomor_periode || 1)}" required></td><td><input class="form-control form-control-sm" type="time" name="jam_mulai" value="${htmlSafe(period.jam_mulai || '')}" required></td><td><input class="form-control form-control-sm" type="time" name="jam_selesai" value="${htmlSafe(period.jam_selesai || '')}" required></td><td><input class="form-control form-control-sm" name="label" maxlength="50" value="${htmlSafe(period.label || '')}"></td><td><button class="btn btn-sm btn-outline-danger" type="button" data-period-remove aria-label="Hapus periode">Hapus</button></td></tr>`;
    }


    // Alur kenaikan kelas: siapkan pemetaan sebagai draf, periksa hasilnya, lalu konfirmasi sebelum menyimpan.
    async function openPromotions() {
        setFeature('Kenaikan Kelas', `
            <div class="alert alert-info">Pilih tahun ajaran asal dan tujuan. Periksa setiap kelas tujuan terlebih dahulu; belum ada perubahan yang disimpan sampai Anda menekan Konfirmasi Kenaikan Kelas.</div>
            <form id="promotionSetup" class="card admin-form-card mb-3"><div class="card-body"><div class="row g-3">
                <div class="col-md-5"><label class="form-label" for="promotionSourceYear">Tahun ajaran asal</label><select class="form-select" id="promotionSourceYear" required><option value="">Memuat tahun ajaran…</option></select></div>
                <div class="col-md-5"><label class="form-label" for="promotionTargetYear">Tahun ajaran tujuan</label><select class="form-select" id="promotionTargetYear" required><option value="">Pilih tahun ajaran tujuan</option></select></div>
                <div class="col-md-2 d-flex align-items-end"><button class="btn btn-outline-primary w-100" type="submit">Siapkan draf</button></div>
            </div></div></form>
            <div id="promotionDraft" aria-live="polite"><div class="text-secondary">Pilih tahun ajaran untuk menyiapkan daftar siswa.</div></div>`);
        const sourceSelect = $('promotionSourceYear');
        const targetSelect = $('promotionTargetYear');
        const draft = $('promotionDraft');
        try {
            const yearResult = await api('/api/v1/academic/students/academic-years');
            const years = yearResult.data || [];
            const options = years.map((year) => `<option value="${htmlSafe(year.id)}">${htmlSafe(year.tahun_ajaran)}${year.is_active ? ' (aktif)' : ''}</option>`).join('');
            sourceSelect.innerHTML = '<option value="">Pilih tahun ajaran asal</option>' + options;
            targetSelect.innerHTML = '<option value="">Pilih tahun ajaran tujuan</option>' + options;
            const activeYear = years.find((year) => year.is_active);
            if (activeYear) sourceSelect.value = String(activeYear.id);
        } catch (error) {
            draft.innerHTML = `<div class="alert alert-danger">${htmlSafe(error.message)}</div>`;
            return;
        }

        const loadDraft = async () => {
            const sourceYearId = sourceSelect.value;
            const targetYearId = targetSelect.value;
            if (!sourceYearId || !targetYearId) {
                draft.innerHTML = '<div class="alert alert-warning">Pilih kedua tahun ajaran terlebih dahulu.</div>';
                return;
            }
            if (sourceYearId === targetYearId) {
                draft.innerHTML = '<div class="alert alert-warning">Tahun ajaran asal dan tujuan harus berbeda.</div>';
                return;
            }
            draft.innerHTML = '<div class="text-secondary"><span class="spin"></span> Menyiapkan daftar siswa dan kelas tujuan…</div>';
            try {
                const [students, classesResponse] = await Promise.all([
                    window.aksaraFetchAllPages(api, '/api/v1/academic/students', { tahun_ajaran_id: sourceYearId }),
                    api(`/api/v1/academic/students/classes?tahun_ajaran_id=${encodeURIComponent(targetYearId)}`),
                ]);
                const targetClasses = classesResponse.data || [];
                const eligible = students.filter((student) => !student.arsip && !student.penempatans?.some((placement) => String(placement.tahun_ajaran_id) === String(targetYearId)));
                const rows = eligible.map((student) => {
                    const sourcePlacement = student.penempatans?.find((placement) => String(placement.tahun_ajaran_id) === String(sourceYearId));
                    const sourceClass = sourcePlacement?.kelas;
                    const matchingClass = targetClasses.find((item) => item.nama_kelas === sourceClass?.nama_kelas) ||
                        targetClasses.find((item) => String(item.tingkat) === String(sourceClass?.tingkat) && item.jurusan === sourceClass?.jurusan);
                    const targetOptions = targetClasses.map((item) => `<option value="${htmlSafe(item.id)}" ${String(item.id) === String(matchingClass?.id || '') ? 'selected' : ''}>${htmlSafe(item.nama_kelas)} · Tingkat ${htmlSafe(item.tingkat)} · ${htmlSafe(item.jurusan)}</option>`).join('');
                    return `<tr><td><input class="form-check-input" type="checkbox" data-promotion-student="${htmlSafe(student.id)}" ${matchingClass ? 'checked' : ''} ${targetClasses.length ? '' : 'disabled'} aria-label="Sertakan ${htmlSafe(student.nama)}"></td><td>${htmlSafe(student.nisn)}</td><td>${htmlSafe(student.nama)}</td><td>${htmlSafe(sourceClass?.nama_kelas || '—')}</td><td><select class="form-select form-select-sm" data-promotion-class="${htmlSafe(student.id)}" ${targetClasses.length ? '' : 'disabled'}><option value="">Pilih kelas tujuan</option>${targetOptions}</select></td></tr>`;
                }).join('');
                draft.innerHTML = `
                    <div class="card mb-3"><div class="card-body">
                        <div class="d-flex flex-wrap justify-content-between gap-2 align-items-center mb-2"><div><h3 class="h6 mb-1">Draf penempatan tahun ajaran tujuan</h3><p class="small text-secondary mb-0">Centang siswa yang akan diproses dan pastikan kelas tujuannya benar.</p></div><span class="badge text-bg-secondary">${eligible.length} siswa tersedia</span></div>
                        ${targetClasses.length ? '' : '<div class="alert alert-warning">Belum ada kelas untuk tahun ajaran tujuan. Buat kelas terlebih dahulu melalui menu Kelas.</div>'}
                        <div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Pilih</th><th>NISN</th><th>Nama siswa</th><th>Kelas asal</th><th>Kelas tujuan</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="text-center text-secondary py-3">Tidak ada siswa yang dapat diproses. Pastikan siswa sudah ditempatkan pada tahun asal dan belum memiliki penempatan tahun tujuan.</td></tr>'}</tbody></table></div>
                        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2"><span class="small text-secondary">Siswa yang sudah punya penempatan di tahun tujuan atau sudah diarsipkan tidak ditampilkan.</span><button class="btn btn-primary" type="button" id="confirmPromotions" ${targetClasses.length && eligible.length ? '' : 'disabled'}>Konfirmasi Kenaikan Kelas</button></div>
                    </div></div>`;
                $('confirmPromotions')?.addEventListener('click', async () => {
                    const selected = Array.from(draft.querySelectorAll('[data-promotion-student]:checked')).map((checkbox) => {
                        const studentId = checkbox.dataset.promotionStudent;
                        return { siswa_id: Number(studentId), kelas_id: Number(draft.querySelector(`[data-promotion-class="${studentId}"]`)?.value || 0) };
                    });
                    if (!selected.length) { showToast('Pilih minimal satu siswa untuk diproses.'); return; }
                    if (selected.some((item) => !item.kelas_id)) { showToast('Pilih kelas tujuan untuk setiap siswa yang dicentang.'); return; }
                    if (!confirm(`Anda akan membuat penempatan untuk ${selected.length} siswa pada tahun ajaran tujuan. Riwayat tahun sebelumnya tidak dihapus. Setelah dikonfirmasi, perubahan tersimpan. Lanjutkan?`)) return;
                    const button = $('confirmPromotions');
                    button.disabled = true;
                    button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Menyimpan…';
                    try {
                        const result = await api('/api/v1/academic/students/promote', { method: 'POST', body: {
                            tahun_ajaran_asal_id: Number(sourceYearId),
                            tahun_ajaran_tujuan_id: Number(targetYearId),
                            placements: selected,
                        }});
                        showToast(result.message || `Penempatan ${result.count || selected.length} siswa berhasil dibuat.`);
                        await loadDraft();
                    } catch (error) {
                        setFeatureError(error);
                        button.disabled = false;
                        button.textContent = 'Konfirmasi Kenaikan Kelas';
                    }
                });
            } catch (error) {
                draft.innerHTML = `<div class="alert alert-danger">${htmlSafe(error.message)}</div>`;
            }
        };
        $('promotionSetup')?.addEventListener('submit', (event) => { event.preventDefault(); loadDraft(); });
        targetSelect.addEventListener('change', () => { if (sourceSelect.value && targetSelect.value) loadDraft(); });
        sourceSelect.addEventListener('change', () => { if (sourceSelect.value && targetSelect.value) loadDraft(); });
    }

    return { loadOptions, openMaster, openCalendars, openPromotions };
};
