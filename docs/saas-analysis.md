# HRM SaaS architecture analysis

Snapshot of the active backend and frontend in the current worktree. The backend files under `backend/src` are the source of truth for persistence and API behavior; dated and `Copy` files are not mounted by the active app.

## 1. Database and ORM/driver

- **Database:** MongoDB, connected with Mongoose through `MONGO_URI` in `backend/src/config/env.js` and `backend/src/config/db.js`.
- **ODM/driver:** Mongoose (`mongoose.connect`, models built with `mongoose.Schema`). There is no SQL database or separate SQL driver.
- **Collections:** Active models are `Tenant`, `TenantRequest`, `User`, `Attendance`, `Holiday`, `Leave`, `OutdoorDuty`, `SuperAdmin`, `SuperAdminAuditLog`, `Payment`, and `ProcessedWebhookEvent`; Mongoose uses their conventional collection names.
- Models use MongoDB `_id` and Mongoose's default version key (`__v`). `ProcessedWebhookEvent` and `SuperAdminAuditLog` do not enable Mongoose timestamps; the audit log records its event time in `time`.
- Current unique constraints include User `(tenantId, email)` and `(tenantId, employeeId)`, Holiday `(tenantId, date)`, Attendance `(tenantId, userId, date)`, and OutdoorDuty `(tenantId, userId, date)`. User, Attendance, Holiday, Leave, and OutdoorDuty require an immutable indexed `tenantId` reference; query middleware rejects unscoped reads and writes.

## 2. Collections and fields

Types below describe the Mongoose schema. All collections also have `_id`, `createdAt`, `updatedAt`, and the default `__v`.

### `users` (`User`)

- `tenantId`: required immutable indexed `Tenant` ObjectId reference.
- `employeeId`: required trimmed uppercase String.
- `name`: String, required, trimmed, 2–60 characters.
- `email`: required lowercase trimmed String.
- Unique compound indexes on `(tenantId, email)` and `(tenantId, employeeId)`; migration 003 replaces the former global unique indexes.
- Dashboard query indexes cover tenant/role/department and tenant/role/join date/active status.
- `password`: String, required, excluded from normal query selection; hashed with bcryptjs (12 rounds) in the model save hook.
- `role`: String enum `admin`, `manager`, `employee`; defaults to `employee`.
- `lastLoginAt`: Date, defaults to `null`; updated after successful tenant-user login and used in platform tenant usage details.
- `emailVerified`: Boolean, defaults to `true` for existing/staff-created users.
- `emailVerificationToken`: hashed String, hidden by default and cleared after verification.
- `emailVerificationExpires`: Date, hidden by default; signup verification links expire after 24 hours.
- Personal fields: `firstName`, `middleName`, `lastName`, `otherId`, `drivingLicenseNumber`, `licenseExpiryDate`, `gender` (`Male`, `Female`, `Other`), `maritalStatus` (`Single`, `Married`, `Other`, default `Single`), `nationality` (default `Indian`), `dateOfBirth`, `avatar` (default empty string; stores a data URL or image URL).
- `contact` subdocument: `street1`, `street2`, `city`, `state`, `zipCode`, `country` (default `India`), `homePhone`, `mobilePhone`, `workPhone`, `workEmail`, `otherEmail`.
- `emergencyContact` subdocument: `name`, `relationship`, `phone`.
- Job fields: `jobTitle`, `department`, `joinDate`, `reportingManager` (nullable `User` ObjectId reference), `isActive` (Boolean, default `true`).
- `leaveBalance` subdocument: numeric `casual` (10), `sick` (8), `paid` (12), `oh` (2), `coff` (0), `maternity` (182), `paternity` (3), `bereavement` (3), and `lwp` (0); defaults shown in parentheses, each has minimum 0.
- `documents` array of subdocuments: required `title`, `fileName`, `originalName`, `path`; optional `mimetype`, `size`; `uploadedAt` defaults to now.
- Password recovery: `passwordResetToken` (String, default `null`) and `passwordResetExpires` (Date, default `null`).

### `tenants` (`Tenant`)

