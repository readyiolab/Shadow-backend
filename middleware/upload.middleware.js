// ============================================
// middleware/upload.middleware.js
// ============================================
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const uploadDirs = {
  kyc: './uploads/kyc',
  profile: './uploads/profile',
  screenshots: './uploads/screenshots',
  attachments: './uploads/attachments'
};

Object.values(uploadDirs).forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Storage configuration for KYC documents
const kycStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDirs.kyc);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const playerId = req.params.player_id;
    const docType = req.body.document_type;
    cb(null, `player_${playerId}_${docType}_${uniqueSuffix}${ext}`);
  }
});

// File filter for KYC documents
const kycFileFilter = (req, file, cb) => {
  // Allowed file types
  const allowedTypes = /jpeg|jpg|png|pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Only .png, .jpg, .jpeg and .pdf files are allowed!'));
  }
};

// Upload middleware for KYC documents
const uploadKYCDocument = multer({
  storage: kycStorage,
  fileFilter: kycFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Storage configuration for profile pictures
const profileStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDirs.profile);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const playerId = req.params.player_id || req.user.user_id;
    cb(null, `profile_${playerId}_${uniqueSuffix}${ext}`);
  }
});

// File filter for profile pictures
const profileFileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Only .png, .jpg and .jpeg files are allowed for profile pictures!'));
  }
};

// Upload middleware for profile pictures
const uploadProfilePicture = multer({
  storage: profileStorage,
  fileFilter: profileFileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB limit
  }
});

// Storage configuration for transaction screenshots
const screenshotStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDirs.screenshots);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `screenshot_${uniqueSuffix}${ext}`);
  }
});

// File filter for screenshots
const screenshotFileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Only .png, .jpg and .jpeg files are allowed for screenshots!'));
  }
};

// Upload middleware for screenshots
const uploadScreenshot = multer({
  storage: screenshotStorage,
  fileFilter: screenshotFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Storage configuration for expense attachments
const attachmentStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDirs.attachments);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `attachment_${uniqueSuffix}${ext}`);
  }
});

// File filter for attachments (images, PDF, documents)
const attachmentFileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype) || file.mimetype === 'application/pdf' || 
                   file.mimetype === 'application/msword' || 
                   file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  if (extname || mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Only images, PDF, and document files are allowed!'));
  }
};

// Upload middleware for attachments
const uploadAttachment = multer({
  storage: attachmentStorage,
  fileFilter: attachmentFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

module.exports = {
  uploadKYCDocument,
  uploadProfilePicture,
  uploadScreenshot,
  uploadAttachment,
  single: (fieldName) => uploadScreenshot.single(fieldName)
};