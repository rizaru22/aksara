window.createAksaraHolidayCalendar = function ({ api, htmlSafe, setFeature, setFeatureError, showToast }) {
    const labels = {
        NASIONAL: 'Libur nasional',
        CUTI_BERSAMA: 'Cuti bersama',
        SEKOLAH: 'Libur sekolah',
    };
    let pendingDeleteId = null;

    // Membuka form pengelolaan hari libur dengan daftar, edit, dan konfirmasi hapus yang interaktif.
    async function open(editId = null) {
        try {
            const response = await api('/api/v1/admin/holidays');
            const items = response.data || [];
            const editing = items.find((item) => String(item.id) === String(editId));
            const render = () => {
                const current = editing || {};
                const form = `<form class="card mb-4 admin-form-card" id="holidayForm" data-id="${htmlSafe(current.id || '')}"><div class="card-body"><h2 class="h5 mb-3">${editing ? 'Ubah Hari Libur' : 'Tambah Hari Libur'}</h2><div class="row g-3 admin-form-grid"><div class="col-sm-12 col-md-4"><label class="form-label" for="holidayDate">Tanggal</label><input class="form-control" id="holidayDate" name="tanggal" type="date" required value="${htmlSafe(current.tanggal || '')}"></div><div class="col-sm-12 col-md-4"><label class="form-label" for="holidayType">Jenis</label><select class="form-select" id="holidayType" name="jenis" required>${Object.entries(labels).map(([value, label]) => `<option value="${value}" ${current.jenis === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="col-sm-12 col-md-4"><label class="form-label" for="holidayName">Nama hari libur</label><input class="form-control" id="holidayName" name="nama" maxlength="255" required value="${htmlSafe(current.nama || '')}" placeholder="Contoh: Hari Kemerdekaan RI"></div><div class="col-sm-12"><label class="form-label" for="holidayNote">Catatan (opsional)</label><textarea class="form-control" id="holidayNote" name="catatan" rows="2" maxlength="2000">${htmlSafe(current.catatan || '')}</textarea></div><div class="col-sm-12 form-actions d-flex gap-2"><button class="btn btn-primary">${editing ? 'Simpan perubahan' : 'Tambah hari libur'}</button>${editing ? '<button class="btn btn-outline-secondary" type="button" id="cancelHolidayEdit">Batal ubah</button>' : ''}</div></div></div></form>`;
                const rows = items.map((item, index) => `<tr><td>${index + 1}</td><td>${htmlSafe(item.tanggal)}</td><td>${htmlSafe(labels[item.jenis] || item.jenis)}</td><td><strong>${htmlSafe(item.nama)}</strong>${item.catatan ? `<br><span class="small text-secondary">${htmlSafe(item.catatan)}</span>` : ''}</td><td class="text-nowrap"><button class="btn btn-sm btn-outline-primary" data-edit-holiday="${item.id}">Ubah</button> <button class="btn btn-sm btn-outline-danger" data-delete-holiday="${item.id}">Hapus</button>${String(pendingDeleteId) === String(item.id) ? ` <button class="btn btn-sm btn-danger" data-confirm-delete="${item.id}">Ya, hapus</button> <button class="btn btn-sm btn-outline-secondary" data-cancel-delete>Batal</button>` : ''}</td></tr>`).join('');
                setFeature('Kalender Hari Libur', `<p class="text-secondary">Tanggal yang tercatat di sini menonaktifkan presensi dan akan diberi keterangan khusus pada laporan.</p>${form}<section class="card"><div class="card-body"><h2 class="h5">Daftar Hari Libur</h2><div class="table-responsive"><table class="table table-striped align-middle mobile-table"><thead><tr><th>No.</th><th>Tanggal</th><th>Jenis</th><th>Nama / Catatan</th><th>Aksi</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="text-center text-secondary py-4">Belum ada hari libur yang diatur.</td></tr>'}</tbody></table></div></div></section>`);

                document.getElementById('holidayForm')?.addEventListener('submit', async (event) => {
                    event.preventDefault();
                    const formElement = event.currentTarget;
                    const data = Object.fromEntries(new FormData(formElement).entries());
                    const id = formElement.dataset.id;
                    try {
                        await api(id ? `/api/v1/admin/holidays/${id}` : '/api/v1/admin/holidays', { method: id ? 'PATCH' : 'POST', body: data });
                        pendingDeleteId = null;
                        showToast(id ? 'Hari libur diperbarui.' : 'Hari libur ditambahkan.');
                        open();
                    } catch (error) { setFeatureError(error); }
                });
                document.getElementById('cancelHolidayEdit')?.addEventListener('click', () => open());
                document.querySelectorAll('[data-edit-holiday]').forEach((button) => button.addEventListener('click', () => open(button.dataset.editHoliday)));
                document.querySelectorAll('[data-delete-holiday]').forEach((button) => button.addEventListener('click', () => { pendingDeleteId = button.dataset.deleteHoliday; open(); }));
                document.querySelectorAll('[data-cancel-delete]').forEach((button) => button.addEventListener('click', () => { pendingDeleteId = null; open(); }));
                document.querySelectorAll('[data-confirm-delete]').forEach((button) => button.addEventListener('click', async () => {
                    try {
                        await api(`/api/v1/admin/holidays/${button.dataset.confirmDelete}`, { method: 'DELETE' });
                        pendingDeleteId = null;
                        showToast('Hari libur dihapus.');
                        open();
                    } catch (error) { setFeatureError(error); }
                }));
            };
            render();
        } catch (error) {
            setFeature('Kalender Hari Libur', `<div class="alert alert-danger">${htmlSafe(error.message)}</div>`);
        }
    }

    return { open };
};
