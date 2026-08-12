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
        Schema::create('liveness_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('absensi_id')->constrained('absensis')->onDelete('cascade');
            $table->string('gesture_type'); // smile, blink, turn_left, turn_right
            $table->boolean('is_passed')->default(false);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('liveness_logs');
    }
};
