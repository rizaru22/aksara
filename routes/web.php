<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->file(public_path('index.html'));
});

Route::get('/reset-password/{token}', function () {
    return response()->file(public_path('reset-password.html'));
})->name('password.reset');

Route::get('/internal-mail-test', function () {
   

    try {
        Mail::raw(
            'Ini adalah email pengujian SMTP AKSARA. https://aksara.smkn1karangbaru.sch.id',
            function ($message) {
                $message
                    ->to('rizaru.2.2@gmail.com')
                    ->subject('Tes SMTP AKSARA - Teks Biasa');
            }
        );

        return response()->json([
            'success' => true,
            'message' => 'Laravel menyerahkan email ke mail transport.',
        ]);
    } catch (\Throwable $e) {
        report($e);

        return response()->json([
            'success' => false,
            'message' => 'Pengiriman gagal. Periksa laravel.log.',
        ], 500);
    }
});