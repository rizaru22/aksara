<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Siswa extends Model
{
    protected $fillable = ['nisn', 'nama', 'kelas_id', 'jenis_kelamin'];

    public function kelas(): BelongsTo
    {
        return $this->belongsTo(Kelas::class);
    }

    public function presensiSiswas(): HasMany
    {
        return $this->hasMany(PresensiSiswa::class);
    }
}