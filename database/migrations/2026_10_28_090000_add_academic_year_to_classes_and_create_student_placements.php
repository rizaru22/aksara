<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Add the column nullable first so existing class rows can be assigned safely.
        Schema::table('kelas', function (Blueprint $table): void {
            $table->unsignedBigInteger('tahun_ajaran_id')->nullable()->after('id');
        });

        if (DB::table('kelas')->whereNull('tahun_ajaran_id')->exists()) {
            $yearId = DB::table('tahun_ajarans')->where('is_active', true)->value('id')
                ?? DB::table('tahun_ajarans')->orderByDesc('id')->value('id');
            if (! $yearId) {
                throw new RuntimeException('Tidak dapat menautkan kelas lama: buat minimal satu tahun ajaran sebelum menjalankan migrasi penempatan siswa.');
            }
            DB::table('kelas')->whereNull('tahun_ajaran_id')->update(['tahun_ajaran_id' => $yearId]);
        }

        Schema::table('kelas', function (Blueprint $table): void {
            $table->unsignedBigInteger('tahun_ajaran_id')->nullable(false)->change();
            $table->foreign('tahun_ajaran_id')->references('id')->on('tahun_ajarans')->restrictOnDelete();
            $table->unique(['tahun_ajaran_id', 'nama_kelas'], 'kelas_year_name_unique');
            $table->unique(['id', 'tahun_ajaran_id'], 'kelas_id_year_unique');
        });

        Schema::create('penempatan_siswas', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('siswa_id')->constrained('siswas')->restrictOnDelete();
            $table->unsignedBigInteger('kelas_id');
            $table->foreignId('tahun_ajaran_id')->constrained('tahun_ajarans')->restrictOnDelete();
            $table->timestamps();
            $table->unique(['siswa_id', 'tahun_ajaran_id'], 'penempatan_student_year_unique');
            $table->index(['kelas_id', 'tahun_ajaran_id'], 'penempatan_class_year_index');
            $table->foreign(['kelas_id', 'tahun_ajaran_id'], 'penempatan_class_year_foreign')
                ->references(['id', 'tahun_ajaran_id'])->on('kelas')->restrictOnDelete();
        });

        Schema::create('arsip_siswas', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('siswa_id')->unique()->constrained('siswas')->restrictOnDelete();
            $table->foreignId('tahun_ajaran_lulus_id')->constrained('tahun_ajarans')->restrictOnDelete();
            $table->date('tanggal_lulus');
            $table->text('catatan')->nullable();
            $table->timestamps();
        });

        Schema::table('siswas', function (Blueprint $table): void {
            $table->dropForeign(['kelas_id']);
            $table->dropColumn('kelas_id');
        });
    }

    public function down(): void
    {
        Schema::table('siswas', function (Blueprint $table): void {
            $table->foreignId('kelas_id')->nullable()->after('nama')->constrained('kelas')->nullOnDelete();
        });
        Schema::dropIfExists('arsip_siswas');
        Schema::dropIfExists('penempatan_siswas');
        Schema::table('kelas', function (Blueprint $table): void {
            $table->dropUnique('kelas_id_year_unique');
            $table->dropUnique('kelas_year_name_unique');
            $table->dropConstrainedForeignId('tahun_ajaran_id');
        });
    }
};
