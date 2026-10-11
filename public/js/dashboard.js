(() => {
    window.aksaraApiUrl = window.aksaraApiUrl || ((path) => {
        const pathname = window.location.pathname;
        const lastSegment = pathname.split('/').filter(Boolean).at(-1) || '';
        const appRoot = /\.[a-z0-9]+$/i.test(lastSegment)
            ? new URL('.', window.location.href)
            : new URL(`${pathname.endsWith('/') ? pathname : `${pathname}/`}`, window.location.origin);
        return new URL(String(path).replace(/^\/+/, ''), appRoot).toString();
    });
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    const loginUrl = 'index.html';
    const $ = (id) => document.getElementById(id);
    const escapeText = (value) => String(value ?? '').trim();
    let toastTimer;
    let activeUser = null;
    let dashboardModules = [];
    let activeRoleNames = [];

    function updateUnreadNotificationCount(count) {
        const badge = $('notificationCount');
        if (!badge) return;
        const unread = Math.max(0, Number(count) || 0);
        badge.hidden = unread === 0;
        badge.textContent = unread > 99 ? '99+' : String(unread);
        badge.setAttribute('aria-label', `${unread} notifikasi belum dibuka`);
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data?.type === 'aksara:unread-count') {
                updateUnreadNotificationCount(event.data.count);
            }
        });
        navigator.serviceWorker.ready
            .then((registration) => registration.active?.postMessage({ type: 'aksara:get-unread-count' }))
            .catch(() => {});
    }

    function showToast(message) {
        $('toast').textContent = message;
        $('toast').classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3200);
    }

    const featureModal = window.bootstrap?.Modal
        ? bootstrap.Modal.getOrCreateInstance($('featureModal'))
        : { show() {}, hide() {} };
    const htmlSafe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);

    async function api(path, options = {}) {
        const headers = { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) };
        let body = options.body;
        if (body && !(body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(body);
        }
        const response = await fetch(window.aksaraApiUrl(path), { method: options.method || 'GET', headers, body });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            const details = result.errors ? Object.values(result.errors).flat().join(' ') : '';
            throw new Error(details || result.message || `Permintaan gagal (${response.status}).`);
        }
        return result;
    }

    function setFeature(title, content) {
        if (document.body.classList.contains('admin-mode')) {
            setAdminPanel(title, content);
            return;
        }
        $('featureTitle').textContent = title;
        $('featureContent').innerHTML = content;
        featureModal.show();
    }

    function setFeatureError(error) {
        const target = document.body.classList.contains('admin-mode') ? $('adminPanelContent') : $('featureContent');
        target.querySelector('.feature-error')?.remove();
        target.insertAdjacentHTML('afterbegin', `<div class="alert alert-danger feature-error">${htmlSafe(error.message || error)}</div>`);
    }

    const teacherAttendance = window.createAksaraTeacherAttendance({ $, api, showToast, setFeature, setFeatureError, featureModal });

    const academicData = window.createAksaraAcademicData({ $, api, htmlSafe, setFeature, setFeatureError, showToast, token });
    const academicYears = window.createAksaraAcademicYears({ openMaster: academicData.openMaster });

    async function openSchedules() {
        const result = await api('/api/v1/teacher/schedules/today');
        const rows = result.data || [];
        const meta = result.meta || {};
        if (meta.hari === 'Minggu' || meta.hari_libur?.jenis === 'MINGGU') {
            showToast('Tidak ada jadwal mengajar pada hari Minggu.');
            return;
        }
        const holidayLabel = meta.hari_libur?.jenis === 'MINGGU' ? 'Hari Minggu' : meta.hari_libur?.jenis.replaceAll('_', ' ');
        const holidayNote = meta.hari_libur ? `<div class="alert alert-info mb-0">${htmlSafe(meta.hari_libur.nama)} · ${htmlSafe(holidayLabel)}. Tidak ada sesi mengajar hari ini.</div>` : '';
        const list = rows.length ? `<div class="list-group">${rows.map((schedule) => {
            const journal = schedule.jurnal_hari_ini;
            const disabled = schedule.kbm_ditangguhkan || journal;
            return `<article class="list-group-item"><div class="d-flex justify-content-between gap-2"><strong>${htmlSafe(schedule.kelas?.nama_kelas)} · ${htmlSafe(schedule.mata_pelajaran?.nama_mapel)}</strong><span class="small">${htmlSafe(schedule.jam_mulai)}–${htmlSafe(schedule.jam_selesai)}</span></div><div class="small text-secondary">${htmlSafe(schedule.hari)} · Siklus ${htmlSafe(schedule.siklus_minggu || 'Mingguan')}</div>${schedule.kbm_ditangguhkan ? `<div class="alert alert-warning mt-2 mb-0 small">KBM ditangguhkan: ${htmlSafe(schedule.agenda_pengganti)}</div>` : journal ? `<div class="alert alert-success mt-2 mb-0 small">Jurnal sudah dikirim · ${htmlSafe(journal.status_sesi)}</div>` : `<button class="btn btn-success btn-sm mt-2" data-journal="${schedule.id}">Isi E-Jurnal & Presensi Siswa</button>`}</article>`;
        }).join('')}</div>` : '<div class="card"><div class="card-body text-center text-secondary">Tidak ada jadwal untuk tanggal dan siklus ini.</div></div>';
        setFeature('Jadwal & E-Jurnal Hari Ini', `<div class="alert alert-info small">${htmlSafe(meta.hari)} · ${htmlSafe(meta.tanggal)} · ${htmlSafe(meta.tahun_ajaran)} / ${htmlSafe(meta.semester)} · Siklus ${htmlSafe(meta.siklus_minggu)}</div>${holidayNote || list}`);
        document.querySelectorAll('[data-journal]').forEach((button) => button.addEventListener('click', () => openJournalForm(button.dataset.journal)));
    }

    async function loadHomeSchedules() {
        const card = $('homeScheduleCard');
        const list = $('homeScheduleList');
        if (!card || !list) return;
        try {
            const result = await api('/api/v1/teacher/schedules/today');
            const rows = result.data || [];
            $('scheduleCaption').textContent = `${result.meta?.hari || ''} · ${result.meta?.tanggal || ''} · ${result.meta?.tahun_ajaran || ''} ${result.meta?.semester || ''}`;
            if (result.meta?.hari === 'Minggu' || result.meta?.hari_libur?.jenis === 'MINGGU') {
                card.hidden = true;
                list.replaceChildren();
                return;
            }
            if (result.meta?.hari_libur) {
                const holiday = result.meta.hari_libur;
                card.hidden = false;
                $('scheduleCaption').textContent = `${holiday.jenis === 'MINGGU' ? 'Hari Minggu' : holiday.jenis.replaceAll('_', ' ')} · ${result.meta?.tanggal || ''}`;
                list.innerHTML = `<div class="alert alert-info mb-0"><strong>${htmlSafe(holiday.nama)}</strong><br>Tidak ada jadwal mengajar karena hari libur.</div>`;
                return;
            }
            if (!rows.length) { card.hidden = true; return; }
            card.hidden = false;
            list.innerHTML = rows.map((schedule) => {
                const journal = schedule.jurnal_hari_ini;
                const isGuru = activeRoleNames.includes('guru');
                const action = schedule.kbm_ditangguhkan
                    ? `<span class="badge text-bg-warning">KBM ditangguhkan</span>`
                    : journal ? (journal.foto_kegiatan ? `<span class="badge text-bg-success">Jurnal & foto tercatat</span>` : `<button class="btn btn-sm btn-outline-success" data-home-journal-photo="${journal.id}">Unggah foto</button>`)
                        : isGuru ? `<button class="btn btn-sm btn-success" data-home-journal="${schedule.id}">Isi Jurnal</button>` : '';
                return `<article class="schedule-item ${schedule.kbm_ditangguhkan ? '' : 'current'}"><span><strong>${htmlSafe(schedule.kelas?.nama_kelas || 'Kelas')} · ${htmlSafe(schedule.mata_pelajaran?.nama_mapel || 'Mata pelajaran')}</strong><br><span>${htmlSafe(schedule.jam_mulai)}–${htmlSafe(schedule.jam_selesai)} · Siklus ${htmlSafe(schedule.siklus_minggu || 'Mingguan')}</span>${schedule.agenda_pengganti ? `<br><small>${htmlSafe(schedule.agenda_pengganti)}</small>` : ''}</span>${action}</article>`;
            }).join('');
            list.querySelectorAll('[data-home-journal]').forEach((button) => button.addEventListener('click', () => openJournalForm(button.dataset.homeJournal)));
            list.querySelectorAll('[data-home-journal-photo]').forEach((button) => button.addEventListener('click', () => openJournalPhotoUpload(button.dataset.homeJournalPhoto)));
        } catch (error) {
            card.hidden = false;
            list.innerHTML = `<div class="alert alert-warning mb-0 small">Jadwal hari ini belum dapat dimuat: ${htmlSafe(error.message)}</div>`;
        }
    }

    const notifications = window.createAksaraNotifications({ $, api, htmlSafe });

    function enterAdminDashboard() {
        document.body.classList.add('admin-mode');
        $('dashboard').hidden = true;
        $('adminWorkspace').hidden = false;
        $('adminUserLabel').textContent = activeUser?.nama || activeUser?.name || '';
        renderAdminHome();
        window.scrollTo({ top: 0 });
    }

    function leaveAdminDashboard() {
        document.body.classList.remove('admin-mode', 'sidebar-open');
        $('adminWorkspace').hidden = true;
        $('dashboard').hidden = false;
    }

    function setAdminPanel(title, content) {
        $('adminPanelContent').innerHTML = `<div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3"><div><div class="text-secondary small">AKSARA / Administrasi</div><h1 class="mb-0">${htmlSafe(title)}</h1></div><button class="btn btn-outline-secondary d-lg-none" id="adminPanelBack"><i class="bi bi-arrow-left"></i> Dashboard</button></div>${content}`;
        $('adminPanelBack')?.addEventListener('click', renderAdminHome);
    }

    function renderAdminHome() {
        const quickLinks = [
            { key: 'reports', icon: 'bi-clipboard-data', label: 'Laporan Harian, Mingguan & Bulanan', text: 'Rekap kehadiran guru dan jurnal mengajar berdasarkan periode.' },
            { key: 'classes', icon: 'bi-building', label: 'Kelola Kelas', text: 'Data kelas, tingkat, jurusan, dan wali kelas.' },
            { key: 'students', icon: 'bi-people', label: 'Kelola Siswa', text: 'Data siswa dan penempatan kelas.' },
            { key: 'schedules', icon: 'bi-calendar-week', label: 'Jadwal Pelajaran', text: 'Jadwal guru, kelas, mata pelajaran, dan siklus.' },
            ...dashboardModules.map((module) => ({ key: module.key, icon: module.icon, label: module.title, text: module.description, module })),
        ];
        setAdminPanel('Dashboard Admin', `<div class="admin-welcome mb-4"><h1>Selamat datang, ${htmlSafe(activeUser?.nama || 'Pengguna')}</h1><p class="mb-0">Rekap kehadiran dan kegiatan pembelajaran hari ini.</p></div><div id="adminLiveReport"><div class="card"><div class="card-body text-secondary"><span class="spin"></span>Memuat rekap hari ini...</div></div></div><h2 class="h5 mt-4 mb-3">Menu Administrasi</h2><div class="row g-3">${quickLinks.map((item) => `<div class="col-12 col-md-6 col-xl-4"><article class="card h-100"><div class="card-body d-flex flex-column"><span class="module-icon mb-3"><i class="bi ${item.icon}"></i></span><h2 class="card-title">${htmlSafe(item.label)}</h2><p class="text-secondary small flex-grow-1">${htmlSafe(item.text)}</p><button class="btn btn-outline-success btn-sm align-self-start" data-admin-open="${htmlSafe(item.key)}">Buka menu <i class="bi bi-arrow-right"></i></button></div></article></div>`).join('')}</div>`);
        $('adminPanelContent').querySelectorAll('[data-admin-open]').forEach((button) => button.addEventListener('click', () => adminAction(button.dataset.adminOpen)));
        document.querySelectorAll('.admin-side-link').forEach((button) => button.classList.toggle('active', button.dataset.adminAction === 'home'));
        adminDashboard.loadAdminLiveReport();
    }

    const adminDashboard = window.createAksaraAdminDashboard({ $, api, htmlSafe });
    const adminReports = window.createAksaraAdminReports({ api, htmlSafe, setAdminPanel });
    const holidayCalendar = window.createAksaraHolidayCalendar({ api, htmlSafe, setFeature, setFeatureError, showToast });

    function adminAction(action) {
        document.querySelectorAll('.admin-side-link').forEach((button) => button.classList.toggle('active', button.dataset.adminAction === action));
        const module = dashboardModules.find((item) => item.key === action);
        if (action === 'home') return renderAdminHome();
        if (action === 'reports') return adminReports.open();
        if (['classes', 'students', 'subjects', 'materials', 'schedules'].includes(action)) return academicData.openMaster(action);
        if (module) return openModule(module);
    }

    async function openJournalForm(scheduleId) {
        const rosterResult = await api(`/api/v1/teacher/schedules/${scheduleId}/students`);
        const students = rosterResult.data || [];
        if (!students.length) return showToast('Kelas ini belum memiliki data siswa.');
        setFeature('Isi E-Jurnal & Presensi Siswa', `<form id="journalForm"><input type="hidden" name="jadwal_pelajaran_id" value="${htmlSafe(scheduleId)}"><div class="mb-3"><label class="form-label" for="journalMaterial">ID materi pelajaran (opsional)</label><input class="form-control" id="journalMaterial" name="materi_pelajaran_id" type="number" min="1"><div class="form-text">Materi harus berasal dari mata pelajaran pada jadwal.</div></div><div class="mb-3"><label class="form-label" for="journalSummary">Materi pembahasan</label><textarea class="form-control" id="journalSummary" name="materi_pembahasan" rows="3" required></textarea></div><div class="mb-3"><label class="form-label" for="journalNotes">Catatan kejadian kelas (opsional)</label><textarea class="form-control" id="journalNotes" name="catatan_kejadian_kelas" rows="2"></textarea></div><div class="mb-3"><label class="form-label" for="journalPhoto">Foto kegiatan (opsional)</label><input class="form-control" id="journalPhoto" name="foto_kegiatan" type="file" accept="image/*" capture="environment"></div><h3 class="h6">Presensi siswa (${students.length})</h3><div class="table-responsive"><table class="table table-sm"><thead><tr><th>Siswa</th><th>Status</th></tr></thead><tbody>${students.map((student, index) => `<tr><td>${htmlSafe(student.nama)}<input type="hidden" name="sid-${index}" value="${student.id}"></td><td><select class="form-select form-select-sm" name="status-${index}">${['HADIR', 'SAKIT', 'IZIN', 'ALPHA', 'CABUT'].map((status) => `<option value="${status}" ${status === 'HADIR' ? 'selected' : ''}>${status}</option>`).join('')}</select><input class="form-control form-control-sm mt-1" name="note-${index}" placeholder="Keterangan (opsional)"></td></tr>`).join('')}</tbody></table></div><button class="btn btn-success w-100" type="submit">Simpan Jurnal & Presensi</button></form>`);
        $('journalForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const data = new FormData();
            for (const [key, value] of form.entries()) if (!key.startsWith('sid-') && !key.startsWith('status-') && !key.startsWith('note-')) data.append(key, value);
            students.forEach((student, index) => {
                data.append(`presensi[${index}][siswa_id]`, student.id);
                data.append(`presensi[${index}][status]`, form.get(`status-${index}`));
                data.append(`presensi[${index}][keterangan]`, form.get(`note-${index}`) || '');
            });
            if (!data.get('materi_pelajaran_id')) data.delete('materi_pelajaran_id');
            try { await api('/api/v1/lesson-journals', { method: 'POST', body: data }); showToast('Jurnal dan presensi siswa tersimpan.'); openSchedules(); }
            catch (error) { setFeatureError(error); }
        });
    }

    async function openJournalPhotoUpload(journalId) {
        setFeature('Unggah Foto Kegiatan', `<form id="journalPhotoForm"><p class="text-secondary small">Unggah foto kegiatan untuk melengkapi jurnal pelajaran.</p><div class="mb-3"><label class="form-label" for="journalPhotoUpload">Foto kegiatan</label><input class="form-control" id="journalPhotoUpload" name="foto_kegiatan" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required></div><button class="btn btn-success w-100" type="submit">Simpan foto</button></form>`);
        $('journalPhotoForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const submit = event.currentTarget.querySelector('button[type="submit"]');
            submit.disabled = true;
            try {
                await api(`/api/v1/lesson-journals/${journalId}/photo`, { method: 'POST', body: new FormData(event.currentTarget) });
                featureModal.hide();
                showToast('Foto kegiatan berhasil diunggah.');
                loadHomeSchedules();
            } catch (error) {
                setFeatureError(error);
            } finally {
                submit.disabled = false;
            }
        });
    }

    async function openWaliSessions() {
        const result = await api('/api/v1/student-attendances/wali-sessions');
        const journals = result.data?.data || [];
        const content = journals.map((journal) => `<article class="card mb-3"><div class="card-body"><h3 class="h6">${htmlSafe(journal.tanggal)} · ${htmlSafe(journal.jadwal_pelajaran?.kelas?.nama_kelas)}</h3><p class="small text-secondary">${htmlSafe(journal.materi_pembahasan)}</p>${journal.presensi_siswas.map((row) => `<div class="row g-2 align-items-center border-top py-2"><div class="col-sm-12 col-md-4">${htmlSafe(row.siswa?.nama)}</div><div class="col-sm-12 col-md-4"><select class="form-select form-select-sm" id="status-${row.id}">${['HADIR', 'SAKIT', 'IZIN', 'ALPHA', 'CABUT'].map((status) => `<option ${status === row.status ? 'selected' : ''}>${status}</option>`).join('')}</select></div><div class="col-sm-12 col-md-4"><button class="btn btn-outline-primary btn-sm" data-attendance-save="${row.id}">Simpan koreksi</button></div></div>`).join('')}</div></article>`).join('');
        setFeature('Koreksi Presensi Per Sesi', content || '<div class="card"><div class="card-body text-center text-secondary">Belum ada sesi jurnal pada kelas perwalian.</div></div>');
        document.querySelectorAll('[data-attendance-save]').forEach((button) => button.addEventListener('click', async () => {
            try { await api(`/api/v1/student-attendances/${button.dataset.attendanceSave}`, { method: 'PATCH', body: { status: $(`status-${button.dataset.attendanceSave}`).value } }); showToast('Koreksi disimpan.'); }
            catch (error) { showToast(error.message); }
        }));
    }

    const moderation = window.createAksaraModeration({ $, api, htmlSafe, setFeature, showToast, token });

    async function openLeave(submitMode = false, page = 1, search = '', perPage = 20) {
        if (submitMode) {
            setFeature('Pengajuan Izin, Cuti & Dinas Luar', `<div class="alert alert-info small">Pilih jenis pengajuan pada formulir. Untuk sakit, pilih Izin / Cuti dan tuliskan “sakit” pada alasan. Dinas luar tercatat setelah disetujui.</div><form id="leaveForm"><div class="mb-3"><label class="form-label">Jenis pengajuan</label><select name="jenis_pengajuan" class="form-select"><option value="CUTI">Izin / Cuti / Sakit</option><option value="DINAS">Dinas luar</option></select></div><div class="row g-3"><div class="col-sm-12 col-md-6"><label class="form-label">Tanggal mulai</label><input class="form-control" name="tanggal_mulai" type="date" required></div><div class="col-sm-12 col-md-6"><label class="form-label">Tanggal selesai</label><input class="form-control" name="tanggal_selesai" type="date" required></div></div><div class="my-3"><label class="form-label">Alasan</label><textarea name="alasan" class="form-control" rows="4" minlength="10" required></textarea></div><div class="mb-3"><label class="form-label">Lampiran PDF/JPG/PNG (opsional, max 5 MB)</label><input class="form-control" name="berkas_lampiran" type="file" accept=".pdf,image/png,image/jpeg"></div><button class="btn btn-success w-100">Kirim pengajuan</button></form>`);
            $('leaveForm').addEventListener('submit', async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                try {
                    await api('/api/v1/leave-requests', { method: 'POST', body: form });
                    featureModal.hide();
                    showToast('Pengajuan berhasil dikirim dan menunggu persetujuan.');
                }
                catch (error) { setFeatureError(error); }
            });
            return;
        }
        const searchValue = $('leaveSearch')?.value ?? search;
        const pageValue = Number.isInteger(page) && page > 0 ? page : 1;
        const query = new URLSearchParams({ page: String(pageValue), per_page: String(perPage), search: searchValue.trim() });
        const result = await api(`/api/v1/leave-requests?${query.toString()}`);
        const items = Array.isArray(result.data) ? result.data : (result.data?.data || []);
        const pagination = Array.isArray(result.data) ? { current_page: 1, last_page: 1, total: items.length, per_page: perPage, from: items.length ? 1 : null, to: items.length } : result;
        const statusBadge = { PENDING: 'text-bg-warning', APPROVED: 'text-bg-success', REJECTED: 'text-bg-danger' };
        const displayDate = (value) => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
        const rows = items.map((item) => `<tr><td class="text-nowrap">${htmlSafe(displayDate(item.created_at))}</td><td><strong>${htmlSafe(item.user?.nama || 'Pengguna')}</strong>${item.user?.nip ? `<div class="small text-secondary">${htmlSafe(item.user.nip)}</div>` : ''}</td><td class="text-nowrap">${item.jenis_pengajuan === 'DINAS' ? 'Dinas luar' : 'Izin / cuti'}</td><td class="text-nowrap">${htmlSafe(item.tanggal_mulai)}${item.tanggal_mulai !== item.tanggal_selesai ? ` – ${htmlSafe(item.tanggal_selesai)}` : ''}</td><td class="leave-reason-cell" title="${htmlSafe(item.alasan)}">${htmlSafe(item.alasan)}</td><td><span class="badge ${statusBadge[item.status_approval] || 'text-bg-secondary'}">${htmlSafe(item.status_approval)}</span></td><td class="text-nowrap">${item.berkas_lampiran ? `<button class="btn btn-outline-secondary btn-sm" data-attachment="${item.id}" title="Unduh lampiran" aria-label="Unduh lampiran"><i class="bi bi-paperclip"></i></button>` : '<span class="text-secondary">—</span>'}</td><td class="text-nowrap">${item.status_approval === 'PENDING' ? `<div class="d-flex gap-1"><button class="btn btn-success btn-sm" data-leave-decision="${item.id}" data-status="APPROVED">Setujui</button><button class="btn btn-outline-danger btn-sm" data-leave-decision="${item.id}" data-status="REJECTED">Tolak</button></div>` : '<span class="text-secondary">Selesai</span>'}</td></tr>`).join('');
        const currentPage = Number(pagination.current_page || pageValue);
        const lastPage = Number(pagination.last_page || 1);
        const startPage = Math.max(1, Math.min(currentPage - 2, lastPage - 4));
        const endPage = Math.min(lastPage, startPage + 4);
        const pageButtons = Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index).map((number) => `<button type="button" class="btn btn-sm ${number === currentPage ? 'btn-primary' : 'btn-outline-secondary'}" data-leave-page="${number}" aria-current="${number === currentPage ? 'page' : 'false'}">${number}</button>`).join('');
        setFeature('Persetujuan Perizinan Guru', `<section class="card"><div class="card-body"><form id="leaveSearchForm" class="row g-2 align-items-end mb-3"><div class="col-12 col-md"><label class="form-label" for="leaveSearch">Cari nama, NIP, jenis, status, atau alasan</label><input class="form-control" type="search" id="leaveSearch" value="${htmlSafe(searchValue)}" placeholder="Ketik kata pencarian"></div><div class="col-6 col-md-2"><label class="form-label" for="leavePerPage">Baris per halaman</label><select class="form-select" id="leavePerPage">${[10, 20, 50].map((count) => `<option value="${count}" ${Number(perPage) === count ? 'selected' : ''}>${count}</option>`).join('')}</select></div><div class="col-6 col-md-auto"><button class="btn btn-primary w-100"><i class="bi bi-search"></i> Cari</button></div></form><div class="table-responsive"><table class="table table-hover table-striped align-middle leave-approval-table"><thead><tr><th>Waktu pengajuan</th><th>Guru</th><th>Jenis</th><th>Tanggal izin</th><th>Alasan</th><th>Status</th><th>Lampiran</th><th>Aksi</th></tr></thead><tbody>${rows || `<tr><td colspan="8" class="text-center text-secondary py-4">${searchValue ? 'Tidak ditemukan pengajuan yang cocok.' : 'Belum ada pengajuan izin.'}</td></tr>`}</tbody></table></div><div class="d-flex flex-wrap justify-content-between align-items-center gap-2"><small class="text-secondary">Menampilkan ${pagination.from || 0}–${pagination.to || 0} dari ${pagination.total || 0} pengajuan terbaru</small><nav class="d-flex gap-1" aria-label="Halaman pengajuan"><button type="button" class="btn btn-sm btn-outline-secondary" data-leave-page="${Math.max(1, currentPage - 1)}" ${currentPage <= 1 ? 'disabled' : ''} aria-label="Halaman sebelumnya"><i class="bi bi-chevron-left"></i></button>${pageButtons}<button type="button" class="btn btn-sm btn-outline-secondary" data-leave-page="${Math.min(lastPage, currentPage + 1)}" ${currentPage >= lastPage ? 'disabled' : ''} aria-label="Halaman berikutnya"><i class="bi bi-chevron-right"></i></button></nav></div></div></section>`);
        $('leaveSearchForm')?.addEventListener('submit', (event) => {
            event.preventDefault();
            openLeave(false, 1, $('leaveSearch').value, Number($('leavePerPage').value)).catch((error) => setFeatureError(error));
        });
        document.querySelectorAll('[data-leave-page]').forEach((button) => button.addEventListener('click', () => {
            openLeave(false, Number(button.dataset.leavePage), searchValue, Number(perPage)).catch((error) => setFeatureError(error));
        }));
        document.querySelectorAll('[data-leave-decision]').forEach((button) => button.addEventListener('click', async () => {
            try { await api(`/api/v1/leave-requests/${button.dataset.leaveDecision}/decision`, { method: 'PATCH', body: { status_approval: button.dataset.status } }); showToast('Keputusan pengajuan tersimpan.'); openLeave(false, currentPage, searchValue, Number(perPage)); }
            catch (error) { showToast(error.message); }
        }));
        document.querySelectorAll('[data-attachment]').forEach((button) => button.addEventListener('click', async () => {
            try {
                const response = await fetch(window.aksaraApiUrl(`/api/v1/leave-requests/${button.dataset.attachment}/attachment`), { headers: { Authorization: `Bearer ${token}` } });
                if (!response.ok) throw new Error('Lampiran tidak dapat diunduh.');
                const url = URL.createObjectURL(await response.blob());
                const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'lampiran-izin'; anchor.click(); URL.revokeObjectURL(url);
            } catch (error) { showToast(error.message); }
        }));
    }

    async function openMyLeaveRequests() {
        const result = await api('/api/v1/leave-requests/mine');
        const items = result.data || [];
        const statusDetails = {
            PENDING: { label: 'Menunggu persetujuan', badge: 'text-bg-warning', detail: 'Pengajuan sudah dikirim dan menunggu ditinjau admin.' },
            APPROVED: { label: 'Disetujui', badge: 'text-bg-success', detail: 'Pengajuan telah disetujui admin.' },
            REJECTED: { label: 'Ditolak', badge: 'text-bg-danger', detail: 'Pengajuan belum disetujui admin.' },
        };
        const formatDateTime = (value) => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
        const cards = items.map((item) => {
            const status = statusDetails[item.status_approval] || statusDetails.PENDING;
            const type = item.jenis_pengajuan === 'DINAS' ? 'Dinas luar' : 'Izin / cuti / sakit';
            const decision = item.status_approval === 'PENDING'
                ? 'Menunggu keputusan admin'
                : `${status.detail}${item.approver?.nama ? ` Oleh ${htmlSafe(item.approver.nama)}.` : ''} · ${formatDateTime(item.updated_at)}`;
            return `<article class="card mb-3"><div class="card-body"><div class="d-flex flex-wrap justify-content-between align-items-start gap-2"><h3 class="h6 mb-0">${type}</h3><span class="badge ${status.badge}">${status.label}</span></div><p class="small text-secondary mt-2 mb-2">${htmlSafe(item.tanggal_mulai)} – ${htmlSafe(item.tanggal_selesai)}</p><p class="mb-2">${htmlSafe(item.alasan)}</p><div class="border-top pt-2 small"><strong>Progres:</strong> ${decision}<br><span class="text-secondary">Dikirim ${formatDateTime(item.created_at)}</span></div>${item.berkas_lampiran ? `<button class="btn btn-outline-secondary btn-sm mt-2" data-attachment="${item.id}">Unduh lampiran</button>` : ''}</div></article>`;
        }).join('');
        setFeature('Status Pengajuan Saya', `<div class="d-flex justify-content-end mb-3"><button type="button" class="btn btn-outline-primary btn-sm" id="refreshMyLeaveRequests"><i class="bi bi-arrow-clockwise"></i> Perbarui status</button></div>${cards || '<div class="card"><div class="card-body text-center text-secondary">Belum ada pengajuan.</div></div>'}`);
        $('refreshMyLeaveRequests')?.addEventListener('click', () => openMyLeaveRequests().catch((error) => setFeatureError(error)));
        document.querySelectorAll('[data-attachment]').forEach((button) => button.addEventListener('click', async () => {
            try {
                const response = await fetch(window.aksaraApiUrl(`/api/v1/leave-requests/${button.dataset.attachment}/attachment`), { headers: { Authorization: `Bearer ${token}` } });
                if (!response.ok) throw new Error('Lampiran tidak dapat diunduh.');
                const url = URL.createObjectURL(await response.blob());
                const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'lampiran-izin'; anchor.click(); URL.revokeObjectURL(url);
            } catch (error) { showToast(error.message); }
        }));
    }

    const userAccess = window.createAksaraUserAccess({ $, api, htmlSafe, setFeature, setFeatureError, showToast });

    async function openSettings() {
        const result = await api('/api/v1/admin/settings');
        const settings = Object.fromEntries((result.data || []).map((setting) => [setting.key, setting.value]));
        const fields = [
            ['geofence_latitude', 'Latitude sekolah', 'number'], ['geofence_longitude', 'Longitude sekolah', 'number'],
            ['geofence_radius_meters', 'Radius geofence (meter)', 'number'],
            ['semester_start_date', 'Tanggal awal semester', 'date'], ['active_semester', 'Semester aktif', 'select'],
            ['school_name', 'Nama sekolah', 'text'], ['is_geofence_strict', 'Mode strict geofence', 'select'],
        ];
        const attendanceSchedule = result.attendance_schedule || [];
        const scheduleRows = attendanceSchedule.map((schedule) => `<tr><th scope="row" class="align-middle">${htmlSafe(schedule.hari)}</th><td><input class="form-control" type="time" name="attendance_jam_masuk_mulai[${htmlSafe(schedule.hari)}]" value="${htmlSafe(schedule.jam_masuk_mulai || '')}" aria-label="Awal absen masuk ${htmlSafe(schedule.hari)}"></td><td><input class="form-control" type="time" name="attendance_jam_masuk_akhir[${htmlSafe(schedule.hari)}]" value="${htmlSafe(schedule.jam_masuk_akhir)}" required aria-label="Batas terlambat masuk ${htmlSafe(schedule.hari)}"></td><td><input class="form-control" type="time" name="attendance_jam_pulang_mulai[${htmlSafe(schedule.hari)}]" value="${htmlSafe(schedule.jam_pulang_mulai || '')}" aria-label="Awal absen pulang ${htmlSafe(schedule.hari)}"></td><td><input class="form-control" type="time" name="attendance_jam_pulang_akhir[${htmlSafe(schedule.hari)}]" value="${htmlSafe(schedule.jam_pulang_akhir || '')}" aria-label="Batas akhir absen pulang ${htmlSafe(schedule.hari)}"></td></tr>`).join('');
        setFeature('Pengaturan Sekolah', `<form class="admin-form" id="settingsForm"><div class="row g-3 admin-form-grid">${fields.map(([key, label, type]) => `<div class="col-sm-12"><label class="form-label">${label}</label>${type === 'select' ? `<select class="form-select" name="${key}">${(key === 'active_semester' ? [['Ganjil', 'Ganjil'], ['Genap', 'Genap']] : [['0', 'Tidak strict'], ['1', 'Strict']]).map(([v, l]) => `<option value="${v}" ${String(settings[key]) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>` : `<input class="form-control" name="${key}" type="${type}" value="${htmlSafe(settings[key])}" required>`}</div>`).join('')}<div class="col-sm-12 form-span-all"><section class="border rounded p-3"><h2 class="h6 mb-1">Jadwal presensi harian</h2><p class="small text-secondary mb-3">Sebelum jam awal masuk, tombol absen belum bisa digunakan. Setelah batas masuk dihitung terlambat. Pulang sebelum awal atau setelah akhir jadwal tetap tercatat dengan status khusus dan wajib disertai alasan.</p><div class="table-responsive"><table class="table table-sm align-middle mb-0" style="min-width: 780px"><thead><tr><th>Hari</th><th>Awal masuk</th><th>Batas terlambat</th><th>Awal pulang</th><th>Akhir pulang</th></tr></thead><tbody>${scheduleRows}</tbody></table></div></section></div><div class="col-sm-12 form-span-all"><div class="alert alert-warning small">Status koordinat: <strong>${String(settings.geofence_location_verified) === '1' ? 'terverifikasi' : 'belum terverifikasi'}. </strong>Jika Anda telah memeriksa lokasi sekolah secara langsung, centang konfirmasi berikut.</div><label class="form-check"><input class="form-check-input" name="confirm_geofence_location" type="checkbox"><span class="form-check-label">Saya sudah memverifikasi koordinat lokasi sekolah</span></label></div><div class="col-sm-12 form-actions"><button class="btn btn-primary">Simpan pengaturan</button></div></div></form>`);
        $('settingsForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const form = Object.fromEntries([...formData.entries()].filter(([key]) => !key.startsWith('attendance_')));
            form.attendance_schedule = attendanceSchedule.map((schedule) => ({
                hari: schedule.hari,
                jam_masuk_mulai: formData.get(`attendance_jam_masuk_mulai[${schedule.hari}]`) || null,
                jam_masuk_akhir: formData.get(`attendance_jam_masuk_akhir[${schedule.hari}]`),
                jam_pulang_mulai: formData.get(`attendance_jam_pulang_mulai[${schedule.hari}]`) || null,
                jam_pulang_akhir: formData.get(`attendance_jam_pulang_akhir[${schedule.hari}]`) || null,
            }));
            for (const key of ['geofence_latitude', 'geofence_longitude', 'geofence_radius_meters']) form[key] = Number(form[key]);
            form.is_geofence_strict = form.is_geofence_strict === '1';
            form.confirm_geofence_location = form.confirm_geofence_location === 'on';
            try { await api('/api/v1/admin/settings', { method: 'PUT', body: { settings: form } }); showToast('Pengaturan diperbarui.'); openSettings(); }
            catch (error) { setFeatureError(error); }
        });
    }

    async function openModule(module) {
        try {
            if (module.key === 'journal') return openSchedules();
            if (module.key === 'academic-master') return academicData.openMaster('classes');
            if (module.key === 'years') return academicYears.open();
            if (module.key === 'agendas') return academicData.openMaster('agendas');
            if (module.key === 'holidays') return holidayCalendar.open();
            if (module.key === 'admin-users') return userAccess.openUsers();
            if (module.key === 'flagged') return moderation.openFlagged();
            if (module.key === 'monitoring') return openMonitoring();
            if (module.key === 'discrepancy') return openDiscrepancies();
            if (module.key === 'leave-approvals' || module.key === 'leave-submit') return openLeave(module.key === 'leave-submit');
            if (module.key === 'student-attendance') return openWaliSessions();
            if (module.key === 'settings') return openSettings();
        } catch (error) { setFeature(module.title, `<div class="alert alert-danger mb-0">${htmlSafe(error.message)}</div>`); }
    }

    async function openMonitoring(filters = {}) {
        const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
        const result = await api(`/api/v1/dashboard/curriculum${params.size ? `?${params}` : ''}`);
        const data = result.data;
        const rows = [
            ['Tahun ajaran', data.tahun_ajaran], ['Semester / siklus', `${data.semester} · ${data.siklus_minggu}`],
            ['Jadwal pada hari ini', data.scheduled_sessions], ['Jurnal tercatat', data.journal_records],
            ['Guru terjadwal', data.scheduled_teachers], ['Guru dengan presensi terverifikasi', data.present_scheduled_teachers],
            ['Presensi flagged', data.flagged_attendances], ['Agenda override KBM', data.school_agenda_overrides],
        ];
        setFeature('Monitoring Pembelajaran', `<form id="monitoringFilters" class="card mb-3 admin-form-card"><div class="card-body"><div class="row g-3 admin-form-grid"><div class="col-sm-12"><label class="form-label">Tanggal</label><input class="form-control" type="date" name="date" value="${htmlSafe(data.date)}"></div><div class="col-sm-12"><label class="form-label">Tahun ajaran</label><select class="form-select" name="tahun_ajaran_id"><option value="">Tahun aktif</option>${data.available_years.map((year) => `<option value="${year.id}" ${String(year.id) === String(filters.tahun_ajaran_id || '') ? 'selected' : ''}>${htmlSafe(year.tahun_ajaran)}${year.is_active ? ' (aktif)' : ''}</option>`).join('')}</select></div><div class="col-sm-12"><label class="form-label">Semester</label><select class="form-select" name="semester"><option value="">Default aktif</option><option ${String(filters.semester || '') === 'Ganjil' ? 'selected' : ''}>Ganjil</option><option ${String(filters.semester || '') === 'Genap' ? 'selected' : ''}>Genap</option></select></div><div class="col-sm-12 form-actions"><button class="btn btn-outline-success">Terapkan filter</button></div></div></div></form><div class="alert alert-info">Angka di bawah adalah hitungan sumber untuk tanggal ${htmlSafe(data.date)}. Persentase KPI menunggu rumus resmi.</div><div class="row g-3">${rows.map(([label, value]) => `<div class="col-sm-12"><div class="card"><div class="card-body d-flex justify-content-between"><span>${htmlSafe(label)}</span><strong>${htmlSafe(value)}</strong></div></div></div>`).join('')}</div>`);
        $('monitoringFilters').addEventListener('submit', (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); openMonitoring(Object.fromEntries(form.entries())); });
    }

    async function openDiscrepancies() {
        const result = await api('/api/v1/discrepancy-cases');
        const cases = result.data?.data || [];
        const note = result.meta?.note || 'Tidak ada kasus tersimpan.';
        setFeature('Audit Discrepancy', `<div class="alert alert-warning">${htmlSafe(note)}</div>${cases.length ? `<div class="list-group">${cases.map((item) => `<article class="list-group-item"><div class="d-flex justify-content-between"><strong>${htmlSafe(item.title)}</strong><span>${htmlSafe(item.status)}</span></div><div class="small text-secondary">${htmlSafe(item.tanggal)} · ${htmlSafe(item.type)}</div><p class="small mb-2">${htmlSafe(item.description)}</p>${item.status === 'OPEN' || item.status === 'IN_REVIEW' ? `<div class="input-group input-group-sm"><input class="form-control" id="note-${item.id}" placeholder="Catatan penyelesaian"><button class="btn btn-outline-success" data-resolve="${item.id}">Tandai selesai</button><button class="btn btn-outline-secondary" data-review="${item.id}">Tinjau</button></div>` : ''}</article>`).join('')}</div>` : '<p class="text-center text-secondary">Belum ada kasus actionable tersimpan.</p>'}`);
        document.querySelectorAll('[data-resolve]').forEach((button) => button.addEventListener('click', async () => {
            try { await api(`/api/v1/discrepancy-cases/${button.dataset.resolve}`, { method: 'PATCH', body: { status: 'RESOLVED', resolution_note: $(`note-${button.dataset.resolve}`).value } }); openDiscrepancies(); }
            catch (error) { showToast(error.message); }
        }));
        document.querySelectorAll('[data-review]').forEach((button) => button.addEventListener('click', async () => {
            try { await api(`/api/v1/discrepancy-cases/${button.dataset.review}`, { method: 'PATCH', body: { status: 'IN_REVIEW' } }); openDiscrepancies(); }
            catch (error) { showToast(error.message); }
        }));
    }

    function setPage(page) {
        if (!['home', 'notifications', 'reports', 'profile'].includes(page)) page = 'home';
        if (page === 'notifications') {
            navigator.serviceWorker?.controller?.postMessage({ type: 'aksara:mark-notifications-read' });
        }
        document.querySelectorAll('.page').forEach((item) => item.classList.toggle('active', item.id === `page-${page}`));
        document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.page === page));
        window.dispatchEvent(new CustomEvent('aksara:page-changed', { detail: { page } }));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    document.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => setPage(button.dataset.page)));
    document.querySelectorAll('[data-message]').forEach((button) => button.addEventListener('click', () => showToast(button.dataset.message)));
    $('refreshSchedule')?.addEventListener('click', loadHomeSchedules);
    $('refreshAnnouncements')?.addEventListener('click', notifications.loadHomeAnnouncements);
    $('openAdminDashboard')?.addEventListener('click', enterAdminDashboard);
    $('returnHome')?.addEventListener('click', leaveAdminDashboard);
    $('adminSidebarToggle')?.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
    $('adminSidebarBackdrop')?.addEventListener('click', () => document.body.classList.remove('sidebar-open'));
    document.querySelectorAll('[data-admin-action]').forEach((button) => button.addEventListener('click', () => {
        document.body.classList.remove('sidebar-open');
        adminAction(button.dataset.adminAction);
    }));
    $('checkIn').addEventListener('click', async () => {
        await teacherAttendance.refreshAttendance();
        if (!$('checkIn').disabled) teacherAttendance.attendanceDialog('check-in');
        else showToast($('attendanceState').textContent);
    });
    $('checkOut').addEventListener('click', async () => {
        await teacherAttendance.refreshAttendance();
        if (!$('checkOut').disabled) teacherAttendance.attendanceDialog('check-out');
        else showToast($('attendanceState').textContent);
    });
    $('requestLeaveButton')?.addEventListener('click', () => openLeave(true));
    $('viewLeaveStatusButton')?.addEventListener('click', () => openMyLeaveRequests().catch((error) => setFeature('Status Pengajuan Saya', `<div class="alert alert-danger mb-0">${htmlSafe(error.message)}</div>`)));
    const dateFormatter = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
    const clockFormatter = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Jakarta' });
    function updateHeaderDateTime() {
        const now = new Date();
        const date = dateFormatter.format(now);
        $('today').textContent = date;
        $('today').dateTime = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Jakarta' }).format(now);
        $('clock').textContent = clockFormatter.format(now);
        const hour = Number(clockFormatter.formatToParts(now).find((part) => part.type === 'hour')?.value || 0);
        $('greeting').textContent = hour < 11 ? 'Selamat pagi,' : hour < 15 ? 'Selamat siang,' : hour < 18 ? 'Selamat sore,' : 'Selamat malam,';
    }
    updateHeaderDateTime();
    window.setInterval(updateHeaderDateTime, 1000);

    function renderRoleModules(user) {
        const roles = Array.isArray(user.roles) ? user.roles.map((role) => String(typeof role === 'string' ? role : role.name).toLowerCase()) : [];
        activeRoleNames = roles;
        const permissions = new Set(Array.isArray(user.permissions) ? user.permissions : []);
        const is = (role) => roles.includes(role);
        const has = (permission) => permissions.has(permission);
        const modules = [];
        const add = (key, permission, icon, title, description, condition = true) => {
            if (condition && has(permission)) modules.push({ key, icon, title, description });
        };

        if (is('guru')) {
            add('journal', 'isi-ejurnal', 'bi-journal-text', 'E-Jurnal & Presensi Kelas', 'Pilih jadwal aktif, isi presensi siswa, dan catat materi mengajar.');
            add('student-attendance', 'kelola-presensi-siswa', 'bi-people', 'Koreksi Presensi Siswa', 'Koreksi status pada sesi jurnal di kelas yang Anda ampu.', Boolean(user.is_wali_kelas));
            add('leave-submit', 'ajukan-pengajuan-izin', 'bi-file-earmark-plus', 'Pengajuan Izin', 'Ajukan cuti atau dinas dan pantau status permohonan.');
        }
        if (is('kurikulum')) {
            add('journal', 'isi-ejurnal', 'bi-journal-text', 'E-Jurnal & Presensi Kelas', 'Isi jurnal dan presensi siswa pada jadwal mengajar yang ditugaskan.');
            add('monitoring', 'view-dashboard-kurikulum', 'bi-bar-chart-line', 'Monitoring Pembelajaran', 'Lihat jumlah jadwal, jurnal, dan presensi hari ini.');
            add('discrepancy', 'view-audit-discrepancy', 'bi-clipboard2-data', 'Audit Discrepancy', 'Tinjau dan tindak lanjuti kasus yang tersedia.');
            add('academic-master', 'kelola-master-data', 'bi-database', 'Master Data Akademik', 'Kelola kelas, siswa, mapel, materi, dan jadwal.');
            add('years', 'kelola-tahun-ajaran', 'bi-calendar3', 'Tahun Ajaran', 'Buat tahun ajaran dan aktifkan melalui sinkronisasi.');
            add('agendas', 'kelola-agenda-sekolah', 'bi-calendar-event', 'Agenda Sekolah', 'Kelola agenda sekolah dan override KBM.');
            add('holidays', 'kelola-agenda-sekolah', 'bi-calendar2-x', 'Kalender Hari Libur', 'Atur libur nasional, cuti bersama, dan libur sekolah.');
        }
        if (is('kepsek')) {
            add('journal', 'isi-ejurnal', 'bi-journal-text', 'E-Jurnal & Presensi Kelas', 'Isi jurnal dan presensi siswa pada jadwal mengajar yang ditugaskan.');
            add('monitoring', 'view-dashboard-kurikulum', 'bi-speedometer2', 'Dashboard Eksekutif', 'Lihat jumlah jadwal, jurnal, dan presensi hari ini.');
            add('discrepancy', 'view-audit-discrepancy', 'bi-clipboard2-data', 'Audit Pembelajaran', 'Tinjau dan tindak lanjuti kasus yang tersedia.');
            add('leave-approvals', 'kelola-pengajuan-izin', 'bi-file-earmark-check', 'Persetujuan Perizinan', 'Verifikasi pengajuan cuti dan dinas guru.');
        }
        if (is('admin')) {
            add('journal', 'isi-ejurnal', 'bi-journal-text', 'E-Jurnal & Presensi Kelas', 'Isi jurnal dan presensi siswa pada jadwal mengajar yang ditugaskan.');
            add('admin-users', 'kelola-master-data', 'bi-person-gear', 'Kelola User & Akses', 'Kelola akun, reset kata sandi, role, dan permission.');
            add('flagged', 'review-absensi-flagged', 'bi-shield-check', 'Moderasi Presensi', 'Tinjau presensi masuk/pulang yang berstatus FLAGGED.');
            add('academic-master', 'kelola-master-data', 'bi-database', 'Master Data Akademik', 'Kelola kelas, siswa, mapel, materi, dan jadwal.');
            add('years', 'kelola-tahun-ajaran', 'bi-calendar3', 'Tahun Ajaran', 'Buat tahun ajaran dan aktivasi tersinkron.');
            add('agendas', 'kelola-agenda-sekolah', 'bi-calendar-event', 'Agenda Sekolah', 'Kelola agenda sekolah dan override KBM.');
            add('holidays', 'kelola-agenda-sekolah', 'bi-calendar2-x', 'Kalender Hari Libur', 'Atur libur nasional, cuti bersama, dan libur sekolah.');
            add('monitoring', 'view-dashboard-kurikulum', 'bi-bar-chart-line', 'Monitoring Pembelajaran', 'Lihat jumlah jadwal, jurnal, dan presensi hari ini.');
            add('discrepancy', 'view-audit-discrepancy', 'bi-clipboard2-data', 'Audit Discrepancy', 'Tinjau dan tindak lanjuti kasus yang tersedia.');
            add('leave-approvals', 'kelola-pengajuan-izin', 'bi-file-earmark-check', 'Persetujuan Perizinan', 'Tinjau pengajuan izin guru.');
            add('settings', 'kelola-master-data', 'bi-sliders', 'Pengaturan Sekolah', 'Atur geofence, semester aktif, dan batas presensi.');
        }

        dashboardModules = modules;
        const canAdminDashboard = is('admin') || is('kurikulum');
        $('adminDashboardEntry').hidden = !canAdminDashboard;
        $('teacherLeaveCard').hidden = !has('ajukan-pengajuan-izin');
        $('roleIntro').hidden = canAdminDashboard || is('guru');
        $('roleModules').hidden = canAdminDashboard || is('guru');
        $('adminSideModules').innerHTML = modules.filter((module) => module.key !== 'academic-master').map((module) => `<button class="admin-side-link" data-admin-action="${htmlSafe(module.key)}"><i class="bi ${htmlSafe(module.icon)}"></i> ${htmlSafe(module.title)}</button>`).join('');
        $('adminSideModules').querySelectorAll('[data-admin-action]').forEach((button) => button.addEventListener('click', () => {
            document.body.classList.remove('sidebar-open');
            adminAction(button.dataset.adminAction);
        }));

        const labels = { guru: 'Dashboard Guru', kurikulum: 'Dashboard Kurikulum', kepsek: 'Dashboard Kepala Sekolah', admin: 'Dashboard Admin / TU' };
        const dashboardLabel = ['admin', 'guru', 'kurikulum', 'kepsek'].filter((role) => is(role)).map((role) => labels[role]);
        $('roleDashboardTitle').textContent = dashboardLabel[0] || 'Dashboard Pengguna';
        $('roleDashboardSubtitle').textContent = modules.length ? `${modules.length} menu tersedia untuk akses akun Anda` : 'Belum ada menu yang diberikan untuk akun ini';

        const container = $('roleModules');
        container.replaceChildren();
        modules.forEach((module) => {
            const column = document.createElement('div');
            column.className = 'col-sm-12';
            const card = document.createElement('article');
            card.className = 'card module-card h-100';
            const body = document.createElement('div');
            body.className = 'card-body';
            const icon = document.createElement('span');
            icon.className = 'module-icon';
            const iconElement = document.createElement('i');
            iconElement.className = `bi ${module.icon}`;
            iconElement.setAttribute('aria-hidden', 'true');
            icon.append(iconElement);
            const copy = document.createElement('div');
            const title = document.createElement('h3');
            title.textContent = module.title;
            const description = document.createElement('p');
            description.textContent = module.description;
            copy.append(title, description);
            const status = document.createElement('span');
            status.className = 'module-state';
            status.textContent = module.key === 'discrepancy' ? 'Aturan menunggu' : 'Buka menu';
            const open = document.createElement('button');
            open.type = 'button';
            open.className = 'btn btn-outline-success btn-sm ms-auto';
            open.textContent = 'Buka';
            open.addEventListener('click', () => openModule(module));
            body.append(icon, copy, status, open);
            card.append(body);
            column.append(card);
            container.append(column);
        });
    }

    async function loadProfile() {
        if (!token || ['undefined', 'null', ''].includes(token)) {
            localStorage.removeItem('token');
            sessionStorage.removeItem('token');
            window.location.replace(loginUrl);
            return;
        }
        try {
            const response = await fetch(window.aksaraApiUrl('/api/v1/auth/me'), { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
            if (response.status === 401) {
                localStorage.removeItem('token');
                sessionStorage.removeItem('token');
                window.location.replace(loginUrl);
                return;
            }
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Profil belum dapat dimuat.');
            const user = result.data || result.user || result;
            activeUser = user;
            window.dispatchEvent(new CustomEvent('aksara:profile-loaded', { detail: user }));
            const name = escapeText(user.nama || user.name || 'Pengguna');
            const role = Array.isArray(user.roles) && user.roles.length ? user.roles.map((item) => typeof item === 'string' ? item : item.name).join(', ') : 'Pengguna';
            const salutation = user.jenis_kelamin === 'L' ? 'Pak' : user.jenis_kelamin === 'P' ? 'Bu' : 'Pak/Bu';
            $('userName').textContent = `${salutation} ${name}`;
            $('schoolName').textContent = escapeText(user.school_name) || 'Nama Sekolah';
            $('profileName').textContent = name;
            $('profileRole').textContent = escapeText(role);
            $('profileEmail').textContent = escapeText(user.email) || '—';
            $('profileNip').textContent = escapeText(user.nip) || 'Non-NIP';
            renderRoleModules(user);
            $('loading').hidden = true;
            $('dashboard').hidden = false;
            teacherAttendance.refreshAttendance();
            notifications.loadHomeAnnouncements();
            if (activeRoleNames.some((item) => ['guru', 'admin', 'kurikulum'].includes(item))) loadHomeSchedules();
            else $('homeScheduleCard').hidden = true;
        } catch (error) {
            $('loading').hidden = true;
            $('loadError').hidden = false;
            $('loadError').textContent = '';
            const message = document.createElement('p');
            message.textContent = `Gagal memuat dashboard: ${error.message}`;
            const retry = document.createElement('button');
            retry.textContent = 'Coba lagi';
            retry.addEventListener('click', loadProfile);
            $('loadError').append(message, retry);
        }
    }

    $('btnLogout').addEventListener('click', async () => {
        try {
            await fetch(window.aksaraApiUrl('/api/v1/auth/logout'), { method: 'POST', headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
        } finally {
            localStorage.removeItem('token');
            sessionStorage.removeItem('token');
            window.location.replace(loginUrl);
        }
    });
    loadProfile();
})();
