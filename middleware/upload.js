const multer = require('multer');
const path = require('path');

/**
 * Multer Configuration for Proof File Uploads
 * 
 * Accepts: PDF, JPG, PNG, DOC, DOCX
 * Stores files in: uploads/proofs/
 * File naming: milestone-{milestoneId}-{timestamp}.{ext}
 */

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/proofs/');
  },
  filename: function (req, file, cb) {
    // Extract milestone ID from params
    const milestoneId = req.params.id || 'unknown';
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const nameWithoutExt = path.basename(file.originalname, ext);
    // Sanitize filename
    const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `milestone-${milestoneId}-${timestamp}-${sanitizedName}${ext}`);
  }
});

// File filter - only allow specific file types
const fileFilter = (req, file, cb) => {
  // Allowed file types
  const allowedMimes = [
    'application/pdf', // PDF
    'image/jpeg',      // JPG
    'image/jpg',       // JPG
    'image/png',       // PNG
    'application/msword', // DOC
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // DOCX
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, JPG, PNG, DOC, and DOCX files are allowed.'), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max file size
  }
});

// Export single file upload middleware
exports.uploadProof = upload.single('proof');
