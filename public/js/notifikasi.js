window.createAksaraNotifications = function ({ $, api, htmlSafe }) {
    async function loadHomeAnnouncements() {
        const list = $('homeAnnouncements');
        try {
            const result = await api('/api/v1/announcements');
            const items = result.data || [];
            list.innerHTML = items.length ? items.map((item) => `<article class="notice"><span class="notice-icon blue"><i class="bi bi-megaphone"></i></span><div class="notice-title">${htmlSafe(item.nama_agenda)}${item.override_kbm ? '<br><span class="text-warning-emphasis">Perubahan kegiatan belajar</span>' : ''}</div><time>${htmlSafe(new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short' }).format(new Date(`${item.tanggal}T00:00:00`)))}<br>${htmlSafe(String(item.jam_mulai).slice(0, 5))}</time></article>`).join('') : '<div class="text-secondary small py-2">Belum ada pengumuman atau agenda sekolah mendatang.</div>';
        } catch (error) {
            list.innerHTML = `<div class="alert alert-warning mb-0 small">Pengumuman belum dapat dimuat: ${htmlSafe(error.message)}</div>`;
        }
    }

    function updateBadge(count) {
        const badge = $('notificationCount');
        if (!badge) return;
        const unread = Math.max(0, Number(count) || 0);
        badge.hidden = unread === 0;
        badge.textContent = unread > 99 ? '99+' : String(unread);
        badge.setAttribute('aria-label', `${unread} notifikasi belum dibaca`);
    }

    function formatDate(value) {
        if (!value) return 'Baru saja';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Baru saja';
        return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    }

    async function loadInbox() {
        const page = $('page-notifications');
        const emptyCard = page?.querySelector('.notification-inbox-card, .empty-state');
        if (!emptyCard) return;
        emptyCard.className = 'card notification-inbox-card';
        emptyCard.innerHTML = '<div class="text-center text-secondary py-3"><span class="spin"></span> Memuat notifikasi...</div>';

        try {
            const result = await api('/api/v1/notifications');
            const items = Array.isArray(result.data) ? result.data : [];
            const unreadCount = Math.max(0, Number(result.unread_count) || 0);
            const readCount = items.filter((item) => Boolean(item.read_at)).length;
            updateBadge(unreadCount);

            if (!items.length) {
                emptyCard.classList.add('is-empty');
                emptyCard.innerHTML = '<i class="bi bi-bell"></i><strong>Belum ada notifikasi</strong><span>Notifikasi pengingat akan muncul di sini setelah tersedia.</span>';
                return;
            }

            emptyCard.innerHTML = `
                <div class="notification-inbox-toolbar">
                    <div>
                        <strong class="notification-inbox-heading">Kotak masuk</strong>
                        <span class="notification-inbox-summary">${unreadCount} belum dibaca · ${readCount} sudah dibaca ditampilkan</span>
                    </div>
                    ${unreadCount > 0 ? '<button class="btn btn-sm btn-outline-success" id="markAllNotificationsRead">Tandai semua dibaca</button>' : ''}
                </div>
                <div class="notification-inbox-list" id="notificationInboxList">
                    ${items.map((item) => {
                        const data = item.data || {};
                        const title = htmlSafe(data.title || 'Notifikasi AKSARA');
                        const body = htmlSafe(data.body || 'Anda memiliki notifikasi baru.');
                        const unread = !item.read_at;
                        return `<article class="notification-item ${unread ? 'is-unread' : 'is-read'}">
                            <span class="notification-item-icon" aria-hidden="true"><i class="bi ${unread ? 'bi-bell-fill' : 'bi-bell'}"></i></span>
                            <div class="notification-item-content">
                                <div class="notification-item-title-row">
                                    <strong class="notification-item-title">${title}</strong>
                                    <span class="notification-status ${unread ? 'status-unread' : 'status-read'}">${unread ? 'Belum dibaca' : 'Sudah dibaca'}</span>
                                </div>
                                <p class="notification-item-body">${body}</p>
                                <div class="notification-item-footer">
                                    <small><i class="bi bi-clock"></i> ${htmlSafe(formatDate(item.created_at))}</small>
                                    ${unread ? `<button type="button" class="btn btn-sm btn-outline-success" data-notification-read="${htmlSafe(item.id)}">Tandai dibaca</button>` : ''}
                                </div>
                            </div>
                        </article>`;
                    }).join('')}
                </div>`;

            $('markAllNotificationsRead')?.addEventListener('click', async (event) => {
                const button = event.currentTarget;
                button.disabled = true;
                try {
                    const updated = await api('/api/v1/notifications/read-all', { method: 'PATCH' });
                    updateBadge(updated.unread_count);
                    await loadInbox();
                } catch (error) {
                    button.disabled = false;
                    emptyCard.insertAdjacentHTML('afterbegin', `<div class="alert alert-danger small">${htmlSafe(error.message)}</div>`);
                }
            });

            emptyCard.querySelectorAll('[data-notification-read]').forEach((button) => {
                button.addEventListener('click', async () => {
                    button.disabled = true;
                    try {
                        const updated = await api(`/api/v1/notifications/${encodeURIComponent(button.dataset.notificationRead)}/read`, { method: 'PATCH' });
                        updateBadge(updated.unread_count);
                        await loadInbox();
                    } catch (error) {
                        button.disabled = false;
                        emptyCard.insertAdjacentHTML('afterbegin', `<div class="alert alert-danger small">${htmlSafe(error.message)}</div>`);
                    }
                });
            });
        } catch (error) {
            emptyCard.innerHTML = `<div class="alert alert-warning mb-0"><strong>Notifikasi belum dapat dimuat.</strong><br>${htmlSafe(error.message)}</div>`;
        }
    }

    document.querySelectorAll('[data-page="notifications"]').forEach((button) => {
        button.addEventListener('click', () => loadInbox());
    });

    return { loadHomeAnnouncements, loadInbox };
};
