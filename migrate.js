const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Starting database migration...');
    
    // Add role and enabled columns to users table if they don't exist
    try {
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user',
        ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE
      `);
      console.log('✓ Added role and enabled columns to users table');
    } catch (err) {
      console.log('  (Columns may already exist or error occurred:', err.message, ')');
    }
    
    // Add quantity column to rooms table if it doesn't exist
    try {
      await client.query(`
        ALTER TABLE rooms 
        ADD COLUMN IF NOT EXISTS quantity INT DEFAULT 5
      `);
      console.log('✓ Added quantity column to rooms table');
    } catch (err) {
      console.log('  (Column may already exist or error occurred:', err.message, ')');
    }
    
    // Add room_count column to bookings table if it doesn't exist
    try {
      await client.query(`
        ALTER TABLE bookings 
        ADD COLUMN IF NOT EXISTS room_count INT DEFAULT 1
      `);
      console.log('✓ Added room_count column to bookings table');
    } catch (err) {
      console.log('  (Column may already exist or error occurred:', err.message, ')');
    }
    
    // Create settings table if it doesn't exist
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS settings (
          id SERIAL PRIMARY KEY,
          key VARCHAR(255) UNIQUE NOT NULL,
          value TEXT,
          description TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✓ Created settings table');
      
      // Insert default settings if they don't exist
      const defaultSettings = [
        { key: 'hotel_name', value: 'Hotel 244', description: 'Hotel name' },
        { key: 'contact_email', value: 'contact@hotel244.com', description: 'Contact email' },
        { key: 'contact_phone', value: '+1-234-567-8900', description: 'Contact phone' },
        { key: 'currency', value: 'USD', description: 'Default currency' },
        { key: 'tax_rate', value: '10', description: 'Tax rate percentage' }
      ];
      
      for (const setting of defaultSettings) {
        try {
          await client.query(
            'INSERT INTO settings (key, value, description) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING',
            [setting.key, setting.value, setting.description]
          );
        } catch (err) {
          // Ignore if setting already exists
        }
      }
      console.log('✓ Inserted default settings');
    } catch (err) {
      console.log('  (Table may already exist or error occurred:', err.message, ')');
    }
    
    // Create messages table if it doesn't exist
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          user_id INT REFERENCES users(id),
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL,
          subject VARCHAR(255),
          message TEXT NOT NULL,
          status VARCHAR(50) DEFAULT 'unread',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✓ Created messages table');
    } catch (err) {
      console.log('  (Table may already exist or error occurred:', err.message, ')');
    }
    
    // Update any existing users to have role='user' if role is NULL
    try {
      await client.query(`
        UPDATE users SET role = 'user' WHERE role IS NULL
      `);
      console.log('✓ Updated existing users with default role');
    } catch (err) {
      console.log('  (Error updating users:', err.message, ')');
    }
    
    // Update any existing users to have enabled=TRUE if enabled is NULL
    try {
      await client.query(`
        UPDATE users SET enabled = TRUE WHERE enabled IS NULL
      `);
      console.log('✓ Updated existing users with default enabled status');
    } catch (err) {
      console.log('  (Error updating users:', err.message, ')');
    }
    
    // Update any existing rooms to have quantity=5 if quantity is NULL
    try {
      await client.query(`
        UPDATE rooms SET quantity = 5 WHERE quantity IS NULL
      `);
      console.log('✓ Updated existing rooms with default quantity');
    } catch (err) {
      console.log('  (Error updating rooms:', err.message, ')');
    }
    
    // Update any existing bookings to have room_count=1 if room_count is NULL
    try {
      await client.query(`
        UPDATE bookings SET room_count = 1 WHERE room_count IS NULL
      `);
      console.log('✓ Updated existing bookings with default room_count');
    } catch (err) {
      console.log('  (Error updating bookings:', err.message, ')');
    }

    // Add slip_image_url column to payments table if it doesn't exist
    try {
      await client.query(`
        ALTER TABLE payments 
        ADD COLUMN IF NOT EXISTS slip_image_url TEXT
      `);
      console.log('✓ Added slip_image_url column to payments table');
    } catch (err) {
      console.log('  (Column may already exist or error occurred:', err.message, ')');
    }
    
    await client.query('COMMIT');
    console.log('\n✅ Migration completed successfully!');
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
