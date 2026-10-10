<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AgendaSekolah extends Model
{
    protected $fillable = [
        'nama_agenda', 'tanggal', 'jam_mulai', 'jam_selesai', 'scope',
        'override_kbm', 'lat_temporary', 'long_temporary', 'radius_meters'
    ];

    protected $casts = [
        'override_kbm' => 'boolean',
    ];
}
