# Rencana Implementasi Kalender Jam Pelajaran AKSARA

Status: Tahap 1 — rancangan dan batasan implementasi  
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

- Implementasikan satu service untuk menyelesaikan waktu sesi berdasarkan tanggal, jadwal, dan kalender aktif.
- Jadwal tanpa rentang periode tetap memakai `jam_mulai`/`jam_selesai` lama.
- Jadwal berbasis periode harus memiliki kedua batas periode, rentang lengkap tanpa celah, dan waktu tiap periode yang valid serta tidak tumpang tindih.
- Tambahkan pengujian untuk jalur jadwal lama dan validasi rentang periode; pengujian integrasi DB untuk kalender aktif masih perlu dilengkapi.
- Jangan ubah semua controller sekaligus.

### Tahap 4 — Integrasi bertahap

- Integrasikan baca jadwal dan dashboard.
- Integrasikan pembuatan/pembaruan jurnal dan validasi finalisasi.
- Integrasikan pengingat push dan deduplikasi.
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

Pada branch `feature/kalender-jam-pelajaran`, service `App\\Services\\KalenderJamPelajaranResolver` telah ditambahkan. Service menerima jadwal dan tanggal sesi, mempertahankan jalur kompatibilitas untuk jadwal lama, atau mengambil jam mulai/selesai dari rentang periode pada kalender berstatus `AKTIF`. Service menolak konfigurasi periode yang tidak lengkap, rentang tidak valid, periode hilang, jam periode tidak valid, atau periode bertumpang tindih.

Unit test awal ditambahkan untuk jalur jadwal lama dan validasi input periode. Pengujian belum dijalankan pada lingkungan PHP proyek ini. Integrasi controller, snapshot atomik ketika draft pertama dibuat, layanan aktivasi transaksional yang menjamin hanya satu kalender aktif, serta tes database untuk periode kalender masih belum selesai. Jangan menganggap Tahap 3 sudah terverifikasi hanya karena berkas telah dibuat.
