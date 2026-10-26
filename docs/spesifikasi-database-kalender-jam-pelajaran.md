# Spesifikasi Database — Kalender Jam Pelajaran AKSARA

Status: Tahap 2 — spesifikasi untuk pemeriksaan pemilik produk; belum disetujui untuk implementasi  
Branch: `feature/kalender-jam-pelajaran`

## 1. Tujuan dan batasan

Kalender sekolah menentukan waktu mulai dan selesai setiap periode pelajaran pada hari tertentu. Kalender dapat berbeda antarhari dan dapat diperbarui sewaktu-waktu.

Kebutuhan yang menjadi dasar:
- Berlaku untuk semua kelas dalam sekolah.
- Durasi/waktu periode bisa berbeda antarhari.
- Satu sesi jurnal dapat meliputi satu atau beberapa periode berurutan.
- Kalender baru berlaku untuk jadwal yang belum dimulai.
- Sesi yang sudah dimulai tidak berganti waktu di tengah jalan.
- Riwayat jurnal harus tetap dapat menjelaskan waktu yang direncanakan saat sesi berlangsung.
- Notifikasi tidak boleh terkirim ulang hanya karena kalender berubah.

Dokumen ini adalah usulan desain, bukan perintah migrasi. Tidak ada migration runtime yang dibuat atau dijalankan oleh dokumen ini.

## 2. Keputusan yang telah dikonfirmasi

Keputusan pemilik produk:
1. **Istirahat berupa jeda antarperiode**, bukan entitas periode tersendiri.
2. **Aktivasi kalender berdasarkan tanggal efektif** (`berlaku_mulai`), bukan jam-menit. Kalender baru tidak mengubah snapshot sesi/jurnal yang sudah dibuat.
3. **Snapshot dibuat saat draft jurnal pertama kali dibuat**. Draft yang sudah memiliki snapshot mempertahankan konteks kalender dan waktu tersebut walaupun kalender baru kemudian diaktifkan.

Keputusan teknis dalam rancangan ini:
- Rentang periode pada satu jadwal harus **kontinu**. Nomor periode awal tidak boleh lebih besar dari nomor akhir, dan seluruh nomor dalam rentang harus tersedia pada hari itu.
- Kalender dipilih menurut tanggal sesi. Aktivasi ditolak jika rentang tanggal kalender aktif bertumpang tindih.
- Riwayat jurnal lama yang tidak memiliki snapshot dibiarkan `NULL`; sistem tidak mengarang waktu rencana historis.
- Jadwal lama tetap kompatibel melalui `jam_mulai`/`jam_selesai` sampai proses pemetaan dan migrasi data disetujui.

## 3. Keputusan desain teknis

### 2.1 Kalender berversi

Jangan mengubah isi kalender yang telah berlaku. Setiap perubahan jadwal waktu menghasilkan versi kalender baru dengan:
- nama/label;
- status;
- tanggal dan waktu mulai berlaku;
- metadata pembuat dan waktu pembuatan.

Hanya satu versi yang boleh berlaku pada satu tanggal/waktu untuk satu lingkup sekolah. Kalender yang telah digunakan tidak dihapus secara fisik.

### 2.2 Periode kalender

Setiap versi mempunyai detail periode per hari:
- nama hari;
- nomor periode;
- jam mulai;
- jam selesai;
- opsional label, misalnya Istirahat atau Periode 1, jika kebutuhan UI membutuhkannya.

Untuk tahap awal, periode pembelajaran sebaiknya hanya mencatat waktu belajar. Istirahat dapat direpresentasikan sebagai jeda antara jam selesai satu periode dan jam mulai periode berikutnya; tidak perlu dianggap sebagai periode pembelajaran kecuali pemilik produk meminta sebaliknya.

Validasi wajib:
- nomor periode unik per versi kalender dan hari;
- jam mulai sebelum jam selesai;
- periode pada hari yang sama tidak boleh tumpang tindih;
- urutan nomor periode harus konsisten dengan urutan waktu, atau sistem menolak konfigurasi yang bertentangan.

### 2.3 Hubungan dengan jadwal pelajaran

Tabel `jadwal_pelajarans` saat ini menyimpan `hari`, `jam_mulai`, dan `jam_selesai` langsung. Usulan paling aman adalah menambahkan referensi rentang periode pada jadwal (misalnya periode awal dan akhir), sementara kolom waktu lama dipertahankan selama migrasi bertahap dan kompatibilitas.

