# AKSARA

AKSARA is a Laravel application for school attendance, lesson journals, student attendance, academic master data, announcements/agendas, leave requests, and role-based operational dashboards. The interface uses Bootstrap 5 and is designed mobile-first; dashboard modules are presented in full-width cards on small screens.

## Requirements and setup

- PHP and Composer versions supported by this Laravel project.
- MySQL 8 (the schema is defined by the repository migrations).
- PHP extensions `zip` and `simplexml` for Excel template generation and `.xlsx` imports.
- Node/npm only if you need to build or change the Vite assets. The login and dashboard pages are static files in `public/` and load Bootstrap 5.3.3 from CDN.

Typical local setup:

```bash
composer install
cp .env.example .env
php artisan key:generate
# Configure DB_* and mail settings in .env
php artisan migrate
php artisan db:seed
php artisan aksara:create-admin
php artisan serve
```

Open the application root to sign in. The first admin is created interactively; the password is not included in source code or seeded demo accounts. `AKSARA_SEED_DEMO_USERS` is disabled by default and should remain disabled outside local development.

## Roles and dashboards

- **Admin**: user/role/direct-permission administration, attendance review, academic masters and school agendas, settings, discrepancy review, and leave decisions.
- **Guru**: daily check-in/out, today’s teaching schedule, lesson journal submission, and student attendance for the journal session.
- **Wali kelas**: teacher features plus corrections to student attendance for classes they lead.
- **Kurikulum**: attendance controls, academic monitoring, discrepancy review, and authorized academic master management.
- **Kepala sekolah**: attendance controls, monitoring, discrepancy review, and leave decisions.

Attendance check-in and check-out are available to all four seeded roles (admin, guru, kurikulum, kepala sekolah). Authorization is enforced by API permissions as well as by dashboard visibility. Additional capabilities can be assigned to a user by an admin where appropriate.

Guru sees daily attendance, today's per-class teaching schedule when available, and school announcements. Admin and Kurikulum see the same home sections plus an Admin Dashboard with a desktop sidebar and responsive mobile navigation. Academic imports are available from that area for classes, students, subjects, materials, and schedules. Download the matching `.xlsx` template for the required column names before importing. Student rows reference an existing class name; material rows reference an existing subject code; schedule rows reference an academic-year label, teacher NIP, class name, and subject code. Imports are validated and committed as one batch, with a maximum of 2,000 rows per file.

## Important configuration

- Set school geofence coordinates in Admin Settings and explicitly confirm the location before location-based attendance is accepted. Unverified coordinates are intentionally rejected. Strict mode rejects out-of-range attendance; non-strict mode records it for review.
- The active academic year is managed in the app and synchronized with `settings.active_tahun_ajaran`. Check consistency with `php artisan aksara:check-academic-year`. The command reports inconsistencies without changing data; repair only with an explicit source, for example `php artisan aksara:check-academic-year --repair-from=table` or `--repair-from=settings`.
- Configure mail delivery before using password reset links and leave-related email workflows.
- Configure push notification keys through your deployment secrets if push notifications are enabled. Never commit private keys or `.env` values.

## Teacher push reminders

Guru can enable browser push reminders from the home dashboard. Push needs a secure HTTPS site (localhost is allowed for local development), a generated VAPID key pair, and the `push_subscriptions` / `push_reminder_dispatches` tables. Generate keys with `php artisan webpush:vapid`; keep the same private key across deployments and do not commit it. Set `VAPID_SUBJECT` to the production site URL or a valid contact `mailto:` address.

The scheduler sends reminders every minute in `Asia/Jakarta`: 10 minutes before the attendance check-in deadline, at the check-out deadline, 15 minutes into a scheduled lesson if no journal exists, and 5 minutes before a lesson ends if its activity photo is missing. For local development, run `php artisan schedule:work`. On a server, configure the host cron to run `php artisan schedule:run` every minute. Photo reminders link back to the dashboard, where a teacher can upload the missing photo to an existing journal.

## Scope notes from PRD v1.2

- Student attendance is stored per lesson-journal session; this project does not add a separate daily student attendance register.
- Full ATP CRUD is deferred by the PRD.
- Agenda scope is currently school-wide. Grade/class targeting requires an approved scope and audience rule.
- Dashboard monitoring returns raw counts. Percentage KPIs are withheld until their formulas are approved.
- Discrepancy case storage and review are available, but automatic case generation waits for approved actionable discrepancy rules.
- Substitute-teacher journal authorization is denied by default until an approved assignment workflow exists.
- Journal edit policy, leave-submission roles, discrepancy/KPI rules, and full audit-history requirements need product decisions before expanding those behaviors.

## Verification

Run the project test suite with `php artisan test`. Database feature tests use the test environment and do not require a production database. Avoid `migrate:fresh` on databases containing data.
