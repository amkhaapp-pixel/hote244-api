const db = require('../config/db');

exports.createBooking = async (req, res) => {
  const { name, email, phone, roomId, checkIn, checkOut } = req.body;

  try {
    // 1. Check if room is available for the dates
    // Query to find overlapping bookings:
    // (checkIn < checkout_column) AND (checkOut > checkin_column)
    const availabilityQuery = `
      SELECT * FROM bookings 
      WHERE room_id = $1 
      AND status != 'cancelled'
      AND ($2 < check_out AND $3 > check_in)
    `;
    const checkResult = await db.query(availabilityQuery, [roomId, checkIn, checkOut]);

    if (checkResult.rows.length > 0) {
      return res.status(400).json({ message: 'Room is already booked for these dates' });
    }

    // 2. Get room price and calculate total
    const roomResult = await db.query(
      'SELECT price, COALESCE(in_maintenance, FALSE) AS in_maintenance FROM rooms WHERE id = $1',
      [roomId]
    );
    if (roomResult.rows.length === 0) return res.status(404).json({ message: 'Room not found' });
    if (roomResult.rows[0].in_maintenance) {
      return res.status(400).json({ message: 'This room is temporarily unavailable for maintenance' });
    }

    const pricePerNight = roomResult.rows[0].price;
    const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
    const totalPrice = pricePerNight * nights;

    // 3. Find or Create User
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
    }

    // 4. Create Booking
    const newBooking = await db.query(
      'INSERT INTO bookings (user_id, room_id, check_in, check_out, total_price) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, roomId, checkIn, checkOut, totalPrice]
    );

    res.status(201).json(newBooking.rows[0]);

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
    res.status(200).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.processPayment = async (req, res) => {
  const { bookingId, method, amount } = req.body;
  try {
    // 1. Create Payment record
    // 1. Create Payment record (status starts as 'pending')
    const result = await db.query(
      'INSERT INTO payments (booking_id, method, amount, status) VALUES ($1, $2, $3, $4) RETURNING *',
      [bookingId, method, amount, 'pending']
    );

    // 2. Booking status stays 'pending' until admin confirms
    // (It's already pending from createBooking, but we can set it explicitly if needed)
    await db.query('UPDATE bookings SET status = $1 WHERE id = $2', ['pending', bookingId]);

    res.status(200).json({ message: 'Payment submitted for review', payment: result.rows[0] });
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
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