Jadwal dengan periode awal 1 dan periode akhir 3 berarti satu sesi pembelajaran kontinu yang mengikuti waktu mulai periode 1 sampai waktu selesai periode 3 pada kalender yang berlaku.

Jangan langsung menghapus kolom waktu lama atau mengubah semua jadwal menjadi periode sebelum strategi backfill dan validasi disetujui.

### 2.4 Snapshot waktu sesi/jurnal

Jurnal saat ini merekam waktu realisasi, tetapi relasinya tetap menuju jadwal yang dapat berubah. Untuk menjaga sejarah, usulkan snapshot pada jurnal atau entitas sesi yang dibuat saat sesi dimulai:
- versi kalender yang digunakan;
- waktu rencana mulai;
- waktu rencana selesai;
- rentang periode yang menjadi dasar sesi.

Snapshot tidak boleh diperbarui ketika kalender baru diaktifkan. Kolom waktu realisasi tetap merekam kejadian aktual, bukan digantikan oleh waktu rencana.

Catatan: keputusan apakah snapshot disimpan langsung di `jurnal_mengajars` atau di tabel sesi tersendiri harus ditetapkan setelah memeriksa seluruh alur pembuatan jurnal, substitusi guru, laporan, dan aturan unik jurnal. Usulan awal untuk implementasi paling kecil adalah snapshot di jurnal, kecuali audit menunjukkan perlunya entitas sesi independen.

## 4. Entitas/tabel yang diusulkan

Nama tabel/kolom berikut merupakan rancangan yang diajukan untuk pemeriksaan; belum diterapkan.

### A. `kalender_jam_pelajaran`

Mewakili versi kalender sekolah.

| Kolom | Usulan tipe | Aturan |
|---|---|---|
| `id` | bigint unsigned | Primary key |
| `nama` | varchar(100) | Label versi, wajib |
| `berlaku_mulai` | date | Tanggal awal versi berlaku, wajib |
| `berlaku_sampai` | date nullable | Tanggal akhir inklusif; null berarti belum ditutup |
| `status` | varchar(16) | `DRAFT`, `AKTIF`, `ARSIP`; validasi nilai di aplikasi |
| `catatan` | text nullable | Alasan perubahan |
| `dibuat_oleh` | foreignId nullable | FK ke users, nullOnDelete |
| `created_at/updated_at` | timestamps | Audit waktu |

Index yang diusulkan:
- index `(berlaku_mulai, berlaku_sampai)` untuk pencarian versi berdasarkan tanggal;
- index `status`;
- FK `dibuat_oleh` ke PK `users` dengan `SET NULL`/`nullOnDelete`, setelah tipe PK diverifikasi.

`berlaku_mulai` tidak perlu unique: beberapa draft boleh memiliki tanggal yang sama, tetapi hanya boleh ada satu kalender aktif yang cocok untuk satu tanggal. Aturan rentang aktif dijaga layanan aktivasi dalam transaksi.

Aturan: kalender draft dapat diedit. Kalender yang pernah aktif tidak diedit isinya; buat versi baru. Saat versi baru diaktifkan, tutup versi sebelumnya pada tanggal sebelum tanggal mulai versi baru. Aplikasi harus mencegah rentang berlaku bertumpang tindih. Karena unique constraint sederhana tidak dapat menjamin tidak ada overlap rentang tanggal pada semua DB yang dipakai, validasi dilakukan dalam transaksi dengan penguncian yang sesuai.

### B. `kalender_jam_pelajaran_detail`

Menyimpan periode per hari untuk versi kalender.

| Kolom | Usulan tipe | Aturan |
|---|---|---|
| `id` | bigint unsigned | Primary key |
| `kalender_id` | bigint unsigned | FK ke `kalender_jam_pelajaran.id`; rekomendasi `RESTRICT` pada FK |
| `hari` | varchar(16) | Senin–Sabtu |
| `nomor_periode` | unsigned smallint | Dimulai dari 1 |
| `jam_mulai` | time | Wajib |
| `jam_selesai` | time | Wajib dan lebih besar dari jam mulai |
| `label` | varchar(50) nullable | Label tampilan opsional |
| `created_at/updated_at` | timestamps | Audit waktu |

