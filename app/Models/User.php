<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Laravel\Sanctum\HasApiTokens;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Spatie\Permission\Traits\HasRoles;
use NotificationChannels\WebPush\HasPushSubscriptions;

class User extends Authenticatable
{
    use HasPushSubscriptions, HasApiTokens, HasFactory, Notifiable, HasRoles;

    protected $fillable = ['nip', 'nama', 'jenis_kelamin', 'email', 'password', 'foto-master'];

    protected $hidden = ['password', 'remember_token'];

  
    /**
     * Cast tipe data.
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function absensis(): HasMany
    {
        return $this->hasMany(Absensi::class);
    }

    public function jadwalPelajarans(): HasMany
    {
        return $this->hasMany(JadwalPelajaran::class);
    }

    public function jurnalMengajars(): HasMany
    {
        return $this->hasMany(JurnalMengajar::class);
    }

    public function pengajuanIzins(): HasMany
    {
        return $this->hasMany(PengajuanIzin::class);
    }

    public function pengajuanGuruPenggantins(): HasMany
    {
        return $this->hasMany(PengajuanGuruPengganti::class, 'user_id');
    }

    public function pengajuanGuruPenggantiSebagaiSubstitusi(): HasMany
    {
        return $this->hasMany(PengajuanGuruPengganti::class, 'guru_pengganti_id');
    }
}
