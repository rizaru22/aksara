<?php

use App\Http\Controllers\Api\AdminUserController;
use App\Http\Controllers\Api\AcademicImportController;
use App\Http\Controllers\Api\AttendanceReportController;
use App\Http\Controllers\Api\AdminSettingsController;
use App\Http\Controllers\Api\AdminReportController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DiscrepancyController;
use App\Http\Controllers\Api\LeaveRequestController;
use App\Http\Controllers\Api\HolidayCalendarController;
use App\Http\Controllers\Api\LessonJournalController;
use App\Http\Controllers\Api\MasterDataController;
use App\Http\Controllers\Api\PasswordResetController;
use App\Http\Controllers\Api\PushSubscriptionController;
use App\Http\Controllers\Api\ProfilePhotoController;
use App\Http\Controllers\Api\SubstituteTeacherController;
use App\Http\Controllers\Api\TeacherAttendanceController;
use App\Http\Controllers\Api\TeacherScheduleController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1/auth')->group(function (): void {
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,1');
    Route::post('/forgot-password', [PasswordResetController::class, 'requestLink'])->middleware('throttle:5,1');
    Route::post('/reset-password', [PasswordResetController::class, 'reset'])->middleware('throttle:5,1');
});

Route::middleware('auth:sanctum')->prefix('v1')->group(function (): void {
    Route::prefix('auth')->group(function (): void {
        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::post('/change-password', [AuthController::class, 'changePassword'])->middleware('throttle:5,1');
        Route::post('/profile/photo', [ProfilePhotoController::class, 'update'])->middleware('throttle:6,1');
    });

    Route::prefix('push')->middleware('role:guru|tendik|admin|kepsek|kurikulum')->group(function (): void {
        Route::get('/vapid-public-key', [PushSubscriptionController::class, 'publicKey']);
        Route::post('/subscriptions', [PushSubscriptionController::class, 'subscribe'])->middleware('throttle:10,1');
        Route::delete('/subscriptions', [PushSubscriptionController::class, 'unsubscribe'])->middleware('throttle:10,1');
    });

    Route::middleware('permission:absen-masuk|absen-pulang')->prefix('teacher/attendance')->group(function (): void {
        Route::get('/today', [TeacherAttendanceController::class, 'today']);
    });
    Route::post('/teacher/attendance/location-check', [TeacherAttendanceController::class, 'verifyLocation'])->middleware(['permission:absen-masuk|absen-pulang', 'throttle:20,1']);
    Route::post('/teacher/attendance/check-in', [TeacherAttendanceController::class, 'checkIn'])->middleware(['permission:absen-masuk', 'throttle:10,1']);
    Route::post('/teacher/attendance/check-out', [TeacherAttendanceController::class, 'checkOut'])->middleware(['permission:absen-pulang', 'throttle:10,1']);
    Route::post('/teacher/attendance/{absensi}/corrections', [TeacherAttendanceController::class, 'submitCorrection'])->middleware(['permission:absen-masuk|absen-pulang', 'throttle:5,1']);
    Route::get('/admin/flagged-attendances', [TeacherAttendanceController::class, 'flagged'])->middleware('permission:review-absensi-flagged');
    Route::post('/admin/flagged-attendances/{absensi}/review', [TeacherAttendanceController::class, 'review'])->middleware('permission:review-absensi-flagged');
    Route::get('/admin/flagged-attendances/{absensi}/photo/{session}', [TeacherAttendanceController::class, 'photo'])->middleware('permission:review-absensi-flagged');
    Route::get('/admin/attendance-corrections', [TeacherAttendanceController::class, 'corrections'])->middleware('permission:review-absensi-flagged');
    Route::post('/admin/attendance-corrections/{attendanceCorrection}/review', [TeacherAttendanceController::class, 'reviewCorrection'])->middleware('permission:review-absensi-flagged');
    Route::get('/admin/attendance-corrections/{attendanceCorrection}/evidence', [TeacherAttendanceController::class, 'correctionEvidence'])->middleware('permission:review-absensi-flagged');

    Route::get('/teacher/schedules/today', [TeacherScheduleController::class, 'today'])->middleware('permission:isi-ejurnal|view-dashboard-kurikulum|kelola-master-data');
    Route::get('/teacher/substitute-candidates', [SubstituteTeacherController::class, 'candidates'])->middleware('permission:isi-ejurnal');
    Route::get('/teacher/substitute-requests/mine', [SubstituteTeacherController::class, 'mine'])->middleware('permission:isi-ejurnal');
    Route::post('/teacher/substitute-requests', [SubstituteTeacherController::class, 'store'])->middleware(['permission:isi-ejurnal', 'throttle:10,1']);
    Route::get('/admin/substitute-requests', [SubstituteTeacherController::class, 'index'])->middleware('role_or_permission:admin|kepsek|kurikulum|kelola-master-data');
    Route::patch('/admin/substitute-requests/{pengajuanGuruPengganti}', [SubstituteTeacherController::class, 'decide'])->middleware('role_or_permission:admin|kepsek|kurikulum|kelola-master-data');
    Route::get('/announcements', [TeacherScheduleController::class, 'announcements']);
    Route::get('/calendar/holidays', [HolidayCalendarController::class, 'index']);
    Route::get('/reports/my-attendance', [AttendanceReportController::class, 'mine']);
    Route::get('/teacher/schedules/{jadwalPelajaran}/students', [LessonJournalController::class, 'students'])->middleware('permission:isi-ejurnal');
    Route::post('/lesson-journals', [LessonJournalController::class, 'store'])->middleware(['permission:isi-ejurnal', 'throttle:10,1']);
    Route::post('/lesson-journals/{jurnalMengajar}/finalize', [LessonJournalController::class, 'finalize'])->middleware(['permission:isi-ejurnal', 'throttle:6,1']);
    Route::get('/lesson-journals/{jurnalMengajar}', [LessonJournalController::class, 'show']);
    Route::patch('/student-attendances/{presensiSiswa}', [LessonJournalController::class, 'updateStudentAttendance'])->middleware('permission:kelola-presensi-siswa');
    Route::get('/student-attendances/wali-sessions', [LessonJournalController::class, 'waliSessions'])->middleware('permission:kelola-presensi-siswa');

    Route::get('/dashboard/curriculum', [DashboardController::class, 'curriculum'])->middleware('permission:view-dashboard-kurikulum');
    Route::get('/dashboard/admin', [DashboardController::class, 'adminLive']);
    Route::get('/admin/reports', [AdminReportController::class, 'index']);
    Route::get('/discrepancy-cases', [DiscrepancyController::class, 'index'])->middleware('permission:view-audit-discrepancy');
    Route::patch('/discrepancy-cases/{discrepancyCase}', [DiscrepancyController::class, 'update'])->middleware('permission:view-audit-discrepancy');

    Route::get('/leave-requests', [LeaveRequestController::class, 'index']);
    Route::get('/leave-requests/mine', [LeaveRequestController::class, 'mine']);
    Route::post('/leave-requests', [LeaveRequestController::class, 'store']);
    Route::patch('/leave-requests/{pengajuanIzin}/decision', [LeaveRequestController::class, 'decide']);
    Route::get('/leave-requests/{pengajuanIzin}/attachment', [LeaveRequestController::class, 'attachment']);

    Route::prefix('admin/users')->middleware('permission:kelola-master-data')->group(function (): void {
        Route::get('/roles', [AdminUserController::class, 'roles']);
        Route::get('/template', [AdminUserController::class, 'template']);
        Route::post('/import', [AdminUserController::class, 'import'])->middleware('throttle:10,1');
        Route::get('/', [AdminUserController::class, 'index']);
        Route::post('/', [AdminUserController::class, 'store']);
        Route::patch('/{user}', [AdminUserController::class, 'update']);
        Route::delete('/{user}', [AdminUserController::class, 'destroy']);
        Route::post('/{user}/password-reset', [PasswordResetController::class, 'adminRequest']);
    });
    Route::get('/admin/settings', [AdminSettingsController::class, 'index']);
    Route::put('/admin/settings', [AdminSettingsController::class, 'update']);
    Route::prefix('admin/holidays')->middleware('permission:kelola-agenda-sekolah')->group(function (): void {
        Route::get('/', [HolidayCalendarController::class, 'adminIndex']);
        Route::post('/', [HolidayCalendarController::class, 'store']);
        Route::patch('/{hariLibur}', [HolidayCalendarController::class, 'update']);
        Route::delete('/{hariLibur}', [HolidayCalendarController::class, 'destroy']);
    });

    Route::prefix('academic')->group(function (): void {
        Route::get('/imports/templates/{resource}', [AcademicImportController::class, 'template'])->middleware('permission:kelola-master-data')->whereIn('resource', ['classes', 'students', 'subjects', 'materials', 'schedules']);
        Route::post('/imports/{resource}', [AcademicImportController::class, 'import'])->middleware(['permission:kelola-master-data', 'throttle:10,1'])->whereIn('resource', ['classes', 'students', 'subjects', 'materials', 'schedules']);
        Route::get('/teachers', [MasterDataController::class, 'teachers']);
        Route::get('/{resource}', [MasterDataController::class, 'index'])->whereIn('resource', ['academic-years', 'classes', 'students', 'subjects', 'materials', 'schedules', 'agendas']);
        Route::post('/{resource}', [MasterDataController::class, 'store'])->whereIn('resource', ['academic-years', 'classes', 'students', 'subjects', 'materials', 'schedules', 'agendas']);
        Route::get('/{resource}/{id}', [MasterDataController::class, 'show'])->whereIn('resource', ['academic-years', 'classes', 'students', 'subjects', 'materials', 'schedules', 'agendas'])->whereNumber('id');
        Route::patch('/{resource}/{id}', [MasterDataController::class, 'update'])->whereIn('resource', ['academic-years', 'classes', 'students', 'subjects', 'materials', 'schedules', 'agendas'])->whereNumber('id');
        Route::delete('/{resource}/{id}', [MasterDataController::class, 'destroy'])->whereIn('resource', ['academic-years', 'classes', 'students', 'subjects', 'materials', 'schedules', 'agendas'])->whereNumber('id');
        Route::post('/academic-years/{tahunAjaran}/activate', [MasterDataController::class, 'activateAcademicYear'])->middleware('permission:kelola-tahun-ajaran');
    });
});