Constraint/index:
- unique `(kalender_id, hari, nomor_periode)`;
- index `(kalender_id, hari, jam_mulai)`.

Kebijakan penghapusan: kalender yang pernah aktif tidak boleh dihapus. Penghapusan draft harus dilakukan melalui layanan transaksional yang menghapus detail draft terlebih dahulu; FK detail sebaiknya `RESTRICT` agar aturan bisnis tidak bergantung pada cascade yang dapat menghapus detail kalender yang sudah digunakan.

## 5. Usulan perubahan kolom pada tabel yang ada

### `jadwal_pelajarans`

Tambahan usulan:
- `periode_mulai` — `unsignedSmallInteger`, nullable selama masa transisi;
- `periode_selesai` — `unsignedSmallInteger`, nullable selama masa transisi.

Keduanya harus `NULL` untuk jadwal legacy, atau keduanya terisi untuk jadwal berbasis periode. Terapkan validasi aplikasi bahwa periode awal tidak melebihi periode akhir dan semua periode dalam rentang tersedia secara berurutan pada hari jadwal. Jangan membuat FK dari nomor periode langsung ke detail kalender karena kalender dipilih menurut tanggal sesi.

Kolom lama `jam_mulai` dan `jam_selesai` tetap dipertahankan sementara. Saat fase migrasi:
- jadwal lama tanpa periode tetap dibaca melalui jalur kompatibilitas waktu lama;
- jadwal baru berbasis periode menggunakan kalender yang berlaku untuk tanggal sesi;
- jangan mengasumsikan semua data lama bisa dipetakan otomatis ke periode tanpa pengecekan bentrok dan kecocokan waktu.

Perlu keputusan tambahan apakah `kalender_id` disimpan pada jadwal sebagai versi tetap atau kalender dipilih menurut tanggal sesi. Rekomendasi awal: jadwal mingguan menyimpan rentang nomor periode, dan kalender dipilih menurut tanggal sesi; sesi yang sudah dimulai mengambil snapshot versi kalender. Ini mendukung perubahan kalender yang berlaku untuk sesi mendatang tanpa mengubah jadwal mingguan satu per satu.

### `jurnal_mengajars`

Tambahan snapshot yang diusulkan:
- `kalender_id_snapshot` — `unsignedBigInteger`, nullable FK ke `kalender_jam_pelajaran.id`, dengan `RESTRICT`/no action;
- `waktu_rencana_mulai` — `dateTime`, nullable;
- `waktu_rencana_selesai` — `dateTime`, nullable;
- `periode_mulai_snapshot` — `unsignedSmallInteger`, nullable;
- `periode_selesai_snapshot` — `unsignedSmallInteger`, nullable.

Gunakan `dateTime` jika konsisten dengan penyimpanan waktu lokal proyek. Finalisasi tipe mengikuti konvensi kolom waktu yang ada setelah audit schema lengkap; jangan memilih `timestamp` secara otomatis tanpa memeriksa perilaku timezone.

Nama final perlu diselaraskan dengan konvensi proyek. Kolom nullable dibutuhkan agar jurnal lama tetap valid tanpa backfill yang mengarang data. Snapshot dibuat atomik ketika draft jurnal pertama kali berhasil dibuat, bukan saat finalisasi atau saat kalender diaktifkan. Snapshot kalender dan waktu rencana harus berasal dari resolusi yang sama. Snapshot tidak berubah saat jurnal diperbarui/finalisasi; pembuatan draft gagal tidak boleh meninggalkan snapshot parsial.

Perlu audit tambahan untuk memastikan tipe/status jurnal di branch saat ini konsisten dengan migration dan controller; jangan membuat perubahan status enum dalam lingkup kalender ini tanpa alasan terpisah.

## 6. Tabel yang tidak diusulkan untuk diubah pada tahap awal

- `jadwal_presensi_harians`: tetap mengatur jendela presensi masuk/pulang harian guru; bukan sumber periode pelajaran.
- `settings`: `jam_masuk_batas` tetap sebagai fallback kompatibilitas presensi.
- `agenda_sekolahs`: tetap menyimpan waktu agenda nyata; pemeriksaan bentrok akan menggunakan waktu sesi hasil resolusi kalender.
- `push_reminder_dispatches`: tetap menjadi catatan deduplikasi. Namun format `reminder_key` perlu ditinjau agar identitas sesi tidak berubah akibat pembaruan kalender.

