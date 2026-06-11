const { query } = require('../config/db');

module.exports = async (req, res, next) => {
  try {
    const userId = req.admin?.id;

    if (!userId) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const result = await query(
      'SELECT id, name, email, role, enabled FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'User not found' });
    }

    const user = result.rows[0];

    if (user.enabled === false || user.enabled === 0) {
      return res.status(403).json({ message: 'Account is disabled' });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
    }

    req.currentAdmin = user;
    next();
  } catch (err) {
    console.error('Admin role verification error:', err);
    res.status(500).json({ message: 'Failed to verify admin access' });
  }
};
