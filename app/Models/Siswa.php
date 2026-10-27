<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Siswa extends Model
{
    protected $fillable = ['nisn', 'nama', 'jenis_kelamin'];

    public function penempatans(): HasMany
    {
        return $this->hasMany(PenempatanSiswa::class);
    }

    public function penempatanAktif(): HasOne
    {
        return $this->hasOne(PenempatanSiswa::class)->whereHas('tahunAjaran', fn ($query) => $query->where('is_active', true));
    }

    public function presensiSiswas(): HasMany
    {
        return $this->hasMany(PresensiSiswa::class);
    }

    public function arsip()
    {
        return $this->hasOne(ArsipSiswa::class);
    }
}
