# Local Testing Setup Guide

## For Mobile Device Testing

### Step 1: Update Backend .env File

Add/update these variables in `royalflush-backend/.env`:

```env
# Backend URL (use your computer's IP address)
BACKEND_URL=http://192.168.1.40:5000

# IDTO Redirect URL (must be HTTP, not deep link)
APP_REDIRECT_URL=http://192.168.1.40:5000/api/kyc/digilocker/callback

# Mobile Deep Link (optional - for redirecting back to app after callback)
MOBILE_DEEP_LINK_URL=royalflush://kyc/callback

# IDTO Configuration
IDTO_BASE_URL=https://dev.idto.ai/verify
IDTO_API_KEY=your_api_key_here
IDTO_CLIENT_ID=your_client_id_here
```

### Step 2: Update Mobile App IP

The mobile app (`royalflush/services/api.ts`) is already set to:
```typescript
const LOCAL_IP = '192.168.1.40';
```

### Step 3: Verify Network Connection

1. **Make sure your phone and computer are on the same WiFi network**
2. **Check your computer's IP:**
   - Windows: `ipconfig` (look for IPv4 Address)
   - Mac/Linux: `ifconfig` or `ip addr`
3. **Test connection from phone:**
   - Open browser on phone
   - Go to: `http://192.168.1.40:5000/api/health` (or any test endpoint)
   - Should see response

### Step 4: Firewall Settings

**Windows Firewall:**
- Allow Node.js through firewall
- Or allow port 5000 inbound connections

**Mac Firewall:**
- System Preferences → Security → Firewall
- Allow Node.js or port 5000

### Step 5: Restart Backend

After updating `.env`:
```bash
cd royalflush-backend
npm start
```

### Step 6: Test KYC Flow

1. Open Expo app on your phone
2. Login with OTP
3. Go to KYC screen
4. Click "Continue with DigiLocker"
5. Should redirect to DigiLocker authentication

## Troubleshooting

### Can't connect from phone
- ✅ Check IP address is correct
- ✅ Check both devices on same WiFi
- ✅ Check firewall allows port 5000
- ✅ Try `http://192.168.1.40:5000` in phone browser first

### IDTO callback not working
- ✅ Check `APP_REDIRECT_URL` is HTTP (not deep link)
- ✅ Check `APP_REDIRECT_URL` matches your IP
- ✅ Check IDTO dashboard has this URL registered

### Deep link not working after callback
- ✅ Check `MOBILE_DEEP_LINK_URL` is set correctly
- ✅ Check app has deep link handler configured
- ✅ Test deep link manually: `royalflush://kyc/callback?success=true`

