<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Throwable;

class ProfilePhotoController extends Controller
{
    /**
     * Endpoint POST /api/v1/profile/photo.
     * Mengunggah dan menyimpan foto profil user serta mengganti foto lama jika sebelumnya sudah ada.
     */
    public function update(Request $request)
    {
        $request->validate([
            'photo' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ]);

        $user = $request->user();
        $oldPath = $user->getAttribute('foto-master');
        $newPath = $request->file('photo')->store('profile-photos', 'public');

        try {
            $user->forceFill(['foto-master' => $newPath])->save();
        } catch (Throwable $exception) {
            Storage::disk('public')->delete($newPath);
            throw $exception;
        }

        if ($oldPath && str_starts_with($oldPath, 'profile-photos/')) {
            Storage::disk('public')->delete($oldPath);
        }

        return response()->json([
            'message' => 'Foto profil berhasil diperbarui.',
            'data' => ['foto_master' => '/storage/' . ltrim($newPath, '/')],
        ]);
    }
}
