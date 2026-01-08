// ============================================
// config/digilocker.config.js
// DigiLocker API Configuration
// ============================================

const axios = require('axios');
const crypto = require('crypto');

class DigiLockerService {
  constructor() {
    // DigiLocker API Credentials (from .env)
    this.clientId = process.env.DIGILOCKER_CLIENT_ID;
    this.clientSecret = process.env.DIGILOCKER_CLIENT_SECRET;
    this.redirectUri = process.env.DIGILOCKER_REDIRECT_URI;
    
    // DigiLocker API URLs
    this.baseURL = 'https://api.digitallocker.gov.in'; // Production
    // this.baseURL = 'https://stage.digitallocker.gov.in'; // Staging for testing
    
    this.authURL = `${this.baseURL}/public/oauth2`;
    this.apiURL = `${this.baseURL}/public/api`;
  }

  // Generate authorization URL for user consent
  generateAuthURL(state) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state: state,
      scope: 'read'
    });

    return `${this.authURL}/1/authorize?${params.toString()}`;
  }

  // Exchange authorization code for access token
  async getAccessToken(authCode) {
    try {
      const response = await axios.post(
        `${this.authURL}/1/token`,
        {
          grant_type: 'authorization_code',
          code: authCode,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return {
        access_token: response.data.access_token,
        token_type: response.data.token_type,
        expires_in: response.data.expires_in,
        refresh_token: response.data.refresh_token
      };
    } catch (error) {
      console.error('Error getting access token:', error.response?.data || error.message);
      throw new Error('Failed to get DigiLocker access token');
    }
  }

  // Get Aadhaar details
  async getAadhaarDetails(accessToken) {
    try {
      const response = await axios.get(`${this.apiURL}/1/aadhaar`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        name: response.data.name,
        dob: response.data.dob,
        gender: response.data.gender,
        address: {
          house: response.data.house,
          street: response.data.street,
          landmark: response.data.landmark,
          locality: response.data.locality,
          vtc: response.data.vtc,
          subdist: response.data.subdist,
          dist: response.data.dist,
          state: response.data.state,
          pincode: response.data.pincode,
          country: response.data.country
        },
        photo: response.data.photo,
        aadhaar_number: this.maskAadhaar(response.data.uid)
      };
    } catch (error) {
      console.error('Error fetching Aadhaar details:', error.response?.data || error.message);
      throw new Error('Failed to fetch Aadhaar details from DigiLocker');
    }
  }

  // Get PAN details
  async getPANDetails(accessToken) {
    try {
      const response = await axios.get(`${this.apiURL}/1/pan`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        name: response.data.name,
        pan_number: response.data.pan,
        dob: response.data.dob,
        father_name: response.data.father_name
      };
    } catch (error) {
      console.error('Error fetching PAN details:', error.response?.data || error.message);
      throw new Error('Failed to fetch PAN details from DigiLocker');
    }
  }

  // Get Driving License details
  async getDrivingLicenseDetails(accessToken) {
    try {
      const response = await axios.get(`${this.apiURL}/1/driving_license`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        name: response.data.name,
        license_number: response.data.license_number,
        dob: response.data.dob,
        issue_date: response.data.issue_date,
        expiry_date: response.data.expiry_date,
        address: response.data.address,
        photo: response.data.photo
      };
    } catch (error) {
      console.error('Error fetching DL details:', error.response?.data || error.message);
      throw new Error('Failed to fetch Driving License details from DigiLocker');
    }
  }

  // Helper: Mask Aadhaar number
  maskAadhaar(aadhaarNumber) {
    if (!aadhaarNumber || aadhaarNumber.length !== 12) return aadhaarNumber;
    return `XXXX-XXXX-${aadhaarNumber.slice(-4)}`;
  }

  // Helper: Save photo to file system
  async savePhotoFromBase64(base64Data, fileName) {
    const fs = require('fs').promises;
    const path = require('path');
    
    const buffer = Buffer.from(base64Data, 'base64');
    const filePath = path.join('uploads', 'kyc', fileName);
    
    await fs.writeFile(filePath, buffer);
    return filePath;
  }

  // Helper: Generate state parameter
  generateState(playerId) {
    const timestamp = Date.now();
    const hash = crypto.createHash('sha256')
      .update(`${playerId}-${timestamp}-${this.clientSecret}`)
      .digest('hex');
    
    return `${playerId}_${hash.substring(0, 16)}`;
  }

  // Helper: Verify state parameter
  verifyState(state) {
    const parts = state.split('_');
    return parts[0];
  }
}

module.exports = new DigiLockerService();