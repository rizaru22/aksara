<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class JurnalMengajar extends Model
{
    protected $fillable = [
        'user_id', 'guru_pengganti_id', 'jadwal_pelajaran_id', 'materi_pelajaran_id',
        'tanggal', 'materi_pembahasan', 'catatan_kejadian_kelas', 'foto_kegiatan',
        'lat_finalisasi', 'long_finalisasi', 'gps_accuracy_finalisasi', 'jarak_geofence_finalisasi',
        'jam_mulai_realisasi', 'jam_selesai_realisasi', 'status_sesi', 'catatan_penutupan',
    ];

    public function guru(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function guruPengganti(): BelongsTo
    {
        return $this->belongsTo(User::class, 'guru_pengganti_id');
    }

    public function jadwalPelajaran(): BelongsTo
    {
        return $this->belongsTo(JadwalPelajaran::class);
    }

    public function presensiSiswas(): HasMany
    {
        return $this->hasMany(PresensiSiswa::class);
    }
}
