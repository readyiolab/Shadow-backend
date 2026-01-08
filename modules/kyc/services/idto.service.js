const axios = require('axios');
const xml2js = require('xml2js');

class IDTOService {

  
  constructor() {
    // Your credentials
    // IDTO credentials - should match backend
    this.baseUrl = 'https://prod.idto.ai/verify';
    this.apiKey = 'DQ1F7KzZevMZICEdWeWM0DOaT5kfyGae5LgafOQLOW4';
    this.clientId = '2a29c496-019a-43da-85b8-0e5f1428a51e';

    console.log('✅ IDTO Service Initialized (Mobile App)');
    console.log('  Base URL:', this.baseUrl);
    
    // Validate credentials
    if (!this.apiKey || !this.clientId) {
      console.error('⚠️ WARNING: IDTO credentials are missing!');
    }
  }

  /**
   * Get headers for IDTO API - Use uppercase headers (IDTO standard)
   */
  getHeaders() {
    const headers = {
    'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-API-KEY': this.apiKey,
      'X-Client-ID': this.clientId,
    };
    
    
    return headers;
  }

  /**
   * Step 1: Verify if user has DigiLocker account
   * Returns: { registered: true/false, digilockerid, source, chargeable, user_consent }
   */
  async verifyAccount(mobileNumber) {
    try {
      console.log('📞 IDTO: Verifying account for:', mobileNumber);

      const response = await axios.post(
        `${this.baseUrl}/digilocker/verify_account`,
        { mobile_number: mobileNumber },
        { headers: this.getHeaders() }
      );

      console.log('✅ IDTO verify_account response:', JSON.stringify(response.data, null, 2));

      // Check if account is registered (code 1004 = ACCOUNT_FOUND)
      const isRegistered = response.data.code === 1004 || response.data.result?.registered === true;

      return {
        success: true,
        registered: isRegistered,
        result: response.data.result || {},
        code: response.data.code,
        data: response.data,
      };
    } catch (error) {
      console.error('❌ IDTO verify_account error:', error.response?.data);
      return {
        success: false,
        registered: false,
        error: error.response?.data?.detail || error.message,
        data: error.response?.data,
      };
    }
  }

  /**
   * Step 2: Initiate DigiLocker session
   * @param {string} userId - User ID
   * @param {boolean} redirectToSignup - Set to true if account doesn't exist, false if exists
   * @param {Array} documentsForConsent - Array of document codes (e.g., ['ADHAR', 'PANCD'])
   */
  async initiateSession(
    redirectUrl,
    userId,
    redirectToSignup = false,
    documentsForConsent = ['ADHAR', 'PANCR']
  ) {
    try {
      console.log('📞 IDTO: Initiating session');
      
      const payload = {
        consent: true,
        consent_purpose: 'KYC Verification for Royal Flush Poker Platform',
        redirect_url: redirectUrl,
        redirect_to_signup: redirectToSignup,
        documents_for_consent: documentsForConsent,
      };

      if (userId) {
        payload.user_id = userId;
      }

      console.log('📦 Payload:', JSON.stringify(payload, null, 2));

      const response = await axios.post(
        `${this.baseUrl}/digilocker/initiate_session`,
        payload,
        { headers: this.getHeaders() }
      );

      console.log('✅ IDTO Response:', JSON.stringify(response.data, null, 2));

      // IDTO API returns: { status, code, url, chargeble, user_consent }
      // The authorization URL is directly in the 'url' field
      const authUrl = response.data.url;

      if (!authUrl) {
        throw new Error('Authorization URL not found in IDTO response');
      }

      // Extract code_verifier from the URL query parameters if present
      let codeVerifier = '';
      try {
        const urlObj = new URL(authUrl);
        codeVerifier = urlObj.searchParams.get('code_verifier') || '';
      } catch (error) {
        console.log('⚠️ Could not extract code_verifier from URL, will use from callback');
      }

      return {
        success: true,
        url: authUrl,
        code_verifier: codeVerifier,
        message: response.data.status || 'Session initiated successfully',
        data: response.data,
      };
    } catch (error) {
      console.error('❌ IDTO initiate_session error:', error.response?.data);
      
      const errorDetail = error.response?.data?.detail || error.response?.data?.message || error.message;
      
      // Provide helpful error messages
      if (error.response?.status === 500) {
        throw new Error(
          `IDTO Error: ${errorDetail}\n\n` +
          `This is usually caused by:\n` +
          `1. Invalid redirect URL (must be publicly accessible HTTPS)\n` +
          `2. Redirect URL not whitelisted in IDTO dashboard\n` +
          `3. For local testing, use ngrok to create a public HTTPS URL`
        );
      }

      throw new Error(errorDetail);
    }
  }

