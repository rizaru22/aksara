<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class KalenderJamPelajaran extends Model
{
    public const STATUS_DRAFT = 'DRAFT';
    public const STATUS_AKTIF = 'AKTIF';
    public const STATUS_ARSIP = 'ARSIP';

    protected $fillable = [
        'nama',
        'berlaku_mulai',
        'berlaku_sampai',
        'status',
        'catatan',
        'dibuat_oleh',
    ];

    protected function casts(): array
    {
        return [
            'berlaku_mulai' => 'date',
            'berlaku_sampai' => 'date',
        ];
    }

    public function pembuat(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dibuat_oleh');
    }

    public function detailPeriode(): HasMany
    {
        return $this->hasMany(KalenderJamPelajaranDetail::class, 'kalender_id');
    }
}
