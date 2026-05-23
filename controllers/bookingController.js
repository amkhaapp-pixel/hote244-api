const db = require('../config/db');
const { formatBookingDates, formatBookingDatesList } = require('../utils/bookingDates');

exports.createBooking = async (req, res) => {
  const { name, email, phone, roomId, checkIn, checkOut, roomCount: roomCountRaw } = req.body;
  const roomCount = Math.max(1, parseInt(roomCountRaw, 10) || 1);

  try {
    // 1. Check if room is available for the dates
    // Query to find overlapping bookings:
    // (checkIn < checkout_column) AND (checkOut > checkin_column)
    // 1. Get room details (price, quantity, maintenance)
    const roomResult = await db.query(
      'SELECT price, COALESCE(quantity, 5) AS quantity, COALESCE(in_maintenance, FALSE) AS in_maintenance FROM rooms WHERE id = $1',
      [roomId]
    );
    if (roomResult.rows.length === 0) return res.status(404).json({ message: 'Room not found' });
    
    const room = roomResult.rows[0];
    if (room.in_maintenance) {
      return res.status(400).json({ message: 'This room is temporarily unavailable for maintenance' });
    }

    // 2. Check if room limit is exceeded on any of the nights
    const availabilityQuery = `
      SELECT to_char(check_in, 'YYYY-MM-DD') as check_in,
             to_char(check_out, 'YYYY-MM-DD') as check_out,
             COALESCE(room_count, 1) as room_count
      FROM bookings 
      WHERE room_id = $1 
      AND status != 'cancelled'
      AND ($2 < check_out AND $3 > check_in)
    `;
    const checkResult = await db.query(availabilityQuery, [roomId, checkIn, checkOut]);

    const limit = room.quantity;
    const start = new Date(checkIn + 'T00:00:00');
    const end = new Date(checkOut + 'T00:00:00');

    // Loop through each night of the stay
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const currentDateStr = `${year}-${month}-${day}`;

      let activeBookingsCount = 0;
      for (const booking of checkResult.rows) {
        if (currentDateStr >= booking.check_in && currentDateStr < booking.check_out) {
          activeBookingsCount += parseInt(booking.room_count, 10) || 1;
        }
      }

      if (activeBookingsCount + roomCount > limit) {
        return res.status(400).json({ message: 'Room is already booked for these dates' });
      }
    }

    if (roomCount > limit) {
      return res.status(400).json({ message: 'Not enough rooms available' });
    }

    const pricePerNight = room.price;
    const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
    const totalPrice = pricePerNight * nights * roomCount;

    // 3. Find or Create User (and update phone/name if changed)
    let userResult = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    let userId;
    if (userResult.rows.length === 0) {
      const newUser = await db.query(
        'INSERT INTO users (name, email, phone) VALUES ($1, $2, $3) RETURNING id',
        [name, email, phone]
      );
      userId = newUser.rows[0].id;
    } else {
      userId = userResult.rows[0].id;
      // Update name and phone from latest booking info
      await db.query(
        'UPDATE users SET name = $1, phone = $2 WHERE id = $3',
        [name, phone, userId]
      );
    }

    // 4. Create Booking
    const newBooking = await db.query(
      'INSERT INTO bookings (user_id, room_id, check_in, check_out, total_price, room_count) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [userId, roomId, checkIn, checkOut, totalPrice, roomCount]
    );

    res.status(201).json(formatBookingDates(newBooking.rows[0]));

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getBookingById = async (req, res) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT b.*, r.name as room_name, u.name as user_name 
      FROM bookings b
      JOIN rooms r ON b.room_id = r.id
      JOIN users u ON b.user_id = u.id
      WHERE b.id = $1
    `;
    const result = await db.query(query, [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Booking not found' });
    res.status(200).json(formatBookingDates(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.processPayment = async (req, res) => {
  const { bookingId, method, amount, slipImageUrl } = req.body;
  try {
    // 1. Create Payment record with slip image URL if provided
    const result = await db.query(
      'INSERT INTO payments (booking_id, method, amount, status, slip_image_url) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [bookingId, method, amount, 'pending', slipImageUrl || null]
    );

    // 2. Booking status stays 'pending' until admin confirms
    await db.query('UPDATE bookings SET status = $1 WHERE id = $2', ['pending', bookingId]);

    res.status(200).json({ message: 'Payment submitted for review', payment: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getPaymentByBookingId = async (req, res) => {
  const { bookingId } = req.params;
  try {
    const result = await db.query(
      'SELECT * FROM payments WHERE booking_id = $1 ORDER BY created_at DESC LIMIT 1',
      [bookingId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getMyBookings = async (req, res) => {
  const { email } = req.query; // We'll use email to identify the user for now
  try {
    const query = `
      SELECT b.*, r.name as room_name, r.images[1] as room_image 
      FROM bookings b
      JOIN rooms r ON b.room_id = r.id
      JOIN users u ON b.user_id = u.id
      WHERE u.email = $1
      ORDER BY b.created_at DESC
    `;
    const result = await db.query(query, [email]);
    res.status(200).json(formatBookingDatesList(result.rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
