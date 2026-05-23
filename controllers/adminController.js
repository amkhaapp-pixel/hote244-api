const db = require('../config/db');
const { formatBookingDates, formatBookingDatesList } = require('../utils/bookingDates');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v2: cloudinary } = require('cloudinary');

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper to extract public ID from Cloudinary URL
const getPublicIdFromUrl = (url) => {
  if (!url || !url.includes('cloudinary')) return null;
  try {
    // URL format: .../upload/v12345/Hotel244/room-xxx.jpg
    const parts = url.split('/');
    const hotel244Index = parts.indexOf('Hotel244');
    if (hotel244Index === -1) return null;
    
    const folderAndFileName = parts.slice(hotel244Index).join('/'); // "Hotel244/room-xxx.jpg"
    return folderAndFileName.split('.')[0]; // "Hotel244/room-xxx"
  } catch (err) {
    console.error('Error parsing public ID:', err);
    return null;
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Query from unified users table
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Check if account is enabled (as per the new column)
    if (user.enabled === 0) {
      return res.status(403).json({ message: 'Account is disabled. Please contact support.' });
    }

    // Strict role check for admin portal
    if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      admin: { 
        id: user.id, 
        email: user.email, 
        name: user.name, 
        role: user.role 
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



/** Percent change vs baseline; baseline 0 and current>0 → 100. */
function pctChange(current, baseline) {
  const c = Number(current);
  const b = Number(baseline);
  if (!Number.isFinite(c) || !Number.isFinite(b)) return 0;
  if (b === 0) return c === 0 ? 0 : 100;
  return Math.round(((c - b) / b) * 1000) / 10;
}

// Get summary statistics for dashboard
exports.getStats = async (req, res) => {
  try {
    const totalBookings = await db.query('SELECT COUNT(*) FROM bookings');
    const totalRevenue = await db.query('SELECT SUM(total_price) FROM bookings WHERE status = $1', ['paid']);
    const activeBookings = await db.query(
      "SELECT COUNT(*) FROM bookings WHERE status = 'paid' AND check_out > CURRENT_DATE AND check_in <= CURRENT_DATE"
    );
    const bookingsToday = await db.query(
      "SELECT COUNT(*) FROM bookings WHERE created_at::date = CURRENT_DATE"
    );
    const bookingsYesterday = await db.query(
      "SELECT COUNT(*) FROM bookings WHERE created_at::date = CURRENT_DATE - INTERVAL '1 day'"
    );
    const revenueToday = await db.query(
      "SELECT COALESCE(SUM(total_price), 0) AS sum FROM bookings WHERE status = 'paid' AND created_at::date = CURRENT_DATE"
    );
    const revenueYesterday = await db.query(
      "SELECT COALESCE(SUM(total_price), 0) AS sum FROM bookings WHERE status = 'paid' AND created_at::date = CURRENT_DATE - INTERVAL '1 day'"
    );
    const revenueMonth = await db.query(
      "SELECT COALESCE(SUM(total_price), 0) AS sum FROM bookings WHERE status = 'paid' AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)"
    );
    const revenueMonthPrevPartial = await db.query(
      `SELECT COALESCE(SUM(total_price), 0) AS sum FROM bookings
       WHERE status = 'paid'
       AND created_at >= date_trunc('month', CURRENT_TIMESTAMP) - INTERVAL '1 month'
       AND created_at < date_trunc('month', CURRENT_TIMESTAMP) - INTERVAL '1 month'
         + (CURRENT_TIMESTAMP - date_trunc('month', CURRENT_TIMESTAMP))`
    );
    const totalRooms = await db.query('SELECT COUNT(*) FROM rooms');
    const maintenanceRooms = await db.query(
      `SELECT COUNT(*)::int AS c FROM rooms WHERE COALESCE(in_maintenance, FALSE) = TRUE`
    );
    const occupiedRooms = await db.query(
      `SELECT COUNT(DISTINCT b.room_id) AS c FROM bookings b
       INNER JOIN rooms r ON r.id = b.room_id
       WHERE b.status = 'paid' AND b.check_in <= CURRENT_DATE AND b.check_out > CURRENT_DATE
       AND NOT COALESCE(r.in_maintenance, FALSE)`
    );
    const occupiedRooms7dAgo = await db.query(
      `SELECT COUNT(DISTINCT b.room_id) AS c FROM bookings b
       INNER JOIN rooms r ON r.id = b.room_id
       WHERE b.status = 'paid'
       AND b.check_in <= CURRENT_DATE - INTERVAL '7 days'
       AND b.check_out > CURRENT_DATE - INTERVAL '7 days'
       AND NOT COALESCE(r.in_maintenance, FALSE)`
    );
    const rooms = parseInt(totalRooms.rows[0].count, 10) || 0;
    const maint = parseInt(maintenanceRooms.rows[0].c, 10) || 0;
    const occ = parseInt(occupiedRooms.rows[0].c, 10) || 0;
    const occ7 = parseInt(occupiedRooms7dAgo.rows[0].c, 10) || 0;
    const sellable = Math.max(0, rooms - maint);
    const availableRooms = Math.max(0, sellable - occ);
    const occupancyRate =
      sellable > 0 ? Math.round((occ / sellable) * 1000) / 10 : 0;
    const occupancyRate7dAgo =
      sellable > 0 ? Math.round((occ7 / sellable) * 1000) / 10 : 0;

    const bToday = parseInt(bookingsToday.rows[0].count, 10);
    const bYest = parseInt(bookingsYesterday.rows[0].count, 10);
    const rToday = parseFloat(revenueToday.rows[0].sum || 0);
    const rYest = parseFloat(revenueYesterday.rows[0].sum || 0);
    const rMonth = parseFloat(revenueMonth.rows[0].sum || 0);
    const rMonthPrev = parseFloat(revenueMonthPrevPartial.rows[0].sum || 0);

    res.json({
      totalBookings: parseInt(totalBookings.rows[0].count, 10),
      totalRevenue: parseFloat(totalRevenue.rows[0].sum || 0),
      activeBookings: parseInt(activeBookings.rows[0].count, 10),
      bookingsToday: bToday,
      bookingsYesterday: bYest,
      bookingsTrendPct: pctChange(bToday, bYest),
      revenueToday: rToday,
      revenueYesterday: rYest,
      revenueTodayTrendPct: pctChange(rToday, rYest),
      revenueMonth: rMonth,
      revenueMonthPrevPartial: rMonthPrev,
      revenueMonthTrendPct: pctChange(rMonth, rMonthPrev),
      occupancyRate,
      occupancyRate7dAgo,
      occupancyTrendPct: pctChange(occupancyRate, occupancyRate7dAgo),
      occupiedRooms: occ,
      maintenanceRooms: maint,
      availableRooms,
      totalRooms: rooms,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all bookings with user and room info
exports.getAllBookings = async (req, res) => {
  try {
    const query = `
      SELECT b.*, u.name as customer_name, u.email as customer_email, u.phone as customer_phone,
             r.name as room_name
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN rooms r ON b.room_id = r.id
      ORDER BY b.created_at DESC
    `;
    const result = await db.query(query);
    res.json(formatBookingDatesList(result.rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get booking statuses for dropdown
exports.getBookingStatuses = async (req, res) => {
  try {
    const statuses = ['pending', 'paid', 'cancelled', 'refunded', 'completed'];
    res.json(statuses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update booking status
exports.updateBookingStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const result = await db.query(
      'UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Booking not found' });
    res.json(formatBookingDates(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all customers (users)
exports.getAllCustomers = async (req, res) => {
  try {
    const query = `
      SELECT u.*, COUNT(b.id) as booking_count 
      FROM users u
      LEFT JOIN bookings b ON u.id = b.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `;
    const result = await db.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Create a new room
exports.createRoom = async (req, res) => {
  const { name, price, capacity, description, images, amenities, in_maintenance, quantity } = req.body;
  try {
    const maint = Boolean(in_maintenance);
    const qty = parseInt(quantity, 10) || 5;
    const result = await db.query(
      `INSERT INTO rooms (name, price, capacity, description, images, amenities, in_maintenance, quantity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, price, capacity, description, images, amenities, maint, qty]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update an existing room
exports.updateRoom = async (req, res) => {
  const { id } = req.params;
  const { name, price, capacity, description, images, amenities, in_maintenance, quantity } = req.body;
  const maint = Boolean(in_maintenance);
  const qty = parseInt(quantity, 10) || 5;
  try {
    // 1. Get current room data to check for deleted images
    const currentRoom = await db.query('SELECT images FROM rooms WHERE id = $1', [id]);
    if (currentRoom.rows.length === 0) return res.status(404).json({ message: 'Room not found' });

    const oldImages = currentRoom.rows[0].images || [];
    const newImages = images || [];

    // 2. Identify images to delete (present in old but not in new)
    const imagesToDelete = oldImages.filter(url => !newImages.includes(url));

    // 3. Delete from Cloudinary
    for (const url of imagesToDelete) {
      const publicId = getPublicIdFromUrl(url);
      if (publicId) {
        await cloudinary.uploader.destroy(publicId).catch(err => console.error('Cloudinary Delete Error:', err));
      }
    }

    // 4. Update Database
    const result = await db.query(
      `UPDATE rooms SET name = $1, price = $2, capacity = $3, description = $4, images = $5, amenities = $6,
       in_maintenance = $7, quantity = $8 WHERE id = $9 RETURNING *`,
      [name, price, capacity, description, images, amenities, maint, qty, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete a room
exports.deleteRoom = async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Get room images before deleting
    const room = await db.query('SELECT images FROM rooms WHERE id = $1', [id]);
    if (room.rows.length === 0) return res.status(404).json({ message: 'Room not found' });

    // 2. Delete images from Cloudinary
    const images = room.rows[0].images || [];
    for (const url of images) {
      const publicId = getPublicIdFromUrl(url);
      if (publicId) {
        await cloudinary.uploader.destroy(publicId).catch(err => console.error('Cloudinary Delete Error:', err));
      }
    }

    // 3. Delete from Database
    await db.query('DELETE FROM rooms WHERE id = $1', [id]);
    res.json({ message: 'Room and associated images deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all payments
exports.getAllPayments = async (req, res) => {
  try {
    const query = `
      SELECT p.*, b.id as booking_id, b.total_price, b.status as booking_status, b.room_id, b.check_in, b.check_out, b.room_count,
             u.name as customer_name, u.email as customer_email, u.phone as customer_phone,
             r.name as room_name
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      JOIN users u ON b.user_id = u.id
      JOIN rooms r ON b.room_id = r.id
      ORDER BY p.created_at DESC
    `;
    const result = await db.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update payment status
exports.updatePaymentStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const result = await db.query(
      'UPDATE payments SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Payment not found' });
    
    // Sync booking status with payment status
    const payment = result.rows[0];
    const bookingStatusMap = {
      'pending': 'pending',
      'completed': 'paid',
      'failed': 'cancelled'
    };
    
    if (bookingStatusMap[status]) {
      await db.query('UPDATE bookings SET status = $1 WHERE id = $2', [bookingStatusMap[status], payment.booking_id]);
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Settings Management
exports.getAllSettings = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM settings ORDER BY key');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateSetting = async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  try {
    const result = await db.query(
      'UPDATE settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2 RETURNING *',
      [value, key]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Setting not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Messages Management
exports.getAllMessages = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM messages ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateMessageStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const result = await db.query(
      'UPDATE messages SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Message not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteMessage = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM messages WHERE id = $1', [id]);
    res.json({ message: 'Message deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Customer Management
exports.updateCustomer = async (req, res) => {
  const { id } = req.params;
  const { name, phone, enabled } = req.body;
  try {
    const result = await db.query(
      'UPDATE users SET name = $1, phone = $2, enabled = $3 WHERE id = $4 RETURNING id, name, email, phone, enabled, role',
      [name, phone, enabled !== undefined ? enabled : true, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Customer not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteCustomer = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM users WHERE id = $1 AND role = $2', [id, 'user']);
    res.json({ message: 'Customer deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Public contact message submission
exports.submitContactMessage = async (req, res) => {
  const { name, email, subject, message } = req.body;
  try {
    const result = await db.query(
      'INSERT INTO messages (name, email, subject, message, user_id) VALUES ($1, $2, $3, $4, NULL) RETURNING *',
      [name, email, subject, message]
    );
    res.status(201).json({
      message: 'Message submitted successfully',
      data: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