- `name`: required trimmed String.
- `slug`: required unique lowercase trimmed String; immutable after creation.
- `status`: enum `trial`, `active`, `suspended`, `deleted`; default `active`.
- `plan`: enum `free`, `basic`, `pro`; default `free`.
- `employeeLimitOverride`: nullable Number, minimum 1. Effective capacity is this value when set, otherwise the plan limit from `backend/src/config/plans.js` (Free 10, Basic 50, Pro 200 active non-admin users).
- `trialEndsAt`: Date, default `null`.
- `deletedAt`: Date, default `null`; set during soft deletion.
- `purgeAfter`: Date, default `null`, indexed; marks the end of the 30-day retention period. Deletion is manual; there is no automatic purge/TTL job.
- `companyProfile`: `website`, `phone`, `address`, `city`, `country` (default `India`).
- `leavePolicy`: numeric defaults for `casual` (12), `sick` (8), `paid` (15), `oh` (2), `coff` (0), `maternity` (182), `paternity` (3), `bereavement` (3), and `lwp` (0).
- `onboarding`: `completed` (default true), `step` (1–5, default 5), and `completedAt`.
- `billing`: `razorpaySubscriptionId` (partial unique index for string IDs), `status` (`inactive`, `pending`, `active`, `halted`, `suspended`, `cancelled`; default `inactive`), `currentPeriodEnd`, `graceUntil`, `lastProcessedAt`, and `suspensionReason`.
- `proman.baseUrl`: optional tenant-specific Proman API base URL.
- `proman.secret`: optional tenant-specific secret; excluded from normal Mongoose query results.

Migration `006-employee-limit-override.js` copies existing legacy `employeeLimit` values into `employeeLimitOverride` only when they differ from the configured plan limit, then unsets the legacy field. Run with `--dry-run` first.

### `payments` (`Payment`)

- Required immutable indexed `tenantId` reference, `razorpayPaymentId`, `razorpaySubscriptionId`, numeric `amount` (Razorpay minor units), `currency`, and `status`.
- Optional `invoiceId`, `paidAt`, `periodStart`, and `periodEnd`.
- Unique compound index on `(tenantId, razorpayPaymentId)`; tenant query guard applies.

### `processedwebhookevents` (`ProcessedWebhookEvent`)

- `eventId`: required global unique String.
- `processedAt`: required Date, defaults to now.
- `expiresAt`: required Date with a TTL index (`expireAfterSeconds: 0`) for idempotency records older than 30 days.

### `superadmins` (`SuperAdmin`)

- `name`: required trimmed String.
- `email`: required lowercase trimmed String with a global unique index.
- `password`: required String excluded from normal query selection; hashed with bcryptjs (12 rounds) in the model save hook.
- Timestamps are enabled. This platform account is not associated with a tenant.

### `superadminauditlogs` (`SuperAdminAuditLog`)

- `who`: nullable indexed ObjectId reference to `SuperAdmin` (`null` for payment webhooks).
- `source`: `super-admin` or `razorpay-webhook`.
- `action`: required trimmed String containing the HTTP method and path, or the successful Super Admin login action.
- `tenantId`: nullable indexed ObjectId reference to `Tenant`; platform-wide actions and tenant creation can have no target tenant ID.
- `details`: optional Mixed data, including old/new plan and employee-limit override values for plan changes.
- `time`: indexed Date, defaults to now. The model does not use Mongoose timestamps.

### `tenantrequests` (`TenantRequest`)

- `companyName`, `slug`, `contactName`, `email`, `phone`: required strings. Slugs use the shared tenant slug policy, including reserved-word checks.
- `employeeCountEstimate`: required integer from 1 to 100,000; `message`: optional trimmed text, max 1,000 characters.
- `status`: `pending`, `approved`, or `rejected`; defaults to `pending`.
- `rejectionReason`: optional trimmed text; `tenantId`: nullable `Tenant` reference, set when approved.
- `reviewedBy`: nullable `SuperAdmin` reference; `reviewedAt`: nullable Date.
- `emailVerified`: Boolean, defaults false; `ipAddress`: request IP.
- `emailVerificationToken`: hashed, excluded from normal reads; `emailVerificationExpires`: Date, also excluded from normal reads. These fields support one-time 24-hour email verification.
- Partial unique indexes on `email` and `slug` while status is `pending`; approved and rejected requests no longer reserve either value.
- Timestamps are enabled.

### `attendances` (`Attendance`)