Tidak ada perubahan tabel di atas yang diwajibkan hanya karena kalender diperkenalkan.

## 7. Dampak aplikasi yang wajib ditangani

Satu service resolver waktu harus menjadi sumber logika bagi:
- `TeacherScheduleController`;
- `DashboardController`;
- `LessonJournalController`;
- `TeacherPushReminderService`;
- `AdminReportController`;
- `AcademicImportController`;
- `MasterDataController`;
- UI jadwal di `public/js/data_akademik.js` dan `public/js/dashboard.js`;
- alur guru pengganti;
- tes jurnal, presensi, impor, dan guru pengganti.

Hindari menyalin logika perhitungan periode di setiap controller.

## 8. Strategi database untuk lingkungan development

Pemilik produk mengonfirmasi bahwa AKSARA masih dalam tahap development dan data di hosting hanya untuk pengujian HTTPS. Karena itu, rancangan boleh merapikan ulang baseline migrasi tanpa mempertahankan kompatibilitas terhadap data uji lama. **Namun, tidak boleh menjalankan migration atau mengubah file migration sebelum dokumen final ini diperiksa dan disetujui.**

Prinsip konsolidasi:
1. Jadikan migration `create table` sebagai satu-satunya sumber definisi struktur awal setiap tabel. Kolom, tipe, default, nullable, index, unique constraint, dan foreign key harus didefinisikan langsung di migration pembuatan tabelnya.
2. Jika migration `create table` yang ada sudah lebih dulu membuat tabel, gabungkan perubahan struktur berikutnya ke migration pembuat tabel itu, lalu hapus migration alter/expand yang menjadi redundan dalam baseline development.
3. Pertahankan pemisahan file berdasarkan tabel atau kelompok domain yang jelas; jangan membuat satu file raksasa untuk seluruh skema. Urutan nama migration harus mencerminkan dependensi foreign key.
4. Migration framework/infra seperti users, cache, jobs, permission tables, dan personal access tokens boleh tetap menjadi migration terpisah. Yang penting setiap tabel memiliki satu definisi baseline yang lengkap dan tidak ada perubahan struktur tabel yang tersebar ke migration alter lanjutan.
5. Data awal/default aplikasi seperti pengaturan GPS adalah **data**, bukan struktur tabel. Pindahkan nilai awal tersebut ke seeder yang idempoten, bukan ke migration perubahan skema.
6. `jurnal_mengajars.status_sesi` harus langsung didefinisikan dengan tipe string dan default status workflow saat ini (`draft`) di migration `create jurnal_mengajars`; migration ekspansi status lama tidak diperlukan dalam baseline development.
7. Struktur kalender baru (dua tabel kalender dan kolom periode/snapshot pada `jadwal_pelajarans` serta `jurnal_mengajars`) harus langsung masuk ke migration create-table masing-masing, bukan dibuat melalui migration alter terpisah.
8. Setelah baseline konsolidasi disetujui, uji fresh database dengan `migrate:fresh` dan seeder; pastikan urutan FK benar, skema berhasil dibangun dari nol, serta seluruh migration dan seeder lolos pengujian. Ini akan menghapus data pada database target, jadi hanya boleh dijalankan di database development/test yang dipastikan aman.
9. Karena tidak perlu mempertahankan data uji lama, tidak diperlukan backfill historis. Data lama tidak dijadikan alasan untuk mempertahankan kolom/migration legacy yang sudah tidak relevan. Tetap jangan menjalankan migration atau `migrate:fresh` sebelum persetujuan eksplisit atas spesifikasi final.

## 9. Inventaris migration yang ditemukan

Pada branch `feature/kalender-jam-pelajaran`, direktori `database/migrations` memuat migration inti Laravel, migration permission, satu migration domain besar, dan beberapa migration lanjutan. Contoh yang perlu dikonsolidasikan ke baseline development:

- `2026_08_12_114718_create_aksara_domain_tables.php` — sudah membuat banyak tabel domain, tetapi `jurnal_mengajars.status_sesi` masih memakai enum status lama.
- `2026_10_12_000001_add_attendance_gps_accuracy_setting.php` dan `2026_10_12_000002_add_journal_gps_accuracy_setting.php` — menambahkan data default ke tabel `settings`, bukan mengubah struktur tabel; pindahkan ke seeder idempoten.
- `2026_10_12_000001_create_attendance_corrections_table.php` dan `2026_10_12_120000_create_pengajuan_guru_penggantis_table.php` — tabel domain tambahan yang dapat tetap memiliki migration create-table tersendiri.
- `2026_10_23_000001_expand_jurnal_status_sesi_for_four_stage_workflow.php` — perubahan tipe/status yang harus dilipat ke migration create `jurnal_mengajars` pada baseline development.
- `2026_10_24_000000_create_notifications_table.php` — tabel infra notifikasi dengan guard `hasTable`; perlu diputuskan apakah tabel ini dijamin hanya dikelola oleh migration aplikasi atau dapat dibuat oleh mekanisme lain sebelum membuat migration baseline yang deterministik.

Ada dua file dengan timestamp prefix `2026_10_12_000001` (`add_attendance_gps_accuracy_setting` dan `create_attendance_corrections_table`). Walaupun Laravel biasanya mengurutkan nama file, timestamp yang sama membuat urutan kurang jelas; rapikan timestamp baseline agar dependensi dan urutan migration deterministik.



Hal-hal berikut wajib diperiksa sebelum migration:

1. **Tipe FK dan aturan penghapusan.** Pastikan tipe PK `users` dan konvensi FK pada skema aktual. Kalender yang pernah aktif tidak boleh dihapus.
2. **Cakupan hari.** Rancangan awal memakai Senin–Sabtu. Verifikasi apakah Minggu perlu didukung sebagai konfigurasi.
3. **Jurnal unik dan guru pengganti.** Audit constraint unik dan alur pembuatan draft/substitusi agar snapshot terikat pada sesi yang benar dan tidak membuat jurnal duplikat.
4. **Waktu dan zona waktu.** Detail kalender memakai `TIME`; snapshot menyimpan tanggal dan jam. Gunakan tipe yang konsisten dengan konvensi proyek dan waktu lokal sekolah.
5. **Deduplikasi notifikasi.** Tentukan identitas stabil untuk sesi pengingat. Perubahan kalender tidak boleh mengirim notifikasi duplikat; jangan ubah `reminder_key` sebelum seluruh pemanggil dan data lama diaudit.
6. **Konsistensi skema/status jurnal.** Verifikasi seluruh migration dan skema aktual terhadap model/controller. Jangan mengubah status jurnal atau enum sesi sebagai bagian dari fitur kalender tanpa kebutuhan terpisah.
7. **Kalender awal dan pemetaan jadwal.** Admin harus memverifikasi jam tiap periode. Laporan dry-run harus menunjukkan jadwal cocok, tidak cocok, bentrok, atau perlu pemetaan manual.

### Aturan operasional tanggal efektif

- Kalender versi baru memiliki `berlaku_mulai` eksplisit.
- Saat aktivasi, versi sebelumnya ditutup pada tanggal sebelum tanggal mulai versi baru.
- Kalender baru dipakai untuk sesi yang belum memiliki snapshot dan tanggal sesinya berada dalam rentang versi baru.
- Draft yang sudah dibuat mempertahankan snapshot lama, meskipun tanggal efektif kalender baru tiba. Sesi yang belum memiliki draft memakai versi yang berlaku pada tanggal sesi.
- Sesi yang sudah dimulai tidak berubah waktu rencananya di tengah jalan karena snapshot sudah dibuat.
- Untuk perubahan darurat pada hari yang sama, sesi/draft yang sudah memiliki snapshot tidak berubah; sesi yang belum memiliki draft dapat memakai kalender yang berlaku pada tanggal tersebut. UI harus memperingatkan dampak ini sebelum aktivasi.

`berlaku_sampai` bersifat inklusif. Kalender tanpa tanggal akhir menggunakan `NULL`. Validasi overlap harus dilakukan dalam transaksi dan dilindungi dari aktivasi bersamaan; index tanggal membantu pencarian tetapi tidak dengan sendirinya mencegah overlap.

## 11. Status

Belum ada migration runtime, model, controller, service, UI, atau test yang dibuat/diubah sebagai bagian dari fitur kalender. Dokumen ini juga mengusulkan konsolidasi migration baseline development, tetapi belum ada file migration yang diubah atau dihapus. Tunggu pemeriksaan dan persetujuan pemilik produk sebelum implementasi.