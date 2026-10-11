<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class JadwalPresensiHarian extends Model
{
    protected $fillable = ['hari', 'jam_masuk_mulai', 'jam_masuk_akhir', 'jam_pulang_mulai', 'jam_pulang_akhir'];
}
