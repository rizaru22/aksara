<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PengajuanGuruPengganti extends Model
{
    protected $table = 'pengajuan_guru_penggantis';

    protected $fillable = [
        'user_id',
        'jadwal_pelajaran_id',
        'guru_pengganti_id',
        'tanggal',
        'alasan',
        'status_approval',
        'catatan_admin',
        'approved_by_user_id',
        'approved_at',
    ];

    protected $casts = [
        'tanggal' => 'date:Y-m-d',
        'approved_at' => 'datetime',
    ];

    public function guruUtama(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function guruPengganti(): BelongsTo
    {
        return $this->belongsTo(User::class, 'guru_pengganti_id');
    }

    public function jadwalPelajaran(): BelongsTo
    {
        return $this->belongsTo(JadwalPelajaran::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_user_id');
    }
}
