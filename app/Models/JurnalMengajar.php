<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class JurnalMengajar extends Model
{
    public const STATUS_DRAFT = 'draft';
    public const STATUS_FINAL = 'final';
    public const STATUS_FINALISASI_SUSULAN = 'finalisasi_susulan';
    public const STATUS_KEDALUWARSA = 'kedaluwarsa';

    public const STATUSES = [
        self::STATUS_DRAFT,
        self::STATUS_FINAL,
        self::STATUS_FINALISASI_SUSULAN,
        self::STATUS_KEDALUWARSA,
    ];

    protected function casts(): array
    {
        return [
            'waktu_rencana_mulai' => 'datetime',
            'waktu_rencana_selesai' => 'datetime',
        ];
    }

    protected $fillable = [
        'user_id', 'guru_pengganti_id', 'jadwal_pelajaran_id', 'materi_pelajaran_id',
        'tanggal', 'materi_pembahasan', 'catatan_kejadian_kelas', 'foto_kegiatan',
        'lat_finalisasi', 'long_finalisasi', 'gps_accuracy_finalisasi', 'jarak_geofence_finalisasi',
        'jam_mulai_realisasi', 'jam_selesai_realisasi', 'status_sesi', 'catatan_penutupan',
        'kalender_id_snapshot', 'waktu_rencana_mulai', 'waktu_rencana_selesai',
        'periode_mulai_snapshot', 'periode_selesai_snapshot',
    ];

    public function kalenderSnapshot(): BelongsTo
    {
        return $this->belongsTo(KalenderJamPelajaran::class, 'kalender_id_snapshot');
    }

    /**
     * Relasi ke guru yang membuat jurnal; digunakan saat menampilkan riwayat, validasi kepemilikan,
     * dan query yang berjalan berdasarkan user yang sedang login.
     */
    public function guru(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /**
     * Relasi ke guru pengganti jika sesi ini diisi oleh pengganti kelas.
     */
    public function guruPengganti(): BelongsTo
    {
        return $this->belongsTo(User::class, 'guru_pengganti_id');
    }

    /**
     * Relasi ke jadwal pembelajaran yang menjadi konteks jurnal hari itu.
     */
    public function jadwalPelajaran(): BelongsTo
    {
        return $this->belongsTo(JadwalPelajaran::class);
    }

    /**
     * Referensi bab/materi kurikulum yang dikaitkan ke jurnal (opsional).
     */
    public function materiPelajaran(): BelongsTo
    {
        return $this->belongsTo(MateriPelajaran::class, 'materi_pelajaran_id');
    }

    /**
     * Semua presensi siswa yang terkait dengan jurnal ini.
     * Relasi ini dipakai untuk memastikan kelengkapan daftar siswa sebelum finalisasi.
     */
    public function presensiSiswas(): HasMany
    {
        return $this->hasMany(PresensiSiswa::class);
    }
}
