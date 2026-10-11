(() => {
    const byId = (id) => document.getElementById(id);
    const input = byId('profilePhotoInput');
    const button = byId('changeProfilePhoto');
    const status = byId('profilePhotoStatus');

    if (!input || !button || !status) return;

    function token() {
        return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    }

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
