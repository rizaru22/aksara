<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class KalenderJamPelajaran extends Model
{
    public const STATUS_AKTIF = 'AKTIF';
    public const STATUS_NONAKTIF = 'NONAKTIF';

    protected $fillable = [
        'nama',
        'status',
        'catatan',
        'dibuat_oleh',
    ];

    public function pembuat(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dibuat_oleh');
    }

    public function detailPeriode(): HasMany
    {
        return $this->hasMany(KalenderJamPelajaranDetail::class, 'kalender_id');
    }
}
