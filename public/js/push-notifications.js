(() => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');

    async function api(path, options = {}) {
        const response = await fetch(window.aksaraApiUrl(path), {
            method: options.method || 'GET',
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${token}`,
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || `Permintaan gagal (${response.status}).`);
        return result;
    }

    function decodeVapidKey(value) {
        const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, '='));
        return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    }

    function makeCard() {
        const card = document.createElement('section');
        card.className = 'row g-3 mb-3';
        card.id = 'pushReminderCard';
        card.innerHTML = '<div class="col-12"><article class="card"><div class="card-body d-flex flex-wrap align-items-center gap-3"><div class="flex-grow-1"><h2 class="h6 mb-1"><i class="bi bi-bell me-1" aria-hidden="true"></i>Pengingat kehadiran & pelajaran</h2><p class="small text-secondary mb-0" id="pushReminderStatus">Aktifkan notifikasi agar pengingat tetap muncul saat dashboard tidak dibuka.</p></div><button type="button" class="btn btn-outline-success" id="pushReminderToggle">Memeriksa…</button></div></article></div>';
        return card;
    }

    async function setup(user) {
        const roles = (user.roles || []).map((role) => typeof role === 'string' ? role : role.name);
        if (!roles.includes('guru')) return;

        const attendanceRow = document.getElementById('checkIn')?.closest('.row');
        if (!attendanceRow || document.getElementById('pushReminderCard')) return;
        const card = makeCard();
        attendanceRow.after(card);
        const button = card.querySelector('#pushReminderToggle');
        const status = card.querySelector('#pushReminderStatus');

        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
            button.disabled = true;
            button.textContent = 'Tidak didukung';
            status.textContent = 'Browser ini belum mendukung notifikasi push.';
            return;
        }

        const setState = async () => {
            if (Notification.permission === 'denied') {
                button.disabled = true;
                button.textContent = 'Izin diblokir';
                status.textContent = 'Izinkan notifikasi AKSARA dari pengaturan situs di browser untuk mengaktifkan pengingat.';
                return;
            }
            const registration = await navigator.serviceWorker.getRegistration('/');
            const subscription = await registration?.pushManager.getSubscription();
            button.disabled = false;
            button.textContent = subscription ? 'Nonaktifkan' : 'Aktifkan pengingat';
            status.textContent = subscription
                ? 'Pengingat push aktif di perangkat ini.'
                : 'Aktifkan notifikasi agar pengingat tetap muncul saat dashboard tidak dibuka.';
        };

        await setState();
        button.addEventListener('click', async () => {
            button.disabled = true;
            try {
                const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
                let subscription = await registration.pushManager.getSubscription();
                if (subscription) {
                    await api('/api/v1/push/subscriptions', { method: 'DELETE', body: { endpoint: subscription.endpoint } });
                    await subscription.unsubscribe();
                    status.textContent = 'Pengingat push dinonaktifkan di perangkat ini.';
                } else {
                    const permission = await Notification.requestPermission();
                    if (permission !== 'granted') throw new Error('Izin notifikasi belum diberikan.');
                    const { public_key: publicKey } = await api('/api/v1/push/vapid-public-key');
                    subscription = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: decodeVapidKey(publicKey),
                    });
                    await api('/api/v1/push/subscriptions', { method: 'POST', body: subscription.toJSON() });
                    status.textContent = 'Pengingat push berhasil diaktifkan di perangkat ini.';
                }
            } catch (error) {
                status.textContent = error.message || 'Notifikasi belum dapat diaktifkan.';
            } finally {
                await setState();
            }
        });
    }

    window.addEventListener('aksara:profile-loaded', (event) => setup(event.detail));
})();
