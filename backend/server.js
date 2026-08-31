/* ============================================================
   Sanchaar backend — auth prototype
   Run: npm install && npm start   (see README.md)
   ============================================================ */

const express = require('express');
const cors = require('cors');
const authStore = require('./authStore');

const app = express();
const PORT = process.env.PORT || 4000;

// Allow the static frontend (e.g. VS Code Live Server on :5500) to call this API.
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*' }));
app.use(express.json());

/* ---- simple request logging, handy while wiring up the frontend ---- */
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

/* GET /api/auth/agencies
   Returns the list of agencies for the "Agency Code" dropdown. */
app.get('/api/auth/agencies', (req, res) => {
  res.json(authStore.listAgencies());
});

/* POST /api/auth/login
   body: { agencyCode, employeeId, passcode }
   Step 1 of the two-step flow — validates credentials and triggers an OTP. */
app.post('/api/auth/login', (req, res) => {
  const { agencyCode, employeeId, passcode } = req.body || {};

  if (!agencyCode || !employeeId || !passcode) {
    return res.status(400).json({ error: 'Agency code, employee ID and passcode are all required' });
  }

  const result = authStore.verifyLogin(agencyCode, employeeId, passcode);
  if (!result.ok) return res.status(401).json({ error: result.error });

  const { ok, ...payload } = result;
  res.json(payload); // { tempToken, expiresInSeconds, devOtp? }
});

/* POST /api/auth/verify-otp
   body: { tempToken, otp }
   Step 2 — on success, issues a session token. */
app.post('/api/auth/verify-otp', (req, res) => {
  const { tempToken, otp } = req.body || {};

  if (!tempToken || !otp) {
    return res.status(400).json({ error: 'Missing tempToken or otp' });
  }

  const result = authStore.verifyOtp(tempToken, otp);
  if (!result.ok) {
    const status = /expired|too many/i.test(result.error) ? 401 : 400;
    return res.status(status).json({ error: result.error, attemptsRemaining: result.attemptsRemaining });
  }

  const { ok, ...payload } = result;
  res.json(payload); // { token, employee }
});

/* POST /api/auth/resend-otp
   body: { tempToken } */
app.post('/api/auth/resend-otp', (req, res) => {
  const { tempToken } = req.body || {};
  if (!tempToken) return res.status(400).json({ error: 'Missing tempToken' });

  const result = authStore.resendOtp(tempToken);
  if (!result.ok) return res.status(401).json({ error: result.error });

  const { ok, ...payload } = result;
  res.json(payload);
});

/* GET /api/auth/session
   header: Authorization: Bearer <token>
   Lets dashboard.html confirm a session is valid before showing data. */
app.get('/api/auth/session', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const session = token && authStore.getSession(token);

  if (!session) return res.status(401).json({ error: 'Invalid or expired session' });
  res.json({ employee: session });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Sanchaar auth backend running at http://localhost:${PORT}`);
  console.log(`Demo login → Agency: DEMO · Employee ID: DEMO1 · Passcode: 0000`);
});
