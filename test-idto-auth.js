/**
 * Quick test script to verify IDTO authentication
 * Run with: node test-idto-auth.js
 */

const axios = require('axios');

const IDTO_CONFIG = {
  baseUrl: 'https://dev.idto.ai/verify',
  apiKey: 'DQ1F7KzZevMZICEdWeWM0DOaT5kfyGae5LgafOQLOW4',
  clientId: '2a29c496-019a-43da-85b8-0e5f1428a51e',
  redirectUrl: 'http://192.168.1.40:5000/api/kyc/digilocker/callback'
};

async function testIDTOAuth() {
  console.log('🧪 Testing IDTO Authentication...\n');
  console.log('Configuration:');
  console.log('  Base URL:', IDTO_CONFIG.baseUrl);
  console.log('  API Key:', IDTO_CONFIG.apiKey.substring(0, 10) + '...');
  console.log('  Client ID:', IDTO_CONFIG.clientId.substring(0, 10) + '...');
  console.log('  Redirect URL:', IDTO_CONFIG.redirectUrl);
  console.log('\n');

  // Test 1: Uppercase headers
  console.log('📝 Test 1: Uppercase headers (X-API-KEY, X-Client-ID)');
  try {
    const response1 = await axios.post(
      `${IDTO_CONFIG.baseUrl}/digilocker/initiate_session`,
      {
        user_id: "1",
        consent: true,
        consent_purpose: "KYC Verification Test",
        redirect_url: IDTO_CONFIG.redirectUrl,
        redirect_to_signup: false,
        documents_for_consent: ["ADHAR", "PANCD"]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-API-KEY': IDTO_CONFIG.apiKey,
          'X-Client-ID': IDTO_CONFIG.clientId
        }
      }
    );
    console.log('✅ SUCCESS! Response:', JSON.stringify(response1.data, null, 2));
    return;
  } catch (error) {
    console.log('❌ FAILED:', error.response?.status, error.response?.data?.detail || error.message);
  }
  console.log('\n');

  // Test 2: Lowercase headers
  console.log('📝 Test 2: Lowercase headers (x-api-key, x-client-id)');
  try {
    const response2 = await axios.post(
      `${IDTO_CONFIG.baseUrl}/digilocker/initiate_session`,
      {
        user_id: "1",
        consent: true,
        consent_purpose: "KYC Verification Test",
        redirect_url: IDTO_CONFIG.redirectUrl,
        redirect_to_signup: false,
        documents_for_consent: ["ADHAR", "PANCD"]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-api-key': IDTO_CONFIG.apiKey,
          'x-client-id': IDTO_CONFIG.clientId
        }
      }
    );
    console.log('✅ SUCCESS! Response:', JSON.stringify(response2.data, null, 2));
    return;
  } catch (error) {
    console.log('❌ FAILED:', error.response?.status, error.response?.data?.detail || error.message);
  }
  console.log('\n');

  // Test 3: Credentials in body
  console.log('📝 Test 3: Credentials in request body');
  try {
    const response3 = await axios.post(
      `${IDTO_CONFIG.baseUrl}/digilocker/initiate_session`,
      {
        user_id: "1",
        consent: true,
        consent_purpose: "KYC Verification Test",
        redirect_url: IDTO_CONFIG.redirectUrl,
        redirect_to_signup: false,
        documents_for_consent: ["ADHAR", "PANCD"],
        api_key: IDTO_CONFIG.apiKey,
        client_id: IDTO_CONFIG.clientId
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );
    console.log('✅ SUCCESS! Response:', JSON.stringify(response3.data, null, 2));
    return;
  } catch (error) {
    console.log('❌ FAILED:', error.response?.status, error.response?.data?.detail || error.message);
  }
  console.log('\n');

  // Test 4: Authorization header
  console.log('📝 Test 4: Authorization Bearer header');
  try {
    const response4 = await axios.post(
      `${IDTO_CONFIG.baseUrl}/digilocker/initiate_session`,
      {
        user_id: "1",
        consent: true,
        consent_purpose: "KYC Verification Test",
        redirect_url: IDTO_CONFIG.redirectUrl,
        redirect_to_signup: false,
        documents_for_consent: ["ADHAR", "PANCD"]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${IDTO_CONFIG.apiKey}`
        }
      }
    );
    console.log('✅ SUCCESS! Response:', JSON.stringify(response4.data, null, 2));
    return;
  } catch (error) {
    console.log('❌ FAILED:', error.response?.status, error.response?.data?.detail || error.message);
  }
  console.log('\n');

  console.log('❌ All authentication methods failed.');
  console.log('📧 Please contact IDTO support with the details from IDTO_SUPPORT_MESSAGE.md');
}

// Run the test
testIDTOAuth().catch(console.error);

