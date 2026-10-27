<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ArsipSiswa extends Model
{
    protected $fillable = ['siswa_id', 'tahun_ajaran_lulus_id', 'tanggal_lulus', 'catatan'];

    protected function casts(): array
    {
        return ['tanggal_lulus' => 'date'];
    }

    public function siswa(): BelongsTo
    {
        return $this->belongsTo(Siswa::class);
    }

    public function tahunAjaranLulus(): BelongsTo
    {
        return $this->belongsTo(TahunAjaran::class, 'tahun_ajaran_lulus_id');
    }
}