- `tenantId`: required immutable indexed `Tenant` ObjectId reference.
- `userId`: required indexed `User` ObjectId reference.
- `date`: required indexed String (`YYYY-MM-DD` in current controllers).
- `clockIn`: required Date; `clockOut`: Date, default `null`.
- `totalHours`: Number, default 0; `activeMinutes`: Number, default 5.
- `lastActiveAt`, `lastHeartbeatAt`: Date, each default now.
- `status`: enum `in-progress`, `present`, `half-day`, `short-leave`, `absent`; default `in-progress`.
- `ipAddress`: String.
- Unique compound index on `(tenantId, userId, date)`.
- Dashboard queries are supported by an additional compound index on `(tenantId, date, userId, status)`.

### `holidays` (`Holiday`)

- `tenantId`: required immutable indexed `Tenant` ObjectId reference.
- `date`: required String; intended format `YYYY-MM-DD`.
- `title`: required String.
- `description`: String, default empty string.
- Unique compound index on `(tenantId, date)`.

### `leaves` (`Leave`)

- `tenantId`: required immutable indexed `Tenant` ObjectId reference.
- `userId`: required indexed `User` ObjectId reference.
- `leaveType`: required enum `casual`, `sick`, `paid`, `oh`, `lwp`, `coff`, `maternity`, `paternity`, `bereavement`.
- `startDate`, `endDate`: required Dates; `daysCount`: required Number, minimum 0.5.
- `reason`: required trimmed String, max 500 characters.
- `isHalfDay`: Boolean, default false; `halfDaySession`: `first`, `second`, or `null` (default `null`).
- `prescription` subdocument: `originalName`, `fileName`, `path`, `mimetype` (Strings, default `null`) and `size` (Number, default `null`).
- `status`: enum `pending`, `approved`, `rejected`, `cancelled`; default `pending`, indexed.
- `reviewedBy`: nullable `User` ObjectId reference; `rejectionReason`: nullable trimmed String.
- Prescription metadata is saved in the schema's `prescription` subdocument and is used to authorize file reads.
- Dashboard compound indexes cover tenant/status/date ranges, approval timestamps, and pending-request ordering.

### `outdoorduties` (`OutdoorDuty`)

- `tenantId`: required immutable indexed `Tenant` ObjectId reference.
- `userId`: required indexed `User` ObjectId reference.
- `date`: required String (`YYYY-MM-DD` in the controller).
- `startTime`, `endTime`: required trimmed Strings (`HH:mm` in the controller).
- `hours`: Number, minimum 0.5, maximum 24, default 0.
- `location`: trimmed String, default empty string.
- `reason`: required trimmed String, max 500 characters.
- `status`: enum `pending`, `approved`, `rejected`; default `pending`, indexed.
- `reviewedBy`: nullable `User` ObjectId reference; `rejectionReason`: nullable trimmed String.
- Unique compound index on `(tenantId, userId, date)`.

No separate settings, department, or integration model is defined in `backend/src/models`. `Tenant` is platform-level; all five business models above require tenant ownership, and a Mongoose query guard rejects missing tenant filters. Migrations use a trusted AsyncLocalStorage bypass. Super Admin employee-count reads use an explicit `allowCrossTenant: true` Mongoose option inside a trusted Super Admin AsyncLocalStorage context and remain bounded by a finite `tenantId: { $in: [...] }` filter. The flag alone does not bypass the guard, and it cannot bypass tenant filters for writes. This option is hard-coded only in Super Admin controller queries and must never be copied from request input or used in tenant routes.

## 3. API routes and data access

Every listed route is mounted under `/api`. “Read” and “write” describe persistent database effects; external Proman calls are identified separately. `auth` means a Bearer JWT is required. Role checks are additional to authentication.

### Authentication (`/api/auth`)

| Method and path | Access | Data effect |
|---|---|---|
| `POST /register` | Public; company code required | **Read/write:** resolve tenant, check tenant-scoped email/manager, and create an employee. |
| `POST /login` | Public; company code required | **Read:** resolve tenant, reject suspended tenant, find tenant-scoped user and verify password; issue JWT. |
| `POST /forgot-password` | Public; company code required | **Read/write:** look up tenant-scoped user and store hashed, expiring reset token; send email. Unknown company/email returns without writing. |
| `POST /reset-password/:token` | Public; company code required | **Read/write:** resolve tenant, find its unexpired reset token, update password, clear reset fields. |
| `GET /me` | Auth | **Read:** fetch current user's profile. |
| `PATCH /change-password` | Auth | **Read/write:** verify current password and save new password. |

