<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Role;

class CreateAdminUser extends Command
{
    protected $signature = 'aksara:create-admin';

    protected $description = 'Create the first Admin account using an interactive password prompt';

    public function handle(): int
    {
        $name = $this->ask('Nama Admin');
        $email = $this->ask('Email Admin');
        if (! $name || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->error('Nama dan alamat email valid wajib diisi.');

            return self::FAILURE;
        }
        if (User::query()->where('email', $email)->exists()) {
            $this->error('Email tersebut sudah digunakan. Tidak ada akun yang diubah.');

            return self::FAILURE;
        }

        $password = $this->secret('Kata sandi awal (minimal 12 karakter)');
        $confirmation = $this->secret('Ulangi kata sandi');
        if (strlen((string) $password) < 12 || ! hash_equals((string) $password, (string) $confirmation)) {
            $this->error('Kata sandi harus minimal 12 karakter dan konfirmasi harus cocok.');

            return self::FAILURE;
        }

        $role = Role::query()->firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);
        $user = User::query()->create(['nama' => $name, 'email' => $email, 'password' => Hash::make($password)]);
        $user->assignRole($role);

        $this->info("Akun Admin {$email} berhasil dibuat.");

        return self::SUCCESS;
    }
}
