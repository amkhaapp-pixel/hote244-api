const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');

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

// Public
router.post('/login', adminController.login);

// Protected
router.get('/stats', authMiddleware, adminController.getStats);
router.get('/bookings', authMiddleware, adminController.getAllBookings);
router.patch('/bookings/:id/status', authMiddleware, adminController.updateBookingStatus);
router.get('/customers', authMiddleware, adminController.getAllCustomers);

// Room Management
router.post('/rooms', authMiddleware, adminController.createRoom);
router.put('/rooms/:id', authMiddleware, adminController.updateRoom);
router.delete('/rooms/:id', authMiddleware, adminController.deleteRoom);

// Image Upload to Cloudinary (up to 5 images at once)
router.post('/upload-images', authMiddleware, upload.array('images', 5), async (req, res) => {
  try {
    const uploadPromises = req.files.map((file) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'Hotel244',
            resource_type: 'image',
            transformation: [
              { width: 1200, height: 800, crop: 'limit', quality: 'auto' }
            ]
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result.secure_url);
          }
        );
        stream.end(file.buffer);
      });
    });

    const urls = await Promise.all(uploadPromises);
    res.json({ urls });
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

module.exports = router;
