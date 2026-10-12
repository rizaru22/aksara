# Dokumentasi Pengembangan AKSARA

Dokumen ini menjelaskan alur pengembangan dari hulu ke hilir untuk fitur utama aplikasi: presensi guru, jurnal mengajar, geofence, dan pengaturan sistem. Fokusnya adalah memetakan hubungan antara endpoint API, controller Laravel, model, table settings, serta file JavaScript di sisi UI.

## 1. Tujuan Dokumentasi

Tujuan utama dari dokumen ini adalah:

- Menjelaskan alur kerja fitur dari sisi pengguna sampai ke penyimpanan data.
- Mencatat file program yang terlibat pada setiap fitur.
- Menjamin bahwa setiap perubahan implementasi memiliki konteks teknis yang jelas.
- Menjadi acuan saat debug, maintenance, dan pengembangan fitur lanjutan.

---

## 2. Arsitektur Umum Sistem

AKSARA adalah aplikasi berbasis Laravel dengan antarmuka dashboard berpola JavaScript vanilla. Alur umum aplikasi adalah:

1. User membuka dashboard di `public/dashboard.html`.
2. JavaScript di `public/js/*.js` memanggil endpoint API di `routes/api.php`.
3. Controller di `app/Http/Controllers/Api/*` memvalidasi request, memproses bisnis logic, dan mengakses model.
4. Model di `app/Models/*` merepresentasikan struktur tabel database.
5. Data setting seperti geofence dan batas akurasi GPS tersimpan di tabel `settings` melalui `Setting::put()` atau `Setting::value()`.

### Ringkasan file inti

- `routes/api.php` : definisi endpoint utama.
- `public/dashboard.html` : entry point UI dashboard.
- `public/js/dashboard.js` : orchestrator frontend dashboard.
- `public/js/presensi_guru.js` : alur absensi guru termasuk GPS, geofence, liveness, kamera.
- `public/js/jurnal_bukti.js` : proses pengambilan bukti, GPS, dan finalisasi jurnal.
- `app/Http/Controllers/Api/TeacherAttendanceController.php` : logika absensi guru.
- `app/Http/Controllers/Api/LessonJournalController.php` : logika draf dan finalisasi jurnal.
- `app/Http/Controllers/Api/AdminSettingsController.php` : form pengaturan admin.
- `app/Models/JurnalMengajar.php` : model jurnal.
- `database/seeders/SettingSeeder.php` : definisi setting default.
- `config/aksara.php` : konfigurasi lingkungan default, termasuk fallback GPS.

---

## 3. Fitur 1: Presensi Guru

### 3.1. Alur hulu ke hilir

User flow:

1. User membuka dashboard di `public/dashboard.html`.
2. `public/js/dashboard.js` memanggil `window.createAksaraTeacherAttendance(...)`.
3. `public/js/presensi_guru.js` melakukan refresh status hari ini dengan endpoint:
   - `GET /api/v1/teacher/attendance/today`
4. Endpoint diproses oleh `TeacherAttendanceController::today()`.
5. Controller memanggil helper internal seperti:
   - `maxGpsAccuracyMeters()`
   - `holidayForDate()`
   - `approvedLeaveForDate()`
   - `checkInStartAt()`
6. Data status diproses lalu dikirim kembali ke frontend untuk menampilkan tombol absen masuk/pulang.

### 3.2. Endpoint yang terlibat

- `GET /api/v1/teacher/attendance/today`
- `POST /api/v1/teacher/attendance/location-check`
- `POST /api/v1/teacher/attendance/check-in`
- `POST /api/v1/teacher/attendance/check-out`
- `POST /api/v1/teacher/attendance/{absensi}/corrections`
- `GET /api/v1/admin/flagged-attendances`
- `POST /api/v1/admin/flagged-attendances/{absensi}/review`

### 3.3. File program yang terlibat

- `routes/api.php`
- `public/js/dashboard.js`
- `public/js/presensi_guru.js`
- `app/Http/Controllers/Api/TeacherAttendanceController.php`
- `app/Models/Absensi.php`
- `app/Models/Setting.php`
- `app/Services/HaversineService.php`
- `database/migrations/...` untuk table absensi dan setting GPS

