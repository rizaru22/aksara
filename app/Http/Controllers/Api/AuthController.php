<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Kelas;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Endpoint POST /api/v1/login.
     * Melakukan login menggunakan NIP, email, atau identitas unik lain yang terdaftar, lalu mengembalikan token API dan profil user.
     */
    public function login(Request $request)
    {
        $request->validate([
            'login'    => 'required|string', // BISA NIP, Kode Guru, ATAU Email
            'password' => 'required|string',
        ]);

        // Cari user berdasarkan NIP, Kode Guru, atau Email
        $user = User::where('nip', $request->login)
            ->orWhere('email', $request->login)
            ->first();

        // Validasi user & password
        if (! $user || ! Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'login' => ['Kredensial login yang dimasukkan tidak cocok dengan data kami.'],
            ]);
        }

        // Hapus token lama & buat token Sanctum baru
        $user->tokens()->delete();
        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'status'  => 'success',
            'message' => 'Login berhasil!',
            'data'    => [
                'token' => $token,
                'user'  => $this->profileData($user),
            ],
        ], 200);
    }

    /**
     * Endpoint GET /api/v1/me.
     * Mengambil profil saat ini untuk memuat role, permissions, foto, dan status user pada dashboard.
     */
    public function me(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'status' => 'success',
            'data'   => $this->profileData($user),
        ], 200);
    }

    /**
     * Endpoint POST /api/v1/change-password.
     * Mengganti kata sandi login aktif setelah user memasukkan password lama dan konfirmasi password baru.
     */
    public function changePassword(Request $request)
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:12', 'confirmed', 'different:current_password'],
        ], [
            'password.min' => 'Kata sandi baru minimal 12 karakter.',
            'password.confirmed' => 'Konfirmasi kata sandi baru tidak cocok.',
            'password.different' => 'Kata sandi baru harus berbeda dari kata sandi saat ini.',
        ]);

        $user = $request->user();
        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => 'Kata sandi saat ini tidak sesuai.',
            ]);
        }

        $user->forceFill(['password' => $data['password']])->save();

        return response()->json([
            'status' => 'success',
            'message' => 'Kata sandi berhasil diubah.',
        ]);
    }

    /**
     * Endpoint POST /api/v1/logout.
     * Menghapus token aktif agar sesi login tidak bisa dipakai lagi dari browser atau client lain.
     */
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json([
            'status'  => 'success',
            'message' => 'Berhasil logout dan token telah dihapus.',
        ], 200);
    }

    /**
     * Menyusun payload profil yang dipakai oleh frontend untuk menampilkan identitas user, role, dan metadata dashboard.
     */
    private function profileData(User $user): array
    {
        return [
            'id'             => $user->id,
            'nip'            => $user->nip,
            'nama'           => $user->nama,
            'jenis_kelamin'  => $user->jenis_kelamin,
            'email'          => $user->email,
            'school_name'    => Setting::value('school_name', 'Nama Sekolah'),
            'foto_master'    => $user->getAttribute('foto-master')
                ? '/storage/' . ltrim($user->getAttribute('foto-master'), '/')
                : null,
            'roles'          => $user->getRoleNames(),
            'permissions'    => $user->getAllPermissions()->pluck('name'),
            'is_wali_kelas'  => Kelas::where('wali_kelas_id', $user->id)->exists(),
        ];
    }
}
