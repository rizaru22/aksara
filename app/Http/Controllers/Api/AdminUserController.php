<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AdminUserController extends Controller
{
    public function roles(Request $request)
    {
        abort_unless($request->user()->hasRole('admin'), 403);

        return response()->json([
            'roles' => \Spatie\Permission\Models\Role::query()->orderBy('name')->pluck('name'),
            'permissions' => \Spatie\Permission\Models\Permission::query()->orderBy('name')->pluck('name'),
        ]);
    }

    public function index(Request $request)
    {
        abort_unless($request->user()->hasRole('admin'), 403);
        return response()->json(User::query()->with(['roles:id,name', 'permissions:id,name'])->orderBy('nama')->paginate(30));
    }

    public function store(Request $request)
    {
        abort_unless($request->user()->hasRole('admin'), 403);
        $data = $request->validate([
            'nip' => ['nullable', 'string', 'max:64', Rule::unique('users', 'nip')],
            'nama' => ['required', 'string', 'max:255'],
            'jenis_kelamin' => ['nullable', 'in:L,P'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')],
            'password' => ['required', 'string', 'min:12', 'confirmed'],
            'roles' => ['required', 'array', 'size:1'],
            'roles.*' => ['required', 'distinct', 'exists:roles,name'],
            'permissions' => ['sometimes', 'array'],
            'permissions.*' => ['required', 'distinct', 'exists:permissions,name'],
        ]);

        $user = User::query()->create([
            'nip' => $data['nip'] ?? null,
            'nama' => $data['nama'],
            'jenis_kelamin' => $data['jenis_kelamin'] ?? null,
            'email' => $data['email'],
            'password' => $data['password'],
        ]);
        $user->syncRoles($data['roles']);
        $user->syncPermissions($data['permissions'] ?? []);

        return response()->json(['message' => 'Akun berhasil dibuat.', 'data' => $user->load('roles:id,name')], 201);
    }

    public function update(Request $request, User $user)
    {
        abort_unless($request->user()->hasRole('admin'), 403);
        $data = $request->validate([
            'nip' => ['sometimes', 'nullable', 'string', 'max:64', Rule::unique('users', 'nip')->ignore($user->id)],
            'nama' => ['sometimes', 'required', 'string', 'max:255'],
            'jenis_kelamin' => ['sometimes', 'nullable', 'in:L,P'],
            'email' => ['sometimes', 'required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'roles' => ['sometimes', 'required', 'array', 'size:1'],
            'roles.*' => ['required', 'distinct', 'exists:roles,name'],
            'permissions' => ['sometimes', 'array'],
            'permissions.*' => ['required', 'distinct', 'exists:permissions,name'],
        ]);

        if (isset($data['roles']) && $user->hasRole('admin') && ! in_array('admin', $data['roles'], true)
            && User::role('admin')->count() <= 1) {
            abort(422, 'Tidak dapat menghapus role Admin terakhir.');
        }

        $user->fill(collect($data)->except(['roles', 'permissions'])->all());
        $user->save();
        if (array_key_exists('roles', $data)) $user->syncRoles($data['roles']);
        if (array_key_exists('permissions', $data)) $user->syncPermissions($data['permissions']);

        return response()->json(['message' => 'Akun berhasil diperbarui.', 'data' => $user->load('roles:id,name')]);
    }

    public function destroy(Request $request, User $user)
    {
        abort_unless($request->user()->hasRole('admin'), 403);
        abort_if($request->user()->id === $user->id, 422, 'Akun yang sedang digunakan tidak dapat dihapus.');
        abort_if($user->hasRole('admin') && User::role('admin')->count() <= 1, 422, 'Admin terakhir tidak dapat dihapus.');

        $hasRecords = $user->absensis()->exists()
            || $user->jadwalPelajarans()->exists()
            || $user->jurnalMengajars()->exists()
            || $user->pengajuanIzins()->exists()
            || DB::table('kelas')->where('wali_kelas_id', $user->id)->exists()
            || DB::table('absensis')->where('approved_by', $user->id)->exists()
            || DB::table('pengajuan_izins')->where('approved_by', $user->id)->exists();

        abort_if($hasRecords, 422, 'Akun memiliki data atau riwayat yang terhubung dan tidak dapat dihapus.');

        DB::transaction(function () use ($user): void {
            $user->tokens()->delete();
            $user->syncRoles([]);
            $user->syncPermissions([]);
            $user->delete();
        });

        return response()->json(['message' => 'Akun tanpa riwayat berhasil dihapus.']);
    }
}
