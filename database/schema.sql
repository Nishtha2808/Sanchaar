CREATE DATABASE IF NOT EXISTS sanchaar;
USE sanchaar;

CREATE TABLE IF NOT EXISTS cities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  district VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  UNIQUE KEY uniq_city (name, district, state)
);

CREATE TABLE IF NOT EXISTS stops (
  id INT AUTO_INCREMENT PRIMARY KEY,
  city_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  x FLOAT NOT NULL,          -- position on the 400x340 SVG viewBox
  y FLOAT NOT NULL,
  occupancy_pct INT NOT NULL,
  is_hub BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- Seed data: matches the LOCATION_DATA object in index.html.
-- Replace coordinates/occupancy with your real data whenever you have it.
-- ---------------------------------------------------------------------

INSERT INTO cities (name, district, state) VALUES
  ('Bhilwara City', 'Bhilwara', 'Rajasthan'),
  ('Jaipur City', 'Jaipur', 'Rajasthan'),
  ('Udaipur City', 'Udaipur', 'Rajasthan'),
  ('Pune City', 'Pune', 'Maharashtra'),
  ('Bengaluru City', 'Bengaluru Urban', 'Karnataka');

-- Bhilwara City
INSERT INTO stops (city_id, name, x, y, occupancy_pct, is_hub) VALUES
  ((SELECT id FROM cities WHERE name='Bhilwara City'), 'Bhilwara Bus Stand', 200, 165, 55, TRUE),
  ((SELECT id FROM cities WHERE name='Bhilwara City'), 'Railway Station', 200, 40, 91, FALSE),
  ((SELECT id FROM cities WHERE name='Bhilwara City'), 'Textile Market', 90, 220, 62, FALSE),
  ((SELECT id FROM cities WHERE name='Bhilwara City'), 'Civil Lines', 310, 250, 28, FALSE);

-- Jaipur City
INSERT INTO stops (city_id, name, x, y, occupancy_pct, is_hub) VALUES
  ((SELECT id FROM cities WHERE name='Jaipur City'), 'Ajmeri Gate Hub', 200, 170, 72, TRUE),
  ((SELECT id FROM cities WHERE name='Jaipur City'), 'City Palace', 130, 60, 88, FALSE),
  ((SELECT id FROM cities WHERE name='Jaipur City'), 'Malviya Nagar', 320, 130, 40, FALSE),
  ((SELECT id FROM cities WHERE name='Jaipur City'), 'Sanganer Airport Rd', 260, 300, 65, FALSE);

-- Udaipur City
INSERT INTO stops (city_id, name, x, y, occupancy_pct, is_hub) VALUES
  ((SELECT id FROM cities WHERE name='Udaipur City'), 'Udaipur Central', 190, 160, 34, TRUE),
  ((SELECT id FROM cities WHERE name='Udaipur City'), 'Lake Pichola Rd', 90, 90, 48, FALSE),
  ((SELECT id FROM cities WHERE name='Udaipur City'), 'Fateh Sagar', 300, 100, 20, FALSE),
  ((SELECT id FROM cities WHERE name='Udaipur City'), 'University Rd', 200, 300, 57, FALSE);

-- Pune City
INSERT INTO stops (city_id, name, x, y, occupancy_pct, is_hub) VALUES
  ((SELECT id FROM cities WHERE name='Pune City'), 'Shivajinagar Hub', 210, 175, 80, TRUE),
  ((SELECT id FROM cities WHERE name='Pune City'), 'Hinjewadi IT Park', 340, 90, 95, FALSE),
  ((SELECT id FROM cities WHERE name='Pune City'), 'Swargate', 120, 280, 66, FALSE),
  ((SELECT id FROM cities WHERE name='Pune City'), 'Kothrud Depot', 80, 120, 30, FALSE);

-- Bengaluru City
INSERT INTO stops (city_id, name, x, y, occupancy_pct, is_hub) VALUES
  ((SELECT id FROM cities WHERE name='Bengaluru City'), 'Majestic Hub', 200, 170, 90, TRUE),
  ((SELECT id FROM cities WHERE name='Bengaluru City'), 'Whitefield', 330, 60, 74, FALSE),
  ((SELECT id FROM cities WHERE name='Bengaluru City'), 'Electronic City', 260, 300, 82, FALSE),
  ((SELECT id FROM cities WHERE name='Bengaluru City'), 'Yeshwanthpur', 70, 100, 25, FALSE);

CREATE TABLE IF NOT EXISTS buses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_stop VARCHAR(100) NOT NULL,
  to_stop VARCHAR(100) NOT NULL,
  bus_number VARCHAR(10) NOT NULL,
  eta_min INT NOT NULL,
  occupancy_pct INT NOT NULL
);

-- ---------------------------------------------------------------------
-- Seed data for passenger.html's "Find buses" results.
-- Only routes listed here return real data; every other From/To pair
-- falls back to the frontend's generated demo buses automatically.
-- ---------------------------------------------------------------------

INSERT INTO buses (from_stop, to_stop, bus_number, eta_min, occupancy_pct) VALUES
  ('University Gate', 'Railway Station', 'B12', 4, 42),
  ('University Gate', 'Railway Station', 'B18', 8, 68),
  ('University Gate', 'Railway Station', 'B07', 14, 94),

  ('Railway Station', 'Tech Park', 'B03', 6, 30),
  ('Railway Station', 'Tech Park', 'B21', 11, 77),
  ('Railway Station', 'Tech Park', 'B44', 19, 88),

  ('Central Market', 'Sanchaar Chowk', 'B09', 3, 55),
  ('Central Market', 'Sanchaar Chowk', 'B15', 9, 91),
  ('Central Market', 'Sanchaar Chowk', 'B27', 16, 22);
