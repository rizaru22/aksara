<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tahun_ajarans', function (Blueprint $table): void {
            $table->id();
            $table->string('tahun_ajaran', 9)->unique()->comment('Format: 2023/2024');
            $table->boolean('is_active')->default(false);
            $table->timestamps();
        });

        Schema::create('kelas', function (Blueprint $table): void {
            $table->id();
            $table->string('nama_kelas');
            $table->string('tingkat');
            $table->string('jurusan');
            $table->foreignId('wali_kelas_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('siswas', function (Blueprint $table): void {
            $table->id();
            $table->string('nisn')->unique();
            $table->string('nama');
            $table->foreignId('kelas_id')->constrained('kelas')->cascadeOnDelete();
            $table->enum('jenis_kelamin', ['L', 'P']);
            $table->timestamps();
        });

        Schema::create('mata_pelajarans', function (Blueprint $table): void {
            $table->id();
            $table->string('kode_mapel')->unique();
            $table->string('nama_mapel');
            $table->timestamps();
        });

        Schema::create('materi_pelajarans', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('mata_pelajaran_id')->constrained('mata_pelajarans')->cascadeOnDelete();
            $table->integer('urutan_bab');
            $table->string('judul_bab');
            $table->integer('target_jjp');
            $table->timestamps();
        });

        Schema::create('absensis', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->date('tanggal');
            $table->time('jam_masuk')->nullable();
            $table->string('foto_masuk')->nullable();
            $table->decimal('lat_masuk', 10, 8)->nullable();
            $table->decimal('long_masuk', 11, 8)->nullable();
            $table->double('distance_masuk')->nullable();
            $table->double('gps_accuracy_masuk')->nullable();
            $table->string('liveness_type_masuk')->nullable();
            $table->float('similarity_masuk')->nullable();
            $table->enum('status_verifikasi_masuk', ['PENDING', 'VERIFIED', 'FLAGGED', 'APPROVED', 'REJECTED', 'CUTI', 'DINAS_LUAR'])->default('PENDING');
            $table->integer('keterlambatan_menit')->default(0);
            $table->time('jam_pulang')->nullable();
            $table->string('foto_pulang')->nullable();
            $table->decimal('lat_pulang', 10, 8)->nullable();
            $table->decimal('long_pulang', 11, 8)->nullable();
            $table->double('distance_pulang')->nullable();
            $table->double('gps_accuracy_pulang')->nullable();
            $table->string('liveness_type_pulang')->nullable();
            $table->enum('status_verifikasi_pulang', ['PENDING', 'VERIFIED', 'FLAGGED', 'APPROVED', 'REJECTED'])->nullable();
            $table->string('status_waktu_pulang', 32)->nullable();
            $table->text('alasan_pulang_awal')->nullable();
            $table->text('catatan_admin')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['user_id', 'tanggal']);
        });

        Schema::create('liveness_logs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('absensi_id')->constrained('absensis')->cascadeOnDelete();
            $table->string('session', 16)->default('check-in');
            $table->string('gesture_type');
            $table->boolean('is_passed')->default(false);
            $table->timestamps();
        });

        Schema::create('jadwal_pelajarans', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tahun_ajaran_id')->constrained('tahun_ajarans')->cascadeOnDelete();
            $table->enum('semester', ['Ganjil', 'Genap']);
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('kelas_id')->constrained('kelas')->cascadeOnDelete();
            $table->foreignId('mata_pelajaran_id')->constrained('mata_pelajarans')->cascadeOnDelete();
            $table->tinyInteger('siklus_minggu')->nullable()->comment('1, 2, 3 untuk sistem blok; NULL untuk jadwal mingguan');
            $table->enum('hari', ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']);
            $table->time('jam_mulai');
            $table->time('jam_selesai');
            $table->unsignedSmallInteger('periode_mulai')->nullable();
            $table->unsignedSmallInteger('periode_selesai')->nullable();
            $table->timestamps();
            $table->index(['tahun_ajaran_id', 'semester', 'hari']);
            $table->index(['user_id', 'tahun_ajaran_id', 'semester', 'hari']);
            $table->index(['kelas_id', 'tahun_ajaran_id', 'semester', 'hari']);
        });

        Schema::create('jurnal_mengajars', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('guru_pengganti_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('jadwal_pelajaran_id')->constrained('jadwal_pelajarans')->cascadeOnDelete();
            $table->foreignId('materi_pelajaran_id')->nullable()->constrained('materi_pelajarans')->nullOnDelete();
            $table->date('tanggal');
            $table->text('materi_pembahasan');
            $table->text('catatan_kejadian_kelas')->nullable();
            $table->string('foto_kegiatan')->nullable();
            $table->decimal('lat_finalisasi', 10, 8)->nullable();
            $table->decimal('long_finalisasi', 11, 8)->nullable();
            $table->double('gps_accuracy_finalisasi')->nullable();
            $table->double('jarak_geofence_finalisasi')->nullable();
            $table->foreignId('kalender_id_snapshot')->nullable()->constrained('kalender_jam_pelajaran')->restrictOnDelete();
            $table->dateTime('waktu_rencana_mulai')->nullable();
            $table->dateTime('waktu_rencana_selesai')->nullable();
            $table->unsignedSmallInteger('periode_mulai_snapshot')->nullable();
            $table->unsignedSmallInteger('periode_selesai_snapshot')->nullable();
            $table->timestamp('jam_mulai_realisasi')->nullable();
            $table->timestamp('jam_selesai_realisasi')->nullable();
            $table->string('status_sesi', 32)->default('draft');
            $table->text('catatan_penutupan')->nullable();
            $table->timestamps();
        });

        Schema::create('presensi_siswas', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('jurnal_mengajar_id')->constrained('jurnal_mengajars')->cascadeOnDelete();
            $table->foreignId('siswa_id')->constrained('siswas')->cascadeOnDelete();
            $table->enum('status', ['HADIR', 'SAKIT', 'IZIN', 'ALPHA', 'CABUT']);
            $table->string('keterangan')->nullable();
            $table->timestamps();
            $table->unique(['jurnal_mengajar_id', 'siswa_id']);
        });

        Schema::create('pengajuan_izins', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->enum('jenis_pengajuan', ['CUTI', 'DINAS']);
            $table->date('tanggal_mulai');
            $table->date('tanggal_selesai');
            $table->text('alasan');
            $table->string('berkas_lampiran')->nullable();
            $table->enum('status_approval', ['PENDING', 'APPROVED', 'REJECTED'])->default('PENDING');
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('agenda_sekolahs', function (Blueprint $table): void {
            $table->id();
            $table->string('nama_agenda');
            $table->date('tanggal');
            $table->time('jam_mulai');
            $table->time('jam_selesai');
            $table->enum('scope', ['SEKOLAH', 'TINGKAT', 'KELAS'])->default('SEKOLAH');
            $table->boolean('override_kbm')->default(true);
            $table->decimal('lat_temporary', 10, 8)->nullable();
            $table->decimal('long_temporary', 11, 8)->nullable();
            $table->integer('radius_meters')->nullable();
            $table->timestamps();
        });

        Schema::create('settings', function (Blueprint $table): void {
            $table->id();
            $table->string('key')->unique();
            $table->text('value')->nullable();
            $table->string('group')->default('general');
            $table->string('type')->default('string');
            $table->string('label');
            $table->text('description')->nullable();
            $table->timestamps();
            $table->index('group');
        });

        Schema::create('discrepancy_cases', function (Blueprint $table): void {
            $table->id();
            $table->string('fingerprint', 191)->unique();
            $table->string('type', 64);
            $table->string('source_type', 64)->nullable();
            $table->unsignedBigInteger('source_id')->nullable();
            $table->date('tanggal');
            $table->string('title', 191);
            $table->text('description')->nullable();
            $table->string('status', 24)->default('OPEN');
            $table->timestamp('first_detected_at');
            $table->timestamp('last_detected_at');
            $table->timestamp('resolved_at')->nullable();
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('resolution_note')->nullable();
            $table->timestamps();
            $table->index(['status', 'tanggal']);
            $table->index(['type', 'tanggal']);
            $table->index(['source_type', 'source_id']);
        });

        Schema::create('jadwal_presensi_harians', function (Blueprint $table): void {
            $table->id();
            $table->string('hari', 16)->unique();
            $table->time('jam_masuk_mulai')->nullable();
            $table->time('jam_masuk_akhir')->nullable();
            $table->time('jam_pulang_mulai')->nullable();
            $table->time('jam_pulang_akhir')->nullable();
            $table->timestamps();
        });

        Schema::create('hari_liburs', function (Blueprint $table): void {
            $table->id();
            $table->date('tanggal')->unique();
            $table->string('nama', 255);
            $table->enum('jenis', ['NASIONAL', 'CUTI_BERSAMA', 'SEKOLAH']);
            $table->text('catatan')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('push_subscriptions', function (Blueprint $table): void {
            $table->id();
            $table->morphs('subscribable', 'push_subscriptions_subscribable_morph_idx');
            $table->string('endpoint', 500)->unique();
            $table->string('public_key')->nullable();
            $table->string('auth_token')->nullable();
            $table->string('content_encoding')->nullable();
            $table->timestamps();
        });

        Schema::create('push_reminder_dispatches', function (Blueprint $table): void {
            $table->id();
            $table->string('reminder_key', 191)->unique();
            $table->timestamp('sent_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('push_reminder_dispatches');
        Schema::dropIfExists('push_subscriptions');
        Schema::dropIfExists('hari_liburs');
        Schema::dropIfExists('jadwal_presensi_harians');
        Schema::dropIfExists('discrepancy_cases');
        Schema::dropIfExists('settings');
        Schema::dropIfExists('agenda_sekolahs');
        Schema::dropIfExists('pengajuan_izins');
        Schema::dropIfExists('presensi_siswas');
        Schema::dropIfExists('jurnal_mengajars');
        Schema::dropIfExists('jadwal_pelajarans');
        Schema::dropIfExists('liveness_logs');
        Schema::dropIfExists('absensis');
        Schema::dropIfExists('materi_pelajarans');
        Schema::dropIfExists('mata_pelajarans');
        Schema::dropIfExists('siswas');
        Schema::dropIfExists('kelas');
        Schema::dropIfExists('tahun_ajarans');
    }
};
