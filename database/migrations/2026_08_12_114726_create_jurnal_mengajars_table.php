<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('jurnal_mengajars', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade'); // Guru pengisi
            $table->foreignId('guru_pengganti_id')->nullable()->constrained('users')->onDelete('set null'); // Jika guru infal
            $table->foreignId('jadwal_pelajaran_id')->constrained('jadwal_pelajarans')->onDelete('cascade');
            $table->foreignId('materi_pelajaran_id')->nullable()->constrained('materi_pelajarans')->onDelete('set null');
            $table->date('tanggal');
            $table->text('materi_pembahasan');
            $table->text('catatan_kejadian_kelas')->nullable();
            $table->string('foto_kegiatan')->nullable();
            $table->timestamp('jam_mulai_realisasi')->nullable();   // Dicatat saat Check-in
            $table->timestamp('jam_selesai_realisasi')->nullable(); // Dicatat saat Check-out
            $table->enum('status_sesi', ['berlangsung', 'selesai', 'flagged'])->default('berlangsung');
            $table->text('catatan_penutupan')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('jurnal_mengajars');
    }
};
