# JavaScript Dashboard AKSARA

`dashboard.html` memuat berkas di folder ini secara berurutan dengan `defer`. Berkas fitur mendaftarkan factory pada `window`, kemudian `dashboard.js` menghubungkan fitur tersebut dengan API, navigasi, dan pengguna yang sedang login.

| Berkas | Tanggung jawab |
| --- | --- |
| `dashboard.js` | Bootstrap aplikasi, autentikasi halaman, navigasi, pemilihan menu berdasarkan role, jadwal/jurnal, pengajuan izin, pengaturan, dan monitoring. |
| `profil_guru.js` | Memilih, memvalidasi, mengunggah, dan menampilkan foto profil di halaman profil serta beranda. |
| `presensi_guru.js` | Status presensi harian, absen masuk/pulang, lokasi, dan foto bukti. |
| `notifikasi.js` | Memuat agenda/pengumuman untuk beranda. |
| `laporan.js` | Merender ringkasan halaman laporan. |
| `dashboard_admin.js` | Rekap guru hadir, izin/sakit/dinas, dan kelengkapan kehadiran kelas. |
| `kelola_user_akses.js` | Daftar, tambah, ubah, hapus pengguna, role/permission, dan reset kata sandi. |
| `moderasi_presensi.js` | Review presensi pending/flagged, paginasi daftar, dan tampilkan foto bukti dalam modal. |
| `data_akademik.js` | Kelas, siswa, mata pelajaran, materi, jadwal, impor, dan template Excel. |
| `tahun_ajaran.js` | Membuka pengelolaan tahun ajaran dari menu role. |

Saat menambahkan modul yang membutuhkan fungsi bersama, injeksikan dependensi melalui factory pada `dashboard.js`; hindari mengandalkan variabel lokal dashboard dari berkas lain.
