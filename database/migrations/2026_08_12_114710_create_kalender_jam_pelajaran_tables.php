<?php

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kalender_jam_pelajaran', function (Blueprint $table): void {
            $table->id();
            $table->string('nama', 100);
            $table->date('berlaku_mulai');
            $table->date('berlaku_sampai')->nullable();
            $table->string('status', 16)->default('DRAFT');
            $table->text('catatan')->nullable();
            $table->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['berlaku_mulai', 'berlaku_sampai'], 'kalender_jam_pelajaran_validity_idx');
            $table->index('status', 'kalender_jam_pelajaran_status_idx');
        });

        Schema::create('kalender_jam_pelajaran_detail', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('kalender_id')->constrained('kalender_jam_pelajaran')->restrictOnDelete();
            $table->string('hari', 16);
            $table->unsignedSmallInteger('nomor_periode');
            $table->time('jam_mulai');
            $table->time('jam_selesai');
            $table->string('label', 50)->nullable();
            $table->timestamps();

            $table->unique(
                ['kalender_id', 'hari', 'nomor_periode'],
                'kalender_detail_day_period_unique'
            );
            $table->index(
                ['kalender_id', 'hari', 'jam_mulai'],
                'kalender_detail_day_start_idx'
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kalender_jam_pelajaran_detail');
        Schema::dropIfExists('kalender_jam_pelajaran');
    }
};