### 3.4. Logic bisnis utama

- `TeacherAttendanceController::today()`
  - mengecek apakah hari libur, ada cuti yang disetujui, atau belum saatnya absen.
- `TeacherAttendanceController::verifyLocation()`
  - melakukan validasi GPS + geofence sebelum foto diambil.
- `TeacherAttendanceController::checkIn()`
  - validasi foto, liveness, akurasi GPS, dan geofence.
- `TeacherAttendanceController::checkOut()`
  - validasi pulang dengan syarat jam pulang, alasan di luar jadwal, dan geofence.
- `TeacherAttendanceController::geofence()`
  - menghitung jarak dari posisi user ke sekolah dan menentukan apakah masuk radius, non-strict, atau reject.

### 3.5. Konfigurasi terhubung

- `attendance_gps_accuracy_meters` : pengaturan batas akurasi presensi.
- `geofence_radius_meters` : radius geofence sekolah.
- `is_geofence_strict` : mode strict atau flag-only.
- `geofence_location_verified` : status verifikasi lokasi sekolah.

---

## 4. Fitur 2: Jurnal Mengajar

### 4.1. Alur hulu ke hilir

User flow:

1. Guru membuka jadwal mengajar di dashboard.
2. `public/js/dashboard.js` menampilkan tombol `Isi jurnal` atau `Lanjutkan draf`.
3. Saat form jurnal dibuka, frontend memanggil alur dari `public/js/jurnal_bukti.js` saat finalisasi.
4. Data draf disimpan melalui:
   - `POST /api/v1/lesson-journals`
5. Saat finalisasi, frontend memanggil:
   - `POST /api/v1/lesson-journals/{jurnalMengajar}/finalize`
6. Controller `LessonJournalController` memvalidasi:
   - foto kegiatan
   - latitude/longitude
   - akurasi GPS
   - radius geofence
   - periode 30 menit terakhir sesi
   - lengkapnya presensi siswa
7. Data disimpan ke model `JurnalMengajar` dan relasi `PresensiSiswa`.

### 4.2. Endpoint yang terlibat

- `GET /api/v1/teacher/schedules/{jadwalPelajaran}/students`
- `POST /api/v1/lesson-journals`
- `GET /api/v1/lesson-journals/{jurnalMengajar}`
- `POST /api/v1/lesson-journals/{jurnalMengajar}/finalize`
- `PATCH /api/v1/student-attendances/{presensiSiswa}`
- `GET /api/v1/student-attendances/wali-sessions`

### 4.3. File program yang terlibat

- `routes/api.php`
- `public/js/dashboard.js`
- `public/js/jurnal_bukti.js`
- `app/Http/Controllers/Api/LessonJournalController.php`
- `app/Models/JurnalMengajar.php`
- `app/Models/PresensiSiswa.php`
- `app/Models/JadwalPelajaran.php`
- `app/Services/CycleScheduleService.php`
- `app/Services/HaversineService.php`

### 4.4. Logic bisnis utama

- `LessonJournalController::store()`
  - membuat atau memperbarui draf jurnal.
  - memastikan semua siswa kelas masuk daftar presensi.
- `LessonJournalController::finalize()`
  - validasi foto, geofence, waktu, dan kelengkapan presensi.
  - menutup draf menjadi status `selesai`.
- `LessonJournalController::authorizeSchedule()`
  - memastikan guru dapat mengakses jadwal yang benar-benar miliknya.
- `LessonJournalController::authorizeFinalizationWindow()`
  - menangani rule 30 menit terakhir dan mode darurat.
- `LessonJournalController::verifyFinalizationLocation()`
  - mengecek apakah lokasi finalisasi masih berada dalam radius sekolah.
- `JurnalMengajar` model
  - menampung data jurnal, foto, koordinat finalisasi, GPS accuracy, jarak geofence, dan status sesi.

### 4.5. Setting terkait

- `journal_gps_accuracy_meters` : batas GPS khusus untuk finalisasi jurnal.
- `attendance_gps_accuracy_meters` : batas GPS untuk presensi harian.
- `geofence_location_verified` : memastikan sekolah sudah punya lokasi yang diverifikasi.

---

## 5. Fitur 3: Geofence dan Pengaturan Sekolah

### 5.1. Alur hulu ke hilir

1. Admin membuka form pengaturan sekolah dari dashboard.
2. `public/js/dashboard.js` memanggil `openSettings()`.
3. Form mengambil data dari endpoint:
   - `GET /api/v1/admin/settings`
4. Data dikirim kembali ke `AdminSettingsController::index()`.
5. Admin menyimpan perubahan ke endpoint:
   - `PUT /api/v1/admin/settings`
6. Controller `AdminSettingsController::update()` memproses validasi dan menulis ke table `settings`.
7. Semua fitur lain yang membaca setting seperti presensi dan jurnal akan memakai hasil pembaruan tersebut.

### 5.2. File program yang terlibat

- `public/js/dashboard.js`
- `app/Http/Controllers/Api/AdminSettingsController.php`
- `database/seeders/SettingSeeder.php`
- `config/aksara.php`
- `app/Models/Setting.php`

### 5.3. Setting yang paling penting

- `geofence_latitude`
- `geofence_longitude`
- `geofence_radius_meters`
- `geofence_location_verified`
- `is_geofence_strict`
- `attendance_gps_accuracy_meters`
- `journal_gps_accuracy_meters`

### 5.4. Logic utama

- `AdminSettingsController::index()`
  - mengambil daftar pengaturan yang bisa diubah admin.
- `AdminSettingsController::update()`
  - validasi data, menulis ke settings, dan menangani geofence verification dengan checkbox konfirmasi.

---

## 6. Pengaturan Nilai GPS dan Fallback

Batas GPS diatur agar tidak hardcoded di JavaScript maupun controller. Strukturnya adalah:

- Setting database diutamakan jika ada.
- Jika tidak ada, fallback memakai konfigurasi di `config/aksara.php`.
- Jika konfigurasi belum ada, nilai default 40 meter dipakai.

### Konfigurasi fallback

File terkait:

- `config/aksara.php`
- `database/migrations/2026_10_12_000001_add_attendance_gps_accuracy_setting.php`
- `database/migrations/2026_10_12_000002_add_journal_gps_accuracy_setting.php`
- `database/seeders/SettingSeeder.php`

### Nilai konfigurasi

- `ATTENDANCE_GPS_ACCURACY_METERS`
- `JOURNAL_GPS_ACCURACY_METERS`

---

## 7. Catatan Pengembangan

Beberapa prinsip yang diterapkan pada fitur ini:

- Frontend bertindak sebagai antarmuka pengguna, bukan sumber kebenaran bisnis.
- Server-side validation tetap menjadi otoritas utama.
- GPS dan geofence harus diuji dengan setting yang benar-benar masuk ke `settings`.
- Finalisasi jurnal harus memisahkan rule presensi dan jurnal agar tidak mengikat semua fitur pada satu nilai yang sama.
- Semua perubahan konfigurasi masuk ke database setting sehingga admin dapat menyesuaikan di runtime tanpa perlu edit source code.

---

## 8. Daftar File yang Bersinggungan dengan Fitur Utama

### UI / Frontend

- `public/dashboard.html`
- `public/js/dashboard.js`
- `public/js/presensi_guru.js`
- `public/js/jurnal_bukti.js`

### Backend / API

- `routes/api.php`
- `app/Http/Controllers/Api/TeacherAttendanceController.php`
- `app/Http/Controllers/Api/LessonJournalController.php`
- `app/Http/Controllers/Api/AdminSettingsController.php`

### Domain / Model

- `app/Models/Absensi.php`
- `app/Models/JurnalMengajar.php`
- `app/Models/PresensiSiswa.php`
- `app/Models/Setting.php`

### Service / Configuration

- `app/Services/HaversineService.php`
- `app/Services/CycleScheduleService.php`
- `config/aksara.php`
- `database/seeders/SettingSeeder.php`

---

## 9. Rincian Lengkap File JavaScript di public/js

