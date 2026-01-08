// ============================================
// utils/cloudinary.util.js
// Cloudinary Upload Utility for KYC Documents
// ============================================
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

class CloudinaryService {
  /**
   * Upload KYC document to Cloudinary
   * @param {string} filePath - Local file path
   * @param {string} playerId - Player ID for folder organization
   * @param {string} documentType - Type of document (id_proof, address_proof, bank_proof, etc)
   * @returns {Promise<Object>} - Cloudinary response with secure_url
   */
  async uploadKYCDocument(filePath, playerId, documentType) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileName = path.basename(filePath);
      const publicId = `kyc/player_${playerId}/${documentType}_${Date.now()}`;

      const result = await cloudinary.uploader.upload(filePath, {
        public_id: publicId,
        resource_type: 'auto',
        folder: 'royal_flush/kyc',
        tags: [`player_${playerId}`, documentType],
        overwrite: false,
        use_filename: true,
        unique_filename: true,
        type: 'authenticated' // Require authentication to access
      });

      // Delete local file after successful upload
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn(`Warning: Could not delete local file: ${filePath}`, err.message);
      }

      return {
        success: true,
        public_id: result.public_id,
        url: result.secure_url,
        cloudinary_id: result.public_id,
        file_size: result.bytes,
        format: result.format,
        uploaded_at: new Date()
      };
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw new Error(`Failed to upload document to Cloudinary: ${error.message}`);
    }
  }

  /**
   * Upload transaction screenshot to Cloudinary
   * @param {string} filePath - Local file path
   * @param {string} playerId - Player ID for folder organization
   * @param {string} transactionType - Type of transaction (deposit_cash, etc)
   * @returns {Promise<Object>} - Cloudinary response with secure_url
   */
  async uploadTransactionScreenshot(filePath, playerId, transactionType = 'deposit_cash') {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const publicId = `transactions/player_${playerId}/${transactionType}_${Date.now()}`;

      const result = await cloudinary.uploader.upload(filePath, {
        public_id: publicId,
        resource_type: 'image',
        folder: 'royal_flush/transactions',
        tags: [`player_${playerId}`, transactionType, 'screenshot'],
        overwrite: false,
        use_filename: true,
        unique_filename: true
      });

      // Delete local file after successful upload
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn(`Warning: Could not delete local file: ${filePath}`, err.message);
      }

      return {
        success: true,
        public_id: result.public_id,
        url: result.secure_url,
        cloudinary_id: result.public_id,
        file_size: result.bytes,
        format: result.format,
        uploaded_at: new Date()
      };
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw new Error(`Failed to upload screenshot to Cloudinary: ${error.message}`);
    }
  }

  /**
   * Delete KYC document from Cloudinary
   * @param {string} publicId - Cloudinary public ID
   * @returns {Promise<Object>}
   */
  async deleteKYCDocument(publicId) {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return {
        success: true,
        message: 'Document deleted successfully',
        result
      };
    } catch (error) {
      console.error('Cloudinary delete error:', error);
      throw new Error(`Failed to delete document from Cloudinary: ${error.message}`);
    }
  }

  /**
   * Get secure download URL for KYC document
   * @param {string} publicId - Cloudinary public ID
   * @returns {string} - Secure URL with token
   */
  getSecureUrl(publicId) {
    try {
      const url = cloudinary.url(publicId, {
        secure: true,
        type: 'authenticated'
      });
      return url;
    } catch (error) {
      console.error('Error generating secure URL:', error);
      throw new Error(`Failed to generate secure URL: ${error.message}`);
    }
  }

  /**
   * Generate authentication token for document access
   * @param {string} publicId - Cloudinary public ID
   * @param {number} expiresIn - Token expiration time in seconds (default: 3600 = 1 hour)
   * @returns {string} - Authentication token
   */
  generateAuthToken(publicId, expiresIn = 3600) {
    try {
      const token = cloudinary.utils.sign_url(
        cloudinary.url(publicId),
        {
          expires_at: Math.floor(Date.now() / 1000) + expiresIn
        }
      );
      return token;
    } catch (error) {
      console.error('Error generating auth token:', error);
      throw new Error(`Failed to generate auth token: ${error.message}`);
    }
  }

  /**
   * Upload multiple documents
   * @param {Array} files - Array of file paths
   * @param {string} playerId - Player ID
   * @param {Array} documentTypes - Array of document types
   * @returns {Promise<Array>} - Array of upload results
   */
  async uploadMultipleDocuments(files, playerId, documentTypes) {
    try {
      const uploadPromises = files.map((file, index) =>
        this.uploadKYCDocument(file, playerId, documentTypes[index] || 'document')
      );

      const results = await Promise.all(uploadPromises);
      return {
        success: true,
        count: results.length,
        documents: results
      };
    } catch (error) {
      console.error('Bulk upload error:', error);
      throw new Error(`Failed to upload multiple documents: ${error.message}`);
    }
  }

  /**
   * Get upload signature for frontend direct upload
   * Allows frontend to upload directly to Cloudinary
   * @returns {Object} - Upload signature and other needed data
   */
  getUploadSignature() {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = cloudinary.utils.api_sign_request(
        {
          timestamp,
          folder: 'royal_flush/kyc',
          resource_type: 'auto'
        },
        process.env.CLOUDINARY_API_SECRET
      );

      return {
        signature,
        timestamp,
        api_key: process.env.CLOUDINARY_API_KEY,
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME
      };
    } catch (error) {
      console.error('Error generating upload signature:', error);
      throw new Error(`Failed to generate upload signature: ${error.message}`);
    }
  }

  /**
   * Validate Cloudinary credentials
   * @returns {Promise<boolean>}
   */
  async validateConfig() {
    try {
      await cloudinary.api.ping();
      return true;
    } catch (error) {
      console.error('Cloudinary config validation failed:', error);
      return false;
    }
  }
}

module.exports = new CloudinaryService();
