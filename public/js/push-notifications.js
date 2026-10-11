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
        card.innerHTML = '<div class="col-12"><article class="card"><div class="card-body d-flex flex-wrap align-items-center gap-3"><div class="flex-grow-1"><h2 class="h6 mb-1"><i class="bi bi-bell me-1" aria-hidden="true"></i>Notifikasi AKSARA</h2><p class="small text-secondary mb-0" id="pushReminderStatus">Aktifkan notifikasi di perangkat ini.</p></div><button type="button" class="btn btn-outline-success" id="pushReminderToggle">Memeriksa…</button></div></article></div>';
        return card;
    }

    async function setup(user) {
        const roles = (user.roles || []).map((role) => typeof role === 'string' ? role : role.name);
        const supportedRoles = ['guru', 'admin', 'kepsek', 'kurikulum'];
        if (!roles.some((role) => supportedRoles.includes(role))) return;

        const insertionPoint = document.querySelector('#page-notifications .page-title');
        if (!insertionPoint || document.getElementById('pushReminderCard')) return;
        const card = makeCard();
        insertionPoint.after(card);
        const button = card.querySelector('#pushReminderToggle');
        const status = card.querySelector('#pushReminderStatus');

        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
            button.disabled = true;
            button.textContent = 'Tidak didukung';
            status.textContent = 'Browser ini belum mendukung notifikasi push.';
            return;
        }

        const setState = async () => {
            const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
            const subscription = await registration?.pushManager.getSubscription();
            const permissionDenied = Notification.permission === 'denied';
            button.disabled = permissionDenied;
            button.textContent = subscription
                ? 'Nonaktifkan notifikasi'
                : (permissionDenied ? 'Izin diblokir' : 'Aktifkan notifikasi');
            if (subscription) {
                status.textContent = 'Notifikasi push aktif di perangkat ini.';
            } else if (permissionDenied) {
                status.textContent = 'Izinkan notifikasi AKSARA dari pengaturan situs di browser untuk mengaktifkannya.';
            } else if (Notification.permission === 'granted') {
                status.textContent = 'Izin browser sudah diberikan. Tekan Aktifkan notifikasi untuk menyelesaikan aktivasi.';
            } else {
                status.textContent = 'Aktifkan notifikasi agar pengajuan perizinan dan pengingat dapat diterima di perangkat ini.';
            }
        };

        try {
            await setState();
        } catch (error) {
            button.disabled = false;
            button.textContent = 'Coba lagi';
            status.textContent = error.message || 'Status langganan notifikasi tidak dapat diperiksa.';
        }
        button.addEventListener('click', async () => {
            button.disabled = true;
            let actionError = '';
            try {
                const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
                let subscription = await registration.pushManager.getSubscription();
                if (subscription) {
                    await api('/api/v1/push/subscriptions', { method: 'DELETE', body: { endpoint: subscription.endpoint } });
                    await subscription.unsubscribe();
                    status.textContent = 'Notifikasi push dinonaktifkan di perangkat ini.';
                } else {
                    const permission = await Notification.requestPermission();
                    if (permission !== 'granted') throw new Error('Izin notifikasi belum diberikan.');
                    const { public_key: publicKey } = await api('/api/v1/push/vapid-public-key');
                    subscription = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: decodeVapidKey(publicKey),
                    });
                    await api('/api/v1/push/subscriptions', { method: 'POST', body: subscription.toJSON() });
                    status.textContent = 'Notifikasi push berhasil diaktifkan di perangkat ini.';
                }
            } catch (error) {
                actionError = error.message || 'Notifikasi belum dapat diaktifkan.';
            }
            try {
                await setState();
            } catch (error) {
                button.disabled = false;
                button.textContent = 'Coba lagi';
                if (!actionError) actionError = error.message || 'Status langganan notifikasi tidak dapat diperiksa.';
            }
            if (actionError) status.textContent = actionError;
        });
    }

    window.addEventListener('aksara:profile-loaded', (event) => setup(event.detail));
})();
