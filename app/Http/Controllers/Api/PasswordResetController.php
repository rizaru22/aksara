<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;

class PasswordResetController extends Controller
{
    /**
     * Endpoint POST /api/v1/password-reset/request.
     * Mengirim tautan reset password ke email user jika akun terdaftar dan valid di sistem.
     */
    public function requestLink(Request $request)
    {
        $request->validate(['email' => ['required', 'email']]);
        Password::sendResetLink(['email' => $request->string('email')->toString()]);

        return response()->json(['message' => 'Jika alamat terdaftar, tautan reset akan dikirim ke email tersebut.']);
    }

    /**
     * Endpoint POST /api/v1/password-reset/reset.
     * Memvalidasi token reset, mengganti password baru, dan me-revoke token lama agar sesi lama tidak berlaku lagi.
     */
    public function reset(Request $request)
    {
        $data = $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'string', 'min:12', 'confirmed'],
        ]);

        $status = Password::reset($data, function (User $user, string $password): void {
            $user->forceFill(['password' => Hash::make($password), 'remember_token' => Str::random(60)])->save();
            $user->tokens()->delete();
            event(new PasswordReset($user));
        });

        if ($status !== Password::PASSWORD_RESET) {
            return response()->json(['message' => 'Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru.'], 422);
        }

        return response()->json(['message' => 'Kata sandi berhasil diubah. Silakan masuk kembali.']);
    }

    /**
     * Endpoint POST /api/v1/admin/users/{user}/password-reset.
     * Meminta admin mengirim tautan reset password ke email user tertentu untuk kebutuhan recovery akun.
     */
    public function adminRequest(Request $request, User $user)
    {
        abort_unless($request->user()->hasRole('admin'), 403);
        Password::sendResetLink(['email' => $user->email]);

        return response()->json(['message' => 'Jika email akun dapat menerima pesan, tautan reset telah dikirim.']);
    }
}
