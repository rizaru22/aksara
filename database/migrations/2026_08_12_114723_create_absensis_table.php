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
        Schema::create('absensis', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->date('tanggal');
            
            // Log Masuk
            $table->time('jam_masuk')->nullable();
            $table->string('foto_masuk')->nullable();
            $table->decimal('lat_masuk', 10, 8)->nullable();
            $table->decimal('long_masuk', 11, 8)->nullable();
            $table->double('distance_masuk')->nullable();
            $table->string('liveness_type_masuk')->nullable();
            $table->float('similarity_masuk')->nullable();
            $table->enum('status_verifikasi_masuk', ['PENDING', 'VERIFIED', 'FLAGGED', 'APPROVED', 'REJECTED', 'CUTI', 'DINAS_LUAR'])->default('PENDING');
            $table->integer('keterlambatan_menit')->default(0);

            // Log Pulang
            $table->time('jam_pulang')->nullable();
            $table->string('foto_pulang')->nullable();
            $table->enum('status_verifikasi_pulang', ['PENDING', 'VERIFIED', 'FLAGGED', 'APPROVED', 'REJECTED'])->nullable();
            $table->text('alasan_pulang_awal')->nullable();

            // Review TU
            $table->text('catatan_admin')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->onDelete('set null');
            
            $table->timestamps();
            $table->unique(['user_id', 'tanggal']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('absensis');
    }
};
