window.createAksaraUserAccess = function ({ $, api, htmlSafe, setFeature, setFeatureError, showToast, token }) {
    const genderLabel = (value) => ({ L: 'Laki-laki', P: 'Perempuan' })[value] || '—';
    async function downloadTemplate() {
        const response = await fetch(window.aksaraApiUrl('/api/v1/admin/users/template'), { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || `Template gagal diunduh (${response.status}).`);
        }
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = url;
        link.download = 'template_pengguna.xlsx';
        link.click();
        URL.revokeObjectURL(url);
    }

    async function openUsers() {
        const [users, roleResult] = await Promise.all([window.aksaraFetchAllPages(api, '/api/v1/admin/users'), api('/api/v1/admin/users/roles')]);
        setFeature('Kelola User & Akses', `<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><p class="text-secondary mb-0">Daftar seluruh akun pengguna yang tersimpan.</p><button class="btn btn-success" id="newUser"><i class="bi bi-person-plus"></i> Tambah pengguna</button></div><div class="table-responsive"><table class="table table-hover align-middle"><thead><tr><th>Nama</th><th>Email</th><th>NIP</th><th>Jenis kelamin</th><th>Role</th><th class="text-end">Aksi</th></tr></thead><tbody>${users.map((user) => `<tr><td class="fw-semibold">${htmlSafe(user.nama)}</td><td>${htmlSafe(user.email)}</td><td>${htmlSafe(user.nip || '—')}</td><td>${htmlSafe(genderLabel(user.jenis_kelamin))}</td><td>${htmlSafe((user.roles || []).map((role) => role.name).join(', ') || 'Belum ada role')}</td><td class="text-end"><div class="d-inline-flex flex-wrap gap-1"><button class="btn btn-outline-primary btn-sm" data-user-edit="${user.id}">Ubah</button><button class="btn btn-outline-secondary btn-sm" data-password-reset="${user.id}">Kirim reset</button><button class="btn btn-outline-danger btn-sm" data-user-delete="${user.id}">Hapus</button></div></td></tr>`).join('') || '<tr><td colspan="6" class="text-center text-secondary py-4">Belum ada pengguna di database.</td></tr>'}</tbody></table></div>`);
        const toolbar = $('newUser').parentElement;
        const templateButton = document.createElement('button');
        templateButton.className = 'btn btn-outline-primary';
        templateButton.innerHTML = '<i class="bi bi-download"></i> Template Excel';
        templateButton.addEventListener('click', async () => {
            try { await downloadTemplate(); }
            catch (error) { showToast(error.message); }
        });
        toolbar.insertBefore(templateButton, $('newUser'));
        const importButton = document.createElement('button');
        importButton.className = 'btn btn-outline-success';
        importButton.innerHTML = '<i class="bi bi-upload"></i> Import Excel';
        toolbar.insertBefore(importButton, $('newUser'));

        const importPanel = document.createElement('section');
        importPanel.className = 'border rounded p-3 mb-3';
        importPanel.innerHTML = `<fieldset class="mb-3"><legend class="form-label fs-6">Role untuk semua akun di file</legend><div class="d-flex flex-wrap gap-3">${(roleResult.roles || []).map((role) => `<label class="form-check"><input class="form-check-input" type="checkbox" name="userImportRoles" value="${htmlSafe(role)}"><span class="form-check-label">${htmlSafe(role)}</span></label>`).join('')}</div><div class="form-text">Pilih satu atau beberapa role. Kepsek berdiri sendiri; guru tidak dapat digabung dengan tendik.</div></fieldset><p class="small text-secondary mb-0">Kolom Excel: <code>nama</code>, <code>email</code>, <code>nip</code>, <code>jenis_kelamin</code>, <code>sandi</code>. Sandi minimal 12 karakter; jenis kelamin L/P atau Laki-laki/Perempuan. Maksimal 2.000 akun per file; jika ada data tidak valid, seluruh impor dibatalkan.</p><div class="alert alert-warning small mt-3 mb-0">File Excel berisi sandi dalam teks biasa. Simpan dengan aman dan hapus file setelah impor selesai.</div><input class="d-none" type="file" id="userImportFile" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"><div id="userImportResult" class="mt-3" aria-live="polite"></div>`;
        toolbar.parentElement.insertBefore(importPanel, toolbar.nextSibling);
        importButton.addEventListener('click', () => $('userImportFile').click());
        $('userImportFile').addEventListener('change', async (event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            const resultBox = $('userImportResult');
            const roles = [...importPanel.querySelectorAll('[name="userImportRoles"]:checked')].map((input) => input.value);
            const roleError = getRoleCombinationError(roles);
            if (roleError) {
                resultBox.innerHTML = `<div class="alert alert-danger mb-0">${htmlSafe(roleError)}</div>`;
                event.currentTarget.value = '';
                return;
            }
            resultBox.innerHTML = '<div class="alert alert-info mb-0">Memvalidasi dan mengimpor akun...</div>';
            const form = new FormData();
            form.append('file', file);
            roles.forEach((role) => form.append('roles[]', role));
            try {
                const imported = await api('/api/v1/admin/users/import', { method: 'POST', body: form });
                await openUsers(1);
                showToast(imported.message);
            } catch (error) {
                resultBox.innerHTML = `<div class="alert alert-danger mb-0">${htmlSafe(error.message || 'Impor pengguna gagal.')}</div>`;
            } finally {
                event.currentTarget.value = '';
            }
        });
        $('newUser').addEventListener('click', () => openUserForm());
        document.querySelectorAll('[data-user-edit]').forEach((button) => button.addEventListener('click', () => openUserForm(users.find((user) => String(user.id) === button.dataset.userEdit))));
        document.querySelectorAll('[data-password-reset]').forEach((button) => button.addEventListener('click', async () => {
            try { const result = await api(`/api/v1/admin/users/${button.dataset.passwordReset}/password-reset`, { method: 'POST', body: {} }); showToast(result.message); }
            catch (error) { showToast(error.message); }
        }));
        document.querySelectorAll('[data-user-delete]').forEach((button) => button.addEventListener('click', async () => {
            if (!confirm('Hapus akun ini? Akun dengan riwayat atau relasi aktif akan ditolak server.')) return;
            try { await api(`/api/v1/admin/users/${button.dataset.userDelete}`, { method: 'DELETE' }); openUsers(); }
            catch (error) { showToast(error.message); }
        }));
    }

    async function openUserForm(user = null) {
        const lists = await api('/api/v1/admin/users/roles');
        const selectedRoles = (user?.roles || []).map((role) => typeof role === 'string' ? role : role.name);
        const roleDescriptions = {
            admin: 'Akses administrasi, dashboard admin, absensi, serta jurnal dan presensi siswa saat mengajar.',
            guru: 'Absensi masuk/pulang, jurnal mengajar, dan presensi siswa pada jadwal yang diampu.',
            tendik: 'Absensi masuk/pulang dan pengajuan izin/cuti/dinas; tidak mendapat menu jurnal mengajar.',
            kepsek: 'Dashboard eksekutif, absensi, jurnal dan presensi siswa saat mengajar, serta persetujuan izin. Role ini berdiri sendiri.',
            kurikulum: 'Dashboard kurikulum, absensi, jurnal dan presensi siswa saat mengajar, serta pengelolaan akademik.',
        };
        const roleChecks = lists.roles.map((role) => `<label class="form-check d-flex align-items-start gap-2 border rounded p-3 m-0"><input class="form-check-input mt-1 flex-shrink-0" type="checkbox" name="roles" value="${htmlSafe(role)}" ${selectedRoles.includes(role) ? 'checked' : ''}><span class="form-check-label"><span class="fw-semibold d-block">${htmlSafe(role)}</span><span class="small text-secondary">${htmlSafe(roleDescriptions[role] || 'Akses akun mengikuti izin yang ditetapkan untuk role ini.')}</span></span></label>`).join('');
        const permissionChecks = lists.permissions.map((permission) => `<label class="form-check d-flex align-items-center gap-2 border rounded p-3 m-0"><input class="form-check-input mt-0 flex-shrink-0" type="checkbox" name="permissions" value="${htmlSafe(permission)}" ${user?.permissions?.some((item) => item.name === permission) ? 'checked' : ''}><span class="form-check-label">${htmlSafe(permission.replaceAll('-', ' '))}<span class="d-block small text-secondary">Izin tambahan untuk akun ini</span></span></label>`).join('');
        setFeature(user ? `Ubah Akun: ${user.nama}` : 'Tambah Akun', `<form class="admin-form-card" id="userForm" data-id="${user?.id || ''}"><div class="row g-3 admin-form-grid"><div class="col-sm-12"><label class="form-label">Nama</label><input class="form-control" name="nama" required value="${htmlSafe(user?.nama)}"></div><div class="col-sm-12"><label class="form-label">Jenis kelamin</label><select class="form-select" id="userGender" name="jenis_kelamin"><option value="">Belum diatur</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></div><div class="col-sm-12"><label class="form-label">Email</label><input class="form-control" type="email" name="email" required value="${htmlSafe(user?.email)}"></div><div class="col-sm-12"><label class="form-label">NIP (opsional)</label><input class="form-control" name="nip" value="${htmlSafe(user?.nip)}"></div>${user ? '<div class="col-sm-12"><div class="alert alert-info small">Reset kata sandi dikirim melalui tautan email dari daftar pengguna.</div></div>' : '<div class="col-sm-12"><label class="form-label" for="initialPassword">Kata sandi awal (min. 12 karakter)</label><div class="input-group"><input class="form-control" id="initialPassword" type="password" name="password" required minlength="12" autocomplete="new-password"><button class="btn btn-outline-secondary" type="button" data-toggle-password="initialPassword" aria-label="Lihat kata sandi" aria-pressed="false"><i class="bi bi-eye" aria-hidden="true"></i></button></div></div><div class="col-sm-12"><label class="form-label" for="passwordConfirmation">Ulangi kata sandi</label><div class="input-group"><input class="form-control" id="passwordConfirmation" type="password" name="password_confirmation" required minlength="12" autocomplete="new-password"><button class="btn btn-outline-secondary" type="button" data-toggle-password="passwordConfirmation" aria-label="Lihat kata sandi" aria-pressed="false"><i class="bi bi-eye" aria-hidden="true"></i></button></div><div class="form-text">Masukkan sandi yang sama untuk menghindari kesalahan pengetikan.</div></div>'}<div class="col-sm-12 form-span-all"><fieldset class="border rounded p-3"><legend class="float-none w-auto px-2 fs-6 fw-bold mb-1">Pilih satu atau beberapa role</legend><p class="small text-secondary mb-3">Role menentukan gabungan akses akun. Kepsek tidak dapat digabung; guru dan tendik juga tidak dapat dipasangkan.</p><div class="row g-2">${roleChecks}</div></fieldset></div><div class="col-sm-12 form-span-all"><details class="border rounded p-3" ${user?.permissions?.length ? 'open' : ''}><summary class="fw-semibold">Pengaturan lanjutan: permission tambahan (opsional)</summary><p class="small text-secondary mt-3 mb-2">Permission yang dipilih di sini menambahkan akses di atas akses dari role. Gunakan hanya jika akun ini perlu pengecualian khusus; permission tidak mencabut akses dari role.</p><div class="row g-2">${permissionChecks}</div></details></div><div class="col-sm-12 form-actions"><button class="btn btn-primary">Simpan akun</button></div></div></form>`);
        $('userGender').value = user?.jenis_kelamin || '';
        document.querySelectorAll('[data-toggle-password]').forEach((button) => button.addEventListener('click', () => {
            const input = $(button.dataset.togglePassword);
            const isVisible = input.type === 'password';
            input.type = isVisible ? 'text' : 'password';
            button.setAttribute('aria-label', isVisible ? 'Sembunyikan kata sandi' : 'Lihat kata sandi');
            button.setAttribute('aria-pressed', String(isVisible));
            button.innerHTML = `<i class="bi ${isVisible ? 'bi-eye-slash' : 'bi-eye'}" aria-hidden="true"></i>`;
        }));
        const confirmationInput = $('passwordConfirmation');
        if (confirmationInput) {
            const passwordInput = $('initialPassword');
            const validateConfirmation = () => confirmationInput.setCustomValidity(
                confirmationInput.value && confirmationInput.value !== passwordInput.value ? 'Kata sandi tidak sama.' : ''
            );
            passwordInput.addEventListener('input', validateConfirmation);
            confirmationInput.addEventListener('input', validateConfirmation);
        }
        $('userForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            if (!user && form.get('password') !== form.get('password_confirmation')) {
                confirmationInput.setCustomValidity('Kata sandi tidak sama.');
                confirmationInput.reportValidity();
                return;
            }
            const roles = form.getAll('roles');
            const roleError = getRoleCombinationError(roles);
            if (roleError) { setFeatureError(new Error(roleError)); return; }
            const body = { nama: form.get('nama'), email: form.get('email'), nip: form.get('nip') || null, jenis_kelamin: form.get('jenis_kelamin') || null,
                roles, permissions: form.getAll('permissions') };
            if (form.get('password')) {
                body.password = form.get('password');
                body.password_confirmation = form.get('password_confirmation');
            }
            try { await api(`/api/v1/admin/users${user ? `/${user.id}` : ''}`, { method: user ? 'PATCH' : 'POST', body }); showToast('Akun tersimpan.'); openUsers(); }
            catch (error) { setFeatureError(error); }
        });
    }

    function getRoleCombinationError(roles) {
        if (!roles.length) return 'Pilih minimal satu role.';
        if (roles.includes('kepsek') && roles.length > 1) return 'Role kepsek tidak dapat digabung dengan role lain.';
        if (roles.includes('guru') && roles.includes('tendik')) return 'Role guru tidak dapat digabung dengan role tendik.';
        return '';
    }
    return { openUsers, openUserForm };
};
