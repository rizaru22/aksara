<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pengajuan_guru_penggantis', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('jadwal_pelajaran_id')->constrained('jadwal_pelajarans')->cascadeOnDelete();
            $table->foreignId('guru_pengganti_id')->constrained('users')->cascadeOnDelete();
            $table->date('tanggal');
            $table->text('alasan');
            $table->enum('status_approval', ['PENDING', 'APPROVED', 'REJECTED'])->default('PENDING');
            $table->text('catatan_admin')->nullable();
            $table->foreignId('approved_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();

            $table->unique(['jadwal_pelajaran_id', 'tanggal'], 'uniq_pengajuan_guru_pengganti_session');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pengajuan_guru_penggantis');
    }
};
