<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class JadwalPelajaran extends Model
{
    protected $fillable = [
        'tahun_ajaran_id', 'semester', 'user_id', 'kelas_id', 'mata_pelajaran_id',
        'siklus_minggu', 'hari', 'jam_mulai', 'jam_selesai'
    ];

    public function guru(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function kelas(): BelongsTo
    {
        return $this->belongsTo(Kelas::class);
    }

    public function mataPelajaran(): BelongsTo
    {
        return $this->belongsTo(MataPelajaran::class);
    }

    public function tahunAjaran(): BelongsTo
    {
        return $this->belongsTo(TahunAjaran::class);
    }

    public function jurnalMengajars(): HasMany
    {
        return $this->hasMany(JurnalMengajar::class);
    }

    public function pengajuanGuruPenggantins(): HasMany
    {
        return $this->hasMany(PengajuanGuruPengganti::class);
    }
}
