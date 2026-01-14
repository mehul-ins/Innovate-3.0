const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads/proofs directory if it doesn't exist
const proofsDir = path.join(__dirname, '../uploads/proofs');
if (!fs.existsSync(proofsDir)) {
    fs.mkdirSync(proofsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, proofsDir);
    },
    filename: (req, file, cb) => {
        // Create unique filename: orderId_milestoneId_timestamp.ext
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext);
        const filename = `${req.user.id}_${Date.now()}${ext}`;
        cb(null, filename);
    }
});

// File filter - accept only documents and images
const fileFilter = (req, file, cb) => {
    const allowedMimes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/jpg',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Accept: PDF, JPG, PNG, DOC, DOCX, XLS, XLSX'));
    }
};

// Create multer instance
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB max
    }
});

module.exports = upload;
