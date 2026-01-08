// ============================================
// modules/kyc/services/kyc.service.js
// ============================================
const db = require("../../../config/database");
const { sendSuccess, sendError } = require("../../../utils/response.util");
const { logAudit } = require("../../../utils/logger.util");
const cloudinaryService = require("../../../utils/cloudinary.util");
const idtoService = require("./idto.service");
const fs = require("fs");
const path = require("path");
const os = require("os");

class KYCService {
  // Step 1: Verify DigiLocker account with mobile number
  async verifyDigiLockerAccount(mobileNumber) {
    try {
      console.log('🔍 KYCService: Verifying DigiLocker account for:', mobileNumber);
      const result = await idtoService.verifyAccount(mobileNumber);
      
      console.log('📦 KYCService: IDTO verifyAccount result:', JSON.stringify(result, null, 2));
      
      if (!result.success) {
        console.error('❌ KYCService: Account verification failed:', result.error);
        throw new Error(result.error || 'Failed to verify DigiLocker account');
      }
      
      const returnValue = {
        success: true,
        registered: result.registered,
        digilockerid: result.digilockerid,
        source: result.source,
        chargeable: result.chargeable,
        user_consent: result.user_consent,
        code: result.code,
        status: result.status,
        data: result.data,
      };
      
      console.log('✅ KYCService: Returning account verification result:', JSON.stringify(returnValue, null, 2));
      return returnValue;
    } catch (error) {
      console.error('❌ KYCService: Error verifying DigiLocker account:', error);
      throw new Error('Failed to verify DigiLocker account: ' + error.message);
    }
  }

  // Step 2: Initiate DigiLocker KYC using IDTO (after account verification)
  async initiateDigiLockerKYC(playerId, userId, mobileNumber = null) {
    const player = await db.select("tbl_players", "*", "player_id = ?", [
      playerId,
    ]);
    if (!player) {
      throw new Error("Player not found");
    }

    // Step 1: Verify account if mobile number provided (for dynamic orchestration)
    let redirectToSignup = false; // Default: account exists
    if (mobileNumber) {
      console.log('📱 Verifying DigiLocker account for mobile:', mobileNumber);
      const accountCheck = await this.verifyDigiLockerAccount(mobileNumber);
      
      if (!accountCheck.success) {
        throw new Error(
          'Failed to verify DigiLocker account. Please try again.'
        );
      }
      
      // Set redirect_to_signup based on account existence
      // If account is registered, redirect_to_signup = false (user can login)
      // If account is NOT registered, redirect_to_signup = true (user needs to signup)
      redirectToSignup = !accountCheck.registered;
      
      if (accountCheck.registered) {
        console.log('✅ DigiLocker account verified:', accountCheck.digilockerid);
        console.log('   Setting redirect_to_signup: false (account exists)');
      } else {
        console.log('ℹ️ DigiLocker account not found - will redirect to signup');
        console.log('   Setting redirect_to_signup: true (account does not exist)');
      }
    } else {
      console.log('ℹ️ No mobile number provided - using default redirect_to_signup: false');
    }

    let kyc = await this.getKYC(playerId);

    if (!kyc) {
      const result = await db.insert("tbl_player_kyc", {
        player_id: playerId,
        id_type: "aadhaar",
        id_number: "PENDING",
        kyc_status: "pending",
        kyc_method: "digilocker",
      });
      kyc = { kyc_id: result.insert_id };
    }

    // Step 2: Initiate IDTO session with redirect_to_signup flag
    console.log('🚀 Initiating DigiLocker session with redirect_to_signup:', redirectToSignup);
    const sessionResult = await idtoService.initiateSession(playerId, redirectToSignup);
    
    console.log('✅ DigiLocker session initiated successfully');
    console.log('   Auth URL:', sessionResult.authUrl);
    console.log('   Code Verifier:', sessionResult.codeVerifier ? 'Set' : 'Missing');

    // Store session in database (using reference_key table structure)
    await db.insert("tbl_digilocker_sessions", {
      player_id: playerId,
      code_verifier: sessionResult.codeVerifier,
      status: "initiated",
      expires_at: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      created_at: new Date(),
    });

    return {
      kyc_id: kyc.kyc_id,
      auth_url: sessionResult.authUrl,
      message: sessionResult.message,
    };
  }

