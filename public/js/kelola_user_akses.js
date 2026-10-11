window.createAksaraUserAccess = function ({ $, api, htmlSafe, setFeature, setFeatureError, showToast }) {
    const genderLabel = (value) => ({ L: 'Laki-laki', P: 'Perempuan' })[value] || '—';
    async function openUsers(page = 1) {
        const result = await api(`/api/v1/admin/users?page=${page}`);
        const pageData = Array.isArray(result.data) ? result : (result.data?.data ? result.data : result);
        const users = Array.isArray(pageData.data) ? pageData.data : [];
        const pagination = `<div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3"><span class="small text-secondary">${users.length ? `Menampilkan ${pageData.from || 1}–${pageData.to || users.length} dari ${pageData.total || users.length} pengguna` : 'Belum ada data pengguna.'}</span><div class="btn-group btn-group-sm"><button class="btn btn-outline-secondary" data-user-page="${Math.max(1, (pageData.current_page || page) - 1)}" ${(pageData.current_page || page) <= 1 ? 'disabled' : ''}>Sebelumnya</button><span class="btn btn-outline-secondary disabled">Halaman ${pageData.current_page || page} / ${pageData.last_page || 1}</span><button class="btn btn-outline-secondary" data-user-page="${Math.min(pageData.last_page || page, (pageData.current_page || page) + 1)}" ${(pageData.current_page || page) >= (pageData.last_page || page) ? 'disabled' : ''}>Berikutnya</button></div></div>`;
        setFeature('Kelola User & Akses', `<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><p class="text-secondary mb-0">Daftar seluruh akun pengguna yang tersimpan.</p><button class="btn btn-success" id="newUser"><i class="bi bi-person-plus"></i> Tambah pengguna</button></div><div class="table-responsive"><table class="table table-hover align-middle"><thead><tr><th>Nama</th><th>Email</th><th>NIP</th><th>Jenis kelamin</th><th>Role</th><th class="text-end">Aksi</th></tr></thead><tbody>${users.map((user) => `<tr><td class="fw-semibold">${htmlSafe(user.nama)}</td><td>${htmlSafe(user.email)}</td><td>${htmlSafe(user.nip || '—')}</td><td>${htmlSafe(genderLabel(user.jenis_kelamin))}</td><td>${htmlSafe((user.roles || []).map((role) => role.name).join(', ') || 'Belum ada role')}</td><td class="text-end"><div class="d-inline-flex flex-wrap gap-1"><button class="btn btn-outline-primary btn-sm" data-user-edit="${user.id}">Ubah</button><button class="btn btn-outline-secondary btn-sm" data-password-reset="${user.id}">Kirim reset</button><button class="btn btn-outline-danger btn-sm" data-user-delete="${user.id}">Hapus</button></div></td></tr>`).join('') || '<tr><td colspan="6" class="text-center text-secondary py-4">Belum ada pengguna di database.</td></tr>'}</tbody></table></div>${pagination}`);
        $('newUser').addEventListener('click', () => openUserForm());
        document.querySelectorAll('[data-user-page]').forEach((button) => button.addEventListener('click', () => openUsers(Number(button.dataset.userPage))));
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
        const selectedRole = (user?.roles || [])[0]?.name || '';
        const roleDescriptions = {
            admin: 'Akses administrasi, dashboard admin, absensi, serta jurnal dan presensi siswa saat mengajar.',
            guru: 'Absensi masuk/pulang, jurnal mengajar, dan presensi siswa pada jadwal yang diampu.',
            kepsek: 'Dashboard eksekutif, absensi, jurnal dan presensi siswa saat mengajar, serta persetujuan izin.',
            kurikulum: 'Dashboard kurikulum, absensi, jurnal dan presensi siswa saat mengajar, serta pengelolaan akademik.',
        };
        const roleChecks = lists.roles.map((role) => `<label class="form-check d-flex align-items-start gap-2 border rounded p-3 m-0"><input class="form-check-input mt-1 flex-shrink-0" type="radio" name="role" value="${htmlSafe(role)}" required ${selectedRole === role ? 'checked' : ''}><span class="form-check-label"><span class="fw-semibold d-block">${htmlSafe(role)}</span><span class="small text-secondary">${htmlSafe(roleDescriptions[role] || 'Akses akun mengikuti izin yang ditetapkan untuk role ini.')}</span></span></label>`).join('');
        const permissionChecks = lists.permissions.map((permission) => `<label class="form-check d-flex align-items-center gap-2 border rounded p-3 m-0"><input class="form-check-input mt-0 flex-shrink-0" type="checkbox" name="permissions" value="${htmlSafe(permission)}" ${user?.permissions?.some((item) => item.name === permission) ? 'checked' : ''}><span class="form-check-label">${htmlSafe(permission.replaceAll('-', ' '))}<span class="d-block small text-secondary">Izin tambahan untuk akun ini</span></span></label>`).join('');
        setFeature(user ? `Ubah Akun: ${user.nama}` : 'Tambah Akun', `<form class="admin-form-card" id="userForm" data-id="${user?.id || ''}"><div class="row g-3 admin-form-grid"><div class="col-sm-12"><label class="form-label">Nama</label><input class="form-control" name="nama" required value="${htmlSafe(user?.nama)}"></div><div class="col-sm-12"><label class="form-label">Jenis kelamin</label><select class="form-select" id="userGender" name="jenis_kelamin"><option value="">Belum diatur</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></div><div class="col-sm-12"><label class="form-label">Email</label><input class="form-control" type="email" name="email" required value="${htmlSafe(user?.email)}"></div><div class="col-sm-12"><label class="form-label">NIP (opsional)</label><input class="form-control" name="nip" value="${htmlSafe(user?.nip)}"></div>${user ? '<div class="col-sm-12"><div class="alert alert-info small">Reset kata sandi dikirim melalui tautan email dari daftar pengguna.</div></div>' : '<div class="col-sm-12"><label class="form-label" for="initialPassword">Kata sandi awal (min. 12 karakter)</label><div class="input-group"><input class="form-control" id="initialPassword" type="password" name="password" required minlength="12" autocomplete="new-password"><button class="btn btn-outline-secondary" type="button" data-toggle-password="initialPassword" aria-label="Lihat kata sandi" aria-pressed="false"><i class="bi bi-eye" aria-hidden="true"></i></button></div></div><div class="col-sm-12"><label class="form-label" for="passwordConfirmation">Ulangi kata sandi</label><div class="input-group"><input class="form-control" id="passwordConfirmation" type="password" name="password_confirmation" required minlength="12" autocomplete="new-password"><button class="btn btn-outline-secondary" type="button" data-toggle-password="passwordConfirmation" aria-label="Lihat kata sandi" aria-pressed="false"><i class="bi bi-eye" aria-hidden="true"></i></button></div><div class="form-text">Masukkan sandi yang sama untuk menghindari kesalahan pengetikan.</div></div>'}<div class="col-sm-12 form-span-all"><fieldset class="border rounded p-3"><legend class="float-none w-auto px-2 fs-6 fw-bold mb-1">Pilih satu role</legend><p class="small text-secondary mb-3">Satu akun hanya memiliki satu role. Role menentukan akses utama dan menu dashboard yang tersedia.</p><div class="row g-2">${roleChecks}</div></fieldset></div><div class="col-sm-12 form-span-all"><details class="border rounded p-3" ${user?.permissions?.length ? 'open' : ''}><summary class="fw-semibold">Pengaturan lanjutan: permission tambahan (opsional)</summary><p class="small text-secondary mt-3 mb-2">Permission yang dipilih di sini menambahkan akses di atas akses dari role. Gunakan hanya jika akun ini perlu pengecualian khusus; permission tidak mencabut akses dari role.</p><div class="row g-2">${permissionChecks}</div></details></div><div class="col-sm-12 form-actions"><button class="btn btn-primary">Simpan akun</button></div></div></form>`);
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
            const body = { nama: form.get('nama'), email: form.get('email'), nip: form.get('nip') || null, jenis_kelamin: form.get('jenis_kelamin') || null,
                roles: [form.get('role')], permissions: form.getAll('permissions') };
            if (form.get('password')) {
                body.password = form.get('password');
                body.password_confirmation = form.get('password_confirmation');
            }
            try { await api(`/api/v1/admin/users${user ? `/${user.id}` : ''}`, { method: user ? 'PATCH' : 'POST', body }); showToast('Akun tersimpan.'); openUsers(); }
            catch (error) { setFeatureError(error); }
        });
    }
    return { openUsers, openUserForm };
};
