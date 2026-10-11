window.createAksaraAcademicData = function ({ $, api, htmlSafe, setFeature, setFeatureError, showToast, token }) {
    const masterDefinitions = {
        'academic-years': { title: 'Tahun Ajaran', columns: ['tahun_ajaran', 'is_active'], fields: [{ name: 'tahun_ajaran', label: 'Tahun ajaran', required: true }] },
        classes: { title: 'Kelas', columns: ['nama_kelas', 'tingkat', 'jurusan', 'wali_kelas.nama'], columnLabels: { 'wali_kelas.nama': 'Nama wali kelas' }, fields: [
            { name: 'nama_kelas', label: 'Nama kelas', required: true }, { name: 'tingkat', label: 'Tingkat', required: true }, { name: 'jurusan', label: 'Jurusan', required: true },
            { name: 'wali_kelas_id', label: 'Wali kelas', type: 'select', options: 'teachers', optional: true },
        ] },
        students: { title: 'Siswa', columns: ['nisn', 'nama', 'kelas_id', 'jenis_kelamin'], fields: [
            { name: 'nisn', label: 'NISN', required: true }, { name: 'nama', label: 'Nama siswa', required: true },
            { name: 'kelas_id', label: 'Kelas', type: 'select', options: 'classes', required: true, value: 'nama_kelas' },
            { name: 'jenis_kelamin', label: 'Jenis kelamin', type: 'select', required: true, options: [['L', 'Laki-laki'], ['P', 'Perempuan']] },
        ] },
        subjects: { title: 'Mata Pelajaran', columns: ['kode_mapel', 'nama_mapel'], fields: [{ name: 'kode_mapel', label: 'Kode mapel', required: true }, { name: 'nama_mapel', label: 'Nama mata pelajaran', required: true }] },
        materials: { title: 'Materi Pelajaran', columns: ['judul_bab', 'urutan_bab', 'target_jjp', 'mata_pelajaran_id'], fields: [
            { name: 'mata_pelajaran_id', label: 'Mata pelajaran', type: 'select', options: 'subjects', required: true, value: 'nama_mapel' },
            { name: 'urutan_bab', label: 'Urutan bab', type: 'number', required: true }, { name: 'judul_bab', label: 'Judul bab', required: true }, { name: 'target_jjp', label: 'Target JJP', type: 'number', required: true },
        ] },
        schedules: { title: 'Jadwal Pelajaran', columns: ['hari', 'jam_mulai', 'jam_selesai', 'kelas.nama_kelas', 'mata_pelajaran.nama_mapel'], fields: [
            { name: 'tahun_ajaran_id', label: 'Tahun ajaran', type: 'select', options: 'academic-years', required: true, value: 'tahun_ajaran' },
            { name: 'semester', label: 'Semester', type: 'select', required: true, options: [['Ganjil', 'Ganjil'], ['Genap', 'Genap']] },
            { name: 'user_id', label: 'Guru', type: 'select', options: 'teachers', required: true, value: 'nama' },
            { name: 'kelas_id', label: 'Kelas', type: 'select', options: 'classes', required: true, value: 'nama_kelas' },
            { name: 'mata_pelajaran_id', label: 'Mata pelajaran', type: 'select', options: 'subjects', required: true, value: 'nama_mapel' },
            { name: 'siklus_minggu', label: 'Siklus (kosong = mingguan)', type: 'select', optional: true, options: [['', 'Mingguan'], ['1', 'Siklus 1'], ['2', 'Siklus 2'], ['3', 'Siklus 3']] },
            { name: 'hari', label: 'Hari', type: 'select', required: true, options: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map((x) => [x, x]) },
            { name: 'jam_mulai', label: 'Jam mulai', type: 'time', required: true }, { name: 'jam_selesai', label: 'Jam selesai', type: 'time', required: true },
        ] },
        agendas: { title: 'Agenda Sekolah', columns: ['nama_agenda', 'tanggal', 'jam_mulai', 'jam_selesai', 'override_kbm'], fields: [
            { name: 'nama_agenda', label: 'Nama agenda', required: true }, { name: 'tanggal', label: 'Tanggal', type: 'date', required: true },
            { name: 'jam_mulai', label: 'Jam mulai', type: 'time', required: true }, { name: 'jam_selesai', label: 'Jam selesai', type: 'time', required: true },
            { name: 'scope', label: 'Cakupan', type: 'select', required: true, options: [['SEKOLAH', 'Seluruh sekolah']] },
            { name: 'override_kbm', label: 'Menangguhkan KBM', type: 'select', required: true, options: [['1', 'Ya'], ['0', 'Tidak']] },
            { name: 'lat_temporary', label: 'Latitude sementara', type: 'number', optional: true }, { name: 'long_temporary', label: 'Longitude sementara', type: 'number', optional: true }, { name: 'radius_meters', label: 'Radius sementara (m)', type: 'number', optional: true },
        ] },
    };

    function nestedValue(item, path) { return path.split('.').reduce((value, key) => value?.[key], item); }

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
    async function loadOptions(optionKey) {
        const path = optionKey === 'teachers'
            ? '/api/v1/academic/teachers'
            : `/api/v1/academic/${optionKey}`;
        return window.aksaraFetchAllPages(api, path);
    }

    async function openMaster(resource, current = null) {
        const definition = masterDefinitions[resource];
        const items = await window.aksaraFetchAllPages(api, `/api/v1/academic/${resource}`);
        const references = {};
        for (const field of definition.fields) if (field.options && typeof field.options === 'string') references[field.options] = await loadOptions(field.options);
        const fieldMarkup = definition.fields.map((field) => {
            let oldValue = current ? nestedValue(current, field.name) ?? current[field.name] ?? '' : '';
            if (field.type === 'time' && oldValue) oldValue = String(oldValue).slice(0, 5);
            if (field.name === 'override_kbm') oldValue = oldValue ? '1' : '0';
            const required = field.required ? 'required' : '';
            let control;
            if (field.type === 'select') {
                const options = typeof field.options === 'string'
                    ? (references[field.options] || []).map((item) => [item.id, item[field.value || 'nama']])
                    : field.options;
                control = `<select class="form-select" name="${field.name}" ${required}><option value="">Pilih…</option>${options.map(([value, label]) => `<option value="${htmlSafe(value)}" ${String(oldValue) === String(value) ? 'selected' : ''}>${htmlSafe(label)}</option>`).join('')}</select>`;
            } else {
                control = `<input class="form-control" name="${field.name}" type="${field.type || 'text'}" value="${htmlSafe(oldValue)}" ${required} ${field.optional ? '' : ''}>`;
            }
            return `<div class="col-sm-12"><label class="form-label">${htmlSafe(field.label)}</label>${control}</div>`;
        }).join('');
        const heading = current ? `Ubah ${definition.title}` : `Tambah ${definition.title}`;
        const importable = ['classes', 'students', 'subjects', 'materials', 'schedules'].includes(resource);
        const studentClasses = references.classes || [];
        const studentImportClassSelect = resource === 'students'
            ? `<div><label class="form-label small mb-1" for="studentImportClass">Kelas tujuan impor</label><select class="form-select" id="studentImportClass" ${studentClasses.length ? '' : 'disabled'}><option value="">${studentClasses.length ? 'Pilih kelas' : 'Belum ada kelas tersedia'}</option>${studentClasses.map((item) => `<option value="${htmlSafe(item.id)}">${htmlSafe(item.nama_kelas)}</option>`).join('')}</select></div>`
            : '';
        const importActions = importable ? `${studentImportClassSelect}<button class="btn btn-outline-success align-self-end" type="button" id="masterImportButton"><i class="bi bi-upload"></i> Import Excel</button><button class="btn btn-outline-primary align-self-end" type="button" id="masterTemplateButton"><i class="bi bi-download"></i> Template Excel</button><input class="d-none" type="file" id="masterImportFile" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">` : '';
        setFeature(definition.title, `<div class="d-flex flex-wrap align-items-end gap-2 mb-3"><button class="btn btn-success align-self-end" id="showMasterForm" ${current ? 'hidden' : ''}><i class="bi bi-plus-lg"></i> Tambah data</button>${importActions}</div>${resource === 'students' ? '<div class="form-text mb-3">Semua siswa dalam file akan dimasukkan ke kelas yang dipilih.</div>' : ''}<div id="masterImportResult" class="mb-3"></div><form class="card mb-4 admin-form-card" id="masterForm" ${current ? `data-id="${current.id}"` : ''} ${current ? '' : 'hidden'}><div class="card-body"><h3 class="h6 mb-3">${heading}</h3><div class="row g-3 admin-form-grid">${fieldMarkup}<div class="col-sm-12 d-flex gap-2 form-actions"><button class="btn btn-primary" type="submit">Simpan</button><button class="btn btn-outline-secondary" type="button" id="cancelMasterForm">Batal</button></div></div></div></form><div class="table-responsive"><table class="table table-sm align-middle mobile-table"><thead><tr>${definition.columns.map((column) => `<th>${htmlSafe(definition.columnLabels?.[column] || column.split('.').pop().replaceAll('_', ' '))}</th>`).join('')}<th>Aksi</th></tr></thead><tbody>${items.map((item) => `<tr>${definition.columns.map((column) => `<td>${htmlSafe(nestedValue(item, column) ?? item[column] ?? '—')}</td>`).join('')}<td class="d-flex gap-1">${resource === 'academic-years' ? `<button class="btn btn-sm btn-outline-success" data-activate="${item.id}" ${item.is_active ? 'disabled' : ''}>${item.is_active ? 'Aktif' : 'Aktifkan'}</button>` : ''}<button class="btn btn-sm btn-outline-primary" data-edit="${item.id}">Ubah</button><button class="btn btn-sm btn-outline-danger" data-delete="${item.id}">Hapus</button></td></tr>`).join('') || `<tr><td colspan="${definition.columns.length + 1}" class="text-center text-secondary py-4">Belum ada data.</td></tr>`}</tbody></table></div>${resource === 'agendas' ? '<div class="alert alert-warning small">Scope tingkat/kelas belum tersedia karena skema tidak memiliki target kelas/tingkat.</div>' : ''}`);
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
    return { loadOptions, openMaster };
};
