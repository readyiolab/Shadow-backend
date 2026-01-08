# IDTO DigiLocker Setup Guide

## Environment Variables Required

Add these to your `.env` file in the `royalflush-backend` directory:

```env
# IDTO DigiLocker Configuration
IDTO_BASE_URL=https://api.idto.in  # Replace with actual IDTO API URL
IDTO_API_KEY=your_idto_api_key_here
IDTO_CLIENT_ID=your_idto_client_id_here
APP_REDIRECT_URL=http://your-ip:5000/api/kyc/digilocker/callback
# OR use FRONTEND_URL (will append /kyc/callback)
FRONTEND_URL=http://your-ip:5000
```

## Quick Setup

1. **Get IDTO Credentials:**
   - Contact IDTO to get your API credentials
   - You'll receive:
     - `IDTO_BASE_URL` - API base URL
     - `IDTO_API_KEY` - Your API key
     - `IDTO_CLIENT_ID` - Your client ID

2. **Set Redirect URL:**
   - For mobile testing: `http://YOUR_IP:5000/api/kyc/digilocker/callback`
   - For production: `https://yourdomain.com/api/kyc/digilocker/callback`
   - Make sure this URL is registered in your IDTO dashboard

3. **Add to .env file:**
   ```env
   IDTO_BASE_URL=https://api.idto.in
   IDTO_API_KEY=your_actual_api_key
   IDTO_CLIENT_ID=your_actual_client_id
   APP_REDIRECT_URL=http://192.168.1.100:5000/api/kyc/digilocker/callback
   ```

4. **Restart Backend:**
   ```bash
   npm start
   ```

## Testing

After setting up, test the endpoint:
```bash
POST http://localhost:5000/api/kyc/player/self/digilocker/initiate
Headers: Authorization: Bearer YOUR_PLAYER_TOKEN
```

## Common Errors

### "IDTO configuration is missing"
- ✅ Check all environment variables are set
- ✅ Restart backend after adding variables
- ✅ Check `.env` file is in `royalflush-backend` directory

### "Redirect URL is missing"
- ✅ Set `APP_REDIRECT_URL` or `FRONTEND_URL` in `.env`
- ✅ Make sure URL is registered in IDTO dashboard

### "Failed to initiate DigiLocker session"
- ✅ Check IDTO API credentials are correct
- ✅ Verify API URL is correct
- ✅ Check network connectivity to IDTO API
- ✅ Check IDTO dashboard for API status

## Debugging

Check backend console logs for:
- Configuration validation messages
- API request/response details
- Error messages with full details

