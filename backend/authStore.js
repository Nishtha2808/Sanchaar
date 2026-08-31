/* ============================================================
   authStore.js — in-memory "database" for the auth prototype.

   Everything here resets when the server restarts. Swap this file
   out for real persistence (Postgres/Mongo/etc.) and a real SMS/
   email OTP provider (Twilio, MSG91, etc.) when moving past demo.
   ============================================================ */

const crypto = require('crypto');

/* ---- seed agencies + employees ----
   NOTE: passcodes are plaintext ONLY because this is a prototype.
   Before going anywhere near production, hash these with bcrypt
   (see the commented block in verifyLogin() below for where). */
const AGENCIES = [
  {
    code: 'DTC',
    name: 'Delhi Transport Corporation',
    employees: [
      { employeeId: 'EMP1001', passcode: '4821', name: 'R. Sharma', role: 'Dispatcher' },
      { employeeId: 'EMP1002', passcode: '7734', name: 'A. Verma', role: 'Route Supervisor' },
    ],
  },
  {
    code: 'BMTC',
    name: 'Bangalore Metropolitan Transport Corporation',
    employees: [
      { employeeId: 'EMP2001', passcode: '5590', name: 'K. Rao', role: 'Dispatcher' },
    ],
  },
  {
    code: 'DEMO',
    name: 'Sanchaar Demo Authority',
    employees: [
      { employeeId: 'DEMO1', passcode: '0000', name: 'Demo Operator', role: 'Admin' },
    ],
  },
];

/* pending logins: tempToken -> { agencyCode, employeeId, otp, expiresAt, attempts } */
const pendingOtps = new Map();
/* active sessions: sessionToken -> { agencyCode, employeeId, name, role, issuedAt } */
const sessions = new Map();

const OTP_TTL_MS = 5 * 60 * 1000;      // OTP valid for 5 minutes
const MAX_OTP_ATTEMPTS = 5;
const IS_DEV = process.env.NODE_ENV !== 'production';

function listAgencies() {
  return AGENCIES.map(a => ({ code: a.code, name: a.name }));
}

function generateOtp() {
  return String(crypto.randomInt(100000, 999999)); // 6-digit
}

/**
 * Step 1: verify agency code + employee ID + passcode.
 * On success, issues a short-lived tempToken and generates an OTP
 * "sent" to the employee (logged to console here; wire to real
 * SMS/email in production).
 */
function verifyLogin(agencyCode, employeeId, passcode) {
  const agency = AGENCIES.find(a => a.code.toLowerCase() === String(agencyCode || '').toLowerCase());
  if (!agency) return { ok: false, error: 'Unknown agency code' };

  const employee = agency.employees.find(e => e.employeeId.toLowerCase() === String(employeeId || '').toLowerCase());
  if (!employee) return { ok: false, error: 'Unknown employee ID for this agency' };

  // Production version:
  // const valid = await bcrypt.compare(passcode, employee.passcodeHash);
  const valid = employee.passcode === String(passcode || '');
  if (!valid) return { ok: false, error: 'Incorrect passcode' };

  const tempToken = crypto.randomUUID();
  const otp = generateOtp();
  pendingOtps.set(tempToken, {
    agencyCode: agency.code,
    employeeId: employee.employeeId,
    name: employee.name,
    role: employee.role,
    otp,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });

  // Mock "SMS" — replace with a real provider call.
  console.log(`[MOCK SMS] OTP for ${employee.name} (${employee.employeeId}): ${otp}`);

  return {
    ok: true,
    tempToken,
    expiresInSeconds: OTP_TTL_MS / 1000,
    // Only exposed outside production so you can test without a real SMS gateway.
    devOtp: IS_DEV ? otp : undefined,
  };
}

/**
 * Step 2: verify the OTP for a given tempToken.
 * On success, issues a session token and clears the pending entry.
 */
function verifyOtp(tempToken, otp) {
  const pending = pendingOtps.get(tempToken);
  if (!pending) return { ok: false, error: 'Login session expired — please log in again' };

  if (Date.now() > pending.expiresAt) {
    pendingOtps.delete(tempToken);
    return { ok: false, error: 'OTP expired — please log in again' };
  }

  if (pending.attempts >= MAX_OTP_ATTEMPTS) {
    pendingOtps.delete(tempToken);
    return { ok: false, error: 'Too many incorrect attempts — please log in again' };
  }

  if (String(otp || '') !== pending.otp) {
    pending.attempts += 1;
    return { ok: false, error: 'Incorrect OTP', attemptsRemaining: MAX_OTP_ATTEMPTS - pending.attempts };
  }

  pendingOtps.delete(tempToken);
  const sessionToken = crypto.randomUUID();
  sessions.set(sessionToken, {
    agencyCode: pending.agencyCode,
    employeeId: pending.employeeId,
    name: pending.name,
    role: pending.role,
    issuedAt: Date.now(),
  });

  return {
    ok: true,
    token: sessionToken,
    employee: {
      employeeId: pending.employeeId,
      name: pending.name,
      role: pending.role,
      agencyCode: pending.agencyCode,
    },
  };
}

/** Regenerate and re-send the OTP for an existing tempToken. */
function resendOtp(tempToken) {
  const pending = pendingOtps.get(tempToken);
  if (!pending) return { ok: false, error: 'Login session expired — please log in again' };

  pending.otp = generateOtp();
  pending.expiresAt = Date.now() + OTP_TTL_MS;
  pending.attempts = 0;

  console.log(`[MOCK SMS] Resent OTP for ${pending.name} (${pending.employeeId}): ${pending.otp}`);

  return { ok: true, expiresInSeconds: OTP_TTL_MS / 1000, devOtp: IS_DEV ? pending.otp : undefined };
}

/** Look up an active session (for protecting dashboard API routes later). */
function getSession(token) {
  return sessions.get(token) || null;
}

module.exports = { listAgencies, verifyLogin, verifyOtp, resendOtp, getSession };