  // Step 2: Handle DigiLocker callback using IDTO
  async handleDigiLockerCallback(code, codeVerifier, playerId) {
    // Find the most recent initiated session for this player
    const session = await db.select(
      "tbl_digilocker_sessions",
      "*",
      "player_id = ? AND status = ?",
      [playerId, "initiated"]
    );

    if (!session) {
      throw new Error("Invalid or expired DigiLocker session");
    }

    // Verify code_verifier matches
    if (session.code_verifier !== codeVerifier) {
      throw new Error("Invalid code verifier");
    }

    try {
      // Get reference key from IDTO
      const referenceResult = await idtoService.getReference(code, codeVerifier);

      // Update session with reference key
      await db.update(
        "tbl_digilocker_sessions",
        {
          reference_key: referenceResult.referenceKey,
          status: "authorized",
          expires_at: new Date(Date.now() + referenceResult.expiresIn * 1000),
        },
        "session_id = ?",
        [session.session_id]
      );

      return {
        player_id: playerId,
        session_id: session.session_id,
        reference_key: referenceResult.referenceKey,
      };
    } catch (error) {
      await db.update(
        "tbl_digilocker_sessions",
        { status: "failed", error_message: error.message },
        "session_id = ?",
        [session.session_id]
      );
      throw error;
    }
  }

  // Step 3: Fetch and store Aadhaar data using IDTO
  // mobileData: Optional data from mobile app (user_details, aadhaar_xml, pan_xml, issued_documents)
  async fetchAndStoreAadhaarData(playerId, referenceKey, userId, mobileData = null) {
    // Try to find session, but don't fail if not found (mobile app flow might not create session)
    let session = await db.select(
      "tbl_digilocker_sessions",
      "*",
      "reference_key = ? AND player_id = ? AND status = ?",
      [referenceKey, playerId, "authorized"]
    );

    // If no session found, create one for mobile app flow
    if (!session && mobileData) {
      const insertResult = await db.insert("tbl_digilocker_sessions", {
        player_id: playerId,
        reference_key: referenceKey,
        status: "authorized",
        expires_at: new Date(Date.now() + 3600 * 1000), // 1 hour
        created_at: new Date(),
      });
      session = { session_id: insertResult.insert_id };
    }

    if (!session) {
      throw new Error("DigiLocker session not found or not authorized");
    }

    try {
      // Get user details from mobile app (extracted from Aadhaar XML)
      // If not provided, extract from Aadhaar XML on backend
      let userDetails = null;
      if (mobileData?.user_details) {
        userDetails = mobileData.user_details;
        console.log('📱 Using user details from mobile app');
      }

      // Extract user details from Aadhaar XML if not provided
      if (!userDetails && mobileData?.aadhaar_xml) {
        try {
          console.log('📝 Extracting user details from Aadhaar XML...');
          const aadhaarData = await idtoService.parseAadhaarXML(mobileData.aadhaar_xml);
          userDetails = {
            name: aadhaarData?.name || null,
            dob: aadhaarData?.dob || null,
            gender: aadhaarData?.gender || null,
            extracted_from_xml: true,
          };
          console.log('✅ Extracted user details from Aadhaar XML');
        } catch (error) {
          console.warn('⚠️ Failed to extract user details from XML:', error.message);
        }
      }

      // Verify age eligibility if user details available
      let ageCheck = null;
      if (userDetails && userDetails.dob) {
        ageCheck = idtoService.isEligible(userDetails.dob);
        
        if (!ageCheck.eligible) {
          await db.update(
            "tbl_digilocker_sessions",
            { status: "failed", error_message: `Age verification failed: ${ageCheck.age} years old` },
            "session_id = ?",
            [session.session_id]
          );
          throw new Error(`Must be 18 or older. Current age: ${ageCheck.age}`);
        }
      }

      // Fetch Aadhaar data - use XML from mobile if provided, otherwise fetch from IDTO
      let aadhaarData = null;
      if (mobileData?.aadhaar_xml) {
        try {
          console.log('📱 Parsing Aadhaar XML from mobile app');
          aadhaarData = await idtoService.parseAadhaarXML(mobileData.aadhaar_xml);
        } catch (error) {
          console.log('Aadhaar XML parse failed:', error.message);
        }
      }
      
      // If not provided or parsing failed, try fetching from IDTO
      if (!aadhaarData) {
        try {
          console.log('📞 Fetching Aadhaar from IDTO');
          aadhaarData = await idtoService.fetchAadhaar(referenceKey);
        } catch (error) {
          console.log('Aadhaar fetch failed:', error.message);
          // Continue even if Aadhaar fetch fails
        }
      }

      // Fetch PAN data (optional) - use XML from mobile if provided, otherwise fetch from IDTO
      let panData = null;
      if (mobileData?.pan_xml) {
        try {
          console.log('📱 Parsing PAN XML from mobile app');
          panData = await idtoService.parsePANXML(mobileData.pan_xml);
        } catch (error) {
          console.log('PAN XML parse failed:', error.message);
        }
      }
      
      // If not provided or parsing failed, try fetching from IDTO
      if (!panData) {
        try {
          console.log('📞 Fetching PAN from IDTO');
          panData = await idtoService.fetchPAN(referenceKey);
        } catch (error) {
          console.log('PAN fetch failed:', error.message);
          // Continue even if PAN fetch fails
        }
      }

      // Prepare address string
      let address = '';
      if (aadhaarData && aadhaarData.address) {
        const addr = aadhaarData.address;
        address = `${addr.house || ''}, ${addr.street || ''}, ${addr.locality || ''}, ${addr.dist || ''}, ${addr.state || ''} - ${addr.pincode || ''}`.replace(/^,\s*|,\s*$/g, '');
      }

      // Upload photo to Cloudinary if available
      let photoUrl = null;
      let photoCloudinaryId = null;
      if (aadhaarData && aadhaarData.photo) {
        try {
          // Convert base64 photo to temporary file and upload
          const photoBuffer = Buffer.from(aadhaarData.photo, 'base64');
          const tempDir = os.tmpdir();
          const fileName = `player_${playerId}_aadhaar_photo_${Date.now()}.jpg`;
          const tempFilePath = path.join(tempDir, fileName);
          
          // Write buffer to temporary file
          fs.writeFileSync(tempFilePath, photoBuffer);
          
          // Upload to Cloudinary
          const photoResult = await cloudinaryService.uploadKYCDocument(
            tempFilePath,
            playerId,
            'photo'
          );
          
          if (photoResult.success) {
            photoUrl = photoResult.url;
            photoCloudinaryId = photoResult.cloudinary_id;
          }
        } catch (photoError) {
          console.error('Error uploading photo:', photoError);
        }
      }

      // Extract Aadhaar number from masked Aadhaar or use placeholder
      const aadhaarNumber = aadhaarData?.maskedAadhaar || (aadhaarData ? 'VERIFIED' : 'PENDING');

      // Prepare update data
      const kycUpdateData = {
        digilocker_verified: true,
        digilocker_data: JSON.stringify({
          reference_key: referenceKey,
          digilocker_id: userDetails?.digilockerid || null,
          name: userDetails?.name || aadhaarData?.name || null,
          dob: userDetails?.dob || aadhaarData?.dob || null,
          gender: userDetails?.gender || aadhaarData?.gender || null,
          age: ageCheck?.age || null,
          address: aadhaarData?.address || null,
          aadhaar_data: aadhaarData || null,
          pan_data: panData || null,
        }),
      };

      // Only update status if we have at least one document or user details
      if (aadhaarData || panData || userDetails) {
        kycUpdateData.id_number = aadhaarNumber;
        kycUpdateData.photo = photoUrl;
        kycUpdateData.photo_cloudinary_id = photoCloudinaryId;
        kycUpdateData.kyc_status = "submitted";
        kycUpdateData.submitted_at = new Date();
      } else {
        // If no documents, keep status as pending but store reference_key
        kycUpdateData.kyc_status = "pending";
        console.warn('⚠️ No documents found - storing reference_key only');
      }

      // Ensure KYC record exists before updating
      let existingKyc = await this.getKYC(playerId);
      if (!existingKyc) {
        // Create KYC record if it doesn't exist
        console.log('📝 Creating new KYC record for player:', playerId);
        const insertResult = await db.insert("tbl_player_kyc", {
          player_id: playerId,
          id_type: "aadhaar",
          id_number: "PENDING",
          kyc_status: "pending",
          kyc_method: "digilocker",
          ...kycUpdateData,
        });
        existingKyc = { kyc_id: insertResult.insert_id };
      } else {
        // Update existing KYC record
        await db.update(
          "tbl_player_kyc",
          kycUpdateData,
          "player_id = ?",
          [playerId]
        );
      }

      // Update player record only if we have data
      if (aadhaarData || panData || userDetails) {
        const updatePlayerData = {
          kyc_status: "submitted",
        };

        if (userDetails?.name || aadhaarData?.name) {
          updatePlayerData.player_name = userDetails?.name || aadhaarData?.name;
        }

        if (address) {
          updatePlayerData.address = address;
        }

        await db.update(
          "tbl_players",
          updatePlayerData,
          "player_id = ?",
          [playerId]
        );
      }

      // Update session status
      await db.update(
        "tbl_digilocker_sessions",
        { status: "completed", completed_at: new Date() },
        "session_id = ?",
        [session.session_id]
      );

      // Save PAN details to separate table if available
      if (panData && panData.panNumber) {
        try {
          // Check if PAN record already exists
          const existingPAN = await db.select(
            "tbl_player_pan_details",
            "*",
            "player_id = ?",
            [playerId]
          );

          if (existingPAN && existingPAN.length > 0) {
            // Update existing PAN record
            await db.update(
              "tbl_player_pan_details",
              {
                pan_number: panData.panNumber,
                name_on_pan: panData.name,
                dob: panData.dob,
                father_name: panData.fatherName,
                verified_via_digilocker: true,
                updated_at: new Date(),
              },
              "player_id = ?",
              [playerId]
            );
            console.log('✅ Updated PAN details in tbl_player_pan_details');
          } else {
            // Insert new PAN record
            await db.insert("tbl_player_pan_details", {
              player_id: playerId,
              pan_number: panData.panNumber,
              name_on_pan: panData.name,
              dob: panData.dob,
              father_name: panData.fatherName,
              verified_via_digilocker: true,
              created_at: new Date(),
              updated_at: new Date(),
            });
            console.log('✅ Saved PAN details to tbl_player_pan_details');
          }
        } catch (panTableError) {
          console.warn('⚠️ Could not save to tbl_player_pan_details table:', panTableError.message);
          console.warn('⚠️ PAN data is still stored in digilocker_data JSON field');
          // Continue - PAN data is already in digilocker_data
        }
      }

      await this.deactivateReminderSchedule(playerId);

      await this.sendKYCNotification(
        playerId,
        "kyc_submitted",
        "KYC Submitted Successfully",
        "Your KYC has been verified through DigiLocker and submitted for review."
      );

      // Get updated KYC record for audit log (use existingKyc if available, otherwise fetch)
      const kycForAudit = existingKyc || await this.getKYC(playerId);
      
      // Only log audit if KYC record exists
      if (kycForAudit && kycForAudit.kyc_id) {
        await this.logKYCAudit(
          kycForAudit.kyc_id,
          playerId,
          "submitted",
          userId,
          "pending",
          "submitted",
          "DigiLocker verification completed via IDTO"
        );
      } else {
        console.warn('⚠️ KYC record not found for player:', playerId, '- skipping audit log');
      }

      return {
        success: true,
        message: "Aadhaar data fetched and stored successfully",
        data: {
          name: userDetails?.name || aadhaarData?.name || null,
          dob: userDetails?.dob || aadhaarData?.dob || null,
          age: ageCheck?.age || null,
          aadhaar_verified: !!aadhaarData,
          pan_verified: !!panData,
        },
      };
    } catch (error) {
      await db.update(
        "tbl_digilocker_sessions",
        { status: "failed", error_message: error.message },
        "session_id = ?",
        [session.session_id]
      );
      throw error;
    }
  }

  // Fetch PAN data (optional) using IDTO
  async fetchAndStorePANData(playerId, referenceKey, userId) {
    const session = await db.select(
      "tbl_digilocker_sessions",
      "*",
      "reference_key = ? AND player_id = ? AND status IN (?, ?)",
      [referenceKey, playerId, "authorized", "completed"]
    );

    if (!session) {
      throw new Error("DigiLocker session not found");
    }

    try {
      const panData = await idtoService.fetchPAN(referenceKey);

      // Check if PAN details table exists, if not, store in digilocker_data
      try {
        await db.insert("tbl_player_pan_details", {
          player_id: playerId,
          pan_number: panData.panNumber,
          name_on_pan: panData.name,
          dob: panData.dob,
          father_name: panData.fatherName,
          verified_via_digilocker: true,
        });
      } catch (tableError) {
        // If table doesn't exist, update digilocker_data with PAN info
        const kyc = await this.getKYC(playerId);
        if (kyc && kyc.digilocker_data) {
          const digiData = JSON.parse(kyc.digilocker_data);
          digiData.pan_data = panData;
          await db.update(
            "tbl_player_kyc",
            { digilocker_data: JSON.stringify(digiData) },
            "player_id = ?",
            [playerId]
          );
        }
      }

      return panData;
    } catch (error) {
      console.error("Error fetching PAN data:", error);
      throw error;
    }
  }

  // Check DigiLocker account (optional step)
  async checkDigiLockerAccount(mobileNumber) {
    return await idtoService.verifyAccount(mobileNumber);
  }

  // Get KYC details
  async getKYC(playerId) {
    const kyc = await db.select("tbl_player_kyc", "*", "player_id = ?", [
      playerId,
    ]);

    return kyc;
  }

  async createKYC(playerId, data, userId) {
    const result = await db.insert("tbl_player_kyc", {
      player_id: playerId,
      id_type: data.id_type,
      id_number: data.id_number,
      kyc_status: "pending",
      kyc_method: "manual",
    });

    await db.update("tbl_players", { kyc_status: "pending" }, "player_id = ?", [
      playerId,
    ]);

    await this.createReminderSchedule(playerId);
    await this.logKYCAudit(
      result.insert_id,
      playerId,
      "created",
      userId,
      null,
      "pending"
    );

    return result.insert_id;
  }

  // Upload document (Manual KYC)
  async uploadDocument(playerId, documentType, filePath, userId) {
    let kyc = await this.getKYC(playerId);

    // AUTO-CREATE KYC RECORD IF NOT EXISTS (for manual KYC uploads)
    if (!kyc) {
      console.log(`Creating new KYC record for player ${playerId} (manual upload)`);
      const result = await db.insert("tbl_player_kyc", {
        player_id: playerId,
        id_type: "manual",
        id_number: "PENDING",
        kyc_status: "pending",
        kyc_method: "manual"
      });
      kyc = { kyc_id: result.insert_id };
    }

    try {
      // Upload to Cloudinary
      const cloudinaryResult = await cloudinaryService.uploadKYCDocument(
        filePath,
        playerId,
        documentType
      );

      if (!cloudinaryResult.success) {
        throw new Error("Cloudinary upload failed");
      }

      const updateData = {};

      // Store the Cloudinary URL and ID based on document type
      switch (documentType) {
        case "id_front":
          updateData.id_document_front = cloudinaryResult.url;
          updateData.id_document_front_cloudinary_id = cloudinaryResult.cloudinary_id;
          break;
        case "id_back":
          updateData.id_document_back = cloudinaryResult.url;
          updateData.id_document_back_cloudinary_id = cloudinaryResult.cloudinary_id;
          break;
        case "address_proof":
          updateData.address_proof_document = cloudinaryResult.url;
          updateData.address_proof_document_cloudinary_id = cloudinaryResult.cloudinary_id;
          updateData.address_proof_type = "utility_bill";
          break;
        case "photo":
          updateData.photo = cloudinaryResult.url;
          updateData.photo_cloudinary_id = cloudinaryResult.cloudinary_id;
          break;
        default:
          throw new Error("Invalid document type");
      }

      await db.update("tbl_player_kyc", updateData, "player_id = ?", [playerId]);
      
      await this.logKYCAudit(
        kyc.kyc_id,
        playerId,
        "document_uploaded",
        userId,
        null,
        { 
          document_type: documentType,
          cloudinary_id: cloudinaryResult.cloudinary_id,
          file_size: cloudinaryResult.file_size
        },
        `Uploaded ${documentType} to Cloudinary`
      );

      return {
        success: true,
        document_type: documentType,
        url: cloudinaryResult.url,
        cloudinary_id: cloudinaryResult.cloudinary_id,
        file_size: cloudinaryResult.file_size
      };
    } catch (error) {
      console.error(`Error uploading ${documentType}:`, error);
      throw error;
    }
  }

  // Submit KYC for review
  async submitKYC(playerId, userId) {
    const kyc = await this.getKYC(playerId);

    if (!kyc) {
      throw new Error("KYC record not found");
    }

    if (kyc.kyc_method === "digilocker" && kyc.digilocker_verified) {
      throw new Error("DigiLocker KYC is already submitted");
    }

    if (kyc.kyc_method === "manual") {
      if (!kyc.id_document_front || !kyc.photo) {
        throw new Error("Please upload all required documents");
      }
    }

    const now = new Date();

    await db.update(
      "tbl_player_kyc",
      {
        kyc_status: "submitted",
        submitted_at: now,
      },
      "player_id = ?",
      [playerId]
    );

    await db.update(
      "tbl_players",
      {
        kyc_status: "submitted",
      },
      "player_id = ?",
      [playerId]
    );

    await this.deactivateReminderSchedule(playerId);

    await this.sendKYCNotification(
      playerId,
      "kyc_submitted",
      "KYC Submitted",
      "Your KYC documents have been submitted and are under review."
    );

    await this.logKYCAudit(
      kyc.kyc_id,
      playerId,
      "submitted",
      userId,
      "pending",
      "submitted"
    );

    return true;
  }

  // Review KYC
  async reviewKYC(playerId, action, notes, reviewedBy) {
    const kyc = await this.getKYC(playerId);

    if (!kyc) {
      throw new Error("KYC record not found");
    }

    if (kyc.kyc_status !== "submitted" && kyc.kyc_status !== "under_review") {
      throw new Error("KYC must be in submitted or under_review status");
    }

    const now = new Date();
    const updateData = {
      reviewed_at: now,
      reviewed_by: reviewedBy,
    };

    let newStatus;
    let notificationTitle;
    let notificationMessage;

    if (action === "approve") {
      newStatus = "approved";
      updateData.kyc_status = "approved";
      updateData.verified_by = reviewedBy;
      updateData.verified_at = now;
      updateData.verification_notes = notes;

      notificationTitle = "KYC Approved ✓";
      notificationMessage = "Congratulations! Your KYC has been approved.";

      await db.update(
        "tbl_players",
        {
          kyc_status: "approved",
          kyc_completed_at: now,
        },
        "player_id = ?",
        [playerId]
      );
    } else if (action === "reject") {
      newStatus = "rejected";
      updateData.kyc_status = "rejected";
      updateData.rejection_reason = notes;
      updateData.rejection_notes = notes;

      notificationTitle = "KYC Rejected";
      notificationMessage = `Your KYC has been rejected. Reason: ${notes}`;

      await db.update(
        "tbl_players",
        {
          kyc_status: "rejected",
        },
        "player_id = ?",
        [playerId]
      );

      await this.reactivateReminderSchedule(playerId);
    }

    await db.update("tbl_player_kyc", updateData, "player_id = ?", [playerId]);

    await this.sendKYCNotification(
      playerId,
      newStatus === "approved" ? "kyc_approved" : "kyc_rejected",
      notificationTitle,
      notificationMessage
    );

    await this.logKYCAudit(
      kyc.kyc_id,
      playerId,
      newStatus,
      reviewedBy,
      kyc.kyc_status,
      newStatus,
      notes
    );

    return true;
  }

