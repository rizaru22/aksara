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
        Schema::create('agenda_sekolahs', function (Blueprint $table) {
            $table->id();
            $table->string('nama_agenda');
            $table->date('tanggal');
            $table->time('jam_mulai');
            $table->time('jam_selesai');
            $table->enum('scope', ['SEKOLAH', 'TINGKAT', 'KELAS'])->default('SEKOLAH');
            $table->boolean('override_kbm')->default(true); // Membekukan KBM
            $table->decimal('lat_temporary', 10, 8)->nullable();
            $table->decimal('long_temporary', 11, 8)->nullable();
            $table->integer('radius_meters')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('agenda_sekolahs');
    }
};
