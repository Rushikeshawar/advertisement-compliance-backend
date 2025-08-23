const express = require('express');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Validate environment variables
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.error('Missing Cloudinary environment variables');
  throw new Error('Cloudinary configuration incomplete. Check your environment variables.');
}

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Test Cloudinary connection
const testCloudinaryConnection = async () => {
  try {
    await cloudinary.api.ping();
    console.log('Cloudinary connection successful');
  } catch (error) {
    console.error('Cloudinary connection failed:', error.message);
  }
};
testCloudinaryConnection();

// Configure Cloudinary storage for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'advertisement-compliance',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'mp4', 'avi', 'mov', 'wmv'],
    public_id: (req, file) => {
      const timestamp = Date.now();
      const randomId = uuidv4().substring(0, 8); // Fixed: substr is deprecated
      const fileName = file.originalname.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_'); // Sanitize filename
      return `${timestamp}-${randomId}-${fileName}`;
    },
    resource_type: 'auto'
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  console.log('Processing file:', file.originalname, 'Type:', file.mimetype);
  
  const allowedTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'video/mp4',
    'video/avi',
    'video/quicktime',
    'video/x-ms-wmv'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    console.log('File type not allowed:', file.mimetype);
    cb(new Error(`File type ${file.mimetype} is not allowed`), false);
  }
};

// Configure multer with size limits
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file
    files: 5 // Maximum 5 files per upload
  }
});

// Upload multiple files
router.post('/files', (req, res) => {
  upload.array('files', 5)(req, res, async (err) => {
    if (err) {
      console.error('Multer error:', err);
      if (err instanceof multer.MulterError) {
        return handleMulterError(err, res);
      }
      return res.status(400).json({ 
        message: err.message || 'File upload failed',
        error: err.message 
      });
    }

    try {
      console.log('Files received:', req.files?.length || 0);
      
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded' });
      }

      const uploadedFiles = req.files.map(file => ({
        originalName: file.originalname,
        filename: file.filename || file.public_id,
        url: file.path,
        size: file.size,
        mimetype: file.mimetype,
        cloudinaryId: file.filename || file.public_id
      }));

      console.log('Files processed successfully:', uploadedFiles.length);

      res.json({
        message: `${uploadedFiles.length} file(s) uploaded successfully`,
        files: uploadedFiles
      });

    } catch (error) {
      console.error('File processing error:', error);
      res.status(500).json({
        message: 'File upload failed',
        error: error.message
      });
    }
  });
});

// Upload single file
router.post('/file', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      console.error('Multer error:', err);
      if (err instanceof multer.MulterError) {
        return handleMulterError(err, res);
      }
      return res.status(400).json({ 
        message: err.message || 'File upload failed',
        error: err.message 
      });
    }

    try {
      console.log('Single file received:', req.file ? req.file.originalname : 'None');
      
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const uploadedFile = {
        originalName: req.file.originalname,
        filename: req.file.filename || req.file.public_id,
        url: req.file.path,
        size: req.file.size,
        mimetype: req.file.mimetype,
        cloudinaryId: req.file.filename || req.file.public_id
      };

      console.log('File processed successfully:', uploadedFile.originalName);

      res.json({
        message: 'File uploaded successfully',
        file: uploadedFile
      });

    } catch (error) {
      console.error('File processing error:', error);
      res.status(500).json({
        message: 'File upload failed',
        error: error.message
      });
    }
  });
});

// Delete file
router.delete('/file/:cloudinaryId', async (req, res) => {
  try {
    const { cloudinaryId } = req.params;
    console.log('Attempting to delete file:', cloudinaryId);

    // Delete from Cloudinary
    const result = await cloudinary.uploader.destroy(cloudinaryId);
    console.log('Cloudinary delete result:', result);

    if (result.result === 'ok') {
      res.json({ message: 'File deleted successfully' });
    } else {
      res.status(404).json({ message: 'File not found or already deleted' });
    }

  } catch (error) {
    console.error('File delete error:', error);
    res.status(500).json({ 
      message: 'File deletion failed',
      error: error.message 
    });
  }
});

// Get file info
router.get('/file/:cloudinaryId', async (req, res) => {
  try {
    const { cloudinaryId } = req.params;
    console.log('Getting file info for:', cloudinaryId);

    // Get file info from Cloudinary
    const result = await cloudinary.api.resource(cloudinaryId);

    const fileInfo = {
      cloudinaryId: result.public_id,
      url: result.secure_url,
      size: result.bytes,
      format: result.format,
      createdAt: result.created_at,
      width: result.width || null,
      height: result.height || null
    };

    res.json(fileInfo);

  } catch (error) {
    if (error.http_code === 404) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    console.error('Get file info error:', error);
    res.status(500).json({ 
      message: 'Failed to get file info',
      error: error.message 
    });
  }
});

// Helper function for handling multer errors
function handleMulterError(err, res) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      message: 'File too large',
      maxSize: '50MB'
    });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      message: 'Too many files',
      maxFiles: 5
    });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      message: 'Unexpected field name for file upload'
    });
  }
  
  return res.status(400).json({
    message: 'File upload error',
    error: err.message
  });
}

// Global error handling middleware
router.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  if (error.message && error.message.includes('File type') && error.message.includes('not allowed')) {
    return res.status(400).json({
      message: error.message,
      allowedTypes: [
        'JPEG/JPG Images',
        'PNG Images', 
        'PDF Documents',
        'Word Documents (DOC/DOCX)',
        'Excel Files (XLS/XLSX)',
        'PowerPoint (PPT/PPTX)',
        'Text Files',
        'Videos (MP4/AVI/MOV/WMV)'
      ]
    });
  }

  res.status(500).json({
    message: 'Internal server error',
    error: error.message
  });
});

module.exports = router;
