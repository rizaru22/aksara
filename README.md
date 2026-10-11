# AKSARA

**AKSARA (Aktivitas Sekolah dan Rekam Akademik)** adalah aplikasi web sekolah untuk presensi guru, kegiatan belajar mengajar, jurnal dan presensi siswa, pengelolaan data akademik, serta laporan operasional. Antarmuka tersedia untuk desktop dan ponsel.

## Teknologi dan persyaratan

- PHP **8.3 atau lebih baru** dan Composer.
- Laravel 13, Laravel Sanctum, dan Spatie Laravel Permission.
- MySQL 8 untuk penggunaan sekolah/produksi. SQLite dapat digunakan untuk pengujian yang mendukungnya.
- Ekstensi PHP `zip` dan `simplexml` untuk fitur impor dan template Excel.
- Peramban modern. HTTPS diperlukan untuk geolokasi, kamera, service worker, dan push notification (localhost dapat dipakai untuk pengembangan).
- Node/npm hanya diperlukan bila mengubah atau membangun aset Vite. Halaman login dan dashboard utama berupa HTML/CSS/JavaScript di `public/`.

Bootstrap CDN dan Google Fonts digunakan oleh antarmuka; koneksi internet pada browser diperlukan agar aset tersebut dapat dimuat.

## Menjalankan secara lokal

```bash
composer install
cp .env.example .env
php artisan key:generate
```

Atur koneksi database pada `.env`, lalu jalankan:

```bash
php artisan migrate
php artisan db:seed
php artisan aksara:create-admin
php artisan serve
```

Buka `http://127.0.0.1:8000`. Perintah `aksara:create-admin` meminta nama, email, dan kata sandi awal (minimal 12 karakter) secara interaktif. Seeder tidak membuat akun demo secara default. Akun demo hanya dibuat bila `AKSARA_SEED_DEMO_USERS=true` pada lingkungan `local` atau `testing`; jangan aktifkan opsi itu di produksi.

Untuk MySQL, isi `DB_CONNECTION=mysql`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, dan `DB_PASSWORD` sesuai server. Jangan pernah menyalin kredensial produksi ke README atau repositori.

## Fitur aplikasi

### Akun dan keamanan

- Login dan logout berbasis token API Sanctum.
- Pengaturan role dan permission; menu pada dashboard mengikuti role/permission akun.
- Admin dapat membuat, mengubah, menghapus, dan mengelola akun, role, serta permission tambahan.
- Admin dapat mengimpor akun secara batch dari Excel `.xlsx` dengan kolom `nama`, `email`, `nip`, `jenis_kelamin`, dan `sandi`; role dipilih sekali untuk seluruh file. Impor maksimal 2.000 baris dan dibatalkan seluruhnya jika ada kesalahan. Sandi harus minimal 12 karakter. File Excel memuat sandi teks biasa, jadi lindungi dan hapus setelah impor.
- Lupa kata sandi dan reset melalui tautan email. Admin juga dapat meminta tautan reset untuk akun pengguna.
- Pengguna dapat mengunggah atau mengganti foto profil.
- Pembatasan laju permintaan diterapkan pada endpoint sensitif seperti login, reset kata sandi, presensi, dan impor.

### Presensi guru

- Presensi masuk dan pulang dengan pemeriksaan geofence sekolah, akurasi lokasi, foto bukti, serta pemeriksaan gerakan liveness (kedip atau menoleh).
- Batas waktu masuk dan pulang diatur menurut jadwal presensi harian. Hari Minggu dan hari libur sekolah menonaktifkan presensi.
- Presensi terlambat dicatat. Presensi pulang di luar rentang yang ditentukan meminta alasan.
- Presensi yang ditandai `FLAGGED` dapat ditinjau admin atau pengguna berizin; foto bukti dapat dibuka dari modul moderasi.
- Pengguna dapat melihat laporan presensinya sendiri. Admin dapat melihat rekap seluruh pengguna.
- Presensi masuk/pulang membutuhkan foto dan lokasi; siapkan izin kamera dan lokasi pada perangkat.

### Pengajuan izin dan dinas luar

- Pengguna dengan permission pengajuan dapat mengirim permohonan cuti/izin atau dinas luar untuk rentang tanggal tertentu dan melampirkan PDF/JPG/PNG.
- Pengguna dapat memantau permohonannya; admin atau pemegang permission persetujuan dapat menyetujui atau menolak permohonan dan mengakses lampiran sesuai hak akses.
- Izin/cuti yang disetujui menghentikan kewajiban presensi pada tanggal berlaku.
- Dinas luar yang disetujui dihitung sebagai hari hadir pada persentase kehadiran. Dalam rekap mingguan, bila tidak ada jam presensi aktual, jam kerja dikreditkan memakai rentang jadwal presensi sekolah untuk hari itu. Jika presensi aktual tersedia, durasi aktual yang dipakai.
- Pengajuan izin/cuti dengan tanggal bertumpang tindih yang masih pending atau sudah disetujui ditolak. Dinas luar dapat mengikuti alur pengajuan terpisah.

### Jadwal mengajar, jurnal, dan presensi siswa

- Guru dengan akses jurnal dapat melihat jadwal hari ini yang sesuai tahun ajaran, semester, dan siklus minggu aktif.
- Pada sesi mengajar, guru mengisi materi dan catatan kelas, presensi siswa, dan dapat mengunggah foto kegiatan.
- Guru dapat mengunggah foto ke jurnal yang sudah dibuat. Guru hanya mengelola jurnal miliknya; akses pengelolaan jurnal siswa mengikuti permission.
- Wali kelas yang berizin dapat mengoreksi presensi siswa pada sesi kelas yang dipimpinnya.
- Agenda sekolah dapat menandai KBM sebagai ditangguhkan/override; jadwal yang terdampak tidak ditawarkan untuk pengisian jurnal.

### Pengumuman, agenda, dan notifikasi

- Dashboard menampilkan pengumuman/agenda sekolah yang masih berlaku.
- Kalender hari libur sekolah dapat dilihat pengguna dan dikelola oleh pemegang permission agenda sekolah.
- Guru dapat mengaktifkan atau menonaktifkan browser push pada perangkatnya.
- Pengingat terjadwal meliputi: 10 menit sebelum batas absen masuk, saat batas akhir absen pulang, 15 menit setelah pelajaran dimulai bila jurnal belum dibuat, dan 5 menit sebelum pelajaran berakhir bila foto kegiatan belum diunggah.
- Badge notifikasi menampilkan jumlah push yang belum dibuka pada browser/perangkat tersebut. Push memerlukan izin browser, dukungan service worker, dan HTTPS.

### Dashboard administrasi dan laporan

- Dashboard operasional menampilkan status presensi, pengajuan izin/sakit/dinas luar, dan ringkasan kelengkapan sesi pembelajaran hari ini.
- Menu administrasi yang tersedia mengikuti hak akses: kelola pengguna dan akses, moderasi presensi, data akademik, tahun ajaran, agenda, kalender libur, monitoring pembelajaran, audit discrepancy, persetujuan perizinan, dan pengaturan sekolah.
- **Laporan harian**: status kehadiran seluruh pengguna serta daftar sesi kelas dan status jurnal.
- **Laporan mingguan**: jumlah hari hadir dan total jam per pengguna, rekap jurnal terisi/belum, dan daftar guru yang belum mengisi jurnal.
- **Laporan bulanan**: persentase dan jumlah kehadiran per pengguna, izin/sakit, dinas luar, alpha, serta rekap keseluruhan. Dinas luar yang disetujui termasuk dalam kehadiran; kategori dinas luar tetap ditampilkan terpisah.
- Laporan harian, mingguan, dan bulanan dapat dicetak atau disimpan menjadi PDF melalui dialog cetak browser.
- Data kelas/jurnal hanya mencakup jadwal mengajar; rekap kehadiran berlaku untuk seluruh pengguna pada roster aplikasi.

### Data akademik dan pengaturan sekolah

- Data yang dapat dikelola meliputi tahun ajaran, kelas, siswa, mata pelajaran, materi, jadwal, dan agenda sekolah.
- Template Excel tersedia untuk impor kelas, siswa, mata pelajaran, materi, dan jadwal. Gunakan template yang sesuai agar nama kolom dan referensi data cocok.
- Impor divalidasi per batch, maksimal 2.000 baris per file. Baris siswa mengacu pada nama kelas yang sudah ada; materi mengacu pada kode mata pelajaran; jadwal mengacu pada label tahun ajaran, NIP guru, nama kelas, dan kode mata pelajaran.
- Pengaturan sekolah mencakup koordinat/radius geofence, verifikasi lokasi, mode geofence, semester aktif, batas presensi, dan jadwal presensi harian.
- Tahun ajaran aktif disimpan pada data akademik dan disinkronkan dengan `settings.active_tahun_ajaran`.

## Konfigurasi penting

### URL publik dan kata sandi

Atur `APP_URL` ke URL publik aplikasi, misalnya `https://aksara.sekolah.sch.id`. URL ini digunakan Laravel untuk membentuk tautan email reset kata sandi. Pastikan domain pada tautan tersebut sama dengan domain resmi aplikasi. Setelah mengubah `.env`, jalankan `php artisan config:clear` atau deploy ulang cache konfigurasi.

### Email

Isi `MAIL_MAILER`, `MAIL_SCHEME`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS`, dan `MAIL_FROM_NAME` sesuai pengaturan SMTP dari penyedia hosting/email. Jangan commit kata sandi SMTP. Uji pengiriman dan periksa laporan delivery/bounce di cPanel maupun folder spam penerima; status SMTP `Accepted` belum menjamin email masuk ke inbox.

### Geofence

Masukkan koordinat sekolah dan radius melalui Pengaturan Sekolah, lalu tandai lokasi telah diverifikasi. Geofence yang belum diverifikasi tidak menerima presensi. Mode strict menolak presensi di luar radius; mode non-strict dapat mencatatnya untuk ditinjau.

### Push notification

Buat sepasang VAPID key dengan:

```bash
php artisan webpush:vapid
```

Simpan `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, dan `VAPID_SUBJECT` pada environment server. Jangan commit private key. Gunakan key yang sama selama deployment aplikasi berlangsung. Scheduler harus berjalan setiap menit agar pengingat terjadwal dikirim.

Untuk pengembangan lokal:

```bash
php artisan schedule:work
```

Pada server, atur cron agar menjalankan `php artisan schedule:run` setiap menit. Push juga memerlukan tabel subscription/reminder dari migrasi yang tersedia, izin notifikasi pengguna, dan browser/perangkat yang mendukung Web Push.

### Tahun ajaran aktif

Periksa konsistensi dengan:

```bash
php artisan aksara:check-academic-year
```

Perintah ini tidak mengubah data secara default. Jika memang sudah menentukan sumber data yang benar, sinkronkan secara eksplisit dengan `--repair-from=table` atau `--repair-from=settings`.

## Deployment

- Arahkan document root web server ke direktori Laravel `public/`, bukan ke root repositori.
- Gunakan HTTPS, `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL` domain aplikasi, serta kredensial database dan SMTP yang valid.
- Pastikan direktori `storage/` dan `bootstrap/cache/` dapat ditulis oleh proses PHP. Berkas bukti presensi, foto jurnal, lampiran izin, dan key rahasia tidak boleh dipublikasikan sebagai direktori web.
- Jalankan migrasi dengan prosedur deployment yang sesuai (misalnya `php artisan migrate --force`) dan backup database sebelum perubahan skema.
- Jalankan cron scheduler setiap menit jika pengingat push digunakan.
- Buat akun admin pertama dengan `php artisan aksara:create-admin`; hindari akun demo pada server.

## Catatan cakupan

- Presensi siswa dicatat per sesi jurnal mengajar; aplikasi ini tidak membuat daftar presensi harian siswa yang terpisah.
- Agenda yang berjalan saat ini bersifat lingkup sekolah, belum menargetkan kelas/tingkat tertentu.
- Monitoring menampilkan hitungan operasional; persentase KPI monitoring belum didefinisikan sebagai rumus resmi. Persentase pada laporan bulanan menggunakan denominator hari kerja pada periode terpilih.
- Audit discrepancy menyediakan daftar dan alur peninjauan kasus yang ada; pembuatan kasus otomatis belum dijalankan tanpa aturan discrepancy yang disepakati.
- Hak guru pengganti untuk mengisi jurnal tidak diberikan otomatis; perlu alur penugasan dan otorisasi khusus.

## Pengujian

Jalankan test suite dengan:

```bash
php artisan test
```

Tes fitur memakai konfigurasi lingkungan pengujian. Jangan menjalankan `migrate:fresh` pada database yang berisi data yang perlu dipertahankan.