  // Get pending KYCs
  async getPendingKYCs(page = 1, limit = 50) {
    const offset = (page - 1) * limit;

    const kycs = await db.queryAll(
      `SELECT k.*, p.player_code, p.player_name, p.phone_number, p.email,
              CASE WHEN k.kyc_method = 'digilocker' THEN '✓ DigiLocker' ELSE 'Manual' END as verification_method
       FROM tbl_player_kyc k
       INNER JOIN tbl_players p ON k.player_id = p.player_id
       WHERE k.kyc_status IN ('submitted', 'under_review')
       ORDER BY k.digilocker_verified DESC, k.submitted_at ASC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM tbl_player_kyc 
       WHERE kyc_status IN ('submitted', 'under_review')`
    );

    return {
      kycs,
      pagination: {
        total: countResult?.total || 0,
        page,
        limit,
        total_pages: Math.ceil((countResult?.total || 0) / limit),
      },
    };
  }

  // Get all KYCs with filters
  async getAllKYCs(filters = {}, page = 1, limit = 50) {
    const offset = (page - 1) * limit;

    let whereClause = "1=1";
    let params = [];

    if (filters.kyc_status) {
      whereClause += " AND k.kyc_status = ?";
      params.push(filters.kyc_status);
    }

    if (filters.kyc_method) {
      whereClause += " AND k.kyc_method = ?";
      params.push(filters.kyc_method);
    }

    if (filters.search) {
      whereClause +=
        " AND (p.player_name LIKE ? OR p.player_code LIKE ? OR p.phone_number LIKE ?)";
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    const kycs = await db.queryAll(
      `SELECT k.*, p.player_code, p.player_name, p.phone_number, p.email
       FROM tbl_player_kyc k
       INNER JOIN tbl_players p ON k.player_id = p.player_id
       WHERE ${whereClause}
       ORDER BY k.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const countResult = await db.query(
      `SELECT COUNT(*) as total 
       FROM tbl_player_kyc k
       INNER JOIN tbl_players p ON k.player_id = p.player_id
       WHERE ${whereClause}`,
      params
    );

    return {
      kycs,
      pagination: {
        total: countResult?.total || 0,
        page,
        limit,
        total_pages: Math.ceil((countResult?.total || 0) / limit),
      },
    };
  }

  // Reminder schedule methods
  async createReminderSchedule(playerId) {
    const nextReminder = new Date();
    nextReminder.setDate(nextReminder.getDate() + 1);

    await db.insert("tbl_kyc_reminder_schedule", {
      player_id: playerId,
      next_reminder_scheduled: nextReminder,
      is_active: true,
    });
  }

  async deactivateReminderSchedule(playerId) {
    await db.update(
      "tbl_kyc_reminder_schedule",
      {
        is_active: false,
      },
      "player_id = ?",
      [playerId]
    );
  }

  async reactivateReminderSchedule(playerId) {
    const nextReminder = new Date();
    nextReminder.setDate(nextReminder.getDate() + 1);

    await db.update(
      "tbl_kyc_reminder_schedule",
      {
        is_active: true,
        next_reminder_scheduled: nextReminder,
        reminder_count: 0,
      },
      "player_id = ?",
      [playerId]
    );
  }

  // Send reminders (cron job)
  async sendKYCReminders() {
    const now = new Date();

    const schedules = await db.queryAll(
      `SELECT s.*, p.player_name, p.phone_number, p.email, p.player_code
       FROM tbl_kyc_reminder_schedule s
       INNER JOIN tbl_players p ON s.player_id = p.player_id
       WHERE s.is_active = 1 
       AND s.next_reminder_scheduled <= ?
       AND (s.paused_until IS NULL OR s.paused_until <= ?)
       AND p.kyc_status IN ('not_started', 'pending', 'rejected')`,
      [now, now]
    );

    const remindersSent = [];

    for (const schedule of schedules) {
      try {
        await this.sendKYCNotification(
          schedule.player_id,
          "kyc_reminder",
          "Complete Your KYC",
          `Hi ${schedule.player_name}, please complete your KYC verification using DigiLocker for instant verification.`
        );

        const nextReminder = new Date();
        nextReminder.setDate(nextReminder.getDate() + 1);

        await db.update(
          "tbl_kyc_reminder_schedule",
          {
            last_reminder_sent: now,
            next_reminder_scheduled: nextReminder,
            reminder_count: schedule.reminder_count + 1,
          },
          "schedule_id = ?",
          [schedule.schedule_id]
        );

        remindersSent.push({
          player_id: schedule.player_id,
          player_name: schedule.player_name,
          reminder_count: schedule.reminder_count + 1,
        });
      } catch (error) {
        console.error(
          `Failed to send reminder to player ${schedule.player_id}:`,
          error
        );
      }
    }

    return remindersSent;
  }

  // Notification methods
  async sendKYCNotification(playerId, type, title, message) {
    const notificationId = await db.insert("tbl_kyc_notifications", {
      player_id: playerId,
      notification_type: type,
      notification_title: title,
      notification_message: message,
    });

    const devices = await db.selectAll(
      "tbl_player_devices",
      "*",
      "player_id = ? AND is_active = 1",
      [playerId]
    );

    for (const device of devices) {
      try {
        await this.sendPushNotification(
          device.device_token,
          device.device_type,
          title,
          message
        );

        await db.update(
          "tbl_kyc_notifications",
          {
            push_sent: true,
            push_sent_at: new Date(),
            push_token: device.device_token,
          },
          "notification_id = ?",
          [notificationId.insert_id]
        );
      } catch (error) {
        console.error(
          `Failed to send push to device ${device.device_id}:`,
          error
        );
      }
    }

    return notificationId.insert_id;
  }

  async sendPushNotification(deviceToken, deviceType, title, message) {
    console.log(`Sending push: ${title} - ${message}`);
    return true;
  }

  async registerDevice(playerId, deviceData) {
    const existing = await db.select(
      "tbl_player_devices",
      "device_id",
      "device_token = ?",
      [deviceData.device_token]
    );

    if (existing) {
      await db.update(
        "tbl_player_devices",
        {
          player_id: playerId,
          device_type: deviceData.device_type,
          device_name: deviceData.device_name || null,
          device_model: deviceData.device_model || null,
          is_active: true,
          last_used_at: new Date(),
        },
        "device_id = ?",
        [existing.device_id]
      );

      return existing.device_id;
    }

    const result = await db.insert("tbl_player_devices", {
      player_id: playerId,
      device_token: deviceData.device_token,
      device_type: deviceData.device_type,
      device_name: deviceData.device_name || null,
      device_model: deviceData.device_model || null,
      last_used_at: new Date(),
    });

    return result.insert_id;
  }

  async getPlayerNotifications(playerId, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const notifications = await db.queryAll(
      `SELECT * FROM tbl_kyc_notifications 
       WHERE player_id = ? 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [playerId, limit, offset]
    );

    return notifications;
  }

  async markNotificationRead(notificationId) {
    await db.update(
      "tbl_kyc_notifications",
      {
        is_read: true,
        read_at: new Date(),
      },
      "notification_id = ?",
      [notificationId]
    );
  }

  // Audit log
  async logKYCAudit(
    kycId,
    playerId,
    actionType,
    actionBy,
    oldStatus,
    newStatus,
    notes = null
  ) {
    await db.insert("tbl_kyc_audit_log", {
      kyc_id: kycId,
      player_id: playerId,
      action_type: actionType,
      action_by: actionBy,
      old_status: oldStatus,
      new_status: newStatus,
      notes: notes,
    });
  }

  // Statistics
  async getKYCStats() {
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_kyc,
        SUM(CASE WHEN kyc_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN kyc_status = 'submitted' THEN 1 ELSE 0 END) as submitted,
        SUM(CASE WHEN kyc_status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN kyc_status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN kyc_method = 'digilocker' THEN 1 ELSE 0 END) as digilocker_kyc,
        SUM(CASE WHEN kyc_method = 'manual' THEN 1 ELSE 0 END) as manual_kyc
      FROM tbl_player_kyc
    `);

    const playerStats = await db.query(`
      SELECT 
        COUNT(*) as total_players,
        SUM(CASE WHEN kyc_status = 'not_started' THEN 1 ELSE 0 END) as not_started,
        SUM(CASE WHEN kyc_status = 'approved' THEN 1 ELSE 0 END) as kyc_completed
      FROM tbl_players
    `);

    return {
      kyc_stats: stats,
      player_stats: playerStats,
    };
  }
}

module.exports = new KYCService();
