<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PengajuanIzin extends Model
{
    protected $fillable = [
        'user_id', 'jenis_pengajuan', 'tanggal_mulai', 'tanggal_selesai',
        'alasan', 'berkas_lampiran', 'status_approval', 'approved_by'
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
