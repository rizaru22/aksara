<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LivenessLog extends Model
{
    protected $fillable = ['absensi_id', 'gesture_type', 'is_passed'];

    protected $casts = ['is_passed' => 'boolean'];

    public function absensi(): BelongsTo
    {
        return $this->belongsTo(Absensi::class);
    }
}
