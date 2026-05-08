const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');

// Define specific routes BEFORE dynamic routes like /:id
router.get('/my-bookings', bookingController.getMyBookings);
router.post('/', bookingController.createBooking);
router.get('/:id', bookingController.getBookingById);
router.post('/payment', bookingController.processPayment);

module.exports = router;
