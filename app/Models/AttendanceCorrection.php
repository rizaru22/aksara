<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AttendanceCorrection extends Model
{
    protected $fillable = [
        'absensi_id', 'user_id', 'session', 'reason', 'evidence_photo',
        'original_status', 'status', 'reviewed_by', 'review_note',
    ];

    public function attendance(): BelongsTo
    {
        return $this->belongsTo(Absensi::class, 'absensi_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
