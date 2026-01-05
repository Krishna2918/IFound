const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  uploadPhotos,
  getPhotosByCase,
  setPrimaryPhoto,
  deletePhoto,
  analyzeOCR,
  getPhotoOCR,
} = require('../controllers/photoController');
const { authenticateToken } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Temp upload for OCR analysis (doesn't require caseId)
const tempDir = path.join(__dirname, '../../uploads/temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const tempUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, tempDir),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, 'ocr-' + uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Only image files are allowed!'));
  },
});

// OCR analysis endpoint (quick scan without case)
router.post('/analyze-ocr', authenticateToken, tempUpload.single('image'), analyzeOCR);

// Get OCR data for a specific photo
router.get('/:id/ocr', getPhotoOCR);

// Case photos
router.post('/:caseId/photos', authenticateToken, upload.array('photos', 10), uploadPhotos);
router.get('/:caseId/photos', getPhotosByCase);

// Individual photo operations
router.put('/:id/set-primary', authenticateToken, setPrimaryPhoto);
router.delete('/:id', authenticateToken, deletePhoto);

module.exports = router;
