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
     * Login API Fleksibel (NIP / Kode Guru / Email)
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
     * Mendapatkan profil user yang sedang login
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
     * Logout & menghapus token Sanctum aktif
     */
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json([
            'status'  => 'success',
            'message' => 'Berhasil logout dan token telah dihapus.',
        ], 200);
    }

    /** Data profil dan konteks tampilan dashboard pengguna. */
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
