const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const bookingController = require('../controllers/bookingController');

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer - use memory storage (buffer) for Cloudinary upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp|gif/;
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Define specific routes BEFORE dynamic routes like /:id
router.get('/my-bookings', bookingController.getMyBookings);
router.post('/', bookingController.createBooking);
router.post('/payment', bookingController.processPayment);

// Get payment by booking ID (public - no auth required for checking payment status)
router.get('/get-payment/:bookingId', bookingController.getPaymentByBookingId);

router.get('/:id', bookingController.getBookingById);

// Upload slip image to Cloudinary (public - no auth required for payment slip)
router.post('/upload-slip', upload.single('slip'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'Hotel244/slips',
        resource_type: 'image',
        transformation: [
          { width: 1200, height: 800, crop: 'limit', quality: 'auto' }
        ]
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          return res.status(500).json({ error: 'Upload failed' });
        }
        res.json({ url: result.secure_url });
      }
    );
    stream.end(req.file.buffer);
  } catch (err) {
    console.error('Slip upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

module.exports = router;
