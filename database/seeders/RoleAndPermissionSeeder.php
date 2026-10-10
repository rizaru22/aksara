<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Role;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\PermissionRegistrar;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

class RoleAndPermissionSeeder extends Seeder
{
    public function run(): void
    {
        // Reset cache permission Spatie
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        // 1. Buat Permissions
        $permissions = [
            // Absensi & Biometrik
            'absen-masuk',
            'absen-pulang',
            'review-absensi-flagged',
            
            // E-Jurnal & Siswa
            'isi-ejurnal',
            'kelola-presensi-siswa',
            
            // Kurikulum & Audit
            'kelola-atp',
            'view-dashboard-kurikulum',
            'view-audit-discrepancy',
            
            // Master Data & Event
            'kelola-master-data',
            'kelola-pengajuan-izin',
            'kelola-agenda-sekolah',
            'kelola-tahun-ajaran',
        ];

        foreach ($permissions as $permission) {
            Permission::firstOrCreate(['name' => $permission]);
        }

        // 2. Buat Roles & Hubungkan Izin

        // Role Admin / TU
        $roleAdmin = Role::firstOrCreate(['name' => 'admin']);
        $roleAdmin->givePermissionTo(Permission::all());

        // Role Guru
        $roleGuru = Role::firstOrCreate(['name' => 'guru']);
        $roleGuru->givePermissionTo([
            'absen-masuk',
            'absen-pulang',
            'isi-ejurnal',
            'kelola-presensi-siswa',
        ]);

        // Role Waka Kurikulum
        $roleKurikulum = Role::firstOrCreate(['name' => 'kurikulum']);
        $roleKurikulum->givePermissionTo([
            'kelola-atp',
            'view-dashboard-kurikulum',
            'view-audit-discrepancy',
            'kelola-agenda-sekolah',
            'kelola-tahun-ajaran',
            'kelola-master-data',
        ]);

        // Role Kepala Sekolah
        $roleKepsek = Role::firstOrCreate(['name' => 'kepsek']);
        $roleKepsek->givePermissionTo([
            'view-dashboard-kurikulum',
            'view-audit-discrepancy',
            'kelola-pengajuan-izin',
        ]);

        // 3. Buat Akun Super Admin Pertama
        $admin = User::firstOrCreate([
            'nip' => '198705302010031001',
            'nama' => 'Safrizal, S.ST',
            'email' => 'safrizal05@guru.smk.belajar.id',
            'password' => Hash::make('password123'),
        ]);
        $admin->assignRole('admin');

        // 4. Buat Akun Sample Guru (Non-NIP / Honorer)
        $guru = User::firstOrCreate([
            'nip' => null, // Contoh guru non-NIP
            'nama' => 'Budi Santoso, S.Kom',
            'email' => 'budi@aksara.sch.id',
            'password' => Hash::make('password123'),
        ]);
        $guru->assignRole('guru');
    }
}
