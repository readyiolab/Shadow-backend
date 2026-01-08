# IDTO Authentication Fix

## Current Error: 401 Unauthorized

The IDTO API is returning: "Authentication required. Provide either a valid JWT token, API key + client ID, or SDK token."

## Solution

IDTO supports multiple authentication methods. Update your `.env` file with the correct method:

### Option 1: JWT Token (Recommended if you have it)

```env
IDTO_BASE_URL=https://dev.idto.ai/verify
IDTO_JWT_TOKEN=your_jwt_token_here

# Remove or comment out API_KEY and CLIENT_ID if using JWT
# IDTO_API_KEY=...
# IDTO_CLIENT_ID=...
```

### Option 2: API Key + Client ID (Current method)

If your API key and Client ID are correct, make sure they're valid:

```env
IDTO_BASE_URL=https://dev.idto.ai/verify
IDTO_API_KEY=DQ1F7KzZevMZICEdWeWM0DOaT5kfyGae5LgafOQLOW4
IDTO_CLIENT_ID=2a29c496-019a-43da-85b8-0e5f1428a51e
```

### Option 3: Get JWT Token First

If IDTO requires you to get a JWT token first using your API key and Client ID, you may need to:

1. Call an authentication endpoint to get a JWT token
2. Use that token for subsequent API calls

Check IDTO documentation for the authentication flow.

## Also Fix Redirect URL

Make sure your `.env` has:

```env
# Backend URL (use your computer's IP for local testing)
BACKEND_URL=http://192.168.1.40:5000

# Redirect URL (must be HTTP, not deep link)
APP_REDIRECT_URL=http://192.168.1.40:5000/api/kyc/digilocker/callback
```

## After Updating

1. **Restart backend** after updating `.env`
2. **Check backend console** - it will show which auth method is being used
3. **Try again** - the error should be resolved

## Troubleshooting

### Still getting 401?
- ✅ Verify API key and Client ID are correct in IDTO dashboard
- ✅ Check if API key has expired
- ✅ Verify the API key has permissions for DigiLocker endpoints
- ✅ Contact IDTO support to verify your credentials

### Redirect URL still showing deep link?
- ✅ Make sure `APP_REDIRECT_URL` is set in `.env`
- ✅ Restart backend after updating `.env`
- ✅ Check backend console logs for the redirect URL being used

