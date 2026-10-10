<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MataPelajaran extends Model
{
    protected $fillable = ['kode_mapel', 'nama_mapel'];

    public function materiPelajarans(): HasMany
    {
        return $this->hasMany(MateriPelajaran::class);
    }

    public function jadwalPelajarans(): HasMany
    {
        return $this->hasMany(JadwalPelajaran::class);
    }
}
