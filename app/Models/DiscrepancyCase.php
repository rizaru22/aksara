<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DiscrepancyCase extends Model
{
    protected $fillable = [
        'fingerprint', 'type', 'source_type', 'source_id', 'tanggal', 'title',
        'description', 'status', 'first_detected_at', 'last_detected_at',
        'resolved_at', 'resolved_by', 'resolution_note',
    ];

    protected function casts(): array
    {
        return [
            'tanggal' => 'date',
            'first_detected_at' => 'datetime',
            'last_detected_at' => 'datetime',
            'resolved_at' => 'datetime',
        ];
    }

    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }
}
