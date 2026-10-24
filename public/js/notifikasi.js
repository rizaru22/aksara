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
        const emptyCard = page?.querySelector('.empty-state');
        if (!emptyCard) return;
        emptyCard.innerHTML = '<div class="text-center text-secondary py-3"><span class="spin"></span> Memuat notifikasi...</div>';

        try {
            const result = await api('/api/v1/notifications');
            const items = Array.isArray(result.data) ? result.data : [];
            updateBadge(result.unread_count);
            if (!items.length) {
                emptyCard.innerHTML = '<i class="bi bi-bell"></i><strong>Belum ada notifikasi</strong><span>Notifikasi pengingat akan muncul di sini setelah tersedia.</span>';
                return;
            }

            emptyCard.innerHTML = `
                <div class="d-flex align-items-center justify-content-between gap-2 mb-3">
                    <span class="small text-secondary">${items.length} notifikasi terbaru</span>
                    ${Number(result.unread_count) > 0 ? '<button class="btn btn-sm btn-outline-success" id="markAllNotificationsRead">Tandai semua dibaca</button>' : ''}
                </div>
                <div class="list-group" id="notificationInboxList">
                    ${items.map((item) => {
                        const data = item.data || {};
                        const title = htmlSafe(data.title || 'Notifikasi AKSARA');
                        const body = htmlSafe(data.body || 'Anda memiliki notifikasi baru.');
                        const unread = !item.read_at;
                        return `<article class="list-group-item ${unread ? 'border-start border-4 border-success' : ''}">
                            <div class="d-flex justify-content-between align-items-start gap-2">
                                <div class="flex-grow-1">
                                    <strong>${title}</strong>
                                    <p class="mb-1 mt-1">${body}</p>
                                    <small class="text-secondary">${htmlSafe(formatDate(item.created_at))}${unread ? ' · Belum dibaca' : ' · Sudah dibaca'}</small>
                                </div>
                                ${unread ? `<button type="button" class="btn btn-sm btn-outline-secondary text-nowrap" data-notification-read="${htmlSafe(item.id)}">Tandai dibaca</button>` : ''}
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
