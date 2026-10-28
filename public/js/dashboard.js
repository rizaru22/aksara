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

    // Menampilkan jumlah notifikasi yang belum dibaca dari service worker.
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

    // Menampilkan pesan singkat untuk memberi feedback kepada user setelah aksi berhasil atau gagal.
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

    //format tanggal
    const formatTanggal = (tanggal, format = 'panjang') => {
        if (!tanggal) return '—';

        const nilai = String(tanggal).slice(0, 10);
        const bagian = nilai.match(/^(\d{4})-(\d{2})-(\d{2})$/);

        if (!bagian) return tanggal;

        const tanggalObj = new Date(
            Number(bagian[1]),
            Number(bagian[2]) - 1,
            Number(bagian[3])
        );

        return new Intl.DateTimeFormat('id-ID', {
            day: 'numeric',
            month: format === 'ringkas' ? 'short' : 'long',
            year: 'numeric',
            timeZone: 'Asia/Jakarta',
        }).format(tanggalObj);
    };


    // Wrapper request yang menambahkan token autentikasi dan menangani error dari backend secara konsisten.
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

    // Mengambil semua halaman data paginated dari endpoint API agar daftar master data tetap lengkap.
    window.aksaraFetchAllPages = async (request, path, parameters = {}) => {
        const query = new URLSearchParams(parameters);
        query.set('page', '1');
        const first = await request(`${path}?${query.toString()}`);
        const unpack = (result) => {
            const page = result?.data && !Array.isArray(result.data) && Array.isArray(result.data.data)
                ? result.data
                : result;
            return {
                rows: Array.isArray(page?.data) ? page.data : (Array.isArray(result?.data) ? result.data : []),
                lastPage: Math.max(1, Number(page?.last_page || 1)),
            };
        };
        const firstPage = unpack(first);
        if (firstPage.lastPage === 1) return firstPage.rows;
        const pages = [];
        for (let start = 2; start <= firstPage.lastPage; start += 5) {
            const batch = await Promise.all(Array.from({ length: Math.min(5, firstPage.lastPage - start + 1) }, (_, index) => {
                const pageQuery = new URLSearchParams(query);
                pageQuery.set('page', String(start + index));
                return request(`${path}?${pageQuery.toString()}`).then(unpack);
            }));
            pages.push(...batch);
        }
        return firstPage.rows.concat(...pages.map((page) => page.rows));
    };

    // Menampilkan modal fitur dengan layout yang bisa berubah antara mode user biasa dan mode admin.
    function setFeature(title, content) {
        $('featureModal')
        .querySelector('.modal-content')
        .classList.remove('attendance-camera-active');
        
        if (document.body.classList.contains('admin-mode')) {
            setAdminPanel(title, content);
            return;
        }
        $('featureTitle').textContent = title;
        $('featureContent').innerHTML = content;
        featureModal.show();
    }

    // Menampilkan fitur wali kelas pada halaman utama, bukan di modal.
    function setWaliPage(title, content) {
        $('waliClassPageContent').innerHTML = `<div class="mb-3"><h1 class="page-title mb-1">${htmlSafe(title)}</h1></div>${content}`;
        setPage('wali-class');
    }

    function setFeatureError(error) {
        const target = document.body.classList.contains('admin-mode') ? $('adminPanelContent') : $('featureContent');
        target.querySelector('.feature-error')?.remove();
        target.insertAdjacentHTML('afterbegin', `<div class="alert alert-danger feature-error">${htmlSafe(error.message || error)}</div>`);
    }

    // Inisialisasi modul utama yang membangun alur presensi guru dan bukti jurnal untuk dashboard.
    const teacherAttendance = window.createAksaraTeacherAttendance({ $, api, showToast, setFeature, setFeatureError, featureModal });
    const journalProof = window.createAksaraJournalProof();

    const academicData = window.createAksaraAcademicData({ $, api, htmlSafe, setFeature, setFeatureError, showToast, token });
    const academicYears = window.createAksaraAcademicYears({ openMaster: academicData.openMaster });

    // Menentukan tombol aksi yang tampil di kartu jadwal berdasarkan status jurnal dan status finalisasi.
    function renderJournalAction(schedule, visible = true) {
        if (!visible) return '';
        if (schedule.kbm_ditangguhkan) return `<span class="badge text-bg-warning">KBM ditangguhkan</span>`;
        const journal = schedule.jurnal_hari_ini;
        if (journal?.status_sesi === 'final') return `<span class="badge text-bg-success">Jurnal selesai</span>`;
        if (journal?.status_sesi === 'draft') {
            if (schedule.can_finalize_journal) return `<button class="btn btn-sm btn-success" data-journal="${schedule.id}">Selesaikan jurnal</button>`;
            if (schedule.can_fill_journal) return `<span class="text-end"><button class="btn btn-sm btn-outline-primary" data-journal="${schedule.id}">Lanjutkan draf</button><small class="d-block text-secondary mt-1">${htmlSafe(schedule.journal_finalization_message)}</small></span>`;
            return `<span class="text-end"><button class="btn btn-sm btn-outline-secondary" disabled>Draf belum selesai</button><small class="d-block text-secondary mt-1">${htmlSafe(schedule.journal_finalization_message || 'Draf belum difinalisasi.')}</small></span>`;
        }
        if (schedule.can_fill_journal) return `<button class="btn btn-sm btn-success" data-journal="${schedule.id}">Isi jurnal</button>`;
        return `<span class="text-end"><button class="btn btn-sm btn-outline-secondary" disabled>${schedule.journal_availability_message?.startsWith('Waktu') ? 'Waktu berakhir' : 'Belum waktunya'}</button><small class="d-block text-secondary mt-1">${htmlSafe(schedule.journal_availability_message || '')}</small></span>`;
    }

    // Menampilkan daftar jadwal mengajar hari ini serta tombol untuk membuat atau melanjutkan jurnal.
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
            const isOwner = Number(schedule.user_id) === Number(activeUser?.id);
            const isFinished = schedule.jurnal_hari_ini?.status_sesi === 'final';
            let substituteAction = '';
            if (isOwner && !isFinished && !schedule.substitute_active) {
                if (schedule.substitute_status === 'PENDING') {
                    substituteAction = `<span class="badge text-bg-warning ms-1"><i class="bi bi-hourglass-split"></i> Pengganti diajukan</span>`;
                } else {
                    substituteAction = `<button class="btn btn-sm btn-outline-info ms-1" data-substitute="${schedule.id}"><i class="bi bi-person-plus"></i> Ajukan Pengganti</button>`;
                }
            }
            return `<article class="list-group-item"><div class="d-flex justify-content-between gap-2"><strong>${htmlSafe(schedule.kelas?.nama_kelas)} · ${htmlSafe(schedule.mata_pelajaran?.nama_mapel)}</strong><span class="small">${htmlSafe(schedule.jam_mulai)}–${htmlSafe(schedule.jam_selesai)}</span></div><div class="small text-secondary">${htmlSafe(schedule.hari)} · Siklus ${htmlSafe(schedule.siklus_minggu || 'Mingguan')}</div>${schedule.substitute_active ? `<div class="alert alert-info mt-2 mb-0 small"><i class="bi bi-person-badge"></i> Mengajar pengganti: ${htmlSafe(schedule.substitute_teacher?.nama || 'Guru pengganti')}</div>` : ''}${schedule.kbm_ditangguhkan ? `<div class="alert alert-warning mt-2 mb-0 small">KBM ditangguhkan: ${htmlSafe(schedule.agenda_pengganti)}</div>` : `<div class="d-flex flex-wrap align-items-center justify-content-end gap-1 mt-2">${renderJournalAction(schedule)}${substituteAction}</div>`}</article>`;
        }).join('')}</div>` : '<div class="card"><div class="card-body text-center text-secondary">Tidak ada jadwal untuk tanggal dan siklus ini.</div></div>';
        const headerToolbar = `<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><div class="alert alert-info small mb-0 py-2 flex-grow-1">${htmlSafe(meta.hari)} · ${htmlSafe(formatTanggal(meta.tanggal))} · ${htmlSafe(meta.tahun_ajaran)} / ${htmlSafe(meta.semester)} · Siklus ${htmlSafe(meta.siklus_minggu)}</div><button class="btn btn-outline-secondary btn-sm" id="btnMySubstitutes"><i class="bi bi-person-lines-fill"></i> Riwayat Pengganti</button></div>`;
        setFeature('Jadwal & E-Jurnal Hari Ini', `${headerToolbar}${holidayNote || list}`);
        $('btnMySubstitutes')?.addEventListener('click', openMySubstituteRequests);
        document.querySelectorAll('[data-journal]').forEach((button) => button.addEventListener('click', () => {
            const schedule = rows.find((item) => String(item.id) === button.dataset.journal);
            openJournalForm(button.dataset.journal, schedule).catch(setFeatureError);
        }));
        document.querySelectorAll('[data-substitute]').forEach((button) => button.addEventListener('click', () => {
            const schedule = rows.find((item) => String(item.id) === button.dataset.substitute);
            openSubstituteRequestForm(button.dataset.substitute, schedule);
        }));
    }

    // Mengambil jadwal hari ini ke kartu home dashboard agar guru melihat agenda aktif secara cepat.
    async function loadHomeSchedules() {
        const card = $('homeScheduleCard');
        const list = $('homeScheduleList');
        if (!card || !list) return;
        try {
            const result = await api('/api/v1/teacher/schedules/today');
            const rows = result.data || [];
            $('scheduleCaption').textContent = `${result.meta?.hari || ''} · ${formatTanggal(result.meta?.tanggal)} · ${result.meta?.tahun_ajaran || ''} ${result.meta?.semester || ''}`;
            if (result.meta?.hari === 'Minggu' || result.meta?.hari_libur?.jenis === 'MINGGU') {
                card.hidden = true;
                list.replaceChildren();
                return;
            }
            if (result.meta?.hari_libur) {
                const holiday = result.meta.hari_libur;
                card.hidden = false;
                $('scheduleCaption').textContent = `${holiday.jenis === 'MINGGU' ? 'Hari Minggu' : holiday.jenis.replaceAll('_', ' ')} · ${formatTanggal(result.meta?.tanggal) || ''}`;
                list.innerHTML = `<div class="alert alert-info mb-0"><strong>${htmlSafe(holiday.nama)}</strong><br>Tidak ada jadwal mengajar karena hari libur.</div>`;
                return;
            }
            if (!rows.length) { card.hidden = true; return; }
            card.hidden = false;
            list.innerHTML = rows.map((schedule) => {
                const journal = schedule.jurnal_hari_ini;
                const hasJournalPermission = activeRoleNames.includes('guru') || (Array.isArray(activeUser?.permissions) && activeUser.permissions.includes('isi-ejurnal')) || dashboardModules.some((module) => module.key === 'journal');
                const action = renderJournalAction(schedule, hasJournalPermission);
                const isOwner = Number(schedule.user_id) === Number(activeUser?.id);
                const isFinished = journal?.status_sesi === 'final';
                let subAction = '';
                if (isOwner && !isFinished && !schedule.substitute_active) {
                    if (schedule.substitute_status === 'PENDING') {
                        subAction = `<div class="small text-warning mt-1"><i class="bi bi-hourglass-split"></i> Pengajuan pengganti menunggu persetujuan</div>`;
                    } else {
                        subAction = `<div class="mt-1"><button class="btn btn-sm btn-outline-info py-0 px-2" style="font-size:0.75rem;" data-substitute="${schedule.id}"><i class="bi bi-person-plus"></i> Ajukan pengganti</button></div>`;
                    }
                }
                const substituteBadge = schedule.substitute_active ? `<div class="small text-info mt-1"><i class="bi bi-person-plus"></i> Mengajar pengganti: ${htmlSafe(schedule.substitute_teacher?.nama || 'Guru pengganti')}</div>` : '';
                return `<article class="schedule-item ${schedule.kbm_ditangguhkan ? '' : 'current'}"><span><strong>${htmlSafe(schedule.kelas?.nama_kelas || 'Kelas')} · ${htmlSafe(schedule.mata_pelajaran?.nama_mapel || 'Mata pelajaran')}</strong><br><span>${htmlSafe(schedule.jam_mulai)}–${htmlSafe(schedule.jam_selesai)} · Siklus ${htmlSafe(schedule.siklus_minggu || 'Mingguan')}</span>${schedule.agenda_pengganti ? `<br><small>${htmlSafe(schedule.agenda_pengganti)}</small>` : ''}${substituteBadge}${subAction}</span>${action}</article>`;
            }).join('');
            list.querySelectorAll('[data-journal]').forEach((button) => button.addEventListener('click', () => {
                const schedule = rows.find((item) => String(item.id) === button.dataset.journal);
                openJournalForm(button.dataset.journal, schedule).catch((error) => showToast(error.message));
            }));
            list.querySelectorAll('[data-substitute]').forEach((button) => button.addEventListener('click', () => {
                const schedule = rows.find((item) => String(item.id) === button.dataset.substitute);
                openSubstituteRequestForm(button.dataset.substitute, schedule);
            }));
        } catch (error) {
            card.hidden = false;
            list.innerHTML = `<div class="alert alert-warning mb-0 small">Jadwal hari ini belum dapat dimuat: ${htmlSafe(error.message)}</div>`;
        }
    }

    const notifications = window.createAksaraNotifications({ $, api, htmlSafe });

    // Memindahkan user ke mode admin untuk menampilkan panel operasional dan rekap sistem.
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

    // Menetapkan isi panel admin agar semua modul seperti laporan, master data, dan moderasi tampil konsisten.
    function setAdminPanel(title, content) {
        $('adminPanelContent').innerHTML = `<div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3"><div><div class="text-secondary small">AKSARA / Administrasi</div><h1 class="mb-0">${htmlSafe(title)}</h1></div><button class="btn btn-outline-secondary d-lg-none" id="adminPanelBack"><i class="bi bi-arrow-left"></i> Dashboard</button></div>${content}`;
        $('adminPanelBack')?.addEventListener('click', renderAdminHome);
    }

    // Membuat halaman beranda admin yang menampilkan ringkasan hari ini dan shortcut ke menu utama.
    function renderAdminHome() {
        const quickLinks = [
            { key: 'reports', icon: 'bi-clipboard-data', label: 'Laporan Presensi Guru', text: 'Rekap presensi masuk, pulang, izin, sakit, dan dinas luar.' },
            { key: 'class-attendance-report', icon: 'bi-calendar2-check', label: 'Laporan Jurnal Mengajar', text: 'Cetak laporan harian per kelas dan rekap mingguan beserta persentase pengisian jurnal.' },
            ...dashboardModules.filter((module) => ['flagged', 'journal-monitoring', 'monitoring', 'substitute-approvals', 'leave-approvals', 'discrepancy', 'student-attendance-report'].includes(module.key)).map((module) => ({ key: module.key, icon: module.icon, label: module.title, text: module.description, module })),
            { key: 'classes', icon: 'bi-building', label: 'Kelola Kelas', text: 'Data kelas, tingkat, jurusan, dan wali kelas.' },
            { key: 'students', icon: 'bi-people', label: 'Kelola Siswa', text: 'Data siswa dan penempatan kelas.' },
            { key: 'subjects', icon: 'bi-book', label: 'Mata Pelajaran', text: 'Kelola data mata pelajaran.' },
            { key: 'materials', icon: 'bi-journal-text', label: 'Materi Pelajaran', text: 'Kelola materi pembelajaran.' },
            { key: 'schedules', icon: 'bi-calendar-week', label: 'Jadwal Pelajaran', text: 'Jadwal guru, kelas, mata pelajaran, dan siklus.' },
            ...dashboardModules.filter((module) => !['flagged', 'journal-monitoring', 'monitoring', 'substitute-approvals', 'leave-approvals', 'discrepancy', 'student-attendance-report'].includes(module.key)).map((module) => ({ key: module.key, icon: module.icon, label: module.title, text: module.description, module })),
        ];
        setAdminPanel('Dashboard Admin', `<div class="admin-welcome mb-4"><h1>Selamat datang, ${htmlSafe(activeUser?.nama || 'Pengguna')}</h1><p class="mb-0">Rekap kehadiran dan kegiatan pembelajaran hari ini.</p></div><div id="adminLiveReport"><div class="card"><div class="card-body text-secondary"><span class="spin"></span>Memuat rekap hari ini...</div></div></div><h2 class="h5 mt-4 mb-3">Menu Administrasi</h2><div class="row g-3">${quickLinks.map((item) => `<div class="col-12 col-md-6 col-xl-4"><article class="card h-100"><div class="card-body d-flex flex-column"><span class="module-icon mb-3"><i class="bi ${item.icon}"></i></span><h2 class="card-title">${htmlSafe(item.label)}</h2><p class="text-secondary small flex-grow-1">${htmlSafe(item.text)}</p><button class="btn btn-outline-success btn-sm align-self-start" data-admin-open="${htmlSafe(item.key)}">Buka menu <i class="bi bi-arrow-right"></i></button></div></article></div>`).join('')}</div>`);
        $('adminPanelContent').querySelectorAll('[data-admin-open]').forEach((button) => button.addEventListener('click', () => adminAction(button.dataset.adminOpen)));
        document.querySelectorAll('.admin-side-link').forEach((button) => button.classList.toggle('active', button.dataset.adminAction === 'home'));
        adminDashboard.loadAdminLiveReport();
    }

    const adminDashboard = window.createAksaraAdminDashboard({ $, api, htmlSafe });
    const adminReports = window.createAksaraAdminReports({ api, htmlSafe, setAdminPanel });
    const holidayCalendar = window.createAksaraHolidayCalendar({ api, htmlSafe, setFeature, setFeatureError, showToast });

    // Mengarahkan tombol menu admin ke handler modul yang sesuai seperti laporan, data akademik, atau moderasi.
    function adminAction(action) {
        document.querySelectorAll('.admin-side-link').forEach((button) => button.classList.toggle('active', button.dataset.adminAction === action));
        const module = dashboardModules.find((item) => item.key === action);
        if (action === 'home') return renderAdminHome();
        if (action === 'reports') return adminReports.open();
        if (action === 'class-attendance-report') return adminReports.open('daily', { dedicatedClass: true });
        if (action === 'student-attendance-report') return adminReports.open('student-monthly', { dedicatedStudent: true });
        if (action === 'substitute-approvals') return openSubstituteApprovals();
        if (action === 'lesson-calendar') return academicData.openCalendars();
        if (['classes', 'students', 'subjects', 'materials', 'schedules'].includes(action)) return academicData.openMaster(action);
        if (action === 'promote-students') return academicData.openPromotions();
        if (module) return openModule(module);
    }

    async function openTeacherJournalDetail(journalId) {
        try { 
            const result = await api(`/api/v1/lesson-journals/${journalId}`);
            const journal = result.data || {};
            const attendance = Array.isArray(journal.presensi_siswas) ? journal.presensi_siswas : (Array.isArray(journal.presensi) ? journal.presensi : []);
            const rows = attendance.map((row, index) => {
                const studentName = row.siswa?.nama || row.nama || '—';
                const status = row.status || '—';
                const keterangan = row.keterangan || '—';
                return `<tr><td>${index + 1}</td><td>${htmlSafe(studentName)}</td><td><span class="badge text-bg-light border">${htmlSafe(status)}</span></td><td>${htmlSafe(keterangan)}</td></tr>`;
            }).join('') || '<tr><td colspan="4" class="text-center text-secondary py-3">Belum ada data presensi siswa untuk jurnal ini.</td></tr>';
            const statusText = ({ draft: 'Draft', final: 'Final', finalisasi_susulan: 'Finalisasi Susulan', kedaluwarsa: 'Kedaluwarsa' })[journal.status_sesi] || journal.status_sesi || '—';
            const materi = journal.materi_pembahasan || '<span class="text-secondary fst-italic">Belum diisi</span>';
            const catatan = journal.catatan_kejadian_kelas || '<span class="text-secondary fst-italic">Belum diisi</span>';
            setFeature('Detail Jurnal Mengajar', `
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                            <div>
                                <div class="small text-secondary">Tanggal kegiatan</div>
                                <strong>${htmlSafe(formatTanggal(journal.tanggal))}</strong>
                            </div>
                            <span class="badge ${({ draft: 'bg-warning text-dark', final: 'bg-success', finalisasi_susulan: 'bg-info text-dark', kedaluwarsa: 'bg-danger' })[journal.status_sesi] || 'bg-secondary'}">${htmlSafe(statusText)}</span>
                        </div>
                        <dl class="row mb-0">
                            <dt class="col-sm-4">Kelas</dt><dd class="col-sm-8">${htmlSafe(journal.jadwal_pelajaran?.kelas?.nama_kelas || '—')}</dd>
                            <dt class="col-sm-4">Mata pelajaran</dt><dd class="col-sm-8">${htmlSafe(journal.jadwal_pelajaran?.mata_pelajaran?.nama_mapel || '—')}</dd>
                            <dt class="col-sm-4">Materi</dt><dd class="col-sm-8">${materi}</dd>
                            <dt class="col-sm-4">Catatan kejadian</dt><dd class="col-sm-8">${catatan}</dd>
                            <dt class="col-sm-4">Jam mulai</dt><dd class="col-sm-8">${htmlSafe(journal.jam_mulai_realisasi || '—')}</dd>
                            <dt class="col-sm-4">Jam selesai</dt><dd class="col-sm-8">${htmlSafe(journal.jam_selesai_realisasi || '—')}</dd>
                        </dl>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header"><strong>Presensi Siswa</strong> <span class="badge bg-secondary ms-1">${attendance.length}</span></div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-sm align-middle mb-0">
                                <thead><tr><th>No.</th><th>Nama Siswa</th><th>Status</th><th>Keterangan</th></tr></thead>
                                <tbody>${rows}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `);
        } catch (error) {
            setFeature('Detail Jurnal Mengajar', `<div class="alert alert-danger mb-0">${htmlSafe(error.message)}</div>`);
        }
    }

    async function openTeacherJournalHistory(target = null) {
        try {
            const response = await api('/api/v1/lesson-journals?per_page=20');
            const journals = response.data || [];
            const rows = journals.map((journal) => {
                const kelas = journal.kelas?.nama_kelas || '—';
                const mapel = journal.mata_pelajaran?.nama_mapel || '—';
                const status = ({ draft: '<span class="badge bg-warning text-dark">Draft</span>', final: '<span class="badge bg-success">Final</span>', finalisasi_susulan: '<span class="badge bg-info text-dark">Finalisasi Susulan</span>', kedaluwarsa: '<span class="badge bg-danger">Kedaluwarsa</span>' })[journal.status_sesi] || '<span class="badge bg-secondary">—</span>';
                const lengkap = journal.lengkap ? '<span class="badge bg-success">Lengkap</span>' : '<span class="badge bg-danger">Belum lengkap</span>';
                return `<tr>
                    <td class="text-nowrap">${htmlSafe(formatTanggal(journal.tanggal,'ringkas'))}</td>
                    <td class="text-nowrap">${htmlSafe(kelas)}</td>
                    <td>${htmlSafe(mapel)}</td>
                    <td>${htmlSafe(journal.materi_pembahasan || '—')}</td>
                    <td>${status}</td>
                    <td class="text-nowrap">
                        <button class="btn btn-outline-secondary btn-sm" data-teacher-journal="${journal.id}">Lihat detail</button>
                        ${journal.status_sesi === 'draft' ? `<button class="btn btn-outline-primary btn-sm mt-1" data-teacher-late-finalize="${journal.id}">Finalisasi susulan</button>` : ''}
                    </td>
                </tr>`;
            }).join('') || '<tr><td colspan="7" class="text-center text-secondary py-4">Belum ada jurnal yang diampu oleh guru ini.</td></tr>';

            const content=`<div class="card">
                    <div class="card-header"><strong>Riwayat jurnal yang diampu</strong></div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-sm table-hover align-middle mb-0">
                                <thead>
                                    <tr><th>Tanggal</th><th>Kelas</th><th>Mata Pelajaran</th><th>Materi</th><th>Status</th><th>Aksi</th></tr>
                                </thead>
                                <tbody>${rows}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;

            if (target) {
                target.innerHTML = content;
            } else {
                setFeature('Riwayat Jurnal Mengajar', content);
            }

            const journalButtons=target
                ? target.querySelectorAll('[data-teacher-journal]')
                : document.querySelectorAll('[data-teacher-journal]');   
                
            journalButtons.forEach((button)=>
            button.addEventListener('click', () => {
                openTeacherJournalDetail(button.dataset.teacherJournal);
            }));

            const lateFinalizeButtons = target
                ? target.querySelectorAll('[data-teacher-late-finalize]')
                : document.querySelectorAll('[data-teacher-late-finalize]');
            lateFinalizeButtons.forEach((button) => button.addEventListener('click', async () => {
                if (!window.confirm('Finalisasi jurnal ini sebagai Finalisasi Susulan? Foto dan GPS baru tidak diperlukan, tetapi data presensi harus lengkap, waktu pembelajaran sudah berakhir, dan batas 48 jam belum lewat.')) return;
                button.disabled = true;
                const payload = new FormData();
                payload.append('finalisasi_susulan', '1');
                try {
                    const result = await api(`/api/v1/lesson-journals/${button.dataset.teacherLateFinalize}/finalize`, { method: 'POST', body: payload });
                    showToast(result.message || 'Jurnal berhasil difinalisasi susulan.');
                    await openTeacherJournalHistory(target);
                } catch (error) {
                    showToast(error.message || 'Finalisasi susulan gagal.');
                    button.disabled = false;
                }
            }));
        
        } catch (error) {
            const message=`
                <div class="alert alert-danger mb-0">
                ${htmlSafe(error.message)}
                </div>
            `;
            if (target) {
                target.innerHTML = message;
            } else {
                setFeature('Jurnal Mengajar', message);
            }
        }
           
        
    }

    window.openTeacherJournalHistory = openTeacherJournalHistory;

    // Membuka form jurnal dan presensi siswa untuk jadwal yang dipilih, termasuk mode draft dan finalisasi dengan foto/GPS.
    async function openJournalForm(scheduleId, schedule = null) {
        const rosterResult = await api(`/api/v1/teacher/schedules/${scheduleId}/students`);
        const students = rosterResult.data || [];
        if (!students.length) return showToast('Kelas ini belum memiliki data siswa.');
        const draft = rosterResult.draft;
        let draftSaved = Boolean(draft);
        const draftAttendance = new Map((draft?.presensi_siswas || []).map((row) => [Number(row.siswa_id), row]));
        const canFinalize = Boolean(schedule?.can_finalize_journal);
        setFeature('Isi E-Jurnal & Presensi Siswa', `<form id="journalForm">
            <input type="hidden" name="jadwal_pelajaran_id" value="${htmlSafe(scheduleId)}">
            <div class="alert alert-info small">Tahap 1: isi jurnal dan presensi siswa sebagai draf selama pelajaran. Tahap 2: pada 30 menit terakhir, ambil foto langsung dan verifikasi lokasi sekolah untuk menyelesaikan jurnal.</div>
            <div class="mb-3"><label class="form-label" for="journalMaterial">ID materi pelajaran (opsional)</label><input class="form-control" id="journalMaterial" name="materi_pelajaran_id" type="number" min="1" value="${htmlSafe(draft?.materi_pelajaran_id || '')}"><div class="form-text">Materi harus berasal dari mata pelajaran pada jadwal.</div></div>
            <div class="mb-3"><label class="form-label" for="journalSummary">Materi pembahasan</label><textarea class="form-control" id="journalSummary" name="materi_pembahasan" rows="3" required>${htmlSafe(draft?.materi_pembahasan || '')}</textarea></div>
            <div class="mb-3"><label class="form-label" for="journalNotes">Catatan kejadian kelas (opsional)</label><textarea class="form-control" id="journalNotes" name="catatan_kejadian_kelas" rows="2">${htmlSafe(draft?.catatan_kejadian_kelas || '')}</textarea></div>
            
<div class="d-flex align-items-center justify-content-between gap-2 mb-2">
    <h3 class="h6 mb-0">Presensi siswa (${students.length})</h3>
    <small class="text-secondary">10 siswa per halaman</small>
</div>

<div class="mb-3">
    <label class="form-label small" for="journalStudentSearch">Cari siswa</label>
    <input
        class="form-control form-control-sm"
        id="journalStudentSearch"
        type="search"
        placeholder="Ketik nama siswa..."
        autocomplete="off"
    >
</div>

<div class="table-responsive">
    <table class="table table-sm align-middle">
        <thead>
            <tr>
                <th scope="col">Siswa</th>
                <th scope="col">Status dan keterangan</th>
            </tr>
        </thead>
        <tbody id="journalStudentRows">
            ${students.map((student, index) => {
                const existing = draftAttendance.get(Number(student.id));
                return `<tr
                    data-student-row
                    data-student-name="${htmlSafe(student.nama.toLowerCase())}"
                >
                    <td>
                        ${htmlSafe(student.nama)}
                        <input type="hidden" name="sid-${index}" value="${htmlSafe(student.id)}">
                    </td>
                    <td>
                        <select class="form-select form-select-sm" name="status-${index}">
                            ${['HADIR', 'SAKIT', 'IZIN', 'ALPHA', 'CABUT'].map((status) =>
                                `<option value="${status}" ${status === (existing?.status || 'HADIR') ? 'selected' : ''}>${status}</option>`
                            ).join('')}
                        </select>
                        <input
                            class="form-control form-control-sm mt-1"
                            name="note-${index}"
                            value="${htmlSafe(existing?.keterangan || '')}"
                            placeholder="Keterangan (opsional)"
                        >
                    </td>
                </tr>`;
            }).join('')}
        </tbody>
    </table>
</div>

<div class="d-flex align-items-center justify-content-between gap-2 mt-2 mb-3">
    <small class="text-secondary" id="journalStudentPageInfo" aria-live="polite"></small>
    <div class="btn-group btn-group-sm" role="group" aria-label="Navigasi halaman siswa">
        <button class="btn btn-outline-secondary" type="button" id="journalStudentPrev">
            Sebelumnya
        </button>
        <button class="btn btn-outline-secondary" type="button" id="journalStudentNext">
            Berikutnya
        </button>
    </div>
</div>

            <button class="btn btn-outline-primary w-100" type="submit" name="journalAction" value="draft">Simpan draf jurnal & presensi</button>
            <div class="border rounded p-3 mt-3 ${canFinalize ? '' : 'd-none'}" id="journalFinalizePanel">
                <h3 class="h6">Tahap 2 · Finalisasi jurnal</h3>
                <p class="small text-secondary mb-2">Foto harus diambil langsung dari kamera. Pastikan GPS aktif dan perangkat berada di area sekolah.</p>
                <video id="journalCamera" class="w-100 rounded mb-2" autoplay playsinline muted hidden></video>
                <div class="d-flex flex-wrap gap-2"><button class="btn btn-outline-secondary btn-sm" id="journalStartCamera" type="button">Buka kamera</button><button class="btn btn-outline-primary btn-sm" id="journalCapturePhoto" type="button" disabled>Ambil foto</button><button class="btn btn-outline-secondary btn-sm" id="journalVerifyLocation" type="button">Verifikasi lokasi</button></div>
                <img id="journalPhotoPreview" class="img-fluid rounded mt-2" alt="Pratinjau foto kegiatan" hidden>
                <div id="journalProofStatus" class="small text-secondary mt-2" aria-live="polite">Foto dan lokasi sekolah wajib diverifikasi untuk finalisasi.</div>
                <button class="btn btn-success w-100 mt-3" id="journalFinalizeButton" type="submit" name="journalAction" value="finalize" disabled>Finalisasi jurnal</button>
            </div>
            ${canFinalize ? '' : `<div class="alert alert-secondary small mt-3 mb-0">${htmlSafe(schedule?.journal_finalization_message || 'Finalisasi tersedia pada 30 menit terakhir sebelum jadwal berakhir.')}</div>`}
        </form>`);
        const journalForm = $('journalForm');
        
const studentSearch = $('journalStudentSearch');
const studentRows = Array.from(
    journalForm.querySelectorAll('[data-student-row]')
);
const studentPageInfo = $('journalStudentPageInfo');
const studentPrev = $('journalStudentPrev');
const studentNext = $('journalStudentNext');

const studentsPerPage = 10;
let studentPage = 1;

function renderStudentPage() {
    const keyword = studentSearch.value.trim().toLocaleLowerCase('id');

    const filteredRows = studentRows.filter((row) =>
        row.dataset.studentName.includes(keyword)
    );

    const totalPages = Math.max(
        1,
        Math.ceil(filteredRows.length / studentsPerPage)
    );

    studentPage = Math.min(studentPage, totalPages);

    const start = (studentPage - 1) * studentsPerPage;
    const visibleRows = filteredRows.slice(
        start,
        start + studentsPerPage
    );

    // Sembunyikan baris, jangan hapus input dari formulir.
    studentRows.forEach((row) => row.classList.add('d-none'));
    visibleRows.forEach((row) => row.classList.remove('d-none'));

    studentPageInfo.textContent = filteredRows.length
        ? `Menampilkan ${start + 1}–${start + visibleRows.length} dari ${filteredRows.length} siswa`
        : 'Tidak ada siswa yang cocok dengan pencarian.';

    studentPrev.disabled = studentPage <= 1;
    studentNext.disabled = studentPage >= totalPages;
}

studentSearch.addEventListener('input', () => {
    studentPage = 1;
    renderStudentPage();
});

studentPrev.addEventListener('click', () => {
    if (studentPage > 1) {
        studentPage--;
        renderStudentPage();
    }
});

studentNext.addEventListener('click', () => {
    studentPage++;
    renderStudentPage();
});

renderStudentPage();

        const camera = $('journalCamera');
        let photoBlob = null;
        let photoUrl = null;
        let verifiedLocation = null;
        const proofStatus = $('journalProofStatus');
        const updateFinalizeState = () => { if ($('journalFinalizeButton')) $('journalFinalizeButton').disabled = !(photoBlob && verifiedLocation); };
        $('journalStartCamera')?.addEventListener('click', async (event) => {
            const button = event.currentTarget;
            button.disabled = true;
            try {
                await journalProof.startCamera(camera);
                camera.hidden = false;
                $('journalCapturePhoto').disabled = false;
                proofStatus.textContent = 'Kamera aktif. Ambil foto kegiatan saat siap.';
            } catch (error) { setFeatureError(error); }
            finally { button.disabled = false; }
        });
        $('journalCapturePhoto')?.addEventListener('click', async (event) => {
            event.currentTarget.disabled = true;
            try {
                photoBlob = await journalProof.capture(camera);
                if (photoUrl) URL.revokeObjectURL(photoUrl);
                photoUrl = URL.createObjectURL(photoBlob);
                $('journalPhotoPreview').src = photoUrl;
                $('journalPhotoPreview').hidden = false;
                journalProof.stopCamera(camera);
                camera.hidden = true;
                proofStatus.textContent = 'Foto siap. Lanjutkan verifikasi lokasi.';
            } catch (error) { setFeatureError(error); }
            finally { event.currentTarget.disabled = false; updateFinalizeState(); }
        });
        $('journalVerifyLocation')?.addEventListener('click', async (event) => {
            const button = event.currentTarget;
            button.disabled = true;
            verifiedLocation = null;
            updateFinalizeState();
            try {
                verifiedLocation = await journalProof.findPreciseLocation(proofStatus);
                proofStatus.textContent = `Lokasi akurat ±${Math.ceil(verifiedLocation.accuracy)} m ditemukan. Sistem akan memeriksa jarak ke sekolah saat finalisasi.`;
            } catch (error) { setFeatureError(error); proofStatus.textContent = error.message; }
            finally { button.disabled = false; updateFinalizeState(); }
        });
        journalForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const submitter = event.submitter;
            const action = submitter?.value || 'draft';
            const form = new FormData(journalForm);
            const data = new FormData();
            for (const [key, value] of form.entries()) if (!key.startsWith('sid-') && !key.startsWith('status-') && !key.startsWith('note-')) data.append(key, value);
            students.forEach((student, index) => {
                data.append(`presensi[${index}][siswa_id]`, student.id);
                data.append(`presensi[${index}][status]`, form.get(`status-${index}`));
                data.append(`presensi[${index}][keterangan]`, form.get(`note-${index}`) || '');
            });
            if (!data.get('materi_pelajaran_id')) data.delete('materi_pelajaran_id');
            journalForm.querySelectorAll('button[type="submit"]').forEach((button) => { button.disabled = true; });
            try {
                const saved = await api('/api/v1/lesson-journals', { method: 'POST', body: data });
                if (action === 'draft') {
                    draftSaved = true;
                    showToast('Draf jurnal dan presensi siswa tersimpan.');
                    await loadHomeSchedules();
                    return;
                }
                if (!draftSaved) {
                    draftSaved = true;
                    showToast('Draf jurnal dan presensi tersimpan. Periksa kembali, lalu tekan Finalisasi jurnal untuk menyelesaikan tahap kedua.');
                    await loadHomeSchedules();
                    return;
                }
                const journalId = saved.data?.id;
                if (!journalId || !photoBlob || !verifiedLocation) throw new Error('Simpan draf, ambil foto langsung, dan verifikasi lokasi sebelum finalisasi.');
                const finalData = new FormData();
                finalData.append('foto_kegiatan', photoBlob, 'foto-kegiatan.jpg');
                finalData.append('latitude', String(verifiedLocation.latitude));
                finalData.append('longitude', String(verifiedLocation.longitude));
                finalData.append('accuracy', String(verifiedLocation.accuracy));
                await api(`/api/v1/lesson-journals/${journalId}/finalize`, { method: 'POST', body: finalData });
                journalProof.stopCamera(camera);
                if (photoUrl) URL.revokeObjectURL(photoUrl);
                featureModal.hide();
                showToast('Jurnal dan presensi berhasil difinalisasi.');
                await loadHomeSchedules();
                openSchedules();
            } catch (error) {
                const reason = error.message || 'Finalisasi jurnal gagal.';
                proofStatus.textContent = `Finalisasi gagal: ${reason}`;
                showToast(`Finalisasi gagal: ${reason}`);
                setFeatureError(error);
            }
            finally { journalForm.querySelectorAll('button[type="submit"]').forEach((button) => { button.disabled = button.value === 'finalize' ? !(photoBlob && verifiedLocation) : false; }); }
        });
        featureModal._element?.addEventListener('hidden.bs.modal', () => {
            journalProof.stopCamera(camera);
            if (photoUrl) URL.revokeObjectURL(photoUrl);
        }, { once: true });
    }

    // Dashboard wali kelas hanya memuat kelas yang memang ditugaskan kepada akun aktif.
    async function openWaliDashboard() {
        const result = await api('/api/v1/wali-class/overview');
        const data = result.data || {};
        const classes = Array.isArray(data.classes) ? data.classes : [];
        const classCards = classes.map((item) => `
            <div class="col-md-12 col-xl-12 col-sm-12 col-xs-12"><article class="card h-100"><div class="card-body">
                <h3 class="h5">${htmlSafe(item.nama_kelas)}</h3>
                <p class="small text-secondary mb-2">${htmlSafe(item.tingkat || '')} · ${htmlSafe(item.jurusan || '')}</p>
                <p><strong>${Number(item.penempatans_count || 0)}</strong> siswa</p>
                <div class="d-flex flex-wrap gap-2">
                    <button class="btn btn-sm btn-outline-primary" data-wali-action="students" data-class-id="${item.id}">Data siswa</button>
                    <button class="btn btn-sm btn-outline-secondary" data-wali-action="schedules" data-class-id="${item.id}">Jadwal</button>
                    <button class="btn btn-sm btn-outline-success" data-wali-action="attendance" data-class-id="${item.id}">Rekap presensi</button>
                    <button class="btn btn-sm btn-primary" data-wali-action="corrections">Koreksi presensi siswa</button>
                </div>
            </div></article></div>`).join('');
        setWaliPage('Dashboard Wali Kelas', `
            <div class="row g-3 mb-3">
                <div class="col-sm-6"><div class="card"><div class="card-body"><div class="small text-secondary">Tahun ajaran aktif</div><strong>${htmlSafe(data.academic_year || 'Belum ditetapkan')}</strong></div></div></div>
                <div class="col-sm-6"><div class="card"><div class="card-body"><div class="small text-secondary">Kelas perwalian</div><strong>${Number(data.total_classes || 0)}</strong></div></div></div>
                <div class="col-sm-6"><div class="card"><div class="card-body"><div class="small text-secondary">Total siswa</div><strong>${Number(data.total_students || 0)}</strong></div></div></div>
            </div>
            <h3 class="h5 mb-3">Kelas yang menjadi tanggung jawab Anda</h3>
            <div class="row g-3">${classCards || '<div class="col-12"><div class="alert alert-info">Belum ada kelas yang ditugaskan kepada Anda sebagai wali kelas pada tahun ajaran aktif.</div></div>'}
            </div>`);
        bindWaliActions();
    }

    async function openWaliClassPicker(action) {
        const result = await api('/api/v1/wali-class/overview');
        const data = result.data || {};
        const classes = Array.isArray(data.classes) ? data.classes : [];
        const labels = { students: 'Data Siswa', schedules: 'Jadwal Kelas', attendance: 'Rekap Presensi' };
        const cards = classes.map((item) => `<div class="col-md-6 col-xl-4"><div class="card h-100"><div class="card-body"><h3 class="h6">${htmlSafe(item.nama_kelas)}</h3><p class="small text-secondary">${htmlSafe(item.tingkat || '')} · ${htmlSafe(item.jurusan || '')}</p><button class="btn btn-primary btn-sm" data-wali-action="${action}" data-class-id="${item.id}">Buka ${labels[action] || 'fitur'}</button></div></div></div>`).join('');
        setWaliPage(`Pilih Kelas · ${labels[action] || 'Wali Kelas'}`, `<p class="text-secondary">Pilih hanya dari kelas yang ditugaskan kepada Anda sebagai wali kelas pada tahun ajaran aktif.</p><div class="row g-3">${cards || '<div class="col-12"><div class="alert alert-info">Belum ada kelas perwalian pada tahun ajaran aktif.</div></div>'}</div><button class="btn btn-outline-secondary mt-3" data-wali-action="dashboard">Kembali ke dashboard wali kelas</button>`);
        bindWaliActions();
    }

    async function openWaliStudents(classId) {
        const result = await api(`/api/v1/wali-class/classes/${encodeURIComponent(classId)}/students`);
        const data = result.data || {};
        const rows = (data.students || []).map((student, index) => `<tr><td>${index + 1}</td><td>${htmlSafe(student.nisn || '—')}</td><td>${htmlSafe(student.nama || '—')}</td><td>${htmlSafe(student.jenis_kelamin || '—')}</td></tr>`).join('');
        setWaliPage(`Data Siswa · ${data.class?.nama_kelas || 'Kelas'}`, `
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><div class="text-secondary small">Tahun ajaran ${htmlSafe(data.academic_year || '—')} · ${Number(data.total_students || 0)} siswa</div><button class="btn btn-outline-secondary btn-sm" data-wali-action="dashboard">Kembali ke dashboard wali kelas</button></div>
            <div class="table-responsive"><table class="table table-striped table-sm align-middle"><thead><tr><th>No.</th><th>NISN</th><th>Nama Siswa</th><th>Jenis Kelamin</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="text-center text-secondary">Belum ada siswa pada kelas ini.</td></tr>'}</tbody></table></div>`);
        bindWaliActions();
    }

    async function openWaliSchedules(classId) {
        const result = await api(`/api/v1/wali-class/classes/${encodeURIComponent(classId)}/schedules`);
        const data = result.data || {};
        const rows = (data.schedules || []).map((item, index) => `<tr><td>${index + 1}</td><td>${htmlSafe(item.hari || '—')}</td><td>${htmlSafe(String(item.jam_mulai || '').slice(0, 5) || '—')}–${htmlSafe(String(item.jam_selesai || '').slice(0, 5) || '—')}</td><td>${htmlSafe(item.mata_pelajaran?.nama_mapel || '—')}</td><td>${htmlSafe(item.guru?.nama || '—')}</td></tr>`).join('');
        setWaliPage(`Jadwal Kelas · ${data.class?.nama_kelas || 'Kelas'}`, `
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><div class="text-secondary small">Tahun ajaran ${htmlSafe(data.academic_year || '—')}</div><button class="btn btn-outline-secondary btn-sm" data-wali-action="dashboard">Kembali ke dashboard wali kelas</button></div>
            <div class="table-responsive"><table class="table table-striped table-sm align-middle"><thead><tr><th>No.</th><th>Hari</th><th>Jam</th><th>Mata Pelajaran</th><th>Guru</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="text-center text-secondary">Belum ada jadwal untuk kelas ini.</td></tr>'}</tbody></table></div>`);
        bindWaliActions();
    }

    // Menyeragamkan kapitalisasi nama siswa hanya pada tampilan, tanpa mengubah data sumber.
    function formatStudentDisplayName(value) {
        return String(value ?? '')
            .toLocaleLowerCase('id-ID')
            .replace(/(^|[\s'-])(\p{L})/gu, (_, separator, letter) => separator + letter.toLocaleUpperCase('id-ID'));
    }

    async function openWaliAttendance(classId, month = new Date().toISOString().slice(0, 7)) {
        const result = await api(`/api/v1/wali-class/classes/${encodeURIComponent(classId)}/attendance?month=${encodeURIComponent(month)}`);
        const data = result.data || {};
        const summary = data.summary || {};
        const rows = (data.students || []).map((student, index) => `<tr><td>${index + 1}</td><td>${htmlSafe(student.nisn || '—')}</td><td>${htmlSafe(student.nama ? formatStudentDisplayName(student.nama) : '—')}</td><td>${student.hadir}</td><td>${student.sakit}</td><td>${student.izin}</td><td>${student.alpha}</td><td>${student.cabut}</td><td>${student.persentase_hadir}%</td></tr>`).join('');
        setWaliPage(`Rekap Presensi · ${data.class?.nama_kelas || 'Kelas'}`, `
            <form id="waliAttendanceFilter" class="row g-2 align-items-end mb-3"><div class="col-sm-6 col-md-4"><label class="form-label" for="waliAttendanceMonth">Bulan laporan</label><input class="form-control" type="month" id="waliAttendanceMonth" name="month" value="${htmlSafe(month)}" required></div><div class="col-auto"><button class="btn btn-primary" type="submit">Tampilkan</button></div><div class="col-auto"><button class="btn btn-outline-secondary" type="button" data-wali-action="dashboard">Kembali</button></div><div class="col-auto"><button class="btn btn-outline-primary" type="button" id="printWaliAttendance"><i class="bi bi-printer"></i> Cetak Presensi</button></div></form>
            <div id="waliAttendancePrintArea" class="wali-attendance-print-area">
            <div class="mb-3"><h2 class="h5 mb-1">Rekap Presensi Siswa</h2><div class="text-secondary small">Kelas: ${htmlSafe(data.class?.nama_kelas || '—')} · Bulan: ${htmlSafe(month)}</div></div>
            <div class="row g-2 mb-3">
                <div class="col-6 col-lg-3"><div class="card"><div class="card-body"><div class="small text-secondary">Jumlah siswa</div><strong>${Number(summary.total_students || 0)}</strong></div></div></div>
                <div class="col-6 col-lg-3"><div class="card"><div class="card-body"><div class="small text-secondary">Catatan presensi</div><strong>${Number(summary.total_sessions || 0)}</strong></div></div></div>
                <div class="col-6 col-lg-3"><div class="card"><div class="card-body"><div class="small text-secondary">Hadir</div><strong>${Number(summary.hadir || 0)}</strong></div></div></div>
                <div class="col-6 col-lg-3"><div class="card"><div class="card-body"><div class="small text-secondary">Alpha</div><strong>${Number(summary.alpha || 0)}</strong></div></div></div>
            </div>
            <div class="table-responsive"><table class="table table-striped table-sm align-middle"><thead><tr><th>No.</th><th>NISN</th><th>Nama Siswa</th><th>Hadir</th><th>Sakit</th><th>Izin</th><th>Alpha</th><th>Cabut</th><th>% Hadir</th></tr></thead><tbody>${rows || '<tr><td colspan="9" class="text-center text-secondary">Belum ada data presensi pada bulan ini.</td></tr>'}</tbody></table></div></div>`);
        $('waliAttendanceFilter')?.addEventListener('submit', (event) => {
            event.preventDefault();
            openWaliAttendance(classId, $('waliAttendanceMonth').value).catch((error) => setWaliPage('Rekap Presensi Wali Kelas', `<div class="alert alert-danger">${htmlSafe(error.message)}</div>`));
        });
        $('printWaliAttendance')?.addEventListener('click', () => {
            // Cetak semua siswa dari data API, bukan hanya baris halaman DataTables yang sedang terlihat.
            const printWindow = window.open('', '', 'width=1100,height=800');
            if (!printWindow) {
                showToast('Jendela cetak diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi.');
                return;
            }
            const printRows = (data.students || []).map((student, index) => `<tr>
                <td>${index + 1}</td>
                <td>${htmlSafe(student.nisn || '—')}</td>
                <td>${htmlSafe(student.nama ? formatStudentDisplayName(student.nama) : '—')}</td>
                <td>${Number(student.hadir || 0)}</td>
                <td>${Number(student.sakit || 0)}</td>
                <td>${Number(student.izin || 0)}</td>
                <td>${Number(student.alpha || 0)}</td>
                <td>${Number(student.cabut || 0)}</td>
                <td>${Number(student.persentase_hadir || 0)}%</td>
            </tr>`).join('');
            printWindow.document.open();
            printWindow.document.write(`<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rekap Presensi - ${htmlSafe(data.class?.nama_kelas || 'Kelas')}</title>
<style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: Arial, sans-serif; color: #111; font-size: 11px; }
    h1 { font-size: 18px; margin: 0 0 5px; }
    .meta { margin-bottom: 14px; font-size: 11px; }
    .summary { display: flex; flex-wrap: wrap; gap: 18px; margin-bottom: 14px; }
    .summary span { display: inline-block; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #777; padding: 5px 6px; text-align: center; }
    th { background: #e9eeee; font-weight: bold; }
    th:nth-child(3), td:nth-child(3) { text-align: left; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
</style>
</head>
<body>
    <h1>Rekap Presensi Siswa</h1>
    <div class="meta">Kelas: ${htmlSafe(data.class?.nama_kelas || '—')} &nbsp; | &nbsp; Bulan: ${htmlSafe(month)}</div>
    <div class="summary">
        <span>Jumlah siswa: <strong>${Number(summary.total_students || (data.students || []).length)}</strong></span>
        <span>Catatan presensi: <strong>${Number(summary.total_sessions || 0)}</strong></span>
        <span>Hadir: <strong>${Number(summary.hadir || 0)}</strong></span>
        <span>Alpha: <strong>${Number(summary.alpha || 0)}</strong></span>
    </div>
    <table>
        <thead><tr><th>No.</th><th>NISN</th><th>Nama Siswa</th><th>Hadir</th><th>Sakit</th><th>Izin</th><th>Alpha</th><th>Cabut</th><th>% Hadir</th></tr></thead>
        <tbody>${printRows || '<tr><td colspan="9">Belum ada data presensi pada bulan ini.</td></tr>'}</tbody>
    </table>
    <script>window.addEventListener('load', () => { window.focus(); window.print(); });<\/script>
</body>
</html>`);
            printWindow.document.close();
        });
        bindWaliActions();
    }

    function bindWaliActions() {
        document.querySelectorAll('[data-wali-action]').forEach((button) => {
            button.addEventListener('click', () => {
                const action = button.dataset.waliAction;
                const classId = button.dataset.classId;
                const work = action === 'dashboard' ? openWaliDashboard()
                    : action === 'students' ? openWaliStudents(classId)
                    : action === 'schedules' ? openWaliSchedules(classId)
                    : action === 'attendance' ? openWaliAttendance(classId)
                    : action === 'corrections' ? openWaliSessions()
                    : Promise.resolve();
                work.catch((error) => setWaliPage('Menu Wali Kelas', `<div class="alert alert-danger mb-0">${htmlSafe(error.message)}</div>`));
            }, { once: true });
        });
    }

    // Menampilkan sesi presensi siswa yang menjadi tanggung jawab wali kelas agar bisa dikoreksi secara cepat.
    async function openWaliSessions() {
        const result = await api('/api/v1/student-attendances/wali-sessions');
        const journals = result.data?.data || [];
        const content = journals.map((journal) => `<article class="card mb-3"><div class="card-body"><h3 class="h6">${htmlSafe(formatTanggal(journal.tanggal))} · ${htmlSafe(journal.jadwal_pelajaran?.kelas?.nama_kelas)}</h3><p class="small text-secondary">${htmlSafe(journal.materi_pembahasan)}</p>${journal.presensi_siswas.map((row) => `<div class="row g-2 align-items-center border-top py-2"><div class="col-sm-12 col-md-4">${htmlSafe(row.siswa?.nama)}</div><div class="col-sm-12 col-md-4"><select class="form-select form-select-sm" id="status-${row.id}">${['HADIR', 'SAKIT', 'IZIN', 'ALPHA', 'CABUT'].map((status) => `<option ${status === row.status ? 'selected' : ''}>${status}</option>`).join('')}</select></div><div class="col-sm-12 col-md-4"><button class="btn btn-outline-primary btn-sm" data-attendance-save="${row.id}">Simpan koreksi</button></div></div>`).join('')}</div></article>`).join('');
        setWaliPage('Koreksi Presensi Per Sesi', content || '<div class="card"><div class="card-body text-center text-secondary">Belum ada sesi jurnal pada kelas perwalian.</div></div>');
        document.querySelectorAll('[data-attendance-save]').forEach((button) => button.addEventListener('click', async () => {
            try { await api(`/api/v1/student-attendances/${button.dataset.attendanceSave}`, { method: 'PATCH', body: { status: $(`status-${button.dataset.attendanceSave}`).value } }); showToast('Koreksi disimpan.'); }
            catch (error) { showToast(error.message); }
        }));
    }

    const moderation = window.createAksaraModeration({ $, api, htmlSafe, setFeature, showToast, token });

    // Menampilkan formulir maupun daftar persetujuan pengajuan perizinan untuk user dan admin.
    async function openLeave(submitMode = false, page = 1, search = '', perPage = 20) {
        if (submitMode) {
            const adminWorkspace = document.body.classList.contains('admin-mode');
            if (adminWorkspace) setFeature('Ajukan Perizinan', '<div id="leaveSubmitContent"></div>');
            else setPage('leave');
            const leaveContent = adminWorkspace ? $('leaveSubmitContent') : $('leavePageContent');
            $('leavePageContent').innerHTML = `<section class="card"><div class="card-body"><div class="alert alert-info small">Pilih jenis pengajuan pada formulir. Untuk sakit, pilih Izin / Cuti dan tuliskan “sakit” pada alasan. Dinas luar tercatat setelah disetujui.</div><form id="leaveForm"><div class="mb-3"><label class="form-label">Jenis pengajuan</label><select name="jenis_pengajuan" class="form-select"><option value="CUTI">Izin / Cuti / Sakit</option><option value="DINAS">Dinas luar</option></select></div><div class="row g-3"><div class="col-sm-12 col-md-6"><label class="form-label">Tanggal mulai</label><input class="form-control" name="tanggal_mulai" type="date" required></div><div class="col-sm-12 col-md-6"><label class="form-label">Tanggal selesai</label><input class="form-control" name="tanggal_selesai" type="date" required></div></div><div class="my-3"><label class="form-label">Alasan</label><textarea name="alasan" class="form-control" rows="4" minlength="10" required></textarea></div><div class="mb-3"><label class="form-label">Lampiran PDF/JPG/PNG (opsional, max 5 MB)</label><input class="form-control" name="berkas_lampiran" type="file" accept=".pdf,image/png,image/jpeg"></div><button class="btn btn-success w-100">Kirim pengajuan</button></form></div></section>`;
            if (adminWorkspace) {
                leaveContent.innerHTML = $('leavePageContent').innerHTML;
                $('leavePageContent').replaceChildren();
            }
            $('leaveForm').addEventListener('submit', async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                try {
                    await api('/api/v1/leave-requests', { method: 'POST', body: form });
                }
                catch (error) {
                    leaveContent.insertAdjacentHTML('afterbegin', `<div class="alert alert-danger leave-error">${htmlSafe(error.message)}</div>`);
                    return;
                }
                showToast('Pengajuan berhasil dikirim dan menunggu persetujuan.');
                openMyLeaveRequests().catch((error) => {
                    const target = adminWorkspace ? $('adminPanelContent') : $('leavePageContent');
                    target.innerHTML = `<div class="alert alert-danger">Pengajuan terkirim, tetapi status belum dapat dimuat: ${htmlSafe(error.message)}</div>`;
                });
            });
            return;
        }
        const searchValue = '';
        const pageValue = 1;
        const allItems = await window.aksaraFetchAllPages(api, '/api/v1/leave-requests', { per_page: '50' });
        const items = allItems;
        const pagination = { current_page: 1, last_page: 1, total: items.length, per_page: items.length || 50, from: items.length ? 1 : null, to: items.length };
        const statusBadge = { PENDING: 'text-bg-warning', APPROVED: 'text-bg-success', REJECTED: 'text-bg-danger' };
        const displayDate = (value) => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
        const formatTanggal = (value) => value ? new Intl.DateTimeFormat('id-ID').format(new Date(value)) : '—';
        const rows = items.map((item, index) => `<tr><td>${index + 1}</td><td class="text-nowrap">${htmlSafe(displayDate(item.created_at))}</td><td><strong>${htmlSafe(item.user?.nama || 'Pengguna')}</strong>${item.user?.nip ? `<div class="small text-secondary">${htmlSafe(item.user.nip)}</div>` : ''}</td><td class="text-nowrap">${item.jenis_pengajuan === 'DINAS' ? 'Dinas luar' : 'Izin / cuti'}</td><td class="text-nowrap">${htmlSafe(formatTanggal(item.tanggal_mulai))}${item.tanggal_mulai !== item.tanggal_selesai ? ` – ${htmlSafe(formatTanggal(item.tanggal_selesai))}` : ''}</td><td class="leave-reason-cell" title="${htmlSafe(item.alasan)}">${htmlSafe(item.alasan)}</td><td><span class="badge ${statusBadge[item.status_approval] || 'text-bg-secondary'}">${htmlSafe(item.status_approval)}</span></td><td class="text-nowrap">${item.berkas_lampiran ? `<button class="btn btn-outline-secondary btn-sm" data-attachment="${item.id}" title="Unduh lampiran" aria-label="Unduh lampiran"><i class="bi bi-paperclip"></i></button>` : '<span class="text-secondary">—</span>'}</td><td class="text-nowrap">${item.status_approval === 'PENDING' ? `<div class="d-flex gap-1"><button class="btn btn-success btn-sm" data-leave-decision="${item.id}" data-status="APPROVED">Setujui</button><button class="btn btn-outline-danger btn-sm" data-leave-decision="${item.id}" data-status="REJECTED">Tolak</button></div>` : '<span class="text-secondary">Selesai</span>'}</td></tr>`).join('');
        const currentPage = Number(pagination.current_page || pageValue);
        const lastPage = Number(pagination.last_page || 1);
        const startPage = Math.max(1, Math.min(currentPage - 2, lastPage - 4));
        const endPage = Math.min(lastPage, startPage + 4);
        const pageButtons = Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index).map((number) => `<button type="button" class="btn btn-sm ${number === currentPage ? 'btn-primary' : 'btn-outline-secondary'}" data-leave-page="${number}" aria-current="${number === currentPage ? 'page' : 'false'}">${number}</button>`).join('');
        setFeature('Persetujuan Perizinan Guru', `<section class="card"><div class="card-body"><form id="leaveSearchForm" class="row g-2 align-items-end mb-3"><div class="col-12 col-md"><label class="form-label" for="leaveSearch">Cari nama, NIP, jenis, status, atau alasan</label><input class="form-control" type="search" id="leaveSearch" value="${htmlSafe(searchValue)}" placeholder="Ketik kata pencarian"></div><div class="col-6 col-md-2"><label class="form-label" for="leavePerPage">Baris per halaman</label><select class="form-select" id="leavePerPage">${[10, 20, 50].map((count) => `<option value="${count}" ${Number(perPage) === count ? 'selected' : ''}>${count}</option>`).join('')}</select></div><div class="col-6 col-md-auto"><button class="btn btn-primary w-100"><i class="bi bi-search"></i> Cari</button></div></form><div class="table-responsive"><table class="table table-hover table-striped align-middle leave-approval-table"><thead><tr><th>No.</th><th>Waktu Pengajuan</th><th>Guru</th><th>Jenis</th><th>Tanggal Izin</th><th>Alasan</th><th>Status</th><th>Lampiran</th><th>Aksi</th></tr></thead><tbody>${rows || `<tr><td colspan="9" class="text-center text-secondary py-4">${searchValue ? 'Tidak ditemukan pengajuan yang cocok.' : 'Belum ada pengajuan izin.'}</td></tr>`}</tbody></table></div><div class="d-flex flex-wrap justify-content-between align-items-center gap-2"><small class="text-secondary">Menampilkan ${pagination.from || 0}–${pagination.to || 0} dari ${pagination.total || 0} pengajuan terbaru</small><nav class="d-flex gap-1" aria-label="Halaman pengajuan"><button type="button" class="btn btn-sm btn-outline-secondary" data-leave-page="${Math.max(1, currentPage - 1)}" ${currentPage <= 1 ? 'disabled' : ''} aria-label="Halaman sebelumnya"><i class="bi bi-chevron-left"></i></button>${pageButtons}<button type="button" class="btn btn-sm btn-outline-secondary" data-leave-page="${Math.min(lastPage, currentPage + 1)}" ${currentPage >= lastPage ? 'disabled' : ''} aria-label="Halaman berikutnya"><i class="bi bi-chevron-right"></i></button></nav></div></div></section>`);
        $('leaveSearchForm')?.remove();
        document.querySelector('nav[aria-label="Halaman pengajuan"]')?.parentElement.remove();
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

    // Menampilkan riwayat pengajuan izin milik user beserta status dan lampiran pendukung.
    async function openMyLeaveRequests() {
        const adminWorkspace = document.body.classList.contains('admin-mode');
        if (adminWorkspace) setFeature('Riwayat Pengajuan Saya', '<div id="myLeaveRequestsContent"></div>');
        else setPage('leave');
        const leaveContent = adminWorkspace ? $('myLeaveRequestsContent') : $('leavePageContent');
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
            return `<article class="card mb-3"><div class="card-body"><div class="d-flex flex-wrap justify-content-between align-items-start gap-2"><h3 class="h6 mb-0">${type}</h3><span class="badge ${status.badge}">${status.label}</span></div><p class="small text-secondary mt-2 mb-2">${htmlSafe(formatTanggal(item.tanggal_mulai))} – ${htmlSafe(formatTanggal(item.tanggal_selesai))}</p><p class="mb-2">${htmlSafe(item.alasan)}</p><div class="border-top pt-2 small"><strong>Progres:</strong> ${decision}<br><span class="text-secondary">Dikirim ${formatDateTime(item.created_at)}</span></div>${item.berkas_lampiran ? `<button class="btn btn-outline-secondary btn-sm mt-2" data-attachment="${item.id}">Unduh lampiran</button>` : ''}</div></article>`;
        }).join('');
        leaveContent.innerHTML = `<div class="d-flex justify-content-end mb-3"><button type="button" class="btn btn-outline-primary btn-sm" id="refreshMyLeaveRequests"><i class="bi bi-arrow-clockwise"></i> Perbarui status</button></div>${cards || '<div class="card"><div class="card-body text-center text-secondary">Belum ada pengajuan.</div></div>'}`;
        $('refreshMyLeaveRequests')?.addEventListener('click', () => openMyLeaveRequests().catch((error) => {
            leaveContent.innerHTML = `<div class="alert alert-danger">${htmlSafe(error.message)}</div>`;
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

    // Membuka formulir pengajuan guru pengganti untuk jadwal yang dipilih oleh guru utama.
    async function openSubstituteRequestForm(scheduleId, schedule = null) {
        if (!schedule) {
            const todaySchedules = await api('/api/v1/teacher/schedules/today');
            schedule = (todaySchedules.data || []).find((item) => String(item.id) === String(scheduleId));
        }
        if (!schedule) return showToast('Jadwal tidak ditemukan.');

        setFeature('Ajukan Guru Pengganti', '<div class="card"><div class="card-body text-secondary"><span class="spin"></span>Memuat daftar rekan guru...</div></div>');

        try {
            const candidatesRes = await api('/api/v1/teacher/substitute-candidates');
            const candidates = candidatesRes.data || [];
            if (!candidates.length) {
                setFeature('Ajukan Guru Pengganti', '<div class="alert alert-warning">Tidak ada data rekan guru yang tersedia untuk dipilih sebagai pengganti.</div>');
                return;
            }

            const today = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Jakarta' }).format(new Date());

            const content = `<div class="card mb-3">
                <div class="card-body">
                    <h2 class="h6 mb-2">Jadwal yang Ingin Didelegasikan</h2>
                    <div class="text-secondary small">
                        <strong>${htmlSafe(schedule.kelas?.nama_kelas || 'Kelas')} · ${htmlSafe(schedule.mata_pelajaran?.nama_mapel || 'Mata Pelajaran')}</strong><br>
                        Waktu: ${htmlSafe(schedule.jam_mulai)}–${htmlSafe(schedule.jam_selesai)} (${htmlSafe(schedule.hari)}) · Siklus ${htmlSafe(schedule.siklus_minggu || 'Mingguan')}
                    </div>
                </div>
            </div>
            <form id="substituteRequestForm">
                <input type="hidden" name="jadwal_pelajaran_id" value="${htmlSafe(scheduleId)}">
                <div class="mb-3">
                    <label class="form-label" for="substituteTeacherSelect">Pilih Guru Pengganti <span class="text-danger">*</span></label>
                    <select class="form-select" id="substituteTeacherSelect" name="guru_pengganti_id" required>
                        <option value="">-- Pilih rekan guru pengganti --</option>
                        ${candidates.map((teacher) => `<option value="${teacher.id}">${htmlSafe(teacher.nama)}${teacher.nip ? ` (${htmlSafe(teacher.nip)})` : ''}</option>`).join('')}
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label" for="substituteDate">Tanggal Mengajar <span class="text-danger">*</span></label>
                    <input class="form-control" type="date" id="substituteDate" name="tanggal" value="${today}" required>
                </div>
                <div class="mb-3">
                    <label class="form-label" for="substituteReason">Alasan Penggantian <span class="text-danger">*</span></label>
                    <textarea class="form-control" id="substituteReason" name="alasan" rows="3" minlength="10" maxlength="2000" placeholder="Jelaskan alasan mengapa membutuhkan guru pengganti (min. 10 karakter)..." required></textarea>
                </div>
                <div class="d-flex justify-content-end gap-2">
                    <button type="button" class="btn btn-outline-secondary" id="btnCancelSubstitute">Batal</button>
                    <button type="submit" class="btn btn-primary" id="btnSubmitSubstitute"><i class="bi bi-send"></i> Kirim Pengajuan</button>
                </div>
            </form>`;

            setFeature('Ajukan Guru Pengganti', content);

            $('btnCancelSubstitute')?.addEventListener('click', openSchedules);

            $('substituteRequestForm')?.addEventListener('submit', async (event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const submitBtn = $('btnSubmitSubstitute');
                submitBtn.disabled = true;
                const body = {
                    jadwal_pelajaran_id: Number(form.jadwal_pelajaran_id.value),
                    guru_pengganti_id: Number(form.guru_pengganti_id.value),
                    tanggal: form.tanggal.value,
                    alasan: form.alasan.value.trim(),
                };

                try {
                    const response = await api('/api/v1/teacher/substitute-requests', {
                        method: 'POST',
                        body,
                    });
                    showToast(response.message || 'Pengajuan guru pengganti berhasil dikirim.');
                    await loadHomeSchedules();
                    openSchedules();
                } catch (error) {
                    showToast(error.message);
                    setFeatureError(error);
                } finally {
                    submitBtn.disabled = false;
                }
            });
        } catch (error) {
            setFeature('Ajukan Guru Pengganti', `<div class="alert alert-danger">${htmlSafe(error.message)}</div>`);
        }
    }

    // Menampilkan riwayat pengajuan guru pengganti milik guru yang sedang login.
    async function openMySubstituteRequests() {
        setFeature('Riwayat Pengajuan Guru Pengganti', '<div class="card"><div class="card-body text-secondary"><span class="spin"></span>Memuat riwayat pengajuan...</div></div>');

        try {
            const res = await api('/api/v1/teacher/substitute-requests/mine');
            const items = res.data || [];

            const statusBadge = {
                PENDING: '<span class="badge text-bg-warning">Menunggu</span>',
                APPROVED: '<span class="badge text-bg-success">Disetujui</span>',
                REJECTED: '<span class="badge text-bg-danger">Ditolak</span>',
            };

            const rows = items.map((item) => `<tr>
                <td class="text-nowrap">${htmlSafe(formatTanggal(item.tanggal))}</td>
                <td>
                    <strong>${htmlSafe(item.jadwal_pelajaran?.kelas?.nama_kelas || 'Kelas')}</strong> · ${htmlSafe(item.jadwal_pelajaran?.mata_pelajaran?.nama_mapel || 'Mapel')}
                </td>
                <td>
                    <strong>${htmlSafe(item.guru_pengganti?.nama || 'Guru')}</strong>
                    ${item.guru_pengganti?.nip ? `<div class="small text-secondary">${htmlSafe(item.guru_pengganti.nip)}</div>` : ''}
                </td>
                <td class="small">${htmlSafe(item.alasan)}</td>
                <td>${statusBadge[item.status_approval] || item.status_approval}</td>
                <td class="small text-secondary">${htmlSafe(item.catatan_admin || '—')}</td>
            </tr>`).join('');

            const content = `<div class="d-flex justify-content-between align-items-center mb-3">
                <p class="small text-secondary mb-0">Daftar permohonan guru pengganti yang pernah Anda ajukan.</p>
                <button class="btn btn-outline-primary btn-sm" id="btnBackToSchedules"><i class="bi bi-arrow-left"></i> Kembali ke Jadwal</button>
            </div>
            <div class="table-responsive">
                <table class="table table-hover table-striped align-middle">
                    <thead>
                        <tr>
                            <th>Tanggal</th>
                            <th>Jadwal</th>
                            <th>Guru Pengganti</th>
                            <th>Alasan</th>
                            <th>Status</th>
                            <th>Catatan Admin</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || '<tr><td colspan="6" class="text-center text-secondary py-4">Belum ada pengajuan guru pengganti.</td></tr>'}
                    </tbody>
                </table>
            </div>`;

            setFeature('Riwayat Pengajuan Guru Pengganti', content);
            $('btnBackToSchedules')?.addEventListener('click', openSchedules);
        } catch (error) {
            setFeature('Riwayat Pengajuan Guru Pengganti', `<div class="alert alert-danger">${htmlSafe(error.message)}</div>`);
        }
    }

    // Menampilkan panel moderasi persetujuan pengajuan guru pengganti untuk Admin, Kurikulum, dan Kepsek.
    async function openSubstituteApprovals(statusFilter = '') {
        const query = statusFilter ? `?status_approval=${encodeURIComponent(statusFilter)}` : '';
        setFeature('Persetujuan Guru Pengganti', '<div class="card"><div class="card-body text-secondary"><span class="spin"></span>Memuat daftar pengajuan pengganti...</div></div>');

        try {
            const res = await api(`/api/v1/admin/substitute-requests${query}`);
            const items = res.data || [];

            const statusBadge = {
                PENDING: '<span class="badge text-bg-warning">Menunggu</span>',
                APPROVED: '<span class="badge text-bg-success">Disetujui</span>',
                REJECTED: '<span class="badge text-bg-danger">Ditolak</span>',
            };

            const filterBar = `<div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                <div class="btn-group btn-group-sm" role="group">
                    <button type="button" class="btn ${!statusFilter ? 'btn-primary' : 'btn-outline-primary'}" data-sub-filter="">Semua</button>
                    <button type="button" class="btn ${statusFilter === 'PENDING' ? 'btn-primary' : 'btn-outline-primary'}" data-sub-filter="PENDING">Menunggu</button>
                    <button type="button" class="btn ${statusFilter === 'APPROVED' ? 'btn-primary' : 'btn-outline-primary'}" data-sub-filter="APPROVED">Disetujui</button>
                    <button type="button" class="btn ${statusFilter === 'REJECTED' ? 'btn-primary' : 'btn-outline-primary'}" data-sub-filter="REJECTED">Ditolak</button>
                </div>
            </div>`;

            const rows = items.map((item, index) => {
                const actions = item.status_approval === 'PENDING'
                    ? `<div class="d-flex gap-1">
                        <button class="btn btn-success btn-sm" data-sub-action="${item.id}" data-decision="APPROVED" title="Setujui"><i class="bi bi-check-lg"></i> Setujui</button>
                        <button class="btn btn-outline-danger btn-sm" data-sub-action="${item.id}" data-decision="REJECTED" title="Tolak"><i class="bi bi-x-lg"></i> Tolak</button>
                       </div>`
                    : `<span class="small text-secondary">Selesai</span>`;

                return `<tr>
                    <td>${index + 1}</td>
                    <td class="text-nowrap">${htmlSafe(formatTanggal(item.tanggal))}</td>
                    <td>
                        <strong>${htmlSafe(item.guru_utama?.nama || 'Guru Utama')}</strong>
                        ${item.guru_utama?.nip ? `<div class="small text-secondary">${htmlSafe(item.guru_utama.nip)}</div>` : ''}
                    </td>
                    <td>
                        <i class="bi bi-arrow-right text-secondary me-1"></i>
                        <strong>${htmlSafe(item.guru_pengganti?.nama || 'Pengganti')}</strong>
                        ${item.guru_pengganti?.nip ? `<div class="small text-secondary">${htmlSafe(item.guru_pengganti.nip)}</div>` : ''}
                    </td>
                    <td>
                        <strong>${htmlSafe(item.jadwal_pelajaran?.kelas?.nama_kelas || 'Kelas')}</strong><br>
                        <span class="small text-secondary">${htmlSafe(item.jadwal_pelajaran?.mata_pelajaran?.nama_mapel || 'Mapel')}</span>
                    </td>
                    <td class="small" style="max-width:200px;">${htmlSafe(item.alasan)}</td>
                    <td>${statusBadge[item.status_approval] || item.status_approval}</td>
                    <td class="text-nowrap">${actions}</td>
                </tr>`;
            }).join('');

            const content = `<section class="card">
                <div class="card-body">
                    ${filterBar}
                    <div class="table-responsive">
                        <table class="table table-hover table-striped align-middle">
                            <thead>
                                <tr>
                                    <th>No.</th>
                                    <th>Tanggal</th>
                                    <th>Guru Utama</th>
                                    <th>Guru Pengganti</th>
                                    <th>Kelas & Mapel</th>
                                    <th>Alasan</th>
                                    <th>Status</th>
                                    <th>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows || '<tr><td colspan="8" class="text-center text-secondary py-4">Tidak ada pengajuan guru pengganti.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>`;

            setFeature('Persetujuan Guru Pengganti', content);

            document.querySelectorAll('[data-sub-filter]').forEach((btn) => btn.addEventListener('click', () => {
                openSubstituteApprovals(btn.dataset.subFilter);
            }));

            document.querySelectorAll('[data-sub-action]').forEach((btn) => btn.addEventListener('click', async () => {
                const id = btn.dataset.subAction;
                const decision = btn.dataset.decision;
                const promptMsg = decision === 'APPROVED'
                    ? 'Catatan persetujuan (opsional):'
                    : 'Catatan penolakan (opsional):';
                const note = window.prompt(promptMsg, '');
                if (note === null) return;

                btn.disabled = true;
                try {
                    await api(`/api/v1/admin/substitute-requests/${id}`, {
                        method: 'PATCH',
                        body: {
                            status_approval: decision,
                            catatan_admin: note ? note.trim() : null,
                        },
                    });
                    showToast(decision === 'APPROVED' ? 'Pengajuan guru pengganti disetujui.' : 'Pengajuan guru pengganti ditolak.');
                    openSubstituteApprovals(statusFilter);
                    if (document.body.classList.contains('admin-mode')) {
                        adminDashboard.loadAdminLiveReport();
                    }
                } catch (error) {
                    showToast(error.message);
                } finally {
                    btn.disabled = false;
                }
            }));
        } catch (error) {
            setFeature('Persetujuan Guru Pengganti', `<div class="alert alert-danger">${htmlSafe(error.message)}</div>`);
        }
    }

    // Monitoring E-Jurnal: menampilkan daftar jurnal mengajar berdasarkan tanggal kegiatan pembelajaran.
    // Admin dan kurikulum dapat memfilter, mencari, serta membuka detail jurnal secara read-only.
    let jmLastFilters = {};
    async function openJournalMonitoring(filters = {}) {
        jmLastFilters = filters;
      
        const tanggal = filters.tanggal || '';
        const status = filters.status || '';
        const search = filters.search || '';

        const params = new URLSearchParams();
        if (tanggal) params.set('tanggal', tanggal);
        if (status) params.set('status', status);
        if (search) params.set('search', search);

        let result;
        try {
            result = await api(`/api/v1/admin/journal-monitoring?${params}`);
        } catch (error) {
            setFeature('Monitoring E-Jurnal', `<div class="alert alert-danger">${htmlSafe(error.message)}</div>`);
            return;
        }

        const summary = result.summary || {};
        const journals = result.data || [];

        const statusOptions = [
            { value: '', label: 'Semua' },
            { value: 'draft', label: 'Draft' },
            { value: 'final', label: 'Final' },
            { value: 'finalisasi_susulan', label: 'Finalisasi Susulan' },
            { value: 'kedaluwarsa', label: 'Kedaluwarsa' },
        ].map((opt) => `<option value="${opt.value}" ${status === opt.value ? 'selected' : ''}>${htmlSafe(opt.label)}</option>`).join('');

        // Tanggal display
        const displayDate = new Date(tanggal + 'T12:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

        const filterBar = `<form id="jmFilters" class="card mb-3 admin-form-card">
            <div class="card-body">
                <div class="row g-3 admin-form-grid">
                    
                <div class="col-md-6 col-sm-12">
                    <label class="form-label" for="jmTanggalMode">Cakupan tanggal</label>
                    <select class="form-select" id="jmTanggalMode" name="tanggal_mode">
                        <option value="semua" ${!tanggal ? 'selected' : ''}>Semua tanggal</option>
                        <option value="tertentu" ${tanggal ? 'selected' : ''}>Tanggal tertentu</option>
                    </select>
                </div>
                <div class="col-md-6 col-sm-12" id="jmTanggalWrapper" ${!tanggal ? 'hidden' : ''}>
                    <label class="form-label" for="jmTanggal">Tanggal kegiatan</label>
                    <input class="form-control" id="jmTanggal" type="date" name="tanggal" value="${htmlSafe(tanggal)}" ${!tanggal ? 'disabled' : ''}>
                </div>

                    <div class="col-md-6 col-sm-12">
                        <label class="form-label" for="jmStatus">Status jurnal</label>
                        <select class="form-select" id="jmStatus" name="status">${statusOptions}</select>
                    </div>
                    <div class="col-md-6 col-sm-12">
                        <label class="form-label" for="jmSearch">Pencarian</label>
                        <input class="form-control" id="jmSearch" type="search" name="search" value="${htmlSafe(search)}" placeholder="Cari nama guru, kelas, atau materi...">
                    </div>
                    <div class=" col-sm-12 form-actions">
                        <button class="btn btn-outline-success" type="submit">Terapkan filter</button>
                        ${activeRoleNames.includes('admin') ? '<button class="btn btn-outline-danger ms-2" type="button" id="jmExpireDrafts">Tandai draft kedaluwarsa</button>' : ''}
                    </div>
                </div>
            </div>
        </form>`;

        const statCards = [
            { label: 'Total jurnal', value: summary.total ?? '—', variant: 'secondary' },
            { label: 'Sudah final', value: summary.final ?? '—', variant: 'success' },
            { label: 'Masih draft', value: summary.draft ?? '—', variant: 'warning' },
            { label: 'Finalisasi susulan', value: summary.finalisasi_susulan ?? '—', variant: 'info' },
            { label: 'Kedaluwarsa', value: summary.kedaluwarsa ?? '—', variant: 'danger' },
            { label: 'Belum lengkap', value: summary.belum_lengkap ?? '—', variant: 'secondary' },
        ].map(({ label, value, variant }) => `<div class="col-lg-4 col-md-6 col-sm-12">
            <div class="card border-${variant}-subtle">
                <div class="card-body d-flex justify-content-between align-items-center py-3">
                    <span class="small text-secondary">${htmlSafe(label)}</span>
                    <span class="fs-4 fw-bold text-${variant}">${htmlSafe(String(value))}</span>
                </div>
            </div>
        </div>`).join('');

        const statusBadge = {
            draft: '<span class="badge bg-warning text-dark">Draft</span>',
            final: '<span class="badge bg-success">Final</span>',
            finalisasi_susulan: '<span class="badge bg-info text-dark">Finalisasi Susulan</span>',
            kedaluwarsa: '<span class="badge bg-danger">Kedaluwarsa</span>',
        };

        const rows = journals.map((item, index) => {
            const guruLabel = htmlSafe(item.guru?.nama || 'Guru tidak diketahui');
            const nipLabel = item.guru?.nip ? `<div class="small text-secondary">${htmlSafe(item.guru.nip)}</div>` : '';
            const kelasLabel = htmlSafe(item.kelas?.nama_kelas || '—');
            const tanggalLabel = formatTanggal(item.tanggal,'ringkas');
            const mapelLabel = htmlSafe(item.mata_pelajaran?.nama_mapel || '—');
            const waktu = item.jam_mulai && item.jam_selesai ? `${htmlSafe(item.jam_mulai)}–${htmlSafe(item.jam_selesai)}` : '—';
            const materi = item.materi_pembahasan
                ? htmlSafe(String(item.materi_pembahasan).substring(0, 80) + (item.materi_pembahasan.length > 80 ? '…' : ''))
                : '<span class="text-secondary fst-italic">Belum diisi</span>';
            const badge = statusBadge[item.status_sesi] || `<span class="badge bg-secondary">${htmlSafe(item.status_label || item.status_sesi)}</span>`;
            const lengkapBadge = item.lengkap
                ? `<span class="badge bg-success">Lengkap</span>`
                : `<span class="badge bg-danger" title="${htmlSafe(item.presensi_count)} / ${htmlSafe(String(item.total_siswa))} siswa">Belum lengkap</span>`;

        return `<tr>
            <td>${index + 1}</td>
            <td class="text-nowrap">${htmlSafe(tanggalLabel)}</td>
            <td>
                <strong>${guruLabel}</strong>
                <span class="text-secondary"> · ${kelasLabel}</span>
                ${nipLabel}
                <div class="small text-secondary">${mapelLabel}</div>
            </td>
            <td class="text-nowrap small">${waktu}</td>
            <td class="small">${materi}</td>
            <td>${badge}</td>
            <td class="text-nowrap">
                <button class="btn btn-outline-secondary btn-sm" data-jm-detail="${item.id}">Lihat detail →</button>
            </td>
        </tr>`;
        }).join('');

        const emptyRow = '';

        const content = `${filterBar}
            <p class="text-secondary small mb-3">
                <i class="bi bi-calendar3 me-1"></i>${htmlSafe(displayDate)}
            </p>
            <div class="row g-3 mb-3">${statCards}</div>
            <section class="card">
                <div class="card-header"><strong>Daftar Jurnal</strong></div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover table-striped align-middle mb-0">
                            <thead>                        
                                    <tr>
                                        <th>No.</th>
                                        <th>Tanggal</th>
                                        <th>Guru / Kelas</th>
                                        <th>Waktu</th>
                                        <th>Materi</th>
                                        <th>Status</th>
                                        <th>Aksi</th>
                                    </tr>
                            </thead>
                            <tbody>${rows || emptyRow}</tbody>
                        </table>
                    </div>
                </div>
                <div class="card-footer small text-secondary">
                    Data berdasarkan tanggal kegiatan pembelajaran, bukan tanggal finalisasi. Draft dari hari sebelumnya tetap tampil saat tanggal kegiatan dipilih.
                </div>
            </section>`;

        setFeature('Monitoring E-Jurnal', content);

        $('jmExpireDrafts')?.addEventListener('click', async (event) => {
            const button = event.currentTarget;
            if (!window.confirm('Tandai semua draft yang telah melewati 48 jam sebagai Kedaluwarsa? Tindakan ini tidak dapat dibatalkan melalui tombol ini.')) return;
            button.disabled = true;
            try {
                const response = await api('/api/v1/admin/journal-monitoring/expire-drafts', { method: 'POST' });
                showToast(response.message || 'Proses kedaluwarsa selesai.');
                await openJournalMonitoring(jmLastFilters);
            } catch (error) {
                showToast(error.message || 'Gagal memproses draft kedaluwarsa.');
            } finally {
                button.disabled = false;
            }
        });
        
        $('jmTanggalMode')?.addEventListener('change', (event) => {
            const mode = event.target.value;
            const wrapper = $('jmTanggalWrapper');
            const input = $('jmTanggal');

            if (!wrapper || !input) return;

            const gunakanTanggal = mode === 'tertentu';

            wrapper.hidden = !gunakanTanggal;
            input.disabled = !gunakanTanggal;

            if (!gunakanTanggal) {
                input.value = '';
            } else if (!input.value) {
                input.value = new Date().toLocaleDateString('en-CA');
            }
        });


        $('jmFilters')?.addEventListener('submit', (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            openJournalMonitoring(Object.fromEntries(form.entries()));
        });

        document.querySelectorAll('[data-jm-detail]').forEach((btn) => {
            btn.addEventListener('click', () => openJournalDetail(btn.dataset.jmDetail));
        });
    }

    // Panel detail jurnal monitoring — baca-saja, tanpa aksi edit atau finalisasi.
    async function openJournalDetail(journalId) {
        let journal;
        try {
            const result = await api(`/api/v1/admin/journal-monitoring/${journalId}`);
            journal = result.data;
        } catch (error) {
            setFeature('Detail Jurnal', `<div class="alert alert-danger">${htmlSafe(error.message)}</div>
                <button class="btn btn-outline-secondary btn-sm" id="jmBack">← Kembali ke daftar</button>`);
            $('jmBack')?.addEventListener('click', () => openJournalMonitoring(jmLastFilters));
            return;
        }

        const statusBadge = {
            draft: '<span class="badge bg-warning text-dark">Draft</span>',
            final: '<span class="badge bg-success">Final</span>',
            finalisasi_susulan: '<span class="badge bg-info text-dark">Finalisasi Susulan</span>',
            kedaluwarsa: '<span class="badge bg-danger">Kedaluwarsa</span>',
        };

        const fmtDt = (val) => val ? new Date(val).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '<span class="text-secondary fst-italic">Belum diisi</span>';
        const fmtStr = (val) => val ? htmlSafe(val) : '<span class="text-secondary fst-italic">Belum diisi</span>';

        const lengkapBadge = journal.lengkap
            ? '<span class="badge bg-success">Lengkap</span>'
            : `<span class="badge bg-danger">Belum lengkap (${journal.presensi_count}/${journal.total_siswa} siswa)</span>`;

        const belumLengkapList = (journal.bagian_belum_lengkap || []).length
            ? `<ul class="mb-0 small text-danger">${journal.bagian_belum_lengkap.map((item) => `<li>${htmlSafe(item)}</li>`).join('')}</ul>`
            : '';

        const guruName = htmlSafe(journal.guru?.nama || '—');
        const guruNip = journal.guru?.nip ? `<span class="text-secondary"> · ${htmlSafe(journal.guru.nip)}</span>` : '';
        const gpName = journal.guru_pengganti ? htmlSafe(journal.guru_pengganti.nama) : null;
        const kelasName = htmlSafe(journal.kelas?.nama_kelas || '—');
        const mapelName = htmlSafe(journal.mata_pelajaran?.nama_mapel || '—');
        const jadwalWaktu = journal.jam_mulai && journal.jam_selesai
            ? `${htmlSafe(journal.jam_mulai)}–${htmlSafe(journal.jam_selesai)}`
            : '—';

        const presensiRows = (journal.presensi_siswas || []).map((p,index) => {
            const statusColors = { HADIR: 'success', SAKIT: 'info', IZIN: 'warning', ALPHA: 'danger', CABUT: 'secondary' };
            const color = statusColors[p.status] || 'secondary';
            return `<tr>
                <td>${index + 1}</td>
                <td>${htmlSafe(p.siswa?.nama || '—')}</td>
                <td><span class="badge bg-${color}">${htmlSafe(p.status)}</span></td>
                <td>${htmlSafe(p.keterangan || '—')}</td>
            </tr>`;
        }).join('') || `<tr><td colspan="4" class="text-center text-secondary py-3">Belum ada presensi dicatat.</td></tr>`;

        const gpsInfo = journal.jarak_geofence_finalisasi != null
            ? `${htmlSafe(String(Math.round(journal.jarak_geofence_finalisasi)))} m dari lokasi sekolah`
            : '<span class="text-secondary fst-italic">Belum diisi</span>';

        const finalisasiWaktu = journal.status_sesi === 'final' && journal.jam_selesai_realisasi
            ? fmtDt(journal.jam_selesai_realisasi)
            : '<span class="text-secondary fst-italic">Belum difinalisasi</span>';

        const content = `
            <button class="btn btn-outline-secondary btn-sm mb-3" id="jmBack"><i class="bi bi-arrow-left me-1"></i>Kembali ke daftar</button>
            <div class="alert alert-info small mb-3">
                <i class="bi bi-info-circle me-1"></i>Data ini bersifat <strong>read-only</strong>.
                Guru dapat melanjutkan atau memfinalisasi jurnal melalui fitur E-Jurnal masing-masing.
            </div>
            <section class="card mb-3">
                <div class="card-header"><strong>Identitas Jurnal</strong></div>
                <div class="card-body">
                    <dl class="row mb-0">
                        <dt class="col-sm-4">Guru pengajar</dt>
                        <dd class="col-sm-8">${guruName}${guruNip}</dd>
                        ${gpName ? `<dt class="col-sm-4">Guru pengganti</dt><dd class="col-sm-8">${gpName}</dd>` : ''}
                        <dt class="col-sm-4">Kelas</dt>
                        <dd class="col-sm-8">${kelasName}</dd>
                        <dt class="col-sm-4">Mata pelajaran</dt>
                        <dd class="col-sm-8">${mapelName}</dd>
                        <dt class="col-sm-4">Tanggal kegiatan</dt>
                        <dd class="col-sm-8">${formatTanggal(journal.tanggal)}</dd>
                        <dt class="col-sm-4">Waktu jadwal</dt>
                        <dd class="col-sm-8">${jadwalWaktu}</dd>
                        <dt class="col-sm-4">Status jurnal</dt>
                        <dd class="col-sm-8">${statusBadge[journal.status_sesi] || htmlSafe(journal.status_sesi)}</dd>
                        <dt class="col-sm-4">Kelengkapan</dt>
                        <dd class="col-sm-8">${lengkapBadge}${belumLengkapList ? `<div class="mt-1">${belumLengkapList}</div>` : ''}</dd>
                    </dl>
                </div>
            </section>
            <section class="card mb-3">
                <div class="card-header"><strong>Isi Jurnal</strong></div>
                <div class="card-body">
                    <dl class="row mb-0">
                        <dt class="col-sm-4">Materi pembahasan</dt>
                        <dd class="col-sm-8">${fmtStr(journal.materi_pembahasan)}</dd>
                        <dt class="col-sm-4">Catatan kejadian kelas</dt>
                        <dd class="col-sm-8">${fmtStr(journal.catatan_kejadian_kelas)}</dd>
                        <dt class="col-sm-4">Foto kegiatan</dt>
                        <dd class="col-sm-8">${journal.has_foto ? '<span class="badge bg-success">Tersedia</span>' : '<span class="text-secondary fst-italic">Belum diisi</span>'}</dd>
                        <dt class="col-sm-4">Catatan penutupan</dt>
                        <dd class="col-sm-8">${fmtStr(journal.catatan_penutupan)}</dd>
                    </dl>
                </div>
            </section>
            <section class="card mb-3">
                <div class="card-header"><strong>Waktu Pelaksanaan &amp; GPS</strong></div>
                <div class="card-body">
                    <dl class="row mb-0">
                        <dt class="col-sm-4">Mulai sesi (realisasi)</dt>
                        <dd class="col-sm-8">${fmtDt(journal.jam_mulai_realisasi)}</dd>
                        <dt class="col-sm-4">Selesai / Finalisasi</dt>
                        <dd class="col-sm-8">${finalisasiWaktu}</dd>
                        <dt class="col-sm-4">Jarak GPS finalisasi</dt>
                        <dd class="col-sm-8">${gpsInfo}</dd>
                    </dl>
                </div>
            </section>
            <section class="card mb-3">
                <div class="card-header"><strong>Presensi Siswa</strong> <span class="badge bg-secondary ms-1">${journal.presensi_count || 0} / ${journal.total_siswa || 0}</span></div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-sm table-hover align-middle mb-0">
                            <thead><tr><th>No.</th><th>Nama Siswa</th><th>Status</th><th>Keterangan</th></tr></thead>
                            <tbody>${presensiRows}</tbody>
                        </table>
                    </div>
                </div>
            </section>
            <section class="card mb-3">
                <div class="card-header"><strong>Riwayat Waktu</strong></div>
                <div class="card-body">
                    <dl class="row mb-0">
                        <dt class="col-sm-4">Dibuat</dt>
                        <dd class="col-sm-8">${fmtDt(journal.created_at)}</dd>
                        <dt class="col-sm-4">Diperbarui</dt>
                        <dd class="col-sm-8">${fmtDt(journal.updated_at)}</dd>
                    </dl>
                </div>
            </section>`;

        setFeature('Detail Jurnal', content);
        $('jmBack')?.addEventListener('click', () => openJournalMonitoring(jmLastFilters));
    }

    const userAccess = window.createAksaraUserAccess({ $, api, htmlSafe, setFeature, setFeatureError, showToast, token });

    // Form pengaturan sekolah menyatukan konfigurasi geofence, jadwal presensi, dan batas akurasi GPS.
    // Semua nilai yang berubah akan dikirim ke API admin/settings dan disimpan ke table settings.
    // Memuat form pengaturan sekolah untuk geofence, GPS, semester aktif, dan jam presensi harian.
    async function openSettings() {
        const result = await api('/api/v1/admin/settings');
        const settings = Object.fromEntries((result.data || []).map((setting) => [setting.key, setting.value]));
        const fields = [
            ['geofence_latitude', 'Latitude sekolah', 'number'], ['geofence_longitude', 'Longitude sekolah', 'number'],
            ['geofence_radius_meters', 'Radius geofence (meter)', 'number'],
            ['attendance_gps_accuracy_meters', 'Batas akurasi GPS presensi (meter)', 'number'],
            ['journal_gps_accuracy_meters', 'Batas akurasi GPS jurnal (meter)', 'number'],
            ['semester_start_date', 'Tanggal awal semester', 'date'], ['active_semester', 'Semester aktif', 'select'],
            ['school_name', 'Nama sekolah', 'text'], ['is_geofence_strict', 'Mode strict geofence', 'select'],
        ];
        const attendanceSchedule = result.attendance_schedule || [];
        const scheduleRows = attendanceSchedule.map((schedule) => `<tr><th scope="row" class="align-middle">${htmlSafe(schedule.hari)}</th><td><input class="form-control" type="time" name="attendance_jam_masuk_mulai[${htmlSafe(schedule.hari)}]" value="${htmlSafe(schedule.jam_masuk_mulai || '')}" aria-label="Awal absen masuk ${htmlSafe(schedule.hari)}"></td><td><input class="form-control" type="time" name="attendance_jam_masuk_akhir[${htmlSafe(schedule.hari)}]" value="${htmlSafe(schedule.jam_masuk_akhir)}" required aria-label="Batas terlambat masuk ${htmlSafe(schedule.hari)}"></td><td><input class="form-control" type="time" name="attendance_jam_pulang_mulai[${htmlSafe(schedule.hari)}]" value="${htmlSafe(schedule.jam_pulang_mulai || '')}" aria-label="Awal absen pulang ${htmlSafe(schedule.hari)}"></td><td><input class="form-control" type="time" name="attendance_jam_pulang_akhir[${htmlSafe(schedule.hari)}]" value="${htmlSafe(schedule.jam_pulang_akhir || '')}" aria-label="Batas akhir absen pulang ${htmlSafe(schedule.hari)}"></td></tr>`).join('');
        setFeature('Pengaturan Sekolah', `<form class="admin-form" id="settingsForm" novalidate><div id="settingsFeedback" class="alert d-none" role="alert" aria-live="polite"></div><div class="row g-3 admin-form-grid">${fields.map(([key, label, type]) => `<div class="col-sm-12"><label class="form-label">${label}</label>${type === 'select' ? `<select class="form-select" name="${key}">${(key === 'active_semester' ? [['Ganjil', 'Ganjil'], ['Genap', 'Genap']] : [['0', 'Tidak strict'], ['1', 'Strict']]).map(([v, l]) => `<option value="${v}" ${String(settings[key]) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>` : `<input class="form-control" name="${key}" type="${type}" value="${htmlSafe(settings[key])}" ${['geofence_latitude', 'geofence_longitude'].includes(key) ? 'step="any" inputmode="decimal"' : ['attendance_gps_accuracy_meters', 'journal_gps_accuracy_meters'].includes(key) ? 'min="1" max="100" step="1" inputmode="numeric"' : ''} ${['geofence_latitude', 'geofence_longitude'].includes(key) ? '' : 'required'}>`}</div>`).join('')}<div class="col-sm-12 form-span-all"><p class="form-text">Koordinat boleh dikosongkan jika belum diatur. Jika mengubah lokasi, isi latitude dan longitude bersama-sama.</p></div><div class="col-sm-12 form-span-all"><section class="border rounded p-3"><h2 class="h6 mb-1">Jadwal presensi harian</h2><p class="small text-secondary mb-3">Sebelum jam awal masuk, tombol absen belum bisa digunakan. Setelah batas masuk dihitung terlambat. Pulang sebelum awal atau setelah akhir jadwal tetap tercatat dengan status khusus dan wajib disertai alasan.</p><div class="table-responsive"><table class="table table-sm align-middle mb-0" style="min-width: 780px"><thead><tr><th>Hari</th><th>Awal masuk</th><th>Batas terlambat</th><th>Awal pulang</th><th>Akhir pulang</th></tr></thead><tbody>${scheduleRows}</tbody></table></div></section></div><div class="col-sm-12 form-span-all"><div class="alert alert-warning small">Status koordinat: <strong>${String(settings.geofence_location_verified) === '1' ? 'terverifikasi' : 'belum terverifikasi'}. </strong>Jika Anda telah memeriksa lokasi sekolah secara langsung, centang konfirmasi berikut.</div><label class="form-check"><input class="form-check-input" name="confirm_geofence_location" type="checkbox"><span class="form-check-label">Saya sudah memverifikasi koordinat lokasi sekolah</span></label></div><div class="col-sm-12 form-actions"><button class="btn btn-primary" type="submit">Simpan pengaturan</button></div></div></form>`);
        const settingsFeedback = $('settingsFeedback');
        const showSettingsError = (message) => {
            settingsFeedback.textContent = message || 'Pengaturan gagal disimpan. Periksa data dan coba lagi.';
            settingsFeedback.className = 'alert alert-danger';
            settingsFeedback.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
        $('settingsForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            settingsFeedback.className = 'alert d-none';
            if (!event.currentTarget.checkValidity()) {
                const invalidField = event.currentTarget.querySelector(':invalid');
                showSettingsError('Periksa kembali kolom wajib dan format angka atau tanggal.');
                invalidField?.focus();
                return;
            }
            const formData = new FormData(event.currentTarget);
            const form = Object.fromEntries([...formData.entries()].filter(([key]) => !key.startsWith('attendance_')));
            form.attendance_gps_accuracy_meters = formData.get('attendance_gps_accuracy_meters');
            form.journal_gps_accuracy_meters = formData.get('journal_gps_accuracy_meters');
            form.attendance_schedule = attendanceSchedule.map((schedule) => ({
                hari: schedule.hari,
                jam_masuk_mulai: formData.get(`attendance_jam_masuk_mulai[${schedule.hari}]`) || null,
                jam_masuk_akhir: formData.get(`attendance_jam_masuk_akhir[${schedule.hari}]`),
                jam_pulang_mulai: formData.get(`attendance_jam_pulang_mulai[${schedule.hari}]`) || null,
                jam_pulang_akhir: formData.get(`attendance_jam_pulang_akhir[${schedule.hari}]`) || null,
            }));
            const hasLatitude = String(form.geofence_latitude || '').trim() !== '';
            const hasLongitude = String(form.geofence_longitude || '').trim() !== '';
            if (hasLatitude !== hasLongitude) {
                showSettingsError('Isi latitude dan longitude sekolah bersama-sama.');
                return;
            }
            if (hasLatitude) {
                form.geofence_latitude = Number(form.geofence_latitude);
                form.geofence_longitude = Number(form.geofence_longitude);
            } else {
                delete form.geofence_latitude;
                delete form.geofence_longitude;
            }
            form.geofence_radius_meters = Number(form.geofence_radius_meters);
            form.attendance_gps_accuracy_meters = Number(form.attendance_gps_accuracy_meters);
            form.journal_gps_accuracy_meters = Number(form.journal_gps_accuracy_meters);
            form.is_geofence_strict = form.is_geofence_strict === '1';
            form.confirm_geofence_location = form.confirm_geofence_location === 'on';
            try {
                await api('/api/v1/admin/settings', { method: 'PUT', body: { settings: form } });
                showToast('Pengaturan diperbarui.');
                openSettings().catch((error) => showSettingsError(`Pengaturan tersimpan, tetapi gagal memuat ulang data: ${error.message}`));
            } catch (error) {
                showSettingsError(error.message);
            }
        });
    }

    // Menangani routing modul berdasarkan permission dan key menu yang dipilih dari user dashboard.
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
            if (module.key === 'substitute-approvals') return openSubstituteApprovals();
            if (module.key === 'journal-monitoring') return openJournalMonitoring();
            if (module.key === 'wali-class-dashboard') return openWaliDashboard();
            if (module.key === 'wali-class-students') return openWaliClassPicker('students');
            if (module.key === 'wali-class-schedules') return openWaliClassPicker('schedules');
            if (module.key === 'wali-class-attendance') return openWaliClassPicker('attendance');
            if (module.key === 'student-attendance') return openWaliSessions();
            if (module.key === 'student-attendance-report') return adminReports.open('student-monthly', { dedicatedStudent: true });
            if (module.key === 'settings') return openSettings();
        } catch (error) { setFeature(module.title, `<div class="alert alert-danger mb-0">${htmlSafe(error.message)}</div>`); }
    }

    // Menampilkan monitoring pembelajaran untuk mengecek jumlah jadwal, jurnal, dan presensi pada tanggal tertentu.
    async function openMonitoring(filters = {}) {
        const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
        const result = await api(`/api/v1/dashboard/curriculum${params.size ? `?${params}` : ''}`);
        const data = result.data;
        const rows = [
            ['Tahun ajaran', data.tahun_ajaran], ['Semester / siklus', `${data.semester} · ${data.siklus_minggu}`],
            ['Jadwal pada hari ini', data.scheduled_sessions], ['Jurnal tercatat', data.journal_records],
            ['Guru terjadwal', data.scheduled_teachers], ['Guru dengan presensi terverifikasi', data.present_scheduled_teachers],
            ['Presensi menunggu verifikasi', data.flagged_attendances], ['Agenda override KBM', data.school_agenda_overrides],
        ];
        setFeature('Monitoring Pembelajaran', `<form id="monitoringFilters" class="card mb-3 admin-form-card"><div class="card-body"><div class="row g-3 admin-form-grid"><div class="col-sm-12"><label class="form-label">Tanggal</label><input class="form-control" type="date" name="date" value="${htmlSafe(formatTanggal(data.date))}"></div><div class="col-sm-12"><label class="form-label">Tahun ajaran</label><select class="form-select" name="tahun_ajaran_id"><option value="">Tahun aktif</option>${data.available_years.map((year) => `<option value="${year.id}" ${String(year.id) === String(filters.tahun_ajaran_id || '') ? 'selected' : ''}>${htmlSafe(year.tahun_ajaran)}${year.is_active ? ' (aktif)' : ''}</option>`).join('')}</select></div><div class="col-sm-12"><label class="form-label">Semester</label><select class="form-select" name="semester"><option value="">Default aktif</option><option ${String(filters.semester || '') === 'Ganjil' ? 'selected' : ''}>Ganjil</option><option ${String(filters.semester || '') === 'Genap' ? 'selected' : ''}>Genap</option></select></div><div class="col-sm-12 form-actions"><button class="btn btn-outline-success">Terapkan filter</button></div></div></div></form><div class="alert alert-info">Angka di bawah adalah hitungan sumber untuk tanggal ${htmlSafe(formatTanggal(data.date))}. Persentase KPI menunggu rumus resmi.</div><div class="row g-3">${rows.map(([label, value]) => `<div class="col col-lg-4 col-md-6 col-sm-12"><div class="card"><div class="card-body d-flex justify-content-between"><span>${htmlSafe(label)}</span><strong>${htmlSafe(value)}</strong></div></div></div>`).join('')}</div>`);
        $('monitoringFilters').addEventListener('submit', (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); openMonitoring(Object.fromEntries(form.entries())); });
    }

    // Menampilkan daftar kasus discrepancy dan menyediakan tombol resolve atau review untuk admin.
    async function openDiscrepancies() {
        const result = await api('/api/v1/discrepancy-cases');
        const cases = result.data?.data || [];
        const note = result.meta?.note || 'Tidak ada kasus tersimpan.';
        setFeature('Audit Pembelajaran', `<div class="alert alert-warning">${htmlSafe(note)}</div>${cases.length ? `<div class="list-group">${cases.map((item) => `<article class="list-group-item"><div class="d-flex justify-content-between"><strong>${htmlSafe(item.title)}</strong><span>${htmlSafe(item.status)}</span></div><div class="small text-secondary">${htmlSafe(formatTanggal(item.tanggal))} · ${htmlSafe(item.type)}</div><p class="small mb-2">${htmlSafe(item.description)}</p>${item.status === 'OPEN' || item.status === 'IN_REVIEW' ? `<div class="input-group input-group-sm"><input class="form-control" id="note-${item.id}" placeholder="Catatan penyelesaian"><button class="btn btn-outline-success" data-resolve="${item.id}">Tandai selesai</button><button class="btn btn-outline-secondary" data-review="${item.id}">Tinjau</button></div>` : ''}</article>`).join('')}</div>` : '<p class="text-center text-secondary">Belum ada kasus actionable tersimpan.</p>'}`);
        document.querySelectorAll('[data-resolve]').forEach((button) => button.addEventListener('click', async () => {
            try { await api(`/api/v1/discrepancy-cases/${button.dataset.resolve}`, { method: 'PATCH', body: { status: 'RESOLVED', resolution_note: $(`note-${button.dataset.resolve}`).value } }); openDiscrepancies(); }
            catch (error) { showToast(error.message); }
        }));
        document.querySelectorAll('[data-review]').forEach((button) => button.addEventListener('click', async () => {
            try { await api(`/api/v1/discrepancy-cases/${button.dataset.review}`, { method: 'PATCH', body: { status: 'IN_REVIEW' } }); openDiscrepancies(); }
            catch (error) { showToast(error.message); }
        }));
    }

    // Mengubah halaman aktif pada dashboard utama dan menyiapkan event agar panel sesuai dengan view yang dipilih.
    function setPage(page) {
        if (!['home', 'leave', 'notifications', 'reports', 'profile', 'wali-class'].includes(page)) page = 'home';
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
    $('openWaliClassDashboard')?.addEventListener('click', () => openWaliDashboard().catch((error) => setWaliPage('Dashboard Wali Kelas', `<div class="alert alert-danger mb-0">${htmlSafe(error.message)}</div>`)));
    $('waliClassBackHome')?.addEventListener('click', () => setPage('home'));
    $('returnHome')?.addEventListener('click', leaveAdminDashboard);
    $('adminSidebarToggle')?.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
    $('adminSidebarBackdrop')?.addEventListener('click', () => document.body.classList.remove('sidebar-open'));
    document.querySelectorAll('[data-admin-action]').forEach((button) => button.addEventListener('click', () => {
        document.body.classList.remove('sidebar-open');
        adminAction(button.dataset.adminAction);
    }));
    $('checkIn')?.addEventListener('click', async () => {
        await teacherAttendance.refreshAttendance();
        if (!$('checkIn').disabled) teacherAttendance.attendanceDialog('check-in');
        else showToast($('attendanceState').textContent);
    });
    $('checkOut')?.addEventListener('click', async () => {
        await teacherAttendance.refreshAttendance();
        if (!$('checkOut').disabled) teacherAttendance.attendanceDialog('check-out');
        else showToast($('attendanceState').textContent);
    });
    $('openLeavePageButton')?.addEventListener('click', () => openMyLeaveRequests().catch((error) => {
        setPage('leave');
        $('leavePageContent').innerHTML = `<div class="alert alert-danger">${htmlSafe(error.message)}</div>`;
    }));
    $('leaveBackButton')?.addEventListener('click', () => setPage('home'));
    $('leavePageRequestButton')?.addEventListener('click', () => openLeave(true));
    $('leavePageHistoryButton')?.addEventListener('click', () => openMyLeaveRequests().catch((error) => {
        $('leavePageContent').innerHTML = `<div class="alert alert-danger">${htmlSafe(error.message)}</div>`;
    }));
    const dateFormatter = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
    const clockFormatter = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Jakarta' });
    // Memperbarui jam dan tanggal di header aplikasi agar user selalu melihat waktu lokal yang akurat.
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

    // Menyusun daftar menu yang tersedia sesuai role dan permission pengguna agar dashboard terasa dinamis.
    function renderRoleModules(user) {
        const roles = Array.isArray(user.roles) ? user.roles.map((role) => String(typeof role === 'string' ? role : role.name).toLowerCase()) : [];
        activeRoleNames = roles;
        const permissions = new Set(Array.isArray(user.permissions) ? user.permissions : []);
        const is = (role) => roles.includes(role);
        const has = (permission) => permissions.has(permission);
        const canSubmitLeave = has('ajukan-pengajuan-izin') || roles.some((role) => ['guru', 'tendik', 'admin', 'kurikulum'].includes(role));
        const modules = [];
        const add = (key, permission, icon, title, description, condition = true) => {
            if (condition && has(permission) && !modules.some((module) => module.key === key)) modules.push({ key, icon, title, description });
        };

        if (is('guru') && Boolean(user.is_wali_kelas)) {
            add('wali-class-dashboard', 'kelola-presensi-siswa', 'bi-speedometer2', 'Dashboard Wali Kelas', 'Ringkasan kelas perwalian dan akses cepat fitur wali kelas.');
            add('wali-class-students', 'kelola-presensi-siswa', 'bi-people', 'Data Siswa Wali Kelas', 'Lihat daftar siswa pada kelas yang ditugaskan.');
            add('wali-class-schedules', 'kelola-presensi-siswa', 'bi-calendar-week', 'Jadwal Kelas Perwalian', 'Lihat jadwal pembelajaran kelas perwalian.');
            add('wali-class-attendance', 'kelola-presensi-siswa', 'bi-clipboard-data', 'Rekap Presensi Siswa', 'Lihat rekap bulanan presensi siswa per kelas.');
            add('student-attendance', 'kelola-presensi-siswa', 'bi-clipboard-check', 'Koreksi Presensi Siswa', 'Lihat dan koreksi presensi pada kelas yang ditugaskan.');
        }
        if (is('kurikulum')) {
            add('student-attendance-report', 'view-dashboard-kurikulum', 'bi-people-fill', 'Laporan Presensi Siswa', 'Rekap kehadiran siswa per bulan dan kelas.');
            add('substitute-approvals', 'view-dashboard-kurikulum', 'bi-person-badge', 'Guru Pengganti', 'Tinjau dan setujui delegasi guru pengganti.');
            add('monitoring', 'view-dashboard-kurikulum', 'bi-bar-chart-line', 'Monitoring Pembelajaran', 'Lihat jumlah jadwal, jurnal, dan presensi hari ini.');
            add('journal-monitoring', 'view-dashboard-kurikulum', 'bi-journal-check', 'Monitoring E-Jurnal', 'Pantau status jurnal mengajar guru berdasarkan tanggal kegiatan.');
            add('discrepancy', 'view-audit-discrepancy', 'bi-clipboard2-data', 'Audit Pembelajaran', 'Tinjau dan tindak lanjuti kasus yang tersedia.');
            add('academic-master', 'kelola-master-data', 'bi-database', 'Master Data Akademik', 'Kelola kelas, siswa, mapel, materi, dan jadwal.');
            add('years', 'kelola-tahun-ajaran', 'bi-calendar3', 'Tahun Ajaran', 'Buat tahun ajaran dan aktifkan melalui sinkronisasi.');
            add('lesson-calendar', 'kelola-master-data', 'bi-calendar2-week', 'Kalender Jam Pelajaran', 'Atur periode waktu pelajaran dan aktifkan kalender sekolah.');
            add('agendas', 'kelola-agenda-sekolah', 'bi-calendar-event', 'Agenda Sekolah', 'Kelola agenda sekolah dan override KBM.');
            add('holidays', 'kelola-agenda-sekolah', 'bi-calendar2-x', 'Kalender Hari Libur', 'Atur libur nasional, cuti bersama, dan libur sekolah.');
        }
        if (is('kepsek')) {
            add('substitute-approvals', 'kelola-pengajuan-izin', 'bi-person-badge', 'Guru Pengganti', 'Tinjau dan setujui delegasi guru pengganti.');
            add('monitoring', 'view-dashboard-kurikulum', 'bi-speedometer2', 'Dashboard Eksekutif', 'Lihat jumlah jadwal, jurnal, dan presensi hari ini.');
            add('journal-monitoring', 'view-dashboard-kurikulum', 'bi-journal-check', 'Monitoring E-Jurnal', 'Pantau status jurnal mengajar guru berdasarkan tanggal kegiatan.');
            add('discrepancy', 'view-audit-discrepancy', 'bi-clipboard2-data', 'Audit Pembelajaran', 'Tinjau dan tindak lanjuti kasus yang tersedia.');
            add('leave-approvals', 'kelola-pengajuan-izin', 'bi-file-earmark-check', 'Persetujuan Perizinan', 'Verifikasi pengajuan cuti dan dinas guru.');
        }
        if (is('admin')) {
            add('admin-users', 'kelola-master-data', 'bi-person-gear', 'Kelola User & Akses', 'Kelola akun, reset kata sandi, role, dan permission.');
            add('student-attendance-report', 'view-dashboard-kurikulum', 'bi-people-fill', 'Laporan Presensi Siswa', 'Rekap kehadiran siswa per bulan dan kelas.');
            add('substitute-approvals', 'kelola-master-data', 'bi-person-badge', 'Guru Pengganti', 'Tinjau dan setujui delegasi guru pengganti.');
            add('journal-monitoring', 'kelola-master-data', 'bi-journal-check', 'Monitoring E-Jurnal', 'Pantau status jurnal mengajar guru berdasarkan tanggal kegiatan.');
            add('flagged', 'review-absensi-flagged', 'bi-shield-check', 'Moderasi Presensi', 'Tinjau foto presensi masuk dan pulang yang belum diverifikasi.');
            add('academic-master', 'kelola-master-data', 'bi-database', 'Master Data Akademik', 'Kelola kelas, siswa, mapel, materi, dan jadwal.');
            add('years', 'kelola-tahun-ajaran', 'bi-calendar3', 'Tahun Ajaran', 'Buat tahun ajaran dan aktivasi tersinkron.');
            add('lesson-calendar', 'kelola-master-data', 'bi-calendar2-week', 'Kalender Jam Pelajaran', 'Atur periode waktu pelajaran dan aktifkan kalender sekolah.');
            add('agendas', 'kelola-agenda-sekolah', 'bi-calendar-event', 'Agenda Sekolah', 'Kelola agenda sekolah dan override KBM.');
            add('holidays', 'kelola-agenda-sekolah', 'bi-calendar2-x', 'Kalender Hari Libur', 'Atur libur nasional, cuti bersama, dan libur sekolah.');
            add('monitoring', 'view-dashboard-kurikulum', 'bi-bar-chart-line', 'Monitoring Pembelajaran', 'Lihat jumlah jadwal, jurnal, dan presensi hari ini.');
            add('discrepancy', 'view-audit-discrepancy', 'bi-clipboard2-data', 'Audit Pembelajaran', 'Tinjau dan tindak lanjuti kasus yang tersedia.');
            add('leave-approvals', 'kelola-pengajuan-izin', 'bi-file-earmark-check', 'Persetujuan Perizinan', 'Tinjau pengajuan izin guru.');
            add('settings', 'kelola-master-data', 'bi-sliders', 'Pengaturan Sekolah', 'Atur geofence, semester aktif, dan batas presensi.');
        }

        if (canSubmitLeave && !is('tendik') && !is('admin')&& !modules.some((module) => module.key === 'leave-submit')) {
            modules.push({ key: 'leave-submit', icon: 'bi-file-earmark-plus', title: 'Pengajuan Izin', description: 'Ajukan cuti atau dinas dan pantau status permohonan.' });
        }

        dashboardModules = modules;
        const canAdminDashboard = is('admin') || is('kurikulum');
        document.body.classList.toggle('kepsek-dashboard', is('kepsek') && !canAdminDashboard);
        $('adminDashboardEntry').hidden = !canAdminDashboard;
        $('waliClassDashboardEntry').hidden = !(Boolean(user.is_wali_kelas) && has('kelola-presensi-siswa'));
        $('teacherLeaveCard').hidden = !canSubmitLeave;
        const hideRoleDashboard = canAdminDashboard || is('guru');
        $('roleIntro').hidden = hideRoleDashboard;
        $('roleModules').hidden = hideRoleDashboard;
        const sidebarGroups = {
            operational: new Set(['wali-class-dashboard', 'wali-class-students', 'wali-class-schedules', 'wali-class-attendance', 'student-attendance', 'student-attendance-report', 'substitute-approvals', 'monitoring', 'journal-monitoring', 'discrepancy', 'flagged', 'leave-approvals', 'leave-submit']),
            calendar: new Set(['years', 'lesson-calendar', 'agendas', 'holidays']),
            administration: new Set(['admin-users', 'settings'])
        };
        const renderSidebarGroup = (elementId, items) => {
            $(elementId).innerHTML = items.map((module) => `<button class="admin-side-link" data-admin-action="${htmlSafe(module.key)}"><i class="bi ${htmlSafe(module.icon)}"></i> ${htmlSafe(module.title)}</button>`).join('');
        };
        const orderedModules = (keys) => keys.map((key) => modules.find((module) => module.key === key)).filter(Boolean);
        renderSidebarGroup('adminSideOperational', orderedModules(['wali-class-dashboard', 'wali-class-students', 'wali-class-schedules', 'wali-class-attendance', 'student-attendance', 'flagged', 'journal-monitoring', 'monitoring', 'substitute-approvals', 'leave-approvals', 'discrepancy', 'leave-submit']));
        renderSidebarGroup('adminSideCalendar', orderedModules(['years', 'lesson-calendar', 'agendas', 'holidays']));
        renderSidebarGroup('adminSideAdministration', orderedModules(['admin-users', 'settings']));
        ['adminSideOperational', 'adminSideCalendar', 'adminSideAdministration'].forEach((elementId) => {
            $(elementId).querySelectorAll('[data-admin-action]').forEach((button) => button.addEventListener('click', () => {
                document.body.classList.remove('sidebar-open');
                adminAction(button.dataset.adminAction);
            }));
        });
        window.addEventListener('aksara:open-substitutes', () => {
            openSubstituteApprovals();
        });
        window.addEventListener('aksara:open-journal-monitoring', () => {
            openJournalMonitoring();
        });

        const labels = { guru: 'Dashboard Guru', kurikulum: 'Dashboard Kurikulum', kepsek: 'Dashboard Kepala Sekolah', admin: 'Dashboard Admin / TU' };
        const dashboardLabel = ['admin', 'kurikulum', 'kepsek', 'guru'].filter((role) => is(role)).map((role) => labels[role]);
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

        if (is('tendik')) {
            $('roleIntro').remove();
            $('roleModules').remove();
        }
    }

    // Memuat profil user aktif, memvalidasi token, dan menyusun state dashboard sesuai role yang dimiliki.
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
            if ($('checkIn') && $('checkOut') && $('attendanceState')) {
                teacherAttendance.refreshAttendance();
            }
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
