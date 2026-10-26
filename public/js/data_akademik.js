window.createAksaraAcademicData = function ({ $, api, htmlSafe, setFeature, setFeatureError, showToast, token }) {
    const masterDefinitions = {
        'academic-years': { title: 'Tahun Ajaran', columns: ['tahun_ajaran', 'is_active'], columnLabels: { tahun_ajaran: 'Tahun Ajaran', is_active: 'Status' }, fields: [{ name: 'tahun_ajaran', label: 'Tahun ajaran', required: true }] },
        classes: { title: 'Kelas', columns: ['nama_kelas', 'tingkat', 'jurusan', 'wali_kelas.nama'], columnLabels: { nama_kelas: 'Nama Kelas', tingkat: 'Tingkat', jurusan: 'Jurusan', 'wali_kelas.nama': 'Nama Wali Kelas' }, fields: [
            { name: 'nama_kelas', label: 'Nama kelas', required: true }, { name: 'tingkat', label: 'Tingkat', required: true }, { name: 'jurusan', label: 'Jurusan', required: true },
            { name: 'wali_kelas_id', label: 'Wali kelas', type: 'select', options: 'teachers', optional: true },
        ] },
        students: { title: 'Siswa', columns: ['nisn', 'nama', 'kelas_id', 'jenis_kelamin'], columnLabels: { nisn: 'NISN', nama: 'Nama Siswa', kelas_id: 'Kelas', jenis_kelamin: 'Jenis Kelamin' }, fields: [
            { name: 'nisn', label: 'NISN', required: true }, { name: 'nama', label: 'Nama siswa', required: true },
            { name: 'kelas_id', label: 'Kelas', type: 'select', options: 'classes', required: true, value: 'nama_kelas' },
            { name: 'jenis_kelamin', label: 'Jenis kelamin', type: 'select', required: true, options: [['L', 'Laki-laki'], ['P', 'Perempuan']] },
        ] },
        subjects: { title: 'Mata Pelajaran', columns: ['kode_mapel', 'nama_mapel'], columnLabels: { kode_mapel: 'Kode Mata Pelajaran', nama_mapel: 'Nama Mata Pelajaran' }, fields: [{ name: 'kode_mapel', label: 'Kode mapel', required: true }, { name: 'nama_mapel', label: 'Nama mata pelajaran', required: true }] },
        materials: { title: 'Materi Pelajaran', columns: ['judul_bab', 'urutan_bab', 'target_jjp', 'mata_pelajaran_id'], columnLabels: { judul_bab: 'Judul Bab', urutan_bab: 'Urutan Bab', target_jjp: 'Target JJP', mata_pelajaran_id: 'Mata Pelajaran' }, fields: [
            { name: 'mata_pelajaran_id', label: 'Mata pelajaran', type: 'select', options: 'subjects', required: true, value: 'nama_mapel' },
            { name: 'urutan_bab', label: 'Urutan bab', type: 'number', required: true }, { name: 'judul_bab', label: 'Judul bab', required: true }, { name: 'target_jjp', label: 'Target JJP', type: 'number', required: true },
        ] },
        schedules: { title: 'Jadwal Pelajaran', columns: ['hari', 'jam_mulai', 'jam_selesai', 'kelas.nama_kelas', 'mata_pelajaran.nama_mapel'], columnLabels: { hari: 'Hari', jam_mulai: 'Jam Mulai', jam_selesai: 'Jam Selesai', 'kelas.nama_kelas': 'Kelas', 'mata_pelajaran.nama_mapel': 'Mata Pelajaran' }, fields: [
            { name: 'tahun_ajaran_id', label: 'Tahun ajaran', type: 'select', options: 'academic-years', required: true, value: 'tahun_ajaran' },
            { name: 'semester', label: 'Semester', type: 'select', required: true, options: [['Ganjil', 'Ganjil'], ['Genap', 'Genap']] },
            { name: 'user_id', label: 'Guru', type: 'select', options: 'teachers', required: true, value: 'nama' },
            { name: 'kelas_id', label: 'Kelas', type: 'select', options: 'classes', required: true, value: 'nama_kelas' },
            { name: 'mata_pelajaran_id', label: 'Mata pelajaran', type: 'select', options: 'subjects', required: true, value: 'nama_mapel' },
            { name: 'siklus_minggu', label: 'Siklus (kosong = mingguan)', type: 'select', optional: true, options: [['', 'Mingguan'], ['1', 'Siklus 1'], ['2', 'Siklus 2'], ['3', 'Siklus 3']] },
            { name: 'hari', label: 'Hari', type: 'select', required: true, options: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map((x) => [x, x]) },
            { name: 'mode_waktu', label: 'Sumber waktu', type: 'select', options: [['periode', 'Gunakan kalender aktif'], ['legacy', 'Jam manual (jadwal lama)']], required: true },
            { name: 'periode_mulai', label: 'Periode mulai', type: 'period', optional: true },
            { name: 'periode_selesai', label: 'Periode selesai', type: 'period', optional: true },
            { name: 'jam_mulai', label: 'Jam mulai', type: 'time', optional: true }, { name: 'jam_selesai', label: 'Jam selesai', type: 'time', optional: true },
        ] },
        agendas: { title: 'Agenda Sekolah', columns: ['nama_agenda', 'tanggal', 'jam_mulai', 'jam_selesai', 'override_kbm'], columnLabels: { nama_agenda: 'Nama Agenda', tanggal: 'Tanggal', jam_mulai: 'Jam Mulai', jam_selesai: 'Jam Selesai', override_kbm: 'Override KBM' }, fields: [
            { name: 'nama_agenda', label: 'Nama agenda', required: true }, { name: 'tanggal', label: 'Tanggal', type: 'date', required: true },
            { name: 'jam_mulai', label: 'Jam mulai', type: 'time', required: true }, { name: 'jam_selesai', label: 'Jam selesai', type: 'time', required: true },
            { name: 'scope', label: 'Cakupan', type: 'select', required: true, options: [['SEKOLAH', 'Seluruh sekolah']] },
            { name: 'override_kbm', label: 'Menangguhkan KBM', type: 'select', required: true, options: [['1', 'Ya'], ['0', 'Tidak']] },
            { name: 'lat_temporary', label: 'Latitude sementara', type: 'number', optional: true }, { name: 'long_temporary', label: 'Longitude sementara', type: 'number', optional: true }, { name: 'radius_meters', label: 'Radius sementara (m)', type: 'number', optional: true },
        ] },
    };

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
            if (resource === 'schedules' && field.name === 'mode_waktu') oldValue = current && current.periode_mulai != null && current.periode_selesai != null ? 'periode' : (activeCalendar ? 'periode' : 'legacy');
            if (field.type === 'time' && oldValue) oldValue = String(oldValue).slice(0, 5);
            if (field.name === 'override_kbm') oldValue = oldValue ? '1' : '0';
            const required = field.required ? 'required' : '';
            let control;
            if (field.type === 'select' || field.type === 'period') {
                const options = field.type === 'period'
                    ? Array.from({ length: Math.max(0, ...((references.periods || []).map((period) => Number(period.nomor_periode)))) }, (_, index) => [String(index + 1), `Jam ke-${index + 1}`])
                    : typeof field.options === 'string'
                    ? (references[field.options] || []).map((item) => [item.id, item[field.value || 'nama']])
                    : field.options;
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
            const wrapperId = resource === 'schedules' && ['mode_waktu', 'periode_mulai', 'periode_selesai', 'jam_mulai', 'jam_selesai'].includes(field.name) ? ` data-schedule-field="${field.name}"` : '';
            return `<div class="col-sm-12"${wrapperId}><label class="form-label">${htmlSafe(field.label)}</label>${control}</div>`;
        }).join('');
        const heading = current ? `Ubah ${definition.title}` : `Tambah ${definition.title}`;
        const importable = ['classes', 'students', 'subjects', 'materials', 'schedules'].includes(resource);
        const studentClasses = references.classes || [];
        const studentImportClassSelect = resource === 'students'
            ? `<div><label class="form-label small mb-1" for="studentImportClass">Kelas tujuan impor</label><select class="form-select" id="studentImportClass" ${studentClasses.length ? '' : 'disabled'}><option value="">${studentClasses.length ? 'Pilih kelas' : 'Belum ada kelas tersedia'}</option>${studentClasses.map((item) => `<option value="${htmlSafe(item.id)}">${htmlSafe(item.nama_kelas)}</option>`).join('')}</select></div>`
            : '';
        const importActions = importable ? `${studentImportClassSelect}<button class="btn btn-outline-success align-self-end" type="button" id="masterImportButton"><i class="bi bi-upload"></i> Import Excel</button><button class="btn btn-outline-primary align-self-end" type="button" id="masterTemplateButton"><i class="bi bi-download"></i> Template Excel</button><input class="d-none" type="file" id="masterImportFile" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">` : '';
        const calendarNotice = resource === 'schedules' ? (activeCalendar ? `<div class="alert alert-info small">Kalender aktif: <strong>${htmlSafe(activeCalendar.nama)}</strong>. Waktu jadwal berbasis periode dihitung otomatis dari periode awal hingga periode akhir.</div>` : '<div class="alert alert-warning small">Belum ada kalender jam pelajaran aktif. Jadwal baru hanya dapat memakai jam manual sampai kalender dibuat dan diaktifkan.</div>') : '';
        setFeature(definition.title, `${calendarNotice}<div class="d-flex flex-wrap align-items-end gap-2 mb-3"><button class="btn btn-success align-self-end" id="showMasterForm" ${current ? 'hidden' : ''}><i class="bi bi-plus-lg"></i> Tambah data</button>${importActions}</div>${resource === 'students' ? '<div class="form-text mb-3">Semua siswa dalam file akan dimasukkan ke kelas yang dipilih.</div>' : ''}<div id="masterImportResult" class="mb-3"></div><form class="card mb-4 admin-form-card" id="masterForm" ${current ? `data-id="${current.id}"` : ''} ${current ? '' : 'hidden'}><div class="card-body"><h3 class="h6 mb-3">${heading}</h3><div class="row g-3 admin-form-grid">${fieldMarkup}<div class="col-sm-12 d-flex gap-2 form-actions"><button class="btn btn-primary" type="submit">Simpan</button><button class="btn btn-outline-secondary" type="button" id="cancelMasterForm">Batal</button></div></div></div></form><div class="table-responsive"><table class="table table-sm align-middle mobile-table"><thead><tr><th>No.</th>${definition.columns.map((column) => `<th>${htmlSafe(definition.columnLabels?.[column] || column.split('.').pop().replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase()))}</th>`).join('')}<th>Aksi</th></tr></thead><tbody>${items.map((item, index) => `<tr><td>${index + 1}</td>${definition.columns.map((column) => `<td>${htmlSafe((resource === 'schedules' && column === 'jam_mulai' ? (item.jam_mulai_resolved ?? 'Tidak tersedia') : resource === 'schedules' && column === 'jam_selesai' ? (item.jam_selesai_resolved ?? 'Tidak tersedia') : nestedValue(item, column) ?? item[column] ?? '—'))}</td>`).join('')}<td class="d-flex gap-1">${resource === 'academic-years' ? `<button class="btn btn-sm btn-outline-success" data-activate="${item.id}" ${item.is_active ? 'disabled' : ''}>${item.is_active ? 'Aktif' : 'Aktifkan'}</button>` : ''}<button class="btn btn-sm btn-outline-primary" data-edit="${item.id}">Ubah</button><button class="btn btn-sm btn-outline-danger" data-delete="${item.id}">Hapus</button></td></tr>`).join('') || `<tr><td colspan="${definition.columns.length + 2}" class="text-center text-secondary py-4">Belum ada data.</td></tr>`}</tbody></table></div>${resource === 'agendas' ? '<div class="alert alert-warning small">Scope tingkat/kelas belum tersedia karena skema tidak memiliki target kelas/tingkat.</div>' : ''}`);
        $('masterImportButton')?.addEventListener('click', () => {
            if (resource === 'students' && !$('studentImportClass')?.value) {
                $('masterImportResult').innerHTML = '<div class="alert alert-warning mb-0">Pilih kelas tujuan terlebih dahulu.</div>';
                return;
            }
            $('masterImportResult').replaceChildren();
            $('masterImportFile').click();
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
            if (resource === 'students' && !classId) {
                resultBox.innerHTML = '<div class="alert alert-warning mb-0">Pilih kelas tujuan terlebih dahulu.</div>';
                event.currentTarget.value = '';
                return;
            }
            resultBox.innerHTML = '<div class="alert alert-info mb-0">Memeriksa dan mengimpor file Excel...</div>';
            try {
                const result = await api(`/api/v1/academic/imports/${resource}`, { method: 'POST', body: (() => { const data = new FormData(); data.append('file', file); if (classId) data.append('class_id', classId); return data; })() });
                await openMaster(resource);
                $('masterImportResult').innerHTML = `<div class="alert alert-success mb-0">${htmlSafe(result.message)}</div>`;
            } catch (error) {
                resultBox.innerHTML = `<div class="alert alert-danger mb-0">${htmlSafe(error.message)}</div>`;
                event.currentTarget.value = '';
            }
        });
        if (resource === 'schedules') {
            const mode = $('masterForm').querySelector('[name="mode_waktu"]');
            const startPeriod = $('masterForm').querySelector('[name="periode_mulai"]');
            const endPeriod = $('masterForm').querySelector('[name="periode_selesai"]');
            const startTime = $('masterForm').querySelector('[name="jam_mulai"]');
            const endTime = $('masterForm').querySelector('[name="jam_selesai"]');
            const day = $('masterForm').querySelector('[name="hari"]');
            const toggleScheduleFields = () => {
                const usePeriods = mode?.value === 'periode' && Boolean(activeCalendar);
                $('masterForm').querySelectorAll('[data-schedule-field="periode_mulai"], [data-schedule-field="periode_selesai"]').forEach((el) => { el.hidden = !usePeriods; });
                $('masterForm').querySelectorAll('[data-schedule-field="jam_mulai"], [data-schedule-field="jam_selesai"]').forEach((el) => { el.hidden = false; });
                if (startPeriod) startPeriod.required = usePeriods;
                if (endPeriod) endPeriod.required = usePeriods;
                if (startTime) { startTime.required = !usePeriods; startTime.readOnly = usePeriods; }
                if (endTime) { endTime.required = !usePeriods; endTime.readOnly = usePeriods; }
                if (!usePeriods && mode && mode.value === 'periode') mode.value = 'legacy';
                updatePeriodPreview();
            };
            const updatePeriodPreview = () => {
                if (!activeCalendar || mode?.value !== 'periode' || !day || !startPeriod?.value || !endPeriod?.value) return;
                const periods = (activeCalendar.detail_periode || []).filter((period) => period.hari === day.value);
                const first = periods.find((period) => Number(period.nomor_periode) === Number(startPeriod.value));
                const last = periods.find((period) => Number(period.nomor_periode) === Number(endPeriod.value));
                if (!first || !last || Number(startPeriod.value) > Number(endPeriod.value)) {
                    startTime.value = '';
                    endTime.value = '';
                    return;
                }
                const sequence = [];
                for (let n = Number(startPeriod.value); n <= Number(endPeriod.value); n++) sequence.push(periods.find((period) => Number(period.nomor_periode) === n));
                if (sequence.some((period) => !period)) {
                    startTime.value = '';
                    endTime.value = '';
                    return;
                }
                startTime.value = String(first.jam_mulai).slice(0, 5);
                endTime.value = String(last.jam_selesai).slice(0, 5);
            };
            mode?.addEventListener('change', toggleScheduleFields);
            day?.addEventListener('change', updatePeriodPreview);
            startPeriod?.addEventListener('change', updatePeriodPreview);
            endPeriod?.addEventListener('change', updatePeriodPreview);
            toggleScheduleFields();
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
            if (values.mode_waktu === 'periode') {
                values.jam_mulai = values.jam_mulai || '00:00';
                values.jam_selesai = values.jam_selesai || '00:01';
            } else {
                values.periode_mulai = null;
                values.periode_selesai = null;
            }
            delete values.mode_waktu;
            if (values.siklus_minggu === '') values.siklus_minggu = null;
            if (values.wali_kelas_id === '') values.wali_kelas_id = null;
            if (values.lat_temporary === '') values.lat_temporary = null;
            if (values.long_temporary === '') values.long_temporary = null;
            if (values.radius_meters === '') values.radius_meters = null;
            if ('override_kbm' in values) values.override_kbm = values.override_kbm === '1';
            const id = event.currentTarget.dataset.id;
            try {
                await api(`/api/v1/academic/${resource}${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: values });
                showToast('Data berhasil disimpan.');
                openMaster(resource);
            } catch (error) { setFeatureError(error); }
        });
        document.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => openMaster(resource, items.find((item) => String(item.id) === button.dataset.edit))));
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
        const response = await api(calendarId ? `/api/v1/academic/calendars/${calendarId}` : '/api/v1/academic/calendars');
        const selected = calendarId ? response.data : null;
        if (calendarId && !selected) throw new Error('Kalender tidak ditemukan.');
        const calendars = calendarId ? [selected] : (response.data || []);
        const active = calendars.find((calendar) => calendar.status === 'AKTIF');
        const list = calendars.map((calendar) => `<tr><td>${htmlSafe(calendar.nama)}</td><td><span class="badge ${calendar.status === 'AKTIF' ? 'text-bg-success' : 'text-bg-secondary'}">${htmlSafe(calendar.status)}</span></td><td>${(calendar.detail_periode || []).length}</td><td class="text-nowrap"><button class="btn btn-sm btn-outline-primary" data-calendar-edit="${calendar.id}">Atur periode</button>${calendar.status === 'AKTIF' ? ` <button class="btn btn-sm btn-outline-warning" data-calendar-deactivate="${calendar.id}">Nonaktifkan</button>` : ` <button class="btn btn-sm btn-success" data-calendar-activate="${calendar.id}">Aktifkan</button>`}</td></tr>`).join('');
        const periods = (selected?.detail_periode || []).map((period) => ({...period, jam_mulai: String(period.jam_mulai).slice(0,5), jam_selesai: String(period.jam_selesai).slice(0,5)}));
        const periodRows = periods.map((period, index) => calendarPeriodRow(period, index)).join('');
        setFeature('Kalender Jam Pelajaran', `
            ${selected ? '<button class="btn btn-outline-secondary btn-sm mb-3" type="button" id="calendarBackToList"><i class="bi bi-arrow-left"></i> Kembali ke daftar kalender</button>' : ''}
            <div class="alert alert-info small">Atur jam tiap periode per hari. Jeda istirahat cukup dibuat sebagai selisih waktu antarkolom periode; tidak perlu dibuat sebagai periode tersendiri. Jadwal periode 1–3 otomatis menggunakan jam mulai periode 1 dan jam selesai periode 3.</div>
            <form id="calendarCreateForm" class="card mb-3"><div class="card-body"><h2 class="h6">Buat kalender</h2><div class="row g-2"><div class="col-md-4"><label class="form-label">Nama kalender</label><input class="form-control" name="nama" maxlength="100" required></div><div class="col-md-6"><label class="form-label">Catatan (opsional)</label><input class="form-control" name="catatan"></div><div class="col-md-2 d-flex align-items-end"><button class="btn btn-primary w-100">Buat</button></div></div></div></form>
            ${selected ? `
                <form id="calendarPeriodsForm" class="card mb-3"><div class="card-body"><div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><div><h2 class="h6 mb-1">Periode: ${htmlSafe(selected.nama)}</h2><div class="small text-secondary">Status: ${htmlSafe(selected.status)}. Kalender aktif harus dinonaktifkan sebelum periode diubah.</div></div><div class="d-flex gap-2"><button class="btn btn-outline-secondary btn-sm" type="button" id="calendarAddPeriod" ${selected.status === 'AKTIF' ? 'disabled' : ''}>Tambah periode</button><button class="btn btn-primary btn-sm" type="submit" ${selected.status === 'AKTIF' ? 'disabled' : ''}>Simpan periode</button></div></div><div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Hari</th><th>Nomor periode</th><th>Jam mulai</th><th>Jam selesai</th><th>Label (opsional)</th><th></th></tr></thead><tbody id="calendarPeriodRows">${periodRows || calendarPeriodRow({hari:'Senin',nomor_periode:1,jam_mulai:'07:30',jam_selesai:'08:15',label:''},0)}</tbody></table></div></div></form>
            ` : '' }
            <div class="card"><div class="card-header"><strong>Daftar kalender</strong></div><div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead><tr><th>Nama</th><th>Status</th><th>Jumlah detail periode</th><th>Aksi</th></tr></thead><tbody>${list || '<tr><td colspan="4" class="text-center text-secondary py-3">Belum ada kalender. Buat kalender di atas.</td></tr>'}</tbody></table></div></div>
        `);
        $('calendarBackToList')?.addEventListener('click', () => openCalendars());
        $('calendarCreateForm')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const values = Object.fromEntries(new FormData(event.currentTarget).entries());
            try { const created = await api('/api/v1/academic/calendars', {method:'POST', body:values}); showToast(created.message); openCalendars(created.data.id); }
            catch (error) { setFeatureError(error); }
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
            try { const result = await api(`/api/v1/academic/calendars/${button.dataset.calendarActivate}/activate`, {method:'POST', body:{}}); showToast(result.message); openCalendars(); }
            catch (error) { setFeatureError(error); }
        }));
        document.querySelectorAll('[data-calendar-deactivate]').forEach((button) => button.addEventListener('click', async () => {
            if (!confirm('Nonaktifkan kalender ini? Jadwal berbasis periode tidak dapat di-resolve sampai kalender lain diaktifkan.')) return;
            try { const result = await api(`/api/v1/academic/calendars/${button.dataset.calendarDeactivate}/deactivate`, {method:'POST', body:{}}); showToast(result.message); openCalendars(); }
            catch (error) { setFeatureError(error); }
        }));
    }

    function calendarPeriodRow(period, key) {
        const days = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
        return `<tr data-period-row="${htmlSafe(key)}"><td><select class="form-select form-select-sm" name="hari">${days.map((day) => `<option value="${day}" ${period.hari === day ? 'selected' : ''}>${day}</option>`).join('')}</select></td><td><input class="form-control form-control-sm" type="number" name="nomor_periode" min="1" max="30" value="${htmlSafe(period.nomor_periode || 1)}" required></td><td><input class="form-control form-control-sm" type="time" name="jam_mulai" value="${htmlSafe(period.jam_mulai || '')}" required></td><td><input class="form-control form-control-sm" type="time" name="jam_selesai" value="${htmlSafe(period.jam_selesai || '')}" required></td><td><input class="form-control form-control-sm" name="label" maxlength="50" value="${htmlSafe(period.label || '')}"></td><td><button class="btn btn-sm btn-outline-danger" type="button" data-period-remove aria-label="Hapus periode">Hapus</button></td></tr>`;
    }

    return { loadOptions, openMaster, openCalendars };
};
