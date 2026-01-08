# IDTO 401 Unauthorized Error - Fix Guide

## Current Issue

IDTO API is returning **401 Unauthorized** even though:
- ✅ Headers are being sent correctly: `X-API-KEY` and `X-Client-ID`
- ✅ Redirect URL is correct: `http://192.168.1.40:5000/api/kyc/digilocker/callback`
- ✅ Request format is correct

## Possible Causes

1. **Invalid/Expired Credentials**
   - API Key or Client ID might be incorrect
   - Credentials might have expired
   - Credentials might not be activated in IDTO dashboard

2. **Wrong Authentication Method**
   - IDTO might require JWT token instead of API key + Client ID
   - IDTO might require credentials in request body instead of headers
   - IDTO might require different header names

3. **Account/Subscription Issues**
   - IDTO account might be suspended
   - Subscription might have expired
   - API access might not be enabled for your account

## What I've Tried

1. ✅ Multiple header formats (X-API-KEY, x-api-key, Authorization)
2. ✅ Adding credentials to request body
3. ✅ Attempting to get JWT token first
4. ✅ Better error logging

## Next Steps to Fix

### Step 1: Verify Credentials with IDTO

Contact IDTO support to verify:
- ✅ API Key: `DQ1F7KzZevMZICEdWeWM0DOaT5kfyGae5LgafOQLOW4`
- ✅ Client ID: `2a29c496-019a-43da-85b8-0e5f1428a51e`
- ✅ Check if these are correct and active
- ✅ Check if your account has access to DigiLocker endpoints

### Step 2: Check IDTO Dashboard

1. Login to IDTO dashboard
2. Check API credentials section
3. Verify:
   - API Key is active
   - Client ID matches
   - DigiLocker service is enabled
   - Redirect URL is whitelisted: `http://192.168.1.40:5000/api/kyc/digilocker/callback`

### Step 3: Get Correct Authentication Method

Ask IDTO support:
- What authentication method should be used?
- Do you need a JWT token first?
- What are the correct header names?
- Is there an authentication endpoint to get a token?

### Step 4: Update Credentials

If IDTO provides new credentials, update in `idto.service.js`:

```javascript
this.apiKey = 'YOUR_NEW_API_KEY';
this.clientId = 'YOUR_NEW_CLIENT_ID';
```

## For Local Testing (Temporary Workaround)

If you need to test the flow without IDTO, you can:

1. **Mock the IDTO response** (for development only)
2. **Use test credentials** if IDTO provides them
3. **Skip DigiLocker** and test manual KYC flow

## Current Status

- ✅ Player login with OTP: **Working**
- ✅ Token storage: **Working**
- ✅ Backend API: **Working**
- ❌ IDTO Authentication: **401 Unauthorized** (Credentials issue)

The code is correct - the issue is with IDTO credentials or authentication method.

