<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MateriPelajaran extends Model
{
    protected $fillable = ['mata_pelajaran_id', 'urutan_bab', 'judul_bab', 'target_jjp'];

    public function mataPelajaran(): BelongsTo
    {
        return $this->belongsTo(MataPelajaran::class);
    }
}
