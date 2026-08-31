# Sanchaar auth backend (prototype)

In-memory Express API for the authority login flow: **Agency Code → Employee ID →
Passcode → OTP**. No database — data resets on restart. Built to be swapped for
real persistence + a real SMS provider later (see comments in `authStore.js`).

## Run it

```bash
cd backend
npm install
npm start
```

Server starts at `http://localhost:4000`. Console prints:

```
Sanchaar auth backend running at http://localhost:4000
Demo login → Agency: DEMO · Employee ID: DEMO1 · Passcode: 0000
```

Keep this running alongside your frontend (e.g. Live Server on `127.0.0.1:5500`).

## Demo credentials

| Agency Code | Employee ID | Passcode |
|---|---|---|
| DEMO | DEMO1 | 0000 |
| DTC  | EMP1001 | 4821 |
| DTC  | EMP1002 | 7734 |
| BMTC | EMP2001 | 5590 |

In dev mode (`NODE_ENV` unset or not `production`), the generated OTP is also
printed to the server console **and** returned in the login response as
`devOtp`, so you can test the full flow without a real SMS gateway. Remove
`devOtp` from the response before shipping this anywhere real.

## API

### `GET /api/auth/agencies`
Returns `[{ code, name }, ...]` — populate the Agency Code dropdown with this.

### `POST /api/auth/login`
Body: `{ agencyCode, employeeId, passcode }`
- `200` → `{ tempToken, expiresInSeconds, devOtp? }` — show the OTP screen next.
- `400` → missing fields.
- `401` → `{ error }` — bad agency/employee/passcode.

### `POST /api/auth/verify-otp`
Body: `{ tempToken, otp }`
- `200` → `{ token, employee: { employeeId, name, role, agencyCode } }` — store
  `token`, redirect to the dashboard.
- `400/401` → `{ error, attemptsRemaining? }`.

### `POST /api/auth/resend-otp`
Body: `{ tempToken }` → `{ expiresInSeconds, devOtp? }`.

### `GET /api/auth/session`
Header: `Authorization: Bearer <token>` → `{ employee }` or `401`. Use this on
`dashboard.html` load to confirm the session is still valid before showing
authority data.

## What to change before production

1. Replace the in-memory `AGENCIES` array in `authStore.js` with a real DB table,
   and hash passcodes with bcrypt (the swap-in point is commented in
   `verifyLogin()`).
2. Replace the `console.log('[MOCK SMS] ...')` calls with a real SMS/email OTP
   provider, and stop returning `devOtp` in responses.
3. Move `sessions`/`pendingOtps` out of process memory (Redis, DB) so they
   survive restarts and work across multiple server instances.
4. Add rate limiting on `/api/auth/login` itself (currently only OTP attempts
   are capped) to slow down credential-guessing.
