<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HariLibur extends Model
{
    protected $fillable = ['tanggal', 'nama', 'jenis', 'catatan', 'created_by'];

    protected function casts(): array
    {
        return ['tanggal' => 'date:Y-m-d'];
    }
}