### Public signup and verification (`/api/public`)

| Method and path | Access | Data effect |
|---|---|---|
| `GET /plans` | Public | **Read:** return plan names and configured employee caps. |
| `GET /slug-availability?slug=` | Public, rate-limited | **Read:** check tenant slug availability and reserved-word policy. |
| `GET /slug-available?slug=` | Public, rate-limited | **Read:** check tenant and pending-request slug reservations for the public request form. |
| `POST /signup-request` | Public, 5/hour/IP and honeypot protected | **Read/write/email:** validate and store a pending request, send a verification link first, and send the applicant a receipt email. The request is hidden from Super Admin until verified. |
| `GET /signup-request/verify?token=` | Public, rate-limited | **Read/write/email:** consume a hashed 24-hour verification token. In `approval` mode, reveal the verified pending request to Super Admin. In `auto` mode, create a 14-day Free trial and its first admin, mark the request approved, and email credentials. |
| `POST /signup` | Public, legacy endpoint | **No data access:** returns HTTP 410; new workspace submissions must use `POST /signup-request` so `TENANT_SIGNUP_MODE` cannot be bypassed. |
| `POST /verify-email` | Public, rate-limited | **Read/write:** resolve the tenant by company code and mark the user verified when the hashed, unexpired token matches. |

### Onboarding (`/api/onboarding`, admin only)

| Method and path | Data effect |
|---|---|
| `GET /` | **Read:** fetch the current tenant's company profile, leave policy, and onboarding step. |
| `PATCH /` | **Write:** update tenant company profile, leave defaults, progress, or completion state. |

The wizard adds the Indian national holiday template through the normal tenant-scoped Holiday API, uses the tenant leave policy for new staff, and adds/imports employees through `/api/admin`.

### Billing (`/api/billing`)

| Method and path | Access | Data effect |
|---|---|---|
| `POST /subscribe` | Tenant admin | **Read/write/external write:** choose a configured Razorpay plan server-side, create a test-mode subscription with tenant/plan notes, and save the returned subscription ID. |
| `POST /webhook` | Public Razorpay callback; raw body before JSON parsing | **Read/write:** verify HMAC-SHA256 signature before database access, deduplicate event ID, map subscription plan IDs, update tenant billing state, record charged payments and audit events. Unknown/stale/mismatched tenant events are ignored; idempotency records expire after 30 days. |

`subscription.halted` starts a seven-day grace period. A periodic job suspends tenants after grace; a successful charge can restore a non-payment suspension. Cancellation retains access through `currentPeriodEnd`. The tenant auth middleware checks suspension and expired cancellation status, including for already-issued JWTs. Only `rzp_test_` credentials are accepted by the subscription endpoint.

### Attendance (`/api/attendance`, all authenticated)

| Method and path | Data effect |
|---|---|
| `POST /clock-in` | **Read/write:** check for today's record, then create attendance. |
| `POST /clock-out` | **Read/write:** close today's record and compute hours/status; weekend work may also update the user's COFF balance. |
| `POST /heartbeat` | **Read/write:** find active attendance; may increment and save `activeMinutes` and heartbeat timestamp. |
| `GET /today` | **Read, sometimes write:** return today's record; if stored totals conflict with elapsed clock time, the handler recalculates and saves derived fields. |
| `GET /my-history` | **Read:** paginated current-user attendance, optionally filtered by month/year. |

### Outdoor duty (`/api/outdoor-duty`, all authenticated)

| Method and path | Access | Data effect |
|---|---|---|
| `POST /` | Auth | **Write:** create current user's outdoor-duty request. |
| `POST /apply` | Auth | **Write:** same handler as `POST /`; this alias also has Joi validation. |
| `GET /my-requests` | Auth | **Read:** paginated current-user requests. |
| `GET /` | Auth; manager/admin gets approver list, employee gets own list | **Read:** manager list is restricted to their reportees; admin list is global; employees see their own requests. |
| `GET /pending` | Manager or admin | **Read:** paginated approver list (manager reportees; admin global). |
| `PATCH /:id/review` | Manager or admin | **Read/write:** review request; approval also creates or updates the user's attendance for that date. |
| `PATCH /:id/approve` | Manager or admin | **Read/write:** alias that sets status to approved; approval also changes attendance. |
| `PATCH /:id/reject` | Manager or admin | **Read/write:** alias that sets status to rejected. |

### Leave (`/api/leaves`, all authenticated)

| Method and path | Access | Data effect |
|---|---|---|
| `POST /apply` | Auth | **Read/write:** check balance and create own leave request; normal leave balances are deducted at application time. Prescription upload may also write a local file. |
| `GET /my-leaves` | Auth | **Read:** paginated current-user leave requests. |
| `PATCH /:id/cancel` | Auth | **Read/write:** cancel own pending request and refund its balance. |
| `GET /all` | Manager or admin | **Read:** admins see all leaves; managers see only their reportees' leaves. |
| `PATCH /:id/review` | Manager or admin | **Read/write:** admins can review any leave; managers can review only their reportees' leaves. Rejection refunds the applicant's balance. |

### HR administration (`/api/admin`, all routes require admin)

| Method and path | Data effect |
|---|---|
| `GET /dashboard` | **Read:** tenant-scoped employee, attendance, leave, outdoor-duty, holiday, joiner, and plan summaries; includes a limited set of pending approval items for quick actions. |
| `POST /bulk-import` | **Read/write:** parse staff CSV; insert new users and update matching users, including roles, manager references, and leave balances. |
| `GET /export-attendance` | **Read:** query attendance and return CSV. |
| `GET /today-employee-attendance` | **Read:** list active staff and today's attendance. This identical GET is registered twice in `admin.routes.js`. |
| `GET /employee-attendance-history` | **Read:** query a selected employee's attendance history. |
| `POST /create-staff` | **Write:** create a user with generated temporary password; send credentials email. |
| `GET /staff` | **Read:** paginated staff and manager list. |
| `GET /usage` | **Read:** active non-admin employee count, configured plan limit, custom override, and effective employee limit. |
| `PATCH /assign-manager` | **Read/write:** validate manager and update a user's `reportingManager`. |
| `PATCH /adjust-balance` | **Read/write:** set one employee's balance for a leave type. |
| `PATCH /update-staff` | **Read/write:** update staff name, email, and role. |
| `PATCH /toggle-status` | **Read/write:** toggle `isActive`. |
| `GET /leave-history` | **Read:** paginated approved leave records and aggregate totals. |
| `POST /apply-employee-leave` | **Read/write:** create an approved leave for an employee and update their balance. |
| `POST /trigger-year-end-rollover` | **Read/write:** process every active user's leave balances (casual reset, OH transferred to paid, OH reset). |
| `POST /direct-attendance` | **Read/write:** upsert attendance for an employee/date. |
| `POST /grant-leave-all` | **Read/write:** credit a leave balance to one selected user or all active users. |
| `GET /export-leave-history` | **Read:** query users and approved leaves; return CSV. |
| `POST /employee-reset-password` | **Read/write:** set a selected user's password and email the temporary password. |

### Users (`/api/users`)

All routes require auth and are limited to `req.tenantId`. Document upload and deletion allow an admin to target any user in that tenant; other roles may target only their own `userId`.

| Method and path | Data effect |
|---|---|
| `GET /profile` | **Read:** own profile; an admin can pass `?userId=` to read another user's profile. |
| `PUT /profile` | **Read/write:** update profile; admin can select another user and can edit role/job fields. |
| `POST /:userId/documents` | **Read/write:** append document metadata to a selected user's document list and save uploaded file on disk. |
| `DELETE /:userId/documents/:docId` | **Read/write:** remove metadata and, if found, the local file. |

### Official holidays (`/api/holidays`)

All routes require auth and are scoped to the authenticated user's `tenantId`; create/import/update/delete additionally require admin.

| Method and path | Data effect |
|---|---|
| `GET /` | **Read:** list holidays, optionally filtered by year and paginated; `all=true` returns all matching records. |
| `POST /` | **Read/write:** check date uniqueness, then create holiday. |
| `POST /import` | **Read/write:** parse CSV and insert non-duplicate holiday rows. |
| `PUT /:id` | **Read/write:** check date uniqueness and update holiday. |
| `DELETE /:id` | **Read/write:** delete holiday. |

### Proman proxy (`/api/proman`)

All routes require HRM authentication and proxy to the configured Proman service; they do not persist data in an HRM collection.

| Method and path | Data effect |
|---|---|
| `GET /tasks` | **External read:** fetch tasks for the supplied email. |
| `POST /timelog` | **External write:** forward a time log. |
| `PATCH /task/:id/status` | **External write:** forward a task status change. |

### Uploaded files (`/api/uploads`)

| Method and path | Access | Data effect |
|---|---|---|
| `GET /:category/:fileName` | Auth; file owner or admin in same tenant | **Read:** serve a document or prescription only if the authenticated user owns its database reference, or the user is an admin in that tenant. |

Direct `/uploads/*` static access is disabled.

### Platform administration (`/api/super`)

`POST /auth/login` is public and authenticates only against the separate `SuperAdmin` collection. Every other route requires a Super Admin token; the audit middleware records each authenticated request.

| Method and path | Access | Data effect |
|---|---|---|
| `POST /auth/login` | Public; Super Admin credentials | **Read/write:** find the platform account, verify its bcrypt password, issue a separate token, and record a successful login audit event. |
| `GET /tenants` | Super Admin | **Read/write:** search/filter and paginate tenants with per-tenant employee counts; the authenticated action is audited. |
| `GET /tenant-requests` | Super Admin | **Read/write:** list and paginate only pending requests whose email is verified; audited. |
| `PATCH /tenant-requests/:id/review` | Super Admin | **Read/write/email:** approve a verified request by creating its 14-day Free trial and first administrator, or reject it with a reason; emails the applicant and audits the action. |
| `POST /tenants` | Super Admin | **Read/write:** create an active tenant on the selected plan by default, or a 14-day trial when explicitly selected, and its first HR Administrator user; generate a temporary password and email the company code, login URL, and credentials; audited. |
| `GET /tenants/:id` | Super Admin | **Read/write:** return tenant details and usage (non-admin employee count, latest user login, and creation date); audited. |
| `GET /tenants/:id/audit` | Super Admin | **Read/write:** return paginated audit events for that tenant, newest first; audited. |
| `PATCH /tenants/:id` | Super Admin | **Read/write:** update allowed tenant name, plan, `employeeLimitOverride`, and trial end date; a lower effective limit cannot be set below the active employee count. Plan changes clear an omitted override; same-plan changes retain it unless explicitly changed. The audit details include old/new plan and override; audited. |
| `PATCH /tenants/:id/status` | Super Admin | **Read/write:** set a tenant to active or suspended; audited. |
| `DELETE /tenants/:id` | Super Admin | **Read/write:** soft-delete by setting status to `deleted` and recording `deletedAt`/`purgeAfter`; audited. |
| `GET /stats` | Super Admin | **Read/write:** count non-deleted, active, trial, and suspended tenants and employees; audited. |

## 4. Login, JWT, and roles today

- The frontend login form submits company code, email, and password to `POST /api/auth/login`. The backend resolves the tenant slug, rejects suspended tenants, fetches the user by `{tenantId, email}`, selects the normally hidden password, and compares it with bcryptjs. Deactivated users (`isActive === false`) are rejected.
- Suspended/deleted tenants and canceled subscriptions past `currentPeriodEnd` are also rejected by tenant authentication, revoking access from existing tokens. A new signup user may log in before verifying email; the admin UI shows a verification banner until completion.
- Successful login returns a signed JWT containing `id`, `role`, and `tenantId`, with expiry configured by `JWT_EXPIRES_IN` (default `1d`) and signing key from `JWT_SECRET`.
- Platform Super Admin login is separate: `POST /api/super/auth/login` authenticates a `SuperAdmin` account and returns a JWT containing `{id, type: "super"}`, signed with `SUPER_JWT_SECRET` (expiry from `SUPER_JWT_EXPIRES_IN`, default `8h`). `authenticateSuper` rejects tenant tokens, while tenant authentication rejects Super Admin tokens. The platform account is seeded from `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, and optional `SUPER_ADMIN_NAME` by `backend/scripts/seedSuperAdmin.js`.
- The React auth context stores the token and user JSON in browser `localStorage`; the Axios request interceptor sends `Authorization: Bearer <token>`. Startup calls `/auth/me` to refresh the user. A 401 clears both stored values.
- `authenticate` verifies the JWT, loads the current user from MongoDB, rejects missing/deactivated accounts and mismatched tenant claims, and attaches the database user to `req.user` and trusted tenant ID to `req.tenantId`. Role authorization therefore uses the current database role, not just the JWT's role claim.
- `authorize` compares `req.user.role` against allowed role strings:
  - `admin` is labeled “HR Administrator” in the UI and is required for `/api/admin/*` and holiday mutations.
  - `employee` is the default role and is used for employee self-service operations.
  - `manager` is also a real backend role, despite the UI focus on HR Administrator and Employee; managers can review/list leave and outdoor duty only for their reportees.
- The Super Admin is a separate platform-level identity, not a tenant role. Tenant management is available only under `/api/super`; Super Admin actions are recorded in `SuperAdminAuditLog` with actor, action, optional tenant ID, and time.
- Public registration has no invite/admin middleware, requires a company code, and always assigns `employee`; a submitted role is ignored. Staff creation with administrative roles remains under `/api/admin`.
- Public tenant requests are controlled by `TENANT_SIGNUP_MODE=approval|auto` (default `approval`). Super Admin can list email-verified pending requests and approve/reject them. Approval provisions a 14-day Free trial and first admin, then emails credentials; auto mode provisions after email verification. Unverified requests are not listed. Super Admin provisioning creates an active tenant by default; selecting trial creates a 14-day trial. Expired trials are atomically changed to active Free, with the employee limit override cleared. The default tenant is active Free with no trial end. The admin onboarding wizard stores progress on Tenant and guides the admin through profile, holidays, leave defaults, employee setup, and completion.
- Public tenant requests are controlled by `TENANT_SIGNUP_MODE=approval|auto` (default `approval`). Super Admin can list email-verified pending requests and approve/reject them. Approval provisions a 14-day Free trial and first admin, then emails credentials; auto mode provisions after email verification. Unverified requests are not listed.
- Forgot-password uses a random reset token, stores its SHA-256 hash and a 15-minute expiry, and emails the raw token with the company code. Password reset resolves that company and searches only its users; password changes update the logged-in user. There is no separate session store or token-version field.

## 5. Globally shared data and configuration

- **Official holidays are tenant-scoped.** Holiday queries and writes use the authenticated user's tenant, and `(tenantId, date)` is unique. The old global unique-date index is removed by migration 002; legacy holidays belong to the default tenant after migration 001.
- There is no settings collection. Roles and their names are code constants; tenant leave defaults are stored on Tenant and applied when staff are created/imported. The annual rollover rules remain in the job/controller code.
- Auto-punchout and year-end rollover iterate active tenants and run queries inside each tenant's AsyncLocalStorage context; both query sets include `tenantId`. Year-end rollover remains scheduled in `Asia/Kolkata`.
- Proman base URL and secret can be configured per Tenant. The legacy environment/default values are fallbacks for the `default` tenant only; other tenants must configure both values.
- Email transport, JWT configuration, database URI, frontend URL, and CORS allowlist are deployment environment configuration shared by the process.
- Plan caps (Free 10, Basic 50, Pro 200 active non-admin employees) and module entitlements are centralized in `backend/src/config/plans.js`; Free and Basic include core HR modules, while Pro also includes Task Time Tracker and exports. Free has no expiry. `Tenant.employeeLimitOverride` is an optional per-customer override. Capacity checks return `PLAN_LIMIT_REACHED`; lapsed paid subscriptions retain read access but writes return `SUBSCRIPTION_EXPIRED`; suspended tenants are restricted; unavailable modules return `FEATURE_NOT_IN_PLAN`.
- Razorpay test credentials, plan IDs, and webhook secret are deployment environment configuration. Webhook payments and idempotency records are persisted in tenant-scoped `Payment` and platform-level `ProcessedWebhookEvent` collections; each webhook action is written to the audit log with source `razorpay-webhook`.
- `SUPER_JWT_SECRET` and `SUPER_JWT_EXPIRES_IN` configure the separate platform token. Super Admin seed credentials are deployment inputs and are not stored in tenant settings.
- Uploaded employee documents and leave prescriptions are stored under `backend/uploads/<tenantId>/{documents,prescriptions}`. Migration `backend/scripts/migrations/005-tenant-upload-paths.js` moves legacy default-tenant files and updates stored paths. Authenticated `/api/uploads` reads and user document deletion enforce tenant ownership.

## 6. Tenant migration plan (least risky to most risky)

Use an expand/backfill/switch/contract rollout. During migration, every request must resolve its tenant from a trusted source (for example a verified host-to-tenant mapping or an authenticated tenant selection); do not trust a client-supplied `tenant_id` as proof of membership. Keep the existing single-tenant data accessible throughout the transition.

1. **Establish tenant identity and provisioning.** The Tenant collection, immutable slugs, lifecycle/plan fields, AsyncLocalStorage context helper, and idempotent default-tenant seed script now exist. A separate Super Admin can provision tenants and their first HR Administrator. Login resolves a company code to a tenant, and authenticated requests derive `req.tenantId` from a verified JWT and database user. Verified host mapping and tenant-aware request logging remain optional follow-up work.
2. **Add tenant metadata compatibly and backfill.** `backend/scripts/migrations/001-backfill-tenant.js` supports `--dry-run`, assigns missing tenant IDs to the seeded tenant, and verifies that no IDs or cross-tenant user references remain. The five tenant-owned schemas now require immutable `tenantId`; the migration uses an explicit trusted query-guard bypass.
3. **Scope the lowest-coupling data first: holidays and configuration.** Holiday list/create/import/update/delete now use the authenticated user's tenant, and `backend/scripts/migrations/002-scope-holiday-index.js` replaces global unique `date` with unique `(tenantId, date)` after checking for missing tenant IDs and duplicate tenant/date pairs. The existing calendar is assigned to the seeded tenant by migration 001. If later adding settings, make them tenant-owned rather than process-global; classify genuinely platform-wide values separately.
4. **Tenant-scope User identity and all account creation.** User now has tenant-scoped unique email and employee ID indexes; migration 003 reports duplicate compound keys before replacing the global indexes. Login, registration, admin create/import/update, manager assignment, reset, staff search, and user/profile/document operations use the authenticated tenant; manager assignment verifies tenant membership.
5. **Tenant-scope transactional/employee records.** Attendance, Leave, and OutdoorDuty reads and writes now use the authenticated tenant; admin reports, exports, direct attendance, employee leave, and review flows are tenant-scoped. Referenced users and reviewers are constrained to the same tenant. Migration `backend/scripts/migrations/004-scope-attendance-od-indexes.js` reports counts with `--dry-run`, checks for missing tenant IDs and duplicate tenant/user/date keys, then replaces the Attendance and OutdoorDuty global unique indexes with `(tenantId, userId, date)`.
6. **Partition background jobs and filesystem/integrations.** Auto-punchout and year-end rollover now iterate active tenants within tenant contexts. Upload storage is tenant-partitioned, with migration 005 for existing files and tenant-checked download/delete paths. Tenant-specific Proman settings are used by all proxy routes; the old fallback applies only to the default tenant. Partition email sender/configuration only if tenants require distinct mail identities.
7. **Switch authentication and authorization to tenant-aware claims.** Login resolves the tenant from company code and authenticates against `(tenantId, email)`; JWTs include tenant ID and `authenticate` verifies it against the database user and sets `req.tenantId`. Login, forgot-password, and reset-password flows require a company code. Admin, employee, reportee, upload, export, and Proman paths are tenant-scoped.
8. **Enforce isolation and remove compatibility paths.** All five tenant-owned schemas now require immutable `tenantId`. Query middleware rejects unscoped find/count/update/delete, aggregate, and bulk-write operations. Migrations have a trusted bypass; Super Admin cross-tenant queries also require an explicit query option inside a trusted context. Reset-password lookup and startup employee-ID repair are tenant-scoped. Backend tests exercise cross-tenant behavior across every documented API route, and GitHub Actions runs the backend suite on pushes and pull requests.

The public SaaS lifecycle is now present on top of that isolation: self-service signup creates a trial workspace, first-login onboarding and verification are tenant-owned, and plan capacity is centrally configured with an optional audited Super Admin override. Before deploying the new plan schema against an existing database, run migration 006 with `--dry-run`, review custom-cap counts, then apply it to preserve non-default legacy limits. Razorpay integration is test-mode only until deployment supplies test credentials, plan IDs, and a webhook secret.

**Highest-risk areas to gate and verify carefully:** authentication and globally unique identities; admin reports and bulk operations; leave/attendance cross-document updates and their unique indexes; and background/file/external-integration paths that currently operate globally.
