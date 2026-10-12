<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Absensi extends Model
{
    protected $fillable = [
        'user_id', 'tanggal', 'jam_masuk', 'foto_masuk', 'lat_masuk', 'long_masuk',
        'distance_masuk', 'gps_accuracy_masuk', 'liveness_type_masuk', 'similarity_masuk', 'status_verifikasi_masuk',
        'keterlambatan_menit', 'jam_pulang', 'foto_pulang', 'lat_pulang', 'long_pulang', 'distance_pulang',
        'gps_accuracy_pulang', 'liveness_type_pulang', 'status_verifikasi_pulang', 'status_waktu_pulang',
        'alasan_pulang_awal', 'catatan_admin', 'approved_by'
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function livenessLogs(): HasMany
    {
        return $this->hasMany(LivenessLog::class);
    }

    public function corrections(): HasMany
    {
        return $this->hasMany(AttendanceCorrection::class, 'absensi_id');
    }
}
