window.createAksaraModeration = function ({ $, api, htmlSafe, setFeature, showToast, token }) {
    async function openFlagged() {
        const result = await api('/api/v1/admin/flagged-attendances');
        const items = result.data || [];
        const waitingStatuses = ['PENDING', 'FLAGGED'];
        const html = items.map((item) => `<article class="card mb-3"><div class="card-body"><strong>${htmlSafe(item.user?.nama)} · ${htmlSafe(item.tanggal)}</strong><p class="small mb-2">Masuk: ${htmlSafe(item.status_verifikasi_masuk)} ${htmlSafe(item.jam_masuk || '')} · Pulang: ${htmlSafe(item.status_verifikasi_pulang || '—')} ${htmlSafe(item.jam_pulang || '')}${item.status_waktu_pulang ? ` · Status waktu: ${htmlSafe(item.status_waktu_pulang.replaceAll('_', ' '))}` : ''}</p>${['masuk', 'pulang'].filter((session) => waitingStatuses.includes(item[`status_verifikasi_${session}`])).map((session) => `<div class="border-top pt-2 mt-2"><label class="form-label">Verifikasi absen ${session}</label>${item[`foto_${session}`] ? `<button class="btn btn-outline-secondary btn-sm mb-2" data-attendance-photo="${item.id}" data-photo-session="${session}">Lihat foto</button>` : '<div class="small text-secondary">Tidak ada foto bukti.</div>'}<textarea class="form-control mb-2" rows="2" id="review-note-${item.id}-${session}" placeholder="Catatan admin wajib diisi"></textarea><div class="d-flex gap-2"><button class="btn btn-success btn-sm" data-review-id="${item.id}" data-review-session="${session}" data-decision="APPROVED">Setujui</button><button class="btn btn-outline-danger btn-sm" data-review-id="${item.id}" data-review-session="${session}" data-decision="REJECTED">Tolak</button></div></div>`).join('')}</div></article>`).join('');
        setFeature('Moderasi Presensi', html || '<div class="card"><div class="card-body text-center text-secondary">Tidak ada absensi yang menunggu verifikasi.</div></div>');
        document.querySelectorAll('[data-review-id]').forEach((button) => button.addEventListener('click', async () => {
            const note = $(`review-note-${button.dataset.reviewId}-${button.dataset.reviewSession}`).value;
            try { await api(`/api/v1/admin/flagged-attendances/${button.dataset.reviewId}/review`, { method: 'POST', body: { session: button.dataset.reviewSession, decision: button.dataset.decision, note } }); openFlagged(); }
            catch (error) { showToast(error.message); }
        }));
        document.querySelectorAll('[data-attendance-photo]').forEach((button) => button.addEventListener('click', async () => {
            try {
                const response = await fetch(window.aksaraApiUrl(`/api/v1/admin/flagged-attendances/${button.dataset.attendancePhoto}/photo/${button.dataset.photoSession}`), { headers: { Authorization: `Bearer ${token}` } });
                if (!response.ok) throw new Error('Foto tidak dapat diunduh.');
                const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'foto-presensi'; anchor.click(); URL.revokeObjectURL(url);
            } catch (error) { showToast(error.message); }
        }));
    }
    return { openFlagged };
};
