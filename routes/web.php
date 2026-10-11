<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->file(public_path('index.html'));
});

Route::get('/reset-password/{token}', function () {
    return response()->file(public_path('reset-password.html'));
})->name('password.reset');
