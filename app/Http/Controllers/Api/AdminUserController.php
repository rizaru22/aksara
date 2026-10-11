<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\SimpleXlsx;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Throwable;

class AdminUserController extends Controller
{
    private const USER_TEMPLATE = ['Pengguna', ['nama', 'email', 'nip', 'jenis_kelamin', 'sandi']];
    private const ROLES = ['guru', 'tendik', 'admin', 'kurikulum', 'kepsek'];

    public function roles(Request $request)
    {
        abort_unless($request->user()->hasRole('admin'), 403);

        return response()->json([
            'roles' => self::ROLES,
            'permissions' => \Spatie\Permission\Models\Permission::query()->orderBy('name')->pluck('name'),
        ]);
    }

    public function index(Request $request)
    {
        abort_unless($request->user()->hasRole('admin'), 403);
        return response()->json(User::query()->with(['roles:id,name', 'permissions:id,name'])->orderBy('nama')->paginate(30));
    }

    public function template(Request $request, SimpleXlsx $xlsx)
    {
        abort_unless($request->user()->hasRole('admin'), 403);
        if (! class_exists(\ZipArchive::class)) {
            return response()->json(['message' => 'Aktifkan ekstensi PHP zip untuk membuat template Excel.'], 503);
        }

        [$sheet, $headers] = self::USER_TEMPLATE;
        $content = $xlsx->write($headers, $sheet);

        return response($content, 200, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => 'attachment; filename="template_pengguna.xlsx"',
            'Cache-Control' => 'private, no-store',
        ]);
    }

    public function import(Request $request, SimpleXlsx $xlsx)
    {
        abort_unless($request->user()->hasRole('admin'), 403);
        // Terima parameter lama `role` untuk kompatibilitas dengan halaman yang belum diperbarui.
        if (! $request->has('roles') && $request->filled('role')) {
            $request->merge(['roles' => [$request->input('role')]]);
        }
        $data = $request->validate([
            'file' => ['required', 'file', 'mimes:xlsx', 'max:10240'],
            'roles' => ['required', 'array', 'min:1'],
            'roles.*' => ['required', 'string', 'distinct', Rule::in(self::ROLES), Rule::exists('roles', 'name')],
        ]);
        $this->validateRoleCombination($data['roles']);
        if (! class_exists(\ZipArchive::class)) {
            return response()->json(['message' => 'Aktifkan ekstensi PHP zip untuk mengimpor file Excel.'], 503);
        }

        try {
            $rows = $xlsx->read($request->file('file')->getRealPath());
            $missing = array_values(array_diff(self::USER_TEMPLATE[1], array_keys($rows[0] ?? [])));
            if ($missing) {
                throw ValidationException::withMessages(['file' => 'Kolom template tidak lengkap: '.implode(', ', $missing).'. Unduh template terbaru.']);
            }
            if (count($rows) > 2000) {
                throw ValidationException::withMessages(['file' => 'Maksimum 2.000 baris data per impor.']);
            }

            $users = $this->mapUsers($rows);
            DB::transaction(function () use ($users, $data): void {
                foreach ($users as $attributes) {
                    $user = User::query()->create($attributes);
                    $user->syncRoles($data['roles']);
                }
            });

            return response()->json([
                'message' => count($users).' pengguna berhasil diimpor dengan role '.implode(', ', $data['roles']).'.',
                'data' => ['imported' => count($users), 'failed' => 0],
            ]);
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (RuntimeException $exception) {
            throw ValidationException::withMessages(['file' => $exception->getMessage()]);
        } catch (Throwable $exception) {
            return response()->json(['message' => 'Impor dibatalkan karena data tidak valid atau email/NIP bertabrakan. Tidak ada akun yang disimpan. Periksa file lalu coba lagi.'], 422);
        }
    }

    private function mapUsers(array $rows): array
    {
        $mapped = [];
        $seenEmails = [];
        $seenNips = [];
        $errors = [];

        foreach ($rows as $offset => $row) {
            $line = $offset + 2;
            $gender = strtoupper(trim((string) ($row['jenis_kelamin'] ?? '')));
            $gender = match ($gender) {
                'LAKI-LAKI', 'LAKI LAKI' => 'L',
                'PEREMPUAN' => 'P',
                default => $gender,
            };
            $attributes = [
                'nama' => trim((string) ($row['nama'] ?? '')),
                'email' => strtolower(trim((string) ($row['email'] ?? ''))),
                'nip' => trim((string) ($row['nip'] ?? '')) ?: null,
                'jenis_kelamin' => $gender ?: null,
                'password' => (string) ($row['sandi'] ?? ''),
            ];

            $validator = Validator::make($attributes, [
                'nama' => ['required', 'string', 'max:255'],
                'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')],
                'nip' => ['nullable', 'string', 'max:64', Rule::unique('users', 'nip')],
                'jenis_kelamin' => ['nullable', Rule::in(['L', 'P'])],
                'password' => ['required', 'string', 'min:12'],
            ], [
                'jenis_kelamin.in' => 'Jenis kelamin harus L, P, Laki-laki, atau Perempuan.',
                'password.min' => 'Sandi minimal 12 karakter.',
            ]);

            if ($validator->fails()) {
                $errors[] = 'Baris '.$line.': '.implode(' ', array_merge(...array_values($validator->errors()->toArray())));
                continue;
            }

            $emailKey = strtolower($attributes['email']);
            $nipKey = $attributes['nip'] === null ? null : strtolower($attributes['nip']);
            if (isset($seenEmails[$emailKey])) $errors[] = 'Baris '.$line.': email duplikat pada file.';
            if ($nipKey !== null && isset($seenNips[$nipKey])) $errors[] = 'Baris '.$line.': NIP duplikat pada file.';
            $seenEmails[$emailKey] = true;
            if ($nipKey !== null) $seenNips[$nipKey] = true;
            $mapped[] = $attributes;
        }

        if ($errors) throw ValidationException::withMessages(['file' => $errors]);
        if (! $mapped) throw ValidationException::withMessages(['file' => 'Tidak ada baris pengguna yang dapat diimpor.']);

        return $mapped;
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
            'roles' => ['required', 'array', 'min:1'],
            'roles.*' => ['required', 'string', 'distinct', Rule::in(self::ROLES), Rule::exists('roles', 'name')],
            'permissions' => ['sometimes', 'array'],
            'permissions.*' => ['required', 'distinct', 'exists:permissions,name'],
        ]);
        $this->validateRoleCombination($data['roles']);

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
            'roles' => ['sometimes', 'required', 'array', 'min:1'],
            'roles.*' => ['required', 'string', 'distinct', Rule::in(self::ROLES), Rule::exists('roles', 'name')],
            'permissions' => ['sometimes', 'array'],
            'permissions.*' => ['required', 'distinct', 'exists:permissions,name'],
        ]);

        if (isset($data['roles'])) $this->validateRoleCombination($data['roles']);

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

    private function validateRoleCombination(array $roles): void
    {
        $roles = array_values(array_unique($roles));
        if (in_array('kepsek', $roles, true) && count($roles) > 1) {
            throw ValidationException::withMessages(['roles' => 'Role kepsek tidak dapat digabung dengan role lain.']);
        }
        if (in_array('guru', $roles, true) && in_array('tendik', $roles, true)) {
            throw ValidationException::withMessages(['roles' => 'Role guru tidak dapat digabung dengan role tendik.']);
        }
    }
}
