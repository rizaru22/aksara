<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TahunAjaran extends Model
{
    //
    
    protected $fillable = ['tahun_ajaran', 'is_active'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function jadwalPelajarans()
    {
        return $this->hasMany(JadwalPelajaran::class);
    }
}