Bagian ini melengkapi dokumentasi agar mencakup seluruh modul JavaScript yang ada di folder `public/js`. Tujuannya bukan hanya menjelaskan fitur utama, tetapi juga memetakan setiap file UI dan fungsi-fungsi kunci agar pengembang baru bisa melacak alur kode tanpa harus membuka seluruh project sekaligus.

### 9.1. `public/js/dashboard.js`

File ini adalah orchestrator utama dashboard. Ia berperan sebagai “router UI” yang menyiapkan menu, tipe user, role, fitur admin, serta tindakan untuk membuka modul seperti jadwal, jurnal, pengajuan izin, setelan, dan laporan.

Fungsi utama:

- `api(path, options = {})` : wrapper fetch yang otomatis menambahkan token dan menangani error dari backend.
- `updateUnreadNotificationCount(count)` : menampilkan jumlah notifikasi yang belum dibaca.
- `showToast(message)` : menampilkan notifikasi kecil di UI.
- `renderJournalAction(schedule, visible = true)` : menampilkan tombol aksi jurnal pada jadwal mengajar.
- `openSchedules()` : membuka panel jadwal hari ini.
- `loadHomeSchedules()` : mengambil data jadwal guru dan menampilkan kartu-kartu pelajaran.
- `enterAdminDashboard()` / `leaveAdminDashboard()` : mengaktifkan atau menonaktifkan mode admin dashboard.
- `renderAdminHome()` : menampilkan landing page admin dengan rekap cepat.
- `adminAction(action)` : routing perintah admin ke modul tertentu.
- `openJournalForm(scheduleId, schedule = null)` : membuka form isian jurnal dan relasi finalisasi bukti foto/GPS.
- `openWaliSessions()` : membuka panel sesi wali untuk proses presensi siswa.
- `openLeave(submitMode = false, ...)` : menampilkan daftar cuti/izin dan form pengajuan.
- `openMyLeaveRequests()` : menampilkan riwayat pengajuan izin milik user.
- `openSettings()` : membuka form pengaturan sistem, termasuk GPS dan geofence.
- `openModule(module)` : membuka modul sesuai role dan permission.
- `openMonitoring(filters = {})` : membuka monitoring presensi dan data operational.
- `openDiscrepancies()` : membuka modul discrepancy / ketidaksesuaian data.
- `setPage(page)` : mengubah state halaman aktif di dashboard.
- `updateHeaderDateTime()` : memperbarui jam di header aplikasi.
- `renderRoleModules(user)` : memetakan role user ke menu yang boleh dibuka.
- `loadProfile()` : mengambil profil user dan menyiapkan komponen UI status login.

Hubungannya:

- Memanggil endpoint API di `routes/api.php`.
- Digunakan untuk membuka fitur utama seperti presensi, jurnal, admin settings, laporan, dan user management.
- Menjadi titik masuk utama dari `public/dashboard.html`.

### 9.2. `public/js/presensi_guru.js`

File ini menangani seluruh flow absensi guru: status hari ini, window waktu absensi, validasi lokasi, foto, liveness (blink), dan pengajuan koreksi bila presensi ditolak.

Fungsi utama:

- `refreshAttendance()` : menyegarkan status masuk/pulang hari ini.
- `renderCorrectionActions(item)` : menampilkan tombol koreksi absent jika sesi ditolak.
- `escapeHtml(value)` : sanitasi HTML untuk string yang dimasukkan ke markup.
- `openCorrectionForm(attendanceId, session)` : membuka form pengajuan koreksi presensi.
- `findPreciseLocation(status, preflight, signal, action = 'check-in')` : mencari lokasi GPS yang akurat dan memvalidasi geofence sesuai status.
- `submitAttendance(action, location, photo, livenessType)` : mengirim absensi ke backend dengan foto dan data lokasi.
- `startCheckIn()` : menjalankan flow absensi masuk complete dengan pengecekan geofence, GPS, kamera, dan upload foto.
- `startCheckOut()` : menjalankan flow absensi pulang dengan alasan bila di luar jadwal.
- `attendanceDialog(action)` : menjalankan dialog masuk atau pulang yang sesuai tombol user.

