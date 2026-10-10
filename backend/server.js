require('dotenv').config();

const express = require('express');
const cors = require('cors');
const authStore = require('./authStore');

const app = express();
const PORT = process.env.PORT || 4000;

// ===============================
// MIDDLEWARE
// ===============================

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*' }));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(
    `${new Date().toISOString()} ${req.method} ${req.path}`
  );
  next();
});

// ===============================
// AUTHENTICATION APIs
// ===============================

// GET /api/auth/agencies
app.get('/api/auth/agencies', (req, res) => {
  res.json(authStore.listAgencies());
});

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
  const { agencyCode, employeeId, passcode } = req.body || {};

  if (!agencyCode || !employeeId || !passcode) {
    return res.status(400).json({
      error: 'Agency code, employee ID and passcode are all required'
    });
  }

  const result = authStore.verifyLogin(
    agencyCode,
    employeeId,
    passcode
  );

  if (!result.ok) {
    return res.status(401).json({ error: result.error });
  }

  const { ok, ...payload } = result;
  res.json(payload);
});

// POST /api/auth/verify-otp
app.post('/api/auth/verify-otp', (req, res) => {
  const { tempToken, otp } = req.body || {};

  if (!tempToken || !otp) {
    return res.status(400).json({
      error: 'Missing tempToken or otp'
    });
  }

  const result = authStore.verifyOtp(tempToken, otp);

  if (!result.ok) {
    const status = /expired|too many/i.test(result.error)
      ? 401
      : 400;

    return res.status(status).json({
      error: result.error,
      attemptsRemaining: result.attemptsRemaining
    });
  }

  const { ok, ...payload } = result;
  res.json(payload);
});

// POST /api/auth/resend-otp
app.post('/api/auth/resend-otp', (req, res) => {
  const { tempToken } = req.body || {};

  if (!tempToken) {
    return res.status(400).json({
      error: 'Missing tempToken'
    });
  }

  const result = authStore.resendOtp(tempToken);

  if (!result.ok) {
    return res.status(401).json({ error: result.error });
  }

  const { ok, ...payload } = result;
  res.json(payload);
});

// GET /api/auth/session
app.get('/api/auth/session', (req, res) => {
  const authHeader = req.headers.authorization || '';

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  const session = token && authStore.getSession(token);

  if (!session) {
    return res.status(401).json({
      error: 'Invalid or expired session'
    });
  }

  res.json({ employee: session });
});

// ===============================
// HEALTH CHECK
// ===============================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ===============================
// WEATHER API
// ===============================

app.get('/api/weather', async (req, res) => {
  try {
    const city = req.query.city || 'Ajmer';
    const apiKey = process.env.OPENWEATHER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: 'OpenWeather API key is not configured'
      });
    }

    const url =
      `https://api.openweathermap.org/data/2.5/weather` +
      `?q=${encodeURIComponent(city)}` +
      `&appid=${apiKey}&units=metric`;

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Unable to fetch weather data'
      });
    }

    const data = await response.json();

    res.json({
      city: data.name,
      temperature: data.main.temp,
      humidity: data.main.humidity,
      weather: data.weather[0].main,
      description: data.weather[0].description,
      windSpeed: data.wind.speed
    });
  } catch (error) {
    console.error('Weather API error:', error);

    res.status(500).json({
      error: 'Failed to fetch weather data'
    });
  }
});

// ===============================
// TOMTOM TRAFFIC API
// ===============================

app.get('/api/traffic', async (req, res) => {
  try {
    // Default Delhi coordinates for testing
    const origin = req.query.origin || '28.6129,77.2295';
    const destination = req.query.destination || '28.6304,77.2177';

    const apiKey = process.env.TOMTOM_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: 'TomTom API key is not configured'
      });
    }

    const url =
      `https://api.tomtom.com/maps/orbis/routing/calculateRoute/` +
      `${origin}:${destination}/json` +
      `?apiVersion=2` +
      `&key=${encodeURIComponent(apiKey)}` +
      `&traffic=live` +
      `&routeType=fast` +
      `&travelMode=car`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'TomTom-Api-Version': '2'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('TomTom API error:', data);

      return res.status(response.status).json({
        error: 'TomTom traffic API request failed',
        details: data
      });
    }

    if (!data.routes || data.routes.length === 0) {
      return res.status(404).json({
        error: 'No route found'
      });
    }

    const summary = data.routes[0].summary;

    const trafficDelay = summary.trafficDelayInSeconds || 0;
    const travelTime = summary.travelTimeInSeconds || 0;

    const travelTimeMinutes = Math.round(travelTime / 60);
    const trafficDelayMinutes = Math.round(trafficDelay / 60);

    let trafficLevel;

    if (trafficDelayMinutes >= 10) {
      trafficLevel = 'HIGH';
    } else if (trafficDelayMinutes >= 5) {
      trafficLevel = 'MEDIUM';
    } else {
      trafficLevel = 'LOW';
    }

    res.json({
      origin,
      destination,
      distanceMeters: summary.lengthInMeters,
      travelTimeSeconds: travelTime,
      travelTimeMinutes,
      trafficDelaySeconds: trafficDelay,
      trafficDelayMinutes,
      trafficLevel
    });
  } catch (error) {
    console.error('TomTom traffic error:', error);

    res.status(500).json({
      error: 'Failed to fetch traffic data'
    });
  }
});

// ===============================
// NOMINATIM GEOCODING API
// ===============================

app.get('/api/geocode', async (req, res) => {
  try {
    const address = req.query.address;

    if (!address) {
      return res.status(400).json({
        error: 'Please provide an address'
      });
    }

    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?format=jsonv2` +
      `&q=${encodeURIComponent(address)}` +
      `&limit=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Sanchaar-Bus-Demand-Prototype/1.0'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Geocoding service request failed'
      });
    }

    const data = await response.json();

    if (data.length === 0) {
      return res.status(404).json({
        error: 'Location not found'
      });
    }

    const location = data[0];

    res.json({
      address: location.display_name,
      latitude: Number(location.lat),
      longitude: Number(location.lon)
    });
  } catch (error) {
    console.error('Geocoding API error:', error);

    res.status(500).json({
      error: 'Failed to fetch location data'
    });
  }
});

// ===============================
// AIR QUALITY API
// ===============================

app.get('/api/air-quality', async (req, res) => {
  try {
    // Default Delhi coordinates for testing
    const latitude = req.query.lat || '28.6139';
    const longitude = req.query.lon || '77.2090';

    const url =
      `https://air-quality-api.open-meteo.com/v1/air-quality` +
      `?latitude=${latitude}` +
      `&longitude=${longitude}` +
      `&current=pm2_5,pm10`;

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Unable to fetch air quality data'
      });
    }

    const data = await response.json();

    res.json({
      latitude: Number(latitude),
      longitude: Number(longitude),
      pm2_5: data.current?.pm2_5,
      pm10: data.current?.pm10
    });
  } catch (error) {
    console.error('Air Quality API error:', error);

    res.status(500).json({
      error: 'Failed to fetch air quality data'
    });
  }
});

// ===============================
// ML BUS CROWDING PREDICTION API
// ===============================

// POST /api/predict
// Sends passenger prediction inputs to the deployed FastAPI model.

app.post('/api/predict', async (req, res) => {
  try {
    const { location, date, time } = req.body || {};

    if (!location || !date || !time) {
      return res.status(400).json({
        error: 'location, date and time are required'
      });
    }

    const mlApiUrl = (
      process.env.ML_API_URL ||
      'https://sanchaar-ml-api.onrender.com'
    ).replace(/\/+$/, '');

    const response = await fetch(`${mlApiUrl}/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        location,
        date,
        time
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('ML API returned an error:', data);

      return res.status(response.status).json(data);
    }

    return res.json(data);
  } catch (error) {
    console.error('ML prediction error:', error);

    return res.status(502).json({
      error: 'Unable to connect to the ML prediction service'
    });
  }
});

// ===============================
// START SERVER
// ===============================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sanchaar backend running on port ${PORT}`);
  console.log(
    'Demo login → Agency: DEMO · Employee ID: DEMO1 · Passcode: 0000'
  );
});