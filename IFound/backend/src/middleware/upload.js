const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Storage configuration for local file system
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const caseId = req.params.caseId || 'temp';
    const uploadPath = path.join(uploadsDir, caseId);

    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  // Supported image formats: JPEG, PNG, GIF, WebP, AVIF, HEIC/HEIF
  // Supported video formats: MP4, MOV, AVI
  const allowedExtensions = /jpeg|jpg|png|gif|webp|avif|heic|heif|mp4|mov|avi/;
  const allowedMimetypes = /jpeg|jpg|png|gif|webp|avif|heic|heif|mp4|mov|avi|octet-stream/;

  const extname = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedMimetypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error(`File type not supported. Allowed: JPEG, PNG, GIF, WebP, AVIF, HEIC, MP4, MOV, AVI`));
  }
};

// Multer configuration
const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB default
  },
  fileFilter: fileFilter,
});

module.exports = upload;