Hubungannya:

- Berkoordinasi dengan `TeacherAttendanceController` pada sisi backend.
- Menggunakan `window.createAksaraAttendanceCapture()` untuk deteksi wajah dan liveness.
- Berjalan secara bergantung pada geofence radius dan `gps_accuracy_limit_meters` yang dibaca dari API.

### 9.3. `public/js/presensi_kamera.js`

File ini memuat modul deteksi wajah untuk liveness blink. Fungsi ini penting untuk memastikan foto presensi bukan sekadar foto statis, tetapi benar-benar diambil saat mata berkedip.

Fungsi utama:

- `getLandmarker()` : inisialisasi Face Landmarker dari MediaPipe.
- `distance(a, b)` : menghitung jarak antara dua titik landmark.
- `eyeRatio(points, corners, upper1, lower1, upper2, lower2)` : menghitung rasio buka-tutup mata.
- `getVisibleCrop(video, frame)` : menghitung crop yang sesuai dengan aspect ratio preview kamera.
- `capture(video, guide, status, signal)` : mengaktifkan kamera depan, menganalisa wajah, menunggu kedipan mata, lalu mengambil foto.

Hubungannya:

- Dipanggil oleh `startCheckIn()` dan `startCheckOut()` di `presensi_guru.js`.
- Menggunakan MediaPipe Tasks Vision dari CDN untuk analisis wajah real-time.

### 9.4. `public/js/jurnal_bukti.js`

File ini adalah modul yang menangani pengambilan bukti jurnal, termasuk foto kegiatan, lokasi GPS, dan validasi akurasi untuk finalisasi jurnal.

Fungsi utama:

- `getMaxGpsAccuracy()` : membaca batas akurasi GPS dari config atau API.
- `startCamera(video)` : membuka kamera belakang dan menyiapkan stream.
- `stopCamera(video)` : menutup stream kamera.
- `capture(video)` : memotret bukti kegiatan dan mengecek ukuran file.
- `findPreciseLocation(status)` : mencari posisi GPS dengan akurasi maksimal yang diperbolehkan untuk jurnal.

Hubungannya:

- Dipanggil saat guru menutup jurnal di dashboard.
- Berhubungan langsung dengan `LessonJournalController::finalize()`.
- Mendukung logic perbedaan `journal_gps_accuracy_meters` vs `attendance_gps_accuracy_meters`.

### 9.5. `public/js/dashboard_admin.js`

File ini menyiapkan dashboard ringkasan admin harian. Ia berfungsi untuk mengecek rekap status guru, jadwal, dan pengumpulan jurnal secara cepat.

Fungsi utama:

- `updateReportClock()` : menampilkan jam real-time pada rekap admin.
- `renderTeacherList(teachers, emptyLabel)` : merender daftar guru dalam status tertentu.
- `renderAdminChartRows(labels, values, colors)` : menampilkan grafik batang progresif.
- `loadAdminLiveReport()` : mengambil data rekap harian dari endpoint `/api/v1/dashboard/admin` dan menyusunnya ke UI.

Hubungannya:

- Menampilkan ringkasan real-time untuk admin.
- Berfokus pada kehadiran guru, sesi kelas, dan kondisi jurnal saat ini.

### 9.6. `public/js/admin_reports.js`

File ini menangani modul laporan admin untuk periode harian, mingguan, dan bulanan.

Fungsi utama:

- `renderTable(headers, rows, emptyMessage)` : helper untuk membuat tabel HTML.
- `renderAttendanceTable(rows, weekly = false)` : menampilkan rekap kehadiran guru.
- `renderClassTable(rows)` : menampilkan status jurnal per kelas.
- `renderMonthly(summary, meta, users)` : membangun tampilan laporan bulanan.
- `renderResults(data, selectedPeriod)` : memilih format render sesuai periode.
- `fetchReport(selectedPeriod, value)` : mengambil data report dari backend.
- `open()` : membangun UI dan mengikat event handler untuk filter periode dan tombol cetak.

Hubungannya:

- Berhubungan dengan endpoint laporan admin di `routes/api.php`.
- Memberikan representasi data real-time kepada admin untuk evaluasi presensi dan jurnal.

### 9.7. `public/js/data_akademik.js`

File ini menangani master data akademik seperti kurikulum, kelas, siswa, mata pelajaran, materi, dan jadwal.

Fungsi utama:

- `nestedValue(item, path)` : membaca nilai nested dari object.
- `downloadTemplate(resource)` : mengunduh template import Excel.
- `loadOptions(optionKey)` : mengambil daftar referensi untuk dropdown form.
- `openMaster(resource, current = null)` : membuat form CRUD master data berdasarkan resource tertentu.

Hubungannya:

- Mengelola resource DATA AKADEMIK dan import/export Excel.
- Banyak dipanggil dari dashboard admin dan menu master data.

### 9.8. `public/js/kalender_hari_libur.js`

File ini menangani pengelolaan kalender hari libur dan cuti bersama sekolah.

Fungsi utama:

- `open(editId = null)` : memperlihatkan form tambah/ubah hari libur serta tabel daftar libur.
- render form dan daftar data dari backend.
- handler submit form `holidayForm` untuk create/update.
- tombol delete dan confirm delete untuk menghapus libur.

Hubungannya:

- Berpengaruh pada validasi hari libur di presensi dan laporan.
- Data di bawah `api/v1/admin/holidays`.

### 9.9. `public/js/kelola_user_akses.js`

File ini menangani pengelolaan user, role, izin tambahan, import Excel, dan reset password.

Fungsi utama:

- `downloadTemplate()` : men-download template user Excel.
- `openUsers()` : menampilkan daftar user dan tombol aksi.
- `openUserForm(user = null)` : membuka form tambah atau ubah user.
- `getRoleCombinationError(roles)` : validasi kombinasi role agar tidak melanggar rule bisnis.

Hubungannya:

- Memakai endpoint admin user management, role management, import, dan reset password.
- Memberi kontrol akses yang aman bagi pengguna dengan role tertentu.

### 9.10. `public/js/notifikasi.js`

File ini menampilkan pengumuman dan agenda sekolah yang datang pada halaman home atau dashboard.

Fungsi utama:

- `loadHomeAnnouncements()` : mengambil data agenda/pengumuman dari backend dan menampilkan kartu agenda.

Hubungannya:

- Mengambil data dari endpoint `api/v1/announcements`.
- Mendukung kegiatan sekolah dan pengumuman penting untuk user.

### 9.11. `public/js/moderasi_presensi.js`

File ini berfungsi sebagai panel admin untuk menilai presensi yang ditandai dan pengajuan koreksi dari guru.

Fungsi utama:

- `openFlagged(page = 1, correctionPage = 1)` : mengambil data presensi waiting review dan koreksi terbaru.
- render kartu presensi menunggu verifikasi.
- render kartu pengajuan koreksi guru.
- menampilkan modal foto bukti.
- mengirim keputusan `APPROVED` / `REJECTED` ke backend.

Hubungannya:

- Berhubungan dengan admin endpoint untuk flagged attendances dan attendance corrections.
- Merupakan tumpuan workflow moderasi presensi.

### 9.12. `public/js/laporan.js`

File ini menangani laporan presensi pribadi guru per bulan, termasuk total jam kerja dan daftar hari masuk/pulang.

Fungsi utama:

- `currentMonth()` : menentukan bulan aktif saat ini.
- `durationMinutes(items)` : menghitung total durasi dari jadwal absensi.
- `formatDuration(minutes)` : formatting durasi menjadi jam dan menit.
- `renderDurationSummary(items, year, monthNumber)` : membuat ringkasan mingguan dan total bulanan.
- `loadAttendanceReport(month)` : mengambil laporan presensi user dari API dan menampilkan tabel.
- event listener `aksara:page-changed` : merender panel laporan ketika menu laporan dibuka.

Hubungannya:

- Mengambil data dari endpoint `api/v1/reports/my-attendance`.
- Fokus pada laporan per user, bukan admin.

### 9.13. `public/js/profil_guru.js`

File ini menangani profil account guru, termasuk ganti password dan upload foto profil.

Fungsi utama:

- toggle visibility password di input form.
- `token()` : mengambil token login dari localStorage/sessionStorage.
- submit form ganti password.
- `setPhoto(url)` : menampilkan foto profil di halaman.
- upload foto profil ke endpoint auth profile photo.
- menangani custom event `aksara:profile-loaded` untuk memuat foto saat halaman dibuka.

Hubungannya:

- Berhubungan dengan endpoint `auth/change-password` dan `auth/profile/photo`.
- Mengelola informasi identitas dan keamanan user.

### 9.14. `public/js/push-notifications.js`

File ini menangani pengaturan notifikasi push berbasis service worker dan VAPID public key.

Fungsi utama:

- `api(path, options = {})` : wrapper request untuk endpoint notifikasi.
- `decodeVapidKey(value)` : men-decode kunci publik VAPID.
- `makeCard()` : membuat card UI toggle notifikasi.
- `setup(user)` : mengatur status izin notifikasi, subscription, dan tombol aktivasi.

Hubungannya:

- Berhubungan dengan service worker `public/sw.js` dan endpoint `/api/v1/push/*`.
- Digunakan untuk reminder dan notifikasi presensi/izin.

### 9.15. `public/js/table-search.js`

File ini menambahkan pencarian cepat ke tabel yang tidak menggunakan DataTables atau yang memiliki tabel custom.

Fungsi utama:

- `enhanceWithFallback(table)` : menambahkan search box manual ketika DataTables tidak aktif.
- `enhance(table)` : mengaktifkan DataTables jika tersedia, atau fallback search manual.
- `scan(root)` : memindai node baru yang ditambahkan ke DOM dan menerapkan enhancer.
- `cleanup(root)` : menghancurkan instance DataTables saat node dihapus.

Hubungannya:

- Digunakan di semua tabel yang muncul di dashboard dan admin panel.
- Menjaga UX agar tabel tetap bisa dicari dengan cepat.

### 9.16. `public/js/tahun_ajaran.js`

File ini adalah wrapper kecil untuk membuka modul master tahun ajaran.

Fungsi utama:

- `open()` : memanggil `openMaster('academic-years')`.

Hubungannya:

- Berfungsi sebagai entry point sederhana untuk modul master data tahun ajaran.

---

## 10. Kesimpulan

Dokumen ini saat ini sudah mencakup tidak hanya alur utama presensi dan jurnal, tetapi juga seluruh modul JavaScript yang terdapat di `public/js`. Dengan cakupan seperti ini, pengelola proyek dan pengembang baru dapat melacak arsitektur frontend dari hulu ke hilir: dari tampilan dashboard, modul per fitur, validasi browser, interaksi API, hingga integrasi dengan controller Laravel dan model database.

Poin pentingnya adalah:

- `dashboard.js` berperan sebagai pusat navigasi aplikasi.
- `presensi_guru.js` dan `jurnal_bukti.js` adalah inti logika absensi dan jurnal.
- `presensi_kamera.js` menangani liveness / keamanan foto.
- `admin_reports.js`, `dashboard_admin.js`, dan `laporan.js` menyediakan ringkasan dan laporan.
- `data_akademik.js`, `kelola_user_akses.js`, `kalender_hari_libur.js` adalah modul master management.
- `notifikasi.js`, `push-notifications.js`, `profil_guru.js`, `moderasi_presensi.js`, `table-search.js` adalah komponen pendukung operasional dan UX.

Dengan dokumentasi seperti ini, kode yang dibuat secara massal oleh AI tetap dapat dijaga, ditelusuri, dan dikembangkan secara terstruktur tanpa kehilangan konteks bisnis dan arsitektural.

Dokumentasi ini menandai alur utama dari fitur presensi dan jurnal AKSARA. Setiap alur dimulai dari UI, melalui endpoint, controller, model, database, dan kembali ke tampilan frontend. Dengan struktur seperti ini, pengembangan fitur baru menjadi lebih mudah dipantau, diuji, dan diperluas tanpa mengganggu flow yang sudah berjalan.
