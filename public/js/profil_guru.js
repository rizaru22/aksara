(() => {
    const byId = (id) => document.getElementById(id);
    const passwordForm = byId('changePasswordForm');
    const passwordStatus = byId('passwordChangeStatus');
    const passwordSubmit = byId('changePasswordSubmit');
    const passwordModal = byId('changePasswordModal');

    // Delegasi event membuat tombol tetap bekerja walau modal dirender ulang atau diubah.
    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-toggle-password]');
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        const input = byId(button.dataset.togglePassword);
        if (!input) return;
        const visible = input.type === 'password';
        input.type = visible ? 'text' : 'password';
        button.setAttribute('aria-pressed', String(visible));
        const label = button.dataset.togglePassword === 'currentPassword'
            ? 'kata sandi saat ini'
            : button.dataset.togglePassword === 'newPassword'
                ? 'kata sandi baru'
                : 'konfirmasi kata sandi baru';
        button.setAttribute('aria-label', `${visible ? 'Sembunyikan' : 'Lihat'} ${label}`);
        const icon = button.querySelector('i');
        if (icon) icon.className = `bi bi-eye${visible ? '-slash' : ''}`;
    });

    // Mengambil token login aktif dari storage browser untuk request protected endpoint profile dan password.
    function token() {
        return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    }

    if (passwordForm && passwordStatus && passwordSubmit) {
        passwordModal?.addEventListener('hidden.bs.modal', () => {
            passwordForm.reset();
            passwordStatus.className = 'alert d-none';
            passwordStatus.textContent = '';
            passwordForm.querySelectorAll('[data-toggle-password]').forEach((button) => {
                const input = byId(button.dataset.togglePassword);
                if (input) input.type = 'password';
                button.setAttribute('aria-pressed', 'false');
                button.setAttribute('aria-label', `Lihat ${button.dataset.togglePassword === 'currentPassword' ? 'kata sandi saat ini' : button.dataset.togglePassword === 'newPassword' ? 'kata sandi baru' : 'konfirmasi kata sandi baru'}`);
                button.innerHTML = '<i class="bi bi-eye" aria-hidden="true"></i>';
            });
        });

        passwordForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            passwordStatus.className = 'alert d-none';

            const form = new FormData(passwordForm);
            const currentPassword = String(form.get('current_password') || '');
            const newPassword = String(form.get('password') || '');
            const confirmation = String(form.get('password_confirmation') || '');
            let validationMessage = '';
            if (!currentPassword) {
                validationMessage = 'Masukkan kata sandi saat ini.';
            } else if (newPassword.length < 12) {
                validationMessage = 'Kata sandi baru minimal 12 karakter.';
            } else if (newPassword === currentPassword) {
                validationMessage = 'Kata sandi baru harus berbeda dari kata sandi saat ini.';
            } else if (newPassword !== confirmation) {
                validationMessage = 'Konfirmasi kata sandi baru tidak cocok.';
            }
            if (validationMessage) {
                passwordStatus.className = 'alert alert-danger';
                passwordStatus.textContent = validationMessage;
                return;
            }

            passwordSubmit.disabled = true;
            passwordSubmit.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Menyimpan…';
            try {
                const response = await fetch(window.aksaraApiUrl('/api/v1/auth/change-password'), {
                    method: 'POST',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token()}`,
                    },
                    body: JSON.stringify({
                        current_password: currentPassword,
                        password: newPassword,
                        password_confirmation: confirmation,
                    }),
                });
                const result = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const errors = result.errors ? Object.values(result.errors).flat().join(' ') : '';
                    throw new Error(errors || result.message || `Kata sandi gagal diubah (${response.status}).`);
                }

                passwordForm.reset();
                passwordStatus.className = 'alert alert-success';
                passwordStatus.textContent = result.message || 'Kata sandi berhasil diubah.';
            } catch (error) {
                passwordStatus.className = 'alert alert-danger';
                passwordStatus.textContent = error.message || 'Kata sandi gagal diubah.';
            } finally {
                passwordSubmit.disabled = false;
                passwordSubmit.innerHTML = '<i class="bi bi-key"></i> Simpan kata sandi baru';
            }
        });
    }

    const input = byId('profilePhotoInput');
    const button = byId('changeProfilePhoto');
    const status = byId('profilePhotoStatus');

    if (!input || !button || !status) return;

    // Menetapkan foto profil baru pada semua elemen yang menampilkan avatar atau foto utama user.
    function setPhoto(url) {
        const imageUrl = url ? `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}` : '';
        [['welcomePhotoImage', 'welcomeAvatar'], ['profilePhotoImage', 'profileAvatar']].forEach(([imageId, avatarId]) => {
            const image = byId(imageId);
            const avatar = byId(avatarId);
            if (!image || !avatar) return;
            image.hidden = !imageUrl;
            if (imageUrl) image.src = imageUrl;
            else image.removeAttribute('src');
            const placeholder = avatar.querySelector('i');
            if (placeholder) placeholder.hidden = Boolean(imageUrl);
        });
    }

    button.addEventListener('click', () => {
        input.click();
    });

    input.addEventListener('change', async () => {
        const photo = input.files?.[0];
        if (!photo) return;

        if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)) {
            status.textContent = 'Pilih foto JPG, PNG, atau WebP.';
            input.value = '';
            return;
        }
        if (photo.size > 5 * 1024 * 1024) {
            status.textContent = 'Ukuran foto maksimal 5 MB.';
            input.value = '';
            return;
        }

        const authToken = token();
        if (!authToken) {
            status.textContent = 'Sesi login tidak ditemukan. Silakan login kembali.';
            return;
        }

        const body = new FormData();
        body.append('photo', photo);
        button.disabled = true;
        status.textContent = 'Mengunggah foto…';

        try {
            const response = await fetch(window.aksaraApiUrl('/api/v1/auth/profile/photo'), {
                method: 'POST',
                headers: { Accept: 'application/json', Authorization: `Bearer ${authToken}` },
                body,
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                const errors = result.errors ? Object.values(result.errors).flat().join(' ') : '';
                throw new Error(errors || result.message || `Unggah foto gagal (${response.status}).`);
            }

            const photoUrl = result.data?.foto_master;
            if (!photoUrl) throw new Error('Foto tersimpan, tetapi alamat fotonya tidak diterima. Muat ulang halaman untuk memeriksa profil.');
            setPhoto(photoUrl);
            status.textContent = result.message || 'Foto profil berhasil diperbarui.';
            window.dispatchEvent(new CustomEvent('aksara:profile-photo-updated', { detail: { foto_master: photoUrl } }));
        } catch (error) {
            status.textContent = error.message || 'Foto gagal diunggah.';
        } finally {
            button.disabled = false;
            input.value = '';
        }
    });

    window.addEventListener('aksara:profile-loaded', (event) => {
        setPhoto(event.detail?.foto_master || null);
    });
})();
