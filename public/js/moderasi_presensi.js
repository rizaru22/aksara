window.createAksaraModeration = function ({ $, api, htmlSafe, setFeature, showToast, token }) {
    let photoUrl = null;

    async function openFlagged(page = 1) {
        try {
            const result = await api(`/api/v1/admin/flagged-attendances?page=${page}`);
            const items = Array.isArray(result.data) ? result.data : [];
            const currentPage = Number(result.current_page || page);
            const lastPage = Math.max(1, Number(result.last_page || 1));
            const total = Number(result.total || 0);
            const waitingStatuses = ['PENDING', 'FLAGGED'];

            if (!items.length && currentPage > lastPage) return openFlagged(lastPage);

            const records = items.map((item) => {
                const sessions = ['masuk', 'pulang'].filter((session) => waitingStatuses.includes(item[`status_verifikasi_${session}`]));
                const sessionContent = sessions.map((session) => {
                    const label = session === 'masuk' ? 'Absen masuk' : 'Absen pulang';
                    const status = item[`status_verifikasi_${session}`];
                    const time = item[`jam_${session}`] || 'Waktu tidak tercatat';
                    return `<details class="moderation-session border rounded p-3 mt-2"><summary class="d-flex flex-wrap align-items-center justify-content-between gap-2"><span><strong>${label}</strong> <span class="text-secondary">${htmlSafe(time)}</span></span><span class="badge text-bg-warning">${htmlSafe(status)}</span></summary><div class="pt-3">${item[`foto_${session}`] ? `<button class="btn btn-outline-primary btn-sm mb-2" type="button" data-attendance-photo="${item.id}" data-photo-session="${session}"><i class="bi bi-image"></i> Lihat foto</button>` : '<div class="small text-secondary mb-2">Foto bukti tidak tersedia.</div>'}<label class="form-label small mb-1" for="review-note-${item.id}-${session}">Catatan admin <span class="text-secondary">(opsional)</span></label><textarea class="form-control form-control-sm mb-2" rows="2" id="review-note-${item.id}-${session}" placeholder="Tambahkan catatan bila diperlukan"></textarea><div class="d-flex gap-2"><button class="btn btn-success btn-sm" data-review-id="${item.id}" data-review-session="${session}" data-decision="APPROVED">Setujui</button><button class="btn btn-outline-danger btn-sm" data-review-id="${item.id}" data-review-session="${session}" data-decision="REJECTED">Tolak</button></div></div></details>`;
                }).join('');
                return `<article class="card mb-2"><div class="card-body p-3"><div class="d-flex flex-wrap justify-content-between align-items-start gap-2"><div><h2 class="h6 mb-1">${htmlSafe(item.user?.nama || 'Nama tidak tersedia')}</h2><div class="small text-secondary">${htmlSafe(item.tanggal)}${item.user?.nip ? ` · NIP ${htmlSafe(item.user.nip)}` : ''}</div></div><span class="badge text-bg-primary">${sessions.length} sesi menunggu</span></div><div class="small mt-2">Masuk ${htmlSafe(item.jam_masuk || '—')} <span class="text-secondary">·</span> Pulang ${htmlSafe(item.jam_pulang || '—')}${item.status_waktu_pulang ? ` <span class="text-secondary">·</span> ${htmlSafe(item.status_waktu_pulang.replaceAll('_', ' '))}` : ''}</div>${sessionContent}</div></article>`;
            }).join('');

            const pagination = total > 0 ? `<nav class="d-flex justify-content-between align-items-center gap-2 mt-3" aria-label="Halaman moderasi"><span class="small text-secondary">${total} record · Halaman ${currentPage} dari ${lastPage}</span><div class="btn-group btn-group-sm"><button class="btn btn-outline-secondary" type="button" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>Sebelumnya</button><button class="btn btn-outline-secondary" type="button" data-page="${currentPage + 1}" ${currentPage >= lastPage ? 'disabled' : ''}>Berikutnya</button></div></nav>` : '';
            const modal = `<div class="modal fade" id="moderationPhotoModal" tabindex="-1" aria-labelledby="moderationPhotoTitle" aria-hidden="true"><div class="modal-dialog modal-dialog-centered modal-lg"><div class="modal-content"><div class="modal-header"><h2 class="modal-title h5" id="moderationPhotoTitle">Foto bukti presensi</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Tutup"></button></div><div class="modal-body text-center"><img id="moderationPhotoImage" class="img-fluid rounded" alt="Foto bukti presensi" style="max-height:75vh;object-fit:contain"><div id="moderationPhotoLoading" class="text-secondary py-5" hidden>Memuat foto...</div></div></div></div></div>`;
            setFeature('Moderasi Presensi', `${items.length ? `<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2"><p class="small text-secondary mb-0">Buka sesi yang ingin ditinjau agar daftar tetap ringkas.</p><button class="btn btn-outline-secondary btn-sm" type="button" data-refresh-moderation><i class="bi bi-arrow-clockwise"></i> Muat ulang</button></div>${records}${pagination}` : '<div class="card"><div class="card-body text-center text-secondary py-4">Tidak ada presensi yang menunggu verifikasi.</div></div>'}${modal}`);

            document.querySelector('[data-refresh-moderation]')?.addEventListener('click', () => openFlagged(currentPage));
            document.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => openFlagged(Number(button.dataset.page))));
            document.querySelectorAll('[data-review-id]').forEach((button) => button.addEventListener('click', async () => {
                const note = $(`review-note-${button.dataset.reviewId}-${button.dataset.reviewSession}`).value.trim();
                button.disabled = true;
                try {
                    await api(`/api/v1/admin/flagged-attendances/${button.dataset.reviewId}/review`, { method: 'POST', body: { session: button.dataset.reviewSession, decision: button.dataset.decision, note } });
                    await openFlagged(currentPage);
                } catch (error) { button.disabled = false; showToast(error.message); }
            }));
            document.querySelectorAll('[data-attendance-photo]').forEach((button) => button.addEventListener('click', async () => {
                const modalElement = document.getElementById('moderationPhotoModal');
                const image = document.getElementById('moderationPhotoImage');
                const loading = document.getElementById('moderationPhotoLoading');
                const modal = window.bootstrap?.Modal.getOrCreateInstance(modalElement);
                if (!modal) return showToast('Penampil foto tidak dapat dibuka. Muat ulang halaman.');
                image.hidden = true;
                loading.hidden = false;
                modal.show();
                button.disabled = true;
                try {
                    const response = await fetch(window.aksaraApiUrl(`/api/v1/admin/flagged-attendances/${button.dataset.attendancePhoto}/photo/${button.dataset.photoSession}`), { headers: { Authorization: `Bearer ${token}` } });
                    if (!response.ok) throw new Error('Foto bukti tidak dapat ditampilkan.');
                    if (photoUrl) URL.revokeObjectURL(photoUrl);
                    photoUrl = URL.createObjectURL(await response.blob());
                    image.src = photoUrl;
                    image.hidden = false;
                    loading.hidden = true;
                } catch (error) { modal.hide(); showToast(error.message); }
                finally { button.disabled = false; }
            }));
            document.getElementById('moderationPhotoModal')?.addEventListener('hidden.bs.modal', () => {
                if (photoUrl) URL.revokeObjectURL(photoUrl);
                photoUrl = null;
                const image = document.getElementById('moderationPhotoImage');
                if (image) image.removeAttribute('src');
            }, { once: true });
        } catch (error) {
            setFeature('Moderasi Presensi', `<div class="alert alert-danger mb-0">${htmlSafe(error.message || 'Data moderasi gagal dimuat.')}</div>`);
        }
    }
    return { openFlagged };
};
