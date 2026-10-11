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
    return { loadHomeAnnouncements };
};