  /**
   * Step 3: Get reference key from code
   */
  async getReference(code ,codeVerifier) {
    try {
      console.log('📞 IDTO: Getting reference key');
      console.log('  Code:', code.substring(0, 20) + '...');
      console.log('  Code Verifier:', codeVerifier.substring(0, 20) + '...');

      const response = await axios.post(
        `${this.baseUrl}/digilocker/get_reference`,
        {
          code: code,
          code_verifier: codeVerifier,
        },
        { headers: this.getHeaders() }
      );

      console.log('✅ IDTO get_reference response:', JSON.stringify(response.data, null, 2));

      return {
        success: true,
        data: response.data.data || response.data,
      };
    } catch (error) {
      console.error('❌ IDTO get_reference error:', error.response?.data);
      throw new Error(
        error.response?.data?.detail || 
        error.response?.data?.message || 
        'Failed to get reference key'
      );
    }
  }

  /**
   * Step 4: Get user details
   */
  async getUserDetails(referenceKey) {
    try {
      console.log('📞 IDTO: Getting user details');

      const response = await axios.post(
        `${this.baseUrl}/digilocker/user_details`,
        { reference_key: referenceKey },
        { headers: this.getHeaders() }
      );

      console.log('✅ IDTO user_details response:', JSON.stringify(response.data, null, 2));

      return {
        success: true,
        data: response.data.data || response.data,
      };
    } catch (error) {
      console.error('❌ IDTO user_details error:', error.response?.data);
      throw new Error(
        error.response?.data?.detail || 
        error.response?.data?.message || 
        'Failed to get user details'
      );
    }
  }
  /**
   * Step 4: Get list of issued documents
   * @param {string} referenceKey - Reference key from get_reference
   * @returns {Array} List of available documents with URIs
   */
  async getIssuedDocuments(referenceKey) {
    try {
      console.log('📄 Fetching issued documents list for reference:', referenceKey);
      
      const response = await axios.post(
        `${this.baseUrl}/digilocker/issued_docs`,
        { reference_key: referenceKey },
        { headers: this.getHeaders() }
      );
      console.log('✅ IDTO issued_docs response:', JSON.stringify(response.data, null, 2));

      return {
        success: true,
        data: response.data.data || response.data,
      };
    } catch (error) {
      console.error('❌ Error fetching issued documents:', error.response?.data);
      throw new Error(
        error.response?.data?.message || 
        'Failed to fetch issued documents'
      );
    }
  }

  /**
   * Step 5: Fetch document XML by URI
   * @param {string} referenceKey - Reference key from get_reference
   * @param {string} uri - Document URI from issued_docs response
   * @returns {Object} Parsed document data
   */
  async fetchDocumentXML(referenceKey, uri) {
    try {
      console.log('📄 Fetching document XML:', uri);
      
      const response = await axios.post(
        `${this.baseUrl}/digilocker/get_issued_docs_xml`,
        {
          reference_key: referenceKey,
          uri: uri,
        },
        {
          headers: {
            ...this.getHeaders(),
            'Accept': 'application/xml',
          },
          responseType: 'text',
        }
      );

      // Determine document type and parse accordingly
      const xmlString = response.data;
      
      // Try to parse as Aadhaar first
      if (xmlString.includes('OfflinePaperlessKyc') || xmlString.includes('UidData')) {
        return await this.parseAadhaarXML(xmlString);
      }
      // Try to parse as PAN
      else if (xmlString.includes('PAN') || xmlString.includes('CertificateData')) {
        return await this.parsePANXML(xmlString);
      }
      // Generic XML parsing
      else {
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(xmlString);
        return {
          raw: result,
          xml: xmlString
        };
      }
    } catch (error) {
      console.error('❌ Error fetching document XML:', error.response?.data);
      throw new Error(
        error.response?.data?.message || 
        'Failed to fetch document'
      );
    }
  }

  /**
   * Fetch Aadhaar XML directly from DigiLocker
   */
  async fetchAadhaar(referenceKey) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/digilocker/fetch_aadhaar`,
        { 
          reference_key: referenceKey 
        },
        {
          headers: {
            ...this.getHeaders(),
            'Accept': 'application/xml'
          },
          responseType: 'text'
        }
      );

      return await this.parseAadhaarXML(response.data);
    } catch (error) {
      const errorCode = error.response?.data?.code;
      const status = error.response?.status;
      
      if (errorCode === 2007 || status === 404) {
        throw new Error('Aadhaar not found in DigiLocker');
      } else if (errorCode === 2005) {
        throw new Error('User did not consent to Aadhaar access');
      } else if (errorCode === 2010) {
        throw new Error('DigiLocker session expired');
      }
      
      console.error('❌ Error fetching Aadhaar:', error.response?.data);
      throw new Error('Failed to fetch Aadhaar');
    }
  }

  /**
   * Fetch PAN XML directly from DigiLocker
   */
  async fetchPAN(referenceKey) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/digilocker/fetch_pan/xml`,
        { 
          reference_key: referenceKey 
        },
        {
          headers: {
            ...this.getHeaders(),
            'Accept': 'application/xml'
          },
          responseType: 'text'
        }
      );

      return await this.parsePANXML(response.data);
    } catch (error) {
      const errorCode = error.response?.data?.code;
      const status = error.response?.status;
      
      if (errorCode === 2007 || status === 404) {
        throw new Error('PAN not found in DigiLocker');
      } else if (errorCode === 2005) {
        throw new Error('User did not consent to PAN access');
      } else if (errorCode === 2010) {
        throw new Error('DigiLocker session expired');
      }
      
      console.error('❌ Error fetching PAN:', error.response?.data);
      throw new Error('PAN not available or user did not consent');
    }
  }

  /**
   * Parse Aadhaar XML to extract data
   */
  async parseAadhaarXML(xmlString) {
    try {
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(xmlString);

      // Handle two different XML formats:
      // Format 1: <OfflinePaperlessKyc><UidData>...
      // Format 2: <Certificate><CertificateData><KycRes><UidData>...

      let uidData = null;
      let kycData = null;
      let maskedAadhaar = null;
      let timestamp = null;

      // Try Format 1: OfflinePaperlessKyc
      if (result.OfflinePaperlessKyc) {
        kycData = result.OfflinePaperlessKyc;
        if (kycData.UidData && Array.isArray(kycData.UidData) && kycData.UidData.length > 0) {
          uidData = kycData.UidData[0];
          maskedAadhaar = (kycData.$ && kycData.$.referenceId) || null;
          timestamp = (kycData.$ && kycData.$.ts) || null;
        }
      }
      // Try Format 2: Certificate/CertificateData/KycRes
      else if (result.Certificate && result.Certificate.CertificateData) {
        const certData = result.Certificate.CertificateData[0];
        if (certData.KycRes && Array.isArray(certData.KycRes) && certData.KycRes.length > 0) {
          kycData = certData.KycRes[0];
          if (kycData.UidData && Array.isArray(kycData.UidData) && kycData.UidData.length > 0) {
            uidData = kycData.UidData[0];
            maskedAadhaar = (kycData.$ && kycData.$.uid) || null; // UID is in UidData attributes
            timestamp = (kycData.$ && kycData.$.ts) || null;
          }
        }
      }

      // Check if we found UidData
      if (!uidData) {
        console.error('❌ Invalid Aadhaar XML structure:', Object.keys(result || {}));
        throw new Error('Invalid Aadhaar XML format - UidData not found in either format');
      }

      // Extract Poi (Personal Info) and Poa (Address)
      const poi = (uidData.Poi && uidData.Poi[0] && uidData.Poi[0].$) || {}; // Personal Info
      const poa = (uidData.Poa && uidData.Poa[0] && uidData.Poa[0].$) || {}; // Address
      const photo = uidData.Pht ? uidData.Pht[0] : null;

      // Extract UID from UidData attributes if not already set
      if (!maskedAadhaar && uidData.$ && uidData.$.uid) {
        maskedAadhaar = uidData.$.uid;
      }

      return {
        name: poi.name || null,
        dob: poi.dob || null,
        gender: poi.gender || null,
        email: poi.email || null,
        phone: poi.phone || null,
        address: {
          house: poa.house || '',
          street: poa.street || '',
          locality: poa.loc || '',
          landmark: poa.lm || '',
          vtc: poa.vtc || '',
          district: poa.dist || '',
          state: poa.state || '',
          pincode: poa.pc || '',
          country: poa.country || 'India'
        },
        photo: photo,
        maskedAadhaar: maskedAadhaar,
        timestamp: timestamp
      };
    } catch (error) {
      console.error('❌ Error parsing Aadhaar XML:', error);
      console.error('❌ XML preview (first 500 chars):', xmlString.substring(0, 500));
      throw new Error('Failed to parse Aadhaar data: ' + error.message);
    }
  }

  /**
   * Parse PAN XML to extract data
   */
  async parsePANXML(xmlString) {
    try {
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(xmlString);

      // Handle different XML formats:
      // Format 1: <Certificate><IssuedTo><Person name="..." dob="..."/><CertificateData><PAN num="..."/></Certificate>
      // Format 2: <PAN><PAN>...</PAN><Name>...</Name>...</PAN>
      // Format 3: <CertificateData><PAN>...</PAN>...</CertificateData>

      let panNumber = null;
      let name = null;
      let dob = null;
      let fatherName = null;
      let panData = null;

      // Try Format 1: Certificate structure (DigiLocker standard format)
      // Structure: <Certificate number="..."><IssuedTo><Person name="..." dob="..."/><CertificateData><PAN num="..."/></Certificate>
      if (result.Certificate) {
        const certificate = result.Certificate;
        panData = certificate;

        // Extract PAN number - check multiple locations
        // 1. From CertificateData > PAN > num attribute
        if (certificate.CertificateData && Array.isArray(certificate.CertificateData) && certificate.CertificateData.length > 0) {
          const certData = certificate.CertificateData[0];
          if (certData.PAN && Array.isArray(certData.PAN) && certData.PAN.length > 0) {
            const panElement = certData.PAN[0];
            // PAN number is in the 'num' attribute
            panNumber = panElement.$?.num || panElement.$?.number || panElement.$?.pan || null;
            // Also try as text content
            if (!panNumber && panElement._) {
              panNumber = panElement._;
            }
          }
        }
        // 2. From Certificate root 'number' attribute
        if (!panNumber && certificate.$) {
          panNumber = certificate.$.number || certificate.$.num || null;
        }

        // Extract person details from IssuedTo > Person
        if (certificate.IssuedTo && Array.isArray(certificate.IssuedTo) && certificate.IssuedTo.length > 0) {
          const issuedTo = certificate.IssuedTo[0];
          if (issuedTo.Person && Array.isArray(issuedTo.Person) && issuedTo.Person.length > 0) {
            const person = issuedTo.Person[0];
            const personAttrs = person.$ || {};
            name = personAttrs.name || null;
            dob = personAttrs.dob || null;
            // Father name might be in 'swd' (spouse/wife/daughter) or other fields
            fatherName = personAttrs.fatherName || personAttrs.father_name || personAttrs.swd || null;
          }
        }
      }
      // Try Format 2: Direct PAN structure
      else if (result.PAN) {
        panData = result.PAN;
        panNumber = panData.PAN?.[0] || panData.panNumber?.[0] || panData.$?.num || panData.$?.number || null;
        name = panData.Name?.[0] || panData.name?.[0] || panData.$?.name || null;
        dob = panData.DOB?.[0] || panData.dob?.[0] || panData.$?.dob || null;
        fatherName = panData.FatherName?.[0] || panData.fatherName?.[0] || panData.FathersName?.[0] || panData.$?.fatherName || null;
      }
      // Try Format 3: CertificateData directly
      else if (result.CertificateData) {
        panData = result.CertificateData;
        if (Array.isArray(panData) && panData.length > 0) {
          panData = panData[0];
        }
        panNumber = panData?.PAN?.[0] || panData?.panNumber?.[0] || panData?.$?.num || panData?.$?.number || null;
        name = panData?.Name?.[0] || panData?.name?.[0] || panData?.$?.name || null;
        dob = panData?.DOB?.[0] || panData?.dob?.[0] || panData?.$?.dob || null;
        fatherName = panData?.FatherName?.[0] || panData?.fatherName?.[0] || panData?.FathersName?.[0] || panData?.$?.fatherName || null;
      }

      // If still no data found, log the structure for debugging
      if (!panData && !panNumber) {
        console.error('❌ Invalid PAN XML structure:', Object.keys(result || {}));
        console.error('❌ XML preview (first 500 chars):', xmlString.substring(0, 500));
        throw new Error('Invalid PAN XML format - PAN data not found');
      }

      // Log parsed data for debugging
      console.log('✅ Parsed PAN data:', {
        panNumber: panNumber ? panNumber.substring(0, 5) + '***' : null,
        hasName: !!name,
        hasDOB: !!dob,
        hasFatherName: !!fatherName,
      });

      return {
        panNumber: panNumber,
        name: name,
        dob: dob,
        fatherName: fatherName,
        raw: panData || result
      };
    } catch (error) {
      console.error('❌ Error parsing PAN XML:', error);
      console.error('❌ XML preview (first 500 chars):', xmlString.substring(0, 500));
      throw new Error('Failed to parse PAN data: ' + error.message);
    }
  }

  /**
   * Calculate age from DOB (DDMMYYYY format)
   */
  calculateAge(dobString) {
    const cleanDob = dobString.replace(/[-/]/g, '');
    
    const day = parseInt(cleanDob.substring(0, 2));
    const month = parseInt(cleanDob.substring(2, 4)) - 1;
    const year = parseInt(cleanDob.substring(4, 8));

    const birthDate = new Date(year, month, day);
    const today = new Date();

    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  }

  /**
   * Verify if user is eligible (18+)
   */
  isEligible(dobString) {
    const age = this.calculateAge(dobString);
    return {
      eligible: age >= 18,
      age: age,
      minimumAge: 18
    };
  }
}

module.exports = new IDTOService();