<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Expand journal session status values for the four-stage E-Jurnal workflow.
     *
     * This project is still in development, so legacy statuses are normalized:
     * berlangsung -> draft, selesai -> final, flagged -> draft.
     */
    public function up(): void
    {
        Schema::table('jurnal_mengajars', function (Blueprint $table) {
            $table->string('status_sesi', 32)->default('draft')->change();
        });

        DB::table('jurnal_mengajars')
            ->where('status_sesi', 'berlangsung')
            ->update(['status_sesi' => 'draft']);

        DB::table('jurnal_mengajars')
            ->where('status_sesi', 'selesai')
            ->update(['status_sesi' => 'final']);

        // "flagged" is no longer an E-Jurnal status. In development, normalize
        // any existing rows to Draft. Attendance moderation flags are separate.
        DB::table('jurnal_mengajars')
            ->where('status_sesi', 'flagged')
            ->update(['status_sesi' => 'draft']);
    }

    /**
     * Roll back to the legacy status vocabulary without restoring the old ENUM.
     * New statuses are mapped to the closest legacy meaning.
     */
    public function down(): void
    {
        DB::table('jurnal_mengajars')
            ->where('status_sesi', 'draft')
            ->update(['status_sesi' => 'berlangsung']);

        DB::table('jurnal_mengajars')
            ->whereIn('status_sesi', ['final', 'finalisasi_susulan'])
            ->update(['status_sesi' => 'selesai']);

        DB::table('jurnal_mengajars')
            ->where('status_sesi', 'kedaluwarsa')
            ->update(['status_sesi' => 'berlangsung']);

        Schema::table('jurnal_mengajars', function (Blueprint $table) {
            $table->string('status_sesi', 32)->default('berlangsung')->change();
        });
    }
};
