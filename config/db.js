const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'hotel',
  password: '1111',
  port: 5432,
});

pool.on('connect', () => {
  console.log('Successfully connected to the database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  // Don't exit on error, just log it
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
