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
        Schema::create('jadwal_pelajarans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tahun_ajaran_id')->constrained('tahun_ajarans')->onDelete('cascade');
            $table->enum('semester', ['Ganjil', 'Genap']);
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade'); // Guru Utama
            $table->foreignId('kelas_id')->constrained('kelas')->onDelete('cascade');
            $table->foreignId('mata_pelajaran_id')->constrained('mata_pelajarans')->onDelete('cascade');
            $table->tinyInteger('siklus_minggu')->nullable()->comment('1, 2,3 untuk sistem blok; NULL untuk mingguan biasa'); // 1, 2, atau 3
            $table->enum('hari', ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']);
            $table->time('jam_mulai');
            $table->time('jam_selesai');
            $table->timestamps();

            // Indeks untuk optimasi query pembacaan jadwal harian
        $table->index(['tahun_ajaran_id', 'semester', 'hari']);
        $table->index(['user_id', 'tahun_ajaran_id', 'semester', 'hari']);
        $table->index(['kelas_id', 'tahun_ajaran_id', 'semester', 'hari']);

        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('jadwal_pelajarans');
    }
};
