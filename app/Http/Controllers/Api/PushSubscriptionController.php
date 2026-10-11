<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Minishlink\WebPush\ContentEncoding;

class PushSubscriptionController extends Controller
{
    public function publicKey()
    {
        $key = config('webpush.vapid.public_key');

        if (! is_string($key) || $key === '') {
            return response()->json(['message' => 'Notifikasi push belum dikonfigurasi di server.'], 503);
        }

        return response()->json(['public_key' => $key]);
    }

    public function subscribe(Request $request)
    {
        $data = $request->validate([
            'endpoint' => ['required', 'url', 'max:500'],
            'keys.p256dh' => ['required', 'string', 'max:255'],
            'keys.auth' => ['required', 'string', 'max:255'],
        ]);

        $request->user()->updatePushSubscription(
            $data['endpoint'],
            $data['keys']['p256dh'],
            $data['keys']['auth'],
            ContentEncoding::aes128gcm,
        );

        return response()->json(['message' => 'Pengingat notifikasi berhasil diaktifkan.']);
    }

    public function unsubscribe(Request $request)
    {
        $data = $request->validate(['endpoint' => ['required', 'url', 'max:500']]);
        $request->user()->deletePushSubscription($data['endpoint']);

        return response()->json(['message' => 'Pengingat notifikasi berhasil dinonaktifkan.']);
    }
}
