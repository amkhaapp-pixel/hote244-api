const db = require('../config/db');

exports.getAllRooms = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM rooms ORDER BY id ASC`
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Database Error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.getRoomById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query('SELECT * FROM rooms WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Room not found' });
    res.status(200).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
