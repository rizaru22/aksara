# Spesifikasi Database — Kalender Jam Pelajaran AKSARA

Status: Tahap 2 — rancangan untuk ditinjau, belum disetujui untuk implementasi  
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

## 2. Keputusan desain yang diusulkan

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

## 3. Entitas/tabel yang diusulkan

Nama berikut bersifat usulan dan belum final.

### A. `kalender_jam_pelajaran`

Mewakili versi kalender sekolah.

| Kolom | Usulan tipe | Aturan |
|---|---|---|
| `id` | bigint unsigned | Primary key |
| `nama` | varchar(100) | Label versi, wajib |
| `berlaku_mulai` | date | Tanggal awal versi berlaku, wajib |
| `berlaku_sampai` | date nullable | Tanggal akhir inklusif; null berarti belum ditutup |
| `status` | varchar/enum | DRAFT, AKTIF, ARSIP |
| `catatan` | text nullable | Alasan perubahan |
| `dibuat_oleh` | foreignId nullable | FK ke users, nullOnDelete |
| `created_at/updated_at` | timestamps | Audit waktu |

Index yang diusulkan:
- index `(berlaku_mulai, berlaku_sampai)`;
- index `status`.

Aturan: kalender draft dapat diedit. Kalender yang pernah aktif tidak diedit isinya; buat versi baru. Saat versi baru diaktifkan, tutup versi sebelumnya pada tanggal sebelum tanggal mulai versi baru. Aplikasi harus mencegah rentang berlaku bertumpang tindih. Karena unique constraint sederhana tidak dapat menjamin tidak ada overlap rentang tanggal pada semua DB yang dipakai, validasi dilakukan dalam transaksi dengan penguncian yang sesuai.

### B. `kalender_jam_pelajaran_detail`

Menyimpan periode per hari untuk versi kalender.

| Kolom | Usulan tipe | Aturan |
|---|---|---|
| `id` | bigint unsigned | Primary key |
| `kalender_id` | foreignId | FK ke kalender, cascadeOnDelete hanya untuk draft; versi aktif/arsip harus dilindungi dari penghapusan |
| `hari` | varchar(16) | Senin–Sabtu |
| `nomor_periode` | unsigned smallint | Dimulai dari 1 |
| `jam_mulai` | time | Wajib |
| `jam_selesai` | time | Wajib dan lebih besar dari jam mulai |
| `label` | varchar(50) nullable | Label tampilan opsional |
| `created_at/updated_at` | timestamps | Audit waktu |

Constraint/index:
- unique `(kalender_id, hari, nomor_periode)`;
- index `(kalender_id, hari, jam_mulai)`.

Catatan FK: kebijakan cascade untuk detail hanya aman jika kalender draft dihapus. Untuk versi yang sudah pernah aktif, larang penghapusan kalender dan detail melalui aplikasi. Jika diperlukan jaminan pada tingkat DB, pertimbangkan soft delete atau aturan FK yang lebih ketat setelah versi MariaDB dan kebijakan penghapusan dipastikan.

## 4. Usulan perubahan kolom pada tabel yang ada

### `jadwal_pelajarans`

Tambahan usulan:
- `periode_mulai` — unsigned smallint nullable pada masa transisi;
- `periode_selesai` — unsigned smallint nullable pada masa transisi.

Kolom lama `jam_mulai` dan `jam_selesai` tetap dipertahankan sementara. Saat fase migrasi:
- jadwal lama tanpa periode tetap dibaca melalui jalur kompatibilitas waktu lama;
- jadwal baru berbasis periode menggunakan kalender yang berlaku untuk tanggal sesi;
- jangan mengasumsikan semua data lama bisa dipetakan otomatis ke periode tanpa pengecekan bentrok dan kecocokan waktu.

Perlu keputusan tambahan apakah `kalender_id` disimpan pada jadwal sebagai versi tetap atau kalender dipilih menurut tanggal sesi. Rekomendasi awal: jadwal mingguan menyimpan rentang nomor periode, dan kalender dipilih menurut tanggal sesi; sesi yang sudah dimulai mengambil snapshot versi kalender. Ini mendukung perubahan kalender yang berlaku untuk sesi mendatang tanpa mengubah jadwal mingguan satu per satu.

### `jurnal_mengajars`

