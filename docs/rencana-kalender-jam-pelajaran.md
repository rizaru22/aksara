# Rencana Implementasi Kalender Jam Pelajaran AKSARA

Status: Tahap 3 — implementasi awal lapisan resolusi waktu  
Branch: `feature/kalender-jam-pelajaran`

## Tujuan

Menyediakan kalender jam pelajaran sekolah yang dapat dikonfigurasi per hari, termasuk durasi periode, tanpa mengubah konteks sesi yang sudah dimulai atau riwayat jurnal yang telah tercatat.

## Keputusan kebutuhan yang sudah diketahui

- Kalender berlaku untuk seluruh kelas di sekolah.
- Waktu pelajaran dapat berbeda menurut hari.
- Satu jurnal dapat mencakup rentang beberapa periode berurutan.
- Perubahan kalender dapat dilakukan sewaktu-waktu.
- Kalender yang diaktifkan menjadi acuan jadwal/sesi mendatang yang belum memiliki snapshot.
- Sesi yang sudah dimulai harus mempertahankan waktu yang telah dipakai saat sesi dimulai.
- Jurnal historis tidak boleh berubah hanya karena kalender diperbarui.
- Perubahan ini tidak boleh mengirim ulang notifikasi yang sudah dikirim untuk sesi yang sama.

## Temuan awal dari kode saat ini

- `jadwal_pelajarans` menyimpan `hari`, `jam_mulai`, dan `jam_selesai` langsung pada baris jadwal.
- `jurnal_mengajars` menyimpan waktu realisasi, tetapi tetap merujuk ke `jadwal_pelajarans`; waktu realisasi bukan snapshot lengkap waktu rencana.
- `TeacherPushReminderService` menghitung pengingat jurnal dari waktu mulai/selesai pada jadwal.
- `TeacherScheduleController`, `LessonJournalController`, dan `DashboardController` menggunakan waktu jadwal untuk menentukan sesi aktif, kelayakan pengisian jurnal, dan jendela finalisasi.
- `jadwal_presensi_harians` dan setting `jam_masuk_batas` merupakan pengaturan presensi guru terpisah dari jam pelajaran.
- Impor data akademik, validasi bentrok, agenda sekolah, dashboard, dan tes fitur juga membaca jam jadwal secara langsung.

## Prinsip desain yang wajib dipenuhi

1. **Status aktif/nonaktif**: sekolah mengaktifkan satu kalender pada satu waktu. Kalender yang dinonaktifkan tetap disimpan agar bisa diaktifkan kembali; snapshot jurnal menjaga riwayat waktu.
2. **Batas berlaku yang jelas**: kalender baru dipakai untuk sesi yang belum dimulai; sesi berjalan mempertahankan waktu yang telah ditetapkan saat dimulai.
3. **Riwayat stabil**: perubahan kalender tidak mengubah waktu historis yang ditampilkan untuk jurnal lama.
4. **Sumber waktu konsisten**: dashboard, validasi jurnal, finalisasi, agenda, dan pengingat harus menggunakan resolver waktu yang sama.
5. **Deduplikasi notifikasi**: perubahan kalender tidak boleh menyebabkan pengiriman ganda untuk pengingat yang sama.
6. **Kompatibilitas**: jadwal lama harus tetap berfungsi selama proses transisi dan data yang ada tidak boleh hilang.
7. **Validasi**: waktu periode harus berurutan dan valid; aturan bentrok guru/kelas tetap ditegakkan.
8. **Tidak ada perubahan destruktif**: migrasi harus aditif terlebih dahulu dan memiliki strategi rollback yang ditinjau sebelum diterapkan.

## Rencana tahapan

### Tahap 1 — Audit dan rancangan (dokumen ini)

- Catat area kode yang membaca waktu jadwal.
- Tetapkan aturan aktivasi kalender dan perlindungan sesi berjalan.
- Belum mengubah skema database atau perilaku aplikasi.

### Tahap 2 — Spesifikasi skema dan migrasi

- Tentukan entitas kalender dengan status aktif/nonaktif dan detail periode.
- Tentukan bagaimana jadwal lama dipetakan ke periode baru.
- Tentukan apakah snapshot waktu rencana disimpan pada jurnal atau entitas sesi.
- Sajikan spesifikasi lengkap untuk ditinjau sebelum menulis migrasi.

### Tahap 3 — Lapisan resolusi waktu

