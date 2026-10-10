<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PresensiSiswa extends Model
{
    protected $fillable = ['jurnal_mengajar_id', 'siswa_id', 'status', 'keterangan'];

    public function jurnalMengajar(): BelongsTo
    {
        return $this->belongsTo(JurnalMengajar::class);
    }

    public function siswa(): BelongsTo
    {
        return $this->belongsTo(Siswa::class);
    }
}
