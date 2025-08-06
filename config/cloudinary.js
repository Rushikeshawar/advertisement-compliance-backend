 
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Cloudinary storage configuration
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'advertisement-compliance',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'mp4', 'avi', 'mov', 'wmv'],
    public_id: (req, file) => {
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substr(2, 8);
      const fileName = file.originalname.split('.')[0];
      return `${timestamp}-${randomId}-${fileName}`;
    },
    resource_type: 'auto'
  }
});

// Upload single file to Cloudinary
const uploadFile = async (file, folder = 'advertisement-compliance') => {
  try {
    const result = await cloudinary.uploader.upload(file.path, {
      folder: folder,
      resource_type: 'auto'
    });
    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      bytes: result.bytes
    };
  } catch (error) {
    throw new Error(`Cloudinary upload failed: ${error.message}`);
  }
};

// Delete file from Cloudinary
const deleteFile = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    throw new Error(`Cloudinary delete failed: ${error.message}`);
  }
};

// Get file info from Cloudinary
const getFileInfo = async (publicId) => {
  try {
    const result = await cloudinary.api.resource(publicId);
    return {
      publicId: result.public_id,
      url: result.secure_url,
      format: result.format,
      bytes: result.bytes,
      createdAt: result.created_at,
      width: result.width,
      height: result.height
    };
  } catch (error) {
    throw new Error(`Failed to get file info: ${error.message}`);
  }
};

// Generate signed URL for secure access
const generateSignedUrl = (publicId, options = {}) => {
  return cloudinary.url(publicId, {
    sign_url: true,
    ...options
  });
};

module.exports = {
  cloudinary,
  storage,
  uploadFile,
  deleteFile,
  getFileInfo,
  generateSignedUrl
};