const mysql = require('mysql2/promise');

// Update these with your real MySQL credentials, or set them as
// environment variables (recommended once this goes anywhere near production).
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sanchaar',
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = pool;
