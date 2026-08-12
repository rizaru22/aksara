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
        Schema::create('presensi_siswas', function (Blueprint $table) {
            $table->id();
            $table->foreignId('jurnal_mengajar_id')->constrained('jurnal_mengajars')->onDelete('cascade');
            $table->foreignId('siswa_id')->constrained('siswas')->onDelete('cascade');
            $table->enum('status', ['HADIR', 'SAKIT', 'IZIN', 'ALPHA', 'CABUT']);
            $table->string('keterangan')->nullable();
            $table->timestamps();
            $table->unique(['jurnal_mengajar_id', 'siswa_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('presensi_siswas');
    }
};
