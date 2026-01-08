# Message to IDTO Support Team

---

**Subject: 401 Authentication Error - API Key + Client ID Not Working**

Hello IDTO Support Team,

I am integrating the IDTO DigiLocker API into my application and encountering a **401 Unauthorized** error when trying to initiate a DigiLocker session.

Issue Details

Error Message:

Authentication required. Provide either a valid JWT token, API key + client ID, or SDK token.


API Endpoint

POST https://dev.idto.ai/verify/digilocker/initiate_session


Request Headers

Content-Type: application/json
Accept: application/json
X-API-KEY: DQ1F7KzZevMZICEdWeWM0DOaT5kfyGae5LgafOQLOW4
X-Client-ID: 2a29c496-019a-43da-85b8-0e5f1428a51e


Request Payload:**

{
  "user_id": "1",
  "consent": true,
  "consent_purpose": "KYC Verification for Royal Flush Poker Platform",
  "redirect_url": "http://192.168.1.40:5000/api/kyc/digilocker/callback",
  "redirect_to_signup": false,
  "documents_for_consent": ["ADHAR", "PANCD"]
}
`

Response:

{
  "detail": "Authentication required. Provide either a valid JWT token, API key + client ID, or SDK token."
}


What I've Tried

 Sending `X-API-KEY` and `X-Client-ID` in request headers (uppercase)
 Sending `x-api-key` and `x-client-id` in request headers (lowercase)
 Verified credentials are correct
Verified redirect URL format is HTTP (not deep link)

 Questions

1. Are my API credentials correct and active?
   - API Key: `DQ1F7KzZevMZICEdWeWM0DOaT5kfyGae5LgafOQLOW4`
   - Client ID: `2a29c496-019a-43da-85b8-0e5f1428a51e`

2. What is the correct authentication method?
   - Should I use API Key + Client ID in headers?
   - Do I need to get a JWT token first? If yes, what is the authentication endpoint?
   - What are the exact header names required? (X-API-KEY, x-api-key, or something else?)

3. Is my redirect URL whitelisted?
   - Redirect URL: `http://192.168.1.40:5000/api/kyc/digilocker/callback`
   - Do I need to whitelist this in the dashboard?

4. Are there any account/subscription restrictions?
   - Does my account have access to DigiLocker endpoints?
   - Are there any plan limitations?

5. Can you provide a working example?
   - A curl command or code snippet that works with my credentials would be very helpful.

Additional Information

- Environment: Development (dev.idto.ai)
- Integration Type: Backend API integration (Node.js/Express)
- Use Case: KYC verification for poker platform
- Documents Required: Aadhaar (ADHAR) and PAN (PANCD)

 Contact Information

Please let me know:
- The correct authentication method
- If my credentials need to be regenerated
- Any additional configuration required

Thank you for your assistance!

---

**Alternative Shorter Version:**

---

**Subject: 401 Error - Need Help with API Authentication**

Hello IDTO Support,

I'm getting a 401 error when calling the DigiLocker API:

**Endpoint:** `POST https://dev.idto.ai/verify/digilocker/initiate_session`

**Headers I'm sending:**
- `X-API-KEY: DQ1F7KzZevMZICEdWeWM0DOaT5kfyGae5LgafOQLOW4`
- `X-Client-ID: 2a29c496-019a-43da-85b8-0e5f1428a51e`

**Error:** "Authentication required. Provide either a valid JWT token, API key + client ID, or SDK token."

**Questions:**
1. Are my credentials correct and active?
2. What is the correct authentication method? (Headers? JWT token? SDK token?)
3. Do I need to whitelist my redirect URL: `http://192.168.1.40:5000/api/kyc/digilocker/callback`?
4. Can you provide a working curl example?

Please help me resolve this authentication issue.

Thank you!

---

