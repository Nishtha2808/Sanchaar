const express = require('express');
const cors = require('cors');
const pool = require('./frontend/db');
const authStore = require('./authStore');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // optional: serve your frontend files from here too

/**
 * GET /api/network?city=Bhilwara City
 * Returns { hub: {...}, stops: [...] } for the requested city.
 * If the city isn't in the database, responds 404 so the frontend
 * falls back to its own generated demo network.
 */
app.get('/api/network', async (req, res) => {
  const city = (req.query.city || '').trim();
  if (!city) return res.status(400).json({ error: 'city query param is required' });

  try {
    const [cityRows] = await pool.query('SELECT id FROM cities WHERE name = ? LIMIT 1', [city]);
    if (cityRows.length === 0) {
      return res.status(404).json({ error: 'city not found' });
    }
    const cityId = cityRows[0].id;

    const [stopRows] = await pool.query(
      'SELECT name, x, y, occupancy_pct AS pct, is_hub FROM stops WHERE city_id = ? ORDER BY is_hub DESC',
      [cityId]
    );

    if (stopRows.length === 0) {
      return res.status(404).json({ error: 'no stops configured for this city' });
    }

    const hub = stopRows.find(s => s.is_hub) || stopRows[0];
    const stops = stopRows.filter(s => s !== hub).map(({ name, x, y, pct }) => ({ name, x, y, pct }));

    res.json({
      hub: { name: hub.name, x: hub.x, y: hub.y, pct: hub.pct },
      stops
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  }
});

/**
 * GET /api/locations
 * Returns the nested { state: { district: [city, ...] } } structure
 * for the frontend's State/District/City picker.
 */
app.get('/api/locations', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT state, district, name AS city FROM cities ORDER BY state, district, name'
    );
    const tree = {};
    for (const row of rows) {
      tree[row.state] ??= {};
      tree[row.state][row.district] ??= [];
      tree[row.state][row.district].push(row.city);
    }
    res.json(tree);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  }
});

/**
 * GET /api/buses?from=University Gate&to=Railway Station
 * Returns an array of buses for the given route. If no route matches,
 * responds 404 so the frontend falls back to its own generated buses.
 */
app.get('/api/buses', async (req, res) => {
  const from = (req.query.from || '').trim();
  const to = (req.query.to || '').trim();
  if (!from || !to) return res.status(400).json({ error: 'from and to query params are required' });

  try {
    const [rows] = await pool.query(
      'SELECT bus_number AS id, eta_min AS eta, occupancy_pct AS occ FROM buses WHERE from_stop = ? AND to_stop = ? ORDER BY eta_min',
      [from, to]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'no buses configured for this route' });
    }
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  }
});

/* ============================================================
   Authority login (backed by authStore.js — in-memory prototype
   store; see that file for seed agencies/employees).
   ============================================================ */

/**
 * GET /api/auth/agencies
 * Returns the list of agencies for the Agency Code dropdown.
 */
app.get('/api/auth/agencies', (req, res) => {
  res.json(authStore.listAgencies());
});

/**
 * POST /api/auth/login
 * body: { agencyCode, employeeId, passcode }
 * On success returns { tempToken, expiresInSeconds, devOtp? } and the
 * frontend moves to the OTP step.
 */
app.post('/api/auth/login', (req, res) => {
  const { agencyCode, employeeId, passcode } = req.body || {};
  const result = authStore.verifyLogin(agencyCode, employeeId, passcode);
  if (!result.ok) return res.status(401).json({ error: result.error });
  res.json(result);
});

/**
 * POST /api/auth/verify-otp
 * body: { tempToken, otp }
 * On success returns { token, employee } and the frontend redirects
 * to dashboard.html.
 */
app.post('/api/auth/verify-otp', (req, res) => {
  const { tempToken, otp } = req.body || {};
  const result = authStore.verifyOtp(tempToken, otp);
  if (!result.ok) return res.status(401).json({ error: result.error });
  res.json(result);
});

/**
 * POST /api/auth/resend-otp
 * body: { tempToken }
 */
app.post('/api/auth/resend-otp', (req, res) => {
  const { tempToken } = req.body || {};
  const result = authStore.resendOtp(tempToken);
  if (!result.ok) return res.status(401).json({ error: result.error });
  res.json(result);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Sanchaar backend running on http://localhost:${PORT}`));
