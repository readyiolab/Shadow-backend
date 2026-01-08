// ============================================
// FILE: config/cloudinary.config.js
// Cloudinary configuration for image storage
// ============================================

const cloudinary = require('cloudinary').v2;
const { cloudinaryCloudName, cloudinaryApiKey, cloudinaryApiSecret } = require('./dotenvConfig');

cloudinary.config({
  cloud_name: cloudinaryCloudName,
  api_key: cloudinaryApiKey,
  api_secret: cloudinaryApiSecret
});

const uploadToCloudinary = async (file, folder = 'royal-flush') => {
  try {
    const result = await cloudinary.uploader.upload(file.tempFilePath || file.path, {
      folder: folder,
      resource_type: 'auto',
      quality: 'auto',
      fetch_format: 'auto',
      max_file_size: 5242880 // 5MB in bytes
    });
    
    return {
      success: true,
      url: result.secure_url,
      public_id: result.public_id
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

const deleteFromCloudinary = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
    return { success: true };
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    return { success: false, error: error.message };
  }
};

module.exports = { uploadToCloudinary, deleteFromCloudinary };

