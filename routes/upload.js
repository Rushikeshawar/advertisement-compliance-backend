 
const express = require('express');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Cloudinary storage for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'advertisement-compliance',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'mp4', 'avi', 'mov', 'wmv'],
    public_id: (req, file) => {
      const timestamp = Date.now();
      const randomId = uuidv4().substr(0, 8);
      const fileName = file.originalname.split('.')[0];
      return `${timestamp}-${randomId}-${fileName}`;
    },
    resource_type: 'auto' // Automatically detect file type
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
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
// Inside /files route
router.post('/files', upload.array('files', 5), async (req, res) => {
  try {
    console.log('Files received:', req.files);
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const uploadedFiles = req.files.map(file => ({
      originalName: file.originalname,
      filename: file.filename,
      url: file.path,
      size: file.size,
      mimetype: file.mimetype,
      cloudinaryId: file.filename
    }));

    res.json({
      message: `${uploadedFiles.length} file(s) uploaded successfully`,
      files: uploadedFiles
    });

  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({
      message: 'File upload failed',
      error: error.message,
      stack: error.stack
    });
  }
});

// Inside /file route
router.post('/file', upload.single('file'), async (req, res) => {
  try {
    console.log('Single file received:', req.file);
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const uploadedFile = {
      originalName: req.file.originalname,
      filename: req.file.filename,
      url: req.file.path,
      size: req.file.size,
      mimetype: req.file.mimetype,
      cloudinaryId: req.file.filename
    };

    res.json({
      message: 'File uploaded successfully',
      file: uploadedFile
    });

  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({
      message: 'File upload failed',
      error: error.message,
      stack: error.stack
    });
  }
});


// Delete file
router.delete('/file/:cloudinaryId', async (req, res) => {
  try {
    const { cloudinaryId } = req.params;

    // Delete from Cloudinary
    const result = await cloudinary.uploader.destroy(cloudinaryId);

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

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        message: 'File too large',
        maxSize: '50MB'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        message: 'Too many files',
        maxFiles: 5
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        message: 'Unexpected field name for file upload'
      });
    }
  }
  
  if (error.message.includes('File type') && error.message.includes('not allowed')) {
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

  next(error);
});

module.exports = router;