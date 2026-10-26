<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KalenderJamPelajaranDetail extends Model
{
    protected $table = 'kalender_jam_pelajaran_detail';

    protected $fillable = [
        'kalender_id',
        'hari',
        'nomor_periode',
        'jam_mulai',
        'jam_selesai',
        'label',
    ];

    public function kalender(): BelongsTo
    {
        return $this->belongsTo(KalenderJamPelajaran::class, 'kalender_id');
    }
}