- [x] Implementasikan resolver waktu sesi berdasarkan jadwal, tanggal, dan kalender aktif.
- [x] Pertahankan kompatibilitas jadwal tanpa rentang periode melalui `jam_mulai`/`jam_selesai` lama.
- [x] Tolak rentang periode tidak lengkap/tidak valid dan detail periode yang hilang atau bertumpang tindih pada rentang yang diminta.
- [x] Tambahkan tes unit untuk jalur legacy dan validasi input dasar; tes lokal yang dilaporkan pemilik proyek: 3 tes lulus, 6 assertions.
- [x] Tambahkan layanan aktivasi kalender transaksional yang memvalidasi detail periode, menonaktifkan kalender aktif lain, lalu mengaktifkan kalender pilihan.
- [x] Integrasikan resolver ke pemeriksaan jendela pengisian jurnal pada `LessonJournalController`.
- [x] Saat draft jurnal pertama dibuat, simpan snapshot kalender, waktu rencana, dan rentang periode dalam transaksi yang sama dengan draft serta presensi siswa.
- [x] Gunakan waktu snapshot untuk jendela finalisasi dan finalisasi susulan jika snapshot tersedia.
- [x] Integrasikan resolver/snapshot ke endpoint dashboard jadwal hari ini: waktu tampilan dan jendela aksi memakai snapshot jurnal jika tersedia, atau resolver untuk sesi yang belum memiliki snapshot; urutan jadwal mengikuti waktu hasil resolusi.
- [x] Integrasikan pengingat pelajaran dengan resolver dan snapshot jurnal; jadwal tanpa snapshot menggunakan kalender aktif.
- [x] Buat reservasi kunci deduplikasi atomik sebelum pengiriman agar scheduler yang berjalan tumpang tindih tidak mengirim dua kali.
- [x] Batasi kunci deduplikasi berdasarkan tanggal, jadwal, jenis pengingat, dan penerima.
- [x] Arahkan pengingat sesi ke guru pengganti jika penugasannya disetujui untuk tanggal tersebut.
- [ ] Uji ulang perilaku pengiriman push, kegagalan provider, dan pergantian kalender; kebijakan saat ini memilih at-most-once sehingga kegagalan setelah reservasi tidak dicoba ulang otomatis.
- [ ] Audit dan integrasikan laporan, impor, validasi bentrok, dan alur guru pengganti.
- Catatan: tes integrasi database ditunda sesuai keputusan pemilik proyek dan akan diuji melalui interface saat tersedia.

### Tahap 4 — Integrasi bertahap

- [x] Integrasikan baca jadwal dan dashboard (endpoint jadwal hari ini).
- [ ] Audit endpoint daftar jadwal lain agar waktu yang ditampilkan konsisten dengan resolver/snapshot.
- Integrasikan pembuatan/pembaruan jurnal dan validasi finalisasi.
- [x] Integrasikan pengingat push dengan waktu hasil resolver/snapshot dan deduplikasi atomik.
- [ ] Uji skenario provider gagal dan konfirmasi kebutuhan retry yang aman tanpa duplikasi.
- Integrasikan impor, validasi bentrok, agenda, laporan, guru pengganti, dan UI admin.

### Tahap 5 — Pengujian regresi dan rilis

- Jalankan tes terkait jadwal, jurnal, presensi, notifikasi, impor, dan guru pengganti.
- Verifikasi kalender lama tetap berfungsi dan histori tidak berubah.
- Siapkan instruksi deployment dan rollback.
- Jangan merge ke `main` atau menjalankan migrasi produksi tanpa persetujuan eksplisit.

## Skenario penerimaan minimum

1. Kalender hari Senin dapat berbeda dari Selasa.
2. Satu sesi yang memakai periode 1–3 dihitung sebagai satu sesi jurnal.
3. Kalender yang diaktifkan menjadi acuan untuk sesi mendatang yang belum memiliki snapshot.
4. Sesi yang sudah dimulai tetap memakai waktu mulai/selesai yang telah ditetapkan untuk sesi tersebut.
5. Jurnal lama menampilkan waktu rencana dan realisasi yang tidak berubah akibat pembaruan kalender.
6. Pengingat dihitung berdasarkan waktu sesi yang sama dengan yang digunakan dashboard dan validasi jurnal.
7. Pengingat yang sudah terkirim tidak terkirim ulang hanya karena kalender diganti.
8. Bentrok jadwal guru/kelas dan agenda sekolah tetap terdeteksi dengan benar.

