const { query } = require('./config/db');

async function updateSchema() {
  try {
    // Add password column to users table if it doesn't exist
    await query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS password VARCHAR(255)
    `);

    // Add role column and enforce known values
    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user'
    `);

    await query(`
      UPDATE users
      SET role = 'user'
      WHERE role IS NULL
    `);

    await query(`
      ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_role_check
    `);

    await query(`
      ALTER TABLE users
      ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user'))
    `);

    await query(`
      ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS in_maintenance BOOLEAN NOT NULL DEFAULT FALSE
    `);

    console.log('Schema updated successfully: users + rooms.in_maintenance');
    process.exit(0);
  } catch (err) {
    console.error('Error updating schema:', err.message);
    process.exit(1);
  }
}

updateSchema();
