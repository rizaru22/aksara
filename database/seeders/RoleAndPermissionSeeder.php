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
            'ajukan-pengajuan-izin',
            'kelola-agenda-sekolah',
            'kelola-tahun-ajaran',
        ];

        foreach ($permissions as $permission) {
            Permission::firstOrCreate(['name' => $permission, 'guard_name' => 'web']);
        }

        // 2. Buat Roles & Hubungkan Izin

        // Role Admin / TU
        $roleAdmin = Role::firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);
        $roleAdmin->syncPermissions(Permission::all());

        // Role Guru
        $roleGuru = Role::firstOrCreate(['name' => 'guru', 'guard_name' => 'web']);
        $roleGuru->syncPermissions([
            'absen-masuk',
            'absen-pulang',
            'isi-ejurnal',
            'kelola-presensi-siswa',
            'ajukan-pengajuan-izin',
        ]);

        // Tenaga kependidikan memiliki akses presensi dan pengajuan izin, tanpa akses jurnal.
        $roleTendik = Role::firstOrCreate(['name' => 'tendik', 'guard_name' => 'web']);
        $roleTendik->syncPermissions([
            'absen-masuk',
            'absen-pulang',
            'ajukan-pengajuan-izin',
        ]);

        // Role Waka Kurikulum
        $roleKurikulum = Role::firstOrCreate(['name' => 'kurikulum', 'guard_name' => 'web']);
        $roleKurikulum->syncPermissions([
            'absen-masuk',
            'absen-pulang',
            'isi-ejurnal',
            'kelola-presensi-siswa',
            'kelola-atp',
            'view-dashboard-kurikulum',
            'view-audit-discrepancy',
            'kelola-agenda-sekolah',
            'kelola-tahun-ajaran',
            'kelola-master-data',
            'ajukan-pengajuan-izin',
        ]);

        // Role Kepala Sekolah
        $roleKepsek = Role::firstOrCreate(['name' => 'kepsek', 'guard_name' => 'web']);
        $roleKepsek->syncPermissions([
            'absen-masuk',
            'absen-pulang',
            'isi-ejurnal',
            'kelola-presensi-siswa',
            'view-dashboard-kurikulum',
            'view-audit-discrepancy',
            'kelola-pengajuan-izin',
        ]);

        // Demo accounts use a known password, so they are opt-in for local development only.
        if (app()->environment('local', 'testing') && filter_var(env('AKSARA_SEED_DEMO_USERS', false), FILTER_VALIDATE_BOOLEAN)) {
            $admin = User::firstOrCreate([
                'nip' => '198705302010031001',
                'nama' => 'Safrizal, S.ST',
                'email' => 'safrizal05@guru.smk.belajar.id',
                'password' => Hash::make('password123'),
            ]);
            $admin->assignRole('admin');

            $guru = User::firstOrCreate([
                'nip' => null,
                'nama' => 'Budi Santoso, S.Kom',
                'email' => 'budi@aksara.sch.id',
                'password' => Hash::make('password123'),
            ]);
            $guru->assignRole('guru');
        }
    }
}
