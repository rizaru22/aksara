<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MateriPelajaran extends Model
{
    protected $fillable = ['mata_pelajaran_id', 'urutan_bab', 'judul_bab', 'target_jjp'];

    public function mataPelajaran(): BelongsTo
    {
        return $this->belongsTo(MataPelajaran::class);
    }

    public function jurnalMengajars(): HasMany
    {
        return $this->hasMany(JurnalMengajar::class);
    }
}