Tambahan snapshot yang diusulkan:
- `kalender_id_snapshot` nullable FK ke versi kalender, delete restrict/no action;
- `waktu_rencana_mulai` nullable timestamp;
- `waktu_rencana_selesai` nullable timestamp;
- `periode_mulai_snapshot` nullable unsigned smallint;
- `periode_selesai_snapshot` nullable unsigned smallint.

Nama final perlu diselaraskan dengan konvensi proyek. Kolom nullable dibutuhkan agar jurnal lama tetap valid tanpa backfill yang mengarang data. Jurnal baru menyimpan snapshot saat sesi pertama kali dimulai, dan snapshot tidak berubah saat jurnal diperbarui/finalisasi.

Perlu audit tambahan untuk memastikan tipe/status jurnal di branch saat ini konsisten dengan migration dan controller; jangan membuat perubahan status enum dalam lingkup kalender ini tanpa alasan terpisah.

## 5. Tabel yang tidak diusulkan untuk diubah pada tahap awal

- `jadwal_presensi_harians`: tetap mengatur jendela presensi masuk/pulang harian guru; bukan sumber periode pelajaran.
- `settings`: `jam_masuk_batas` tetap sebagai fallback kompatibilitas presensi.
- `agenda_sekolahs`: tetap menyimpan waktu agenda nyata; pemeriksaan bentrok akan menggunakan waktu sesi hasil resolusi kalender.
- `push_reminder_dispatches`: tetap menjadi catatan deduplikasi. Namun format `reminder_key` perlu ditinjau agar identitas sesi tidak berubah akibat pembaruan kalender.

Tidak ada perubahan tabel di atas yang diwajibkan hanya karena kalender diperkenalkan.

## 6. Dampak aplikasi yang wajib ditangani

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

## 7. Strategi migrasi aman yang diusulkan

1. Buat tabel kalender dan detail, serta kolom periode/snapshot yang nullable.
2. Seed atau buat satu kalender awal dari konfigurasi yang telah diverifikasi admin; jangan menebak pemetaan periode dari waktu jadwal.
3. Buat laporan validasi yang menunjukkan jadwal mana yang dapat dipetakan dan mana yang memerlukan keputusan manual.
4. Jalankan kompatibilitas baca: jadwal lama tetap menggunakan waktu lama; jadwal yang telah dipetakan menggunakan resolver kalender.
5. Setelah seluruh data dan jalur aplikasi tervalidasi, baru pertimbangkan mewajibkan periode untuk jadwal baru.
6. Jangan menghapus kolom lama dalam rilis awal.
7. Tidak ada backfill jurnal historis dengan waktu yang tidak dapat dibuktikan.
8. Rollback harus dapat mengembalikan aplikasi ke jalur waktu lama tanpa kehilangan data kalender yang baru dibuat.

## 8. Pertanyaan yang harus diputuskan sebelum migration

1. Apakah periode istirahat dicatat sebagai entitas sendiri, atau cukup berupa jeda waktu antarperiode?
2. Apakah kalender berlaku menurut tanggal mulai (tanggal efektif) atau perlu jam-menit efektif untuk perubahan darurat di tengah hari? Rekomendasi: gunakan tanggal efektif untuk perubahan normal, dan definisikan aturan eksplisit jika perubahan darurat dapat diaktifkan di tengah hari.
3. Untuk sesi yang belum dimulai tetapi sudah memiliki jurnal draft, apakah snapshot waktu diambil ketika draft dibuat atau ketika sesi mulai? Rekomendasi: ambil snapshot saat draft pertama dibuat agar semua operasi atas draft memakai konteks waktu yang sama; kalender baru tidak mengubah draft yang sudah dibuat.
4. Apakah satu jadwal dapat memiliki periode terputus (misalnya periode 1 dan 3 tetapi bukan 2)? Rekomendasi: rentang harus kontinu.
5. Apakah perlu menyimpan waktu rencana snapshot pada jurnal lama yang sudah ada? Rekomendasi: jangan mengarang; biarkan null dan tampilkan waktu historis yang tersedia dari jadwal saat ini dengan penanda bahwa itu bukan snapshot.

## 9. Status

Belum ada migration runtime, model, controller, service, UI, atau test yang dibuat/diubah pada tahap ini. Dokumen ini meminta review terhadap struktur, batasan, dan pertanyaan di atas sebelum implementasi.