## Catatan

Dokumen ini adalah rancangan awal berdasarkan pemeriksaan kode pada branch `main`. Struktur tabel final, strategi backfill, dan detail kompatibilitas belum diputuskan. Tidak ada migration atau perubahan kode runtime pada tahap ini.


## Catatan progres Tahap 3

Pada branch `feature/kalender-jam-pelajaran` tersedia `App\\Services\\KalenderJamPelajaranResolver` untuk menyelesaikan waktu berdasarkan jadwal dan tanggal. Jadwal legacy tetap memakai waktu tersimpan; jadwal berbasis periode menggunakan kalender aktif. Unit test awal telah dijalankan oleh pemilik proyek: 3 tes lulus dengan 6 assertions.

Layanan `App\\Services\\KalenderJamPelajaranService` juga telah ditambahkan untuk aktivasi kalender dalam transaksi. Layanan mengunci baris kalender yang ada, memvalidasi bahwa detail periode tersedia, nomor periode berurutan mulai dari 1 per hari, jam valid, dan periode tidak bertumpang tindih; kemudian menonaktifkan kalender aktif dan mengaktifkan pilihan.

`LessonJournalController` kini menggunakan resolver untuk memeriksa waktu pengisian ketika belum ada draft terbuka. Saat draft baru dibuat, resolver dijalankan lagi di dalam transaksi dan snapshot kalender, waktu rencana, serta rentang periode disimpan bersama draft dan presensi. Pembaruan draft yang sudah ada tidak menimpa snapshot. Jendela finalisasi dan finalisasi susulan menggunakan waktu snapshot apabila tersedia. Review tambahan memperbaiki pemeriksaan agenda sekolah agar tetap dijalankan saat draft baru dibuat maupun saat draft lama diperbarui; pemeriksaan menggunakan waktu snapshot jika ada, tanpa menimpa snapshot. Integrasi ini belum diuji ulang setelah perubahan controller. Tes integrasi database sengaja ditunda sesuai keputusan pemilik proyek. Endpoint `TeacherScheduleController::today` juga telah diperbarui: dashboard menggunakan snapshot jurnal bila tersedia dan resolver untuk jadwal tanpa snapshot, menghitung bentrok agenda dengan rentang waktu hasil resolusi, menonaktifkan aksi jurnal jika waktu tidak dapat diselesaikan, dan mengurutkan jadwal berdasarkan waktu hasil resolusi. Perubahan ini belum diuji ulang. Pengingat push kini memakai waktu hasil resolver atau snapshot jurnal, pemeriksaan agenda membandingkan rentang waktu yang sama, kunci deduplikasi mencakup jenis/tanggal/jadwal/penerima dan direservasi atomik sebelum notifikasi dikirim. Pengingat juga diarahkan ke guru pengganti yang memiliki penugasan APPROVED untuk tanggal tersebut. Kebijakan ini mencegah pengiriman ganda oleh eksekusi scheduler bersamaan, tetapi bersifat at-most-once: bila pengiriman gagal setelah reservasi, pengiriman tidak otomatis dicoba ulang. Belum ada tes baru yang dijalankan. Laporan, impor, validasi bentrok, endpoint daftar jadwal lain, dan audit lengkap alur guru pengganti masih perlu ditinjau.


## Progres audit Tahap 4 — daftar jadwal, laporan, agenda, dan penerimaan

- [x] Dashboard admin live menyelesaikan waktu sesi melalui resolver atau snapshot jurnal, lalu menerapkan filter sesi berjalan dan agenda pada waktu hasil resolusi.
- [x] Mempertahankan kontrak respons dashboard admin (teacher_nip, journal_filled, expected_students, marked_students, dan is_in_class) saat mengubah sumber waktu.
- [x] Laporan kelas harian/mingguan memakai waktu snapshot jika ada, atau resolver pada tanggal laporan; kegagalan resolusi ditampilkan melalui time_resolution_error dan tidak diganti diam-diam dengan waktu lama.
- [x] Monitoring jurnal admin menampilkan waktu rencana dan rentang periode snapshot jika tersedia.
- [x] Endpoint daftar/detail jadwal master menyertakan jam_mulai_resolved, jam_selesai_resolved, sumber_waktu_rencana, tanggal_resolusi, dan kesalahan resolusi tanpa menimpa kolom jam legacy; parameter tanggal opsional dapat menentukan tanggal resolusi.
- [x] CRUD jadwal master menerima periode_mulai/periode_selesai opsional, memvalidasi pasangan rentang, membandingkan rentang periode jika kedua jadwal berbasis periode, dan menggunakan resolver untuk membandingkan jadwal campuran periode/legacy pada tanggal representatif hari yang sama.
- [x] Impor jadwal membandingkan baris impor legacy dengan jadwal yang sudah tersimpan menggunakan resolver, sehingga jadwal berbasis periode tidak dinilai hanya berdasarkan nilai jam placeholder.
- [ ] Uji regresi end-to-end pada environment Laravel/PHP 8.3 dan database uji. Belum ada tes yang dijalankan setelah perubahan controller di tahap ini; percobaan mengambil clone repo untuk menjalankan tes lokal gagal karena environment eksekusi tidak dapat menjangkau GitHub.
- [ ] Uji skenario penerimaan di bawah ini; daftar ini adalah rencana uji, bukan klaim hasil tes.

### Matriks skenario penerimaan

| ID | Skenario | Hasil yang diharapkan | Status |
|---|---|---|---|
| AT-01 | Jadwal legacy tanpa nomor periode | Resolver memakai jam_mulai/jam_selesai tersimpan | Tes unit legacy sebelumnya lulus; belum diulang |
| AT-02 | Jadwal berbasis periode dengan kalender aktif | Dashboard, pengingat, dan laporan memakai rentang waktu hasil kalender | Belum diuji |
| AT-03 | Draft memiliki snapshot lalu kalender aktif diganti | Dashboard, pengingat, laporan, dan monitoring jurnal tetap memakai snapshot lama | Belum diuji |
| AT-04 | Kalender aktif tidak memiliki rentang periode yang diperlukan | Aksi jurnal dinonaktifkan; pengingat dilewati dan kesalahan dicatat; laporan memberi indikator resolusi gagal | Belum diuji |
| AT-05 | Agenda sekolah menimpa KBM dan beririsan dengan sesi berbasis periode | Sesi dikecualikan dari dashboard live, laporan sesi kelas, dan pengingat; pembuatan/pembaruan draft ditolak | Belum diuji |
| AT-06 | Agenda tidak beririsan dengan sesi | Sesi tetap tersedia | Belum diuji |
| AT-07 | Dua proses scheduler mengirim jenis pengingat yang sama untuk penerima/jadwal/tanggal yang sama | Hanya satu proses memperoleh kunci unik dan mengirim | Belum diuji |
| AT-08 | Dua guru memiliki jadwal berbeda pada waktu sama | Kunci pengingat masing-masing penerima tidak saling menekan | Belum diuji |
| AT-09 | Guru pengganti disetujui pada tanggal sesi | Pengingat sesi diarahkan ke guru pengganti untuk jadwal tersebut | Belum diuji |
| AT-10 | Kegagalan provider setelah kunci didaftarkan | Tidak ada retry otomatis; kegagalan dicatat, tanpa risiko duplikasi otomatis | Belum diuji |
| AT-11 | Jadwal baru berbasis periode bentrok dengan jadwal periode lain untuk guru/kelas sama | Konflik rentang nomor periode ditolak | Implementasi tersedia; belum diuji |
| AT-12 | Jadwal campuran periode dan legacy | Konflik dibandingkan dengan waktu hasil resolver pada hari sekolah yang sama | Implementasi tersedia; belum diuji |
| AT-13 | Daftar/detail jadwal master diminta dengan tanggal tertentu | API menyertakan waktu hasil resolusi tanpa mengubah kolom jam legacy dan menolak tanggal yang tidak sesuai hari jadwal melalui indikator kesalahan | Implementasi tersedia; belum diuji |
| AT-14 | Impor jadwal legacy berkonflik dengan jadwal berbasis periode yang sudah ada | Konflik dihitung menggunakan waktu hasil resolver, bukan nilai jam placeholder | Implementasi tersedia; belum diuji |

Catatan: pemeriksaan dashboard dan laporan di atas adalah integrasi kode. Status “belum diuji” harus tetap dipertahankan sampai tes dijalankan di environment proyek; jangan menyimpulkan kelulusan dari inspeksi kode saja.
