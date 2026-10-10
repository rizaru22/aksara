<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TahunAjaran extends Model
{
    //
    
    protected $fillable = ['tahun_ajaran','is_active'];

    public function JadwalPelajaran()
    {
        return $this->hasMany(JadwalPelajaran::class);
    }
}
