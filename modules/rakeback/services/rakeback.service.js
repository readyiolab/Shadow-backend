// ============================================
// FILE: modules/rakeback/services/rakeback.service.js
// Rakeback Service - SEPARATE Session Tracking
// Does NOT interfere with CRM total hours played
// ============================================

const db = require("../../../config/database");
const cashierService = require("../../cashier/services/cashier.service");


class RakebackService {
  // ==========================================
  // GET RAKEBACK TYPES
  // ==========================================
  async getRakebackTypes() {
    const types = await db.selectAll(
      "tbl_rakeback_types",
      "*",
      "is_active = 1",
      [],
      "ORDER BY required_hours ASC"
    );

    return types || [];
  }

  async createRakebackType(data, userId) {
  try {
    const { required_hours, default_amount } = data;

    // Validate required fields
    if (!required_hours || !default_amount) {
      throw new Error('Required hours and default amount are required');
    }

    // Auto-generate type_code and type_label
    const hours = parseFloat(required_hours);
    const amount = parseFloat(default_amount);
    
    const type_code = `RB_${hours}H`;
    const type_label = `${hours}hrs = ₹${amount.toLocaleString('en-IN')}`;

    // Check if type_code already exists
    const existing = await db.select(
      'tbl_rakeback_types',
      '*',
      'type_code = ?',
      [type_code]
    );

    if (existing) {
      throw new Error(`Rakeback type for ${hours} hours already exists`);
    }

    // Insert new type
    const result = await db.insert('tbl_rakeback_types', {
      type_code,
      type_label,
      required_hours: hours,
      default_amount: amount,
      is_active: true,
      created_at: new Date(),
      created_by: userId
    });

    return {
      success: true,
      type_id: result.insert_id,
      type_code,
      type_label,
      message: `Rakeback type '${type_label}' created successfully`
    };
  } catch (error) {
    throw error;
  }
}

// ==========================================
// UPDATE RAKEBACK TYPE
// ==========================================
async updateRakebackType(typeCode, data, userId) {
  try {
    const { required_hours, default_amount } = data;

    // Check if type exists
    const existing = await db.select(
      'tbl_rakeback_types',
      '*',
      'type_code = ?',
      [typeCode]
    );

    if (!existing) {
      throw new Error('Rakeback type not found');
    }

    // Validate at least one field is provided
    if (!required_hours && !default_amount) {
      throw new Error('Required hours or default amount must be provided');
    }

    // Use existing values if not provided
    const hours = required_hours ? parseFloat(required_hours) : existing.required_hours;
    const amount = default_amount ? parseFloat(default_amount) : existing.default_amount;

    // Update type_label based on new values
    const type_label = `${hours}hrs = ₹${amount.toLocaleString('en-IN')}`;

    // Update type
    await db.update(
      'tbl_rakeback_types',
      {
        required_hours: hours,
        default_amount: amount,
        type_label,
        updated_at: new Date()
      },
      'type_code = ?',
      [typeCode]
    );

    return {
      success: true,
      type_label,
      message: `Rakeback type updated to '${type_label}'`
    };
  } catch (error) {
    throw error;
  }
}

// ==========================================
// DELETE RAKEBACK TYPE (soft delete)
// ==========================================
async deleteRakebackType(typeCode, userId) {
  try {
    // Check if type exists
    const existing = await db.select(
      'tbl_rakeback_types',
      '*',
      'type_code = ?',
      [typeCode]
    );

    if (!existing) {
      throw new Error('Rakeback type not found');
    }

    // Check if type is being used in active assignments
    const activeAssignments = await db.select(
      'tbl_rakeback_assignments',
      'COUNT(*) as count',
      "rakeback_type_code = ? AND assignment_status IN ('active', 'eligible')",
      [typeCode]
    );

    if (activeAssignments && activeAssignments.count > 0) {
      throw new Error('Cannot delete rakeback type with active assignments');
    }

    // Soft delete (set is_active to false)
    await db.update(
      'tbl_rakeback_types',
      {
        is_active: false,
        updated_at: new Date()
      },
      'type_code = ?',
      [typeCode]
    );

    return {
      success: true,
      message: `Rakeback type '${existing.type_label}' deleted successfully`
    };
  } catch (error) {
    throw error;
  }
}


  
 // ==========================================
// START RAKEBACK SESSION (when player sits)
// ==========================================
async startRakebackSession(tablePlayerId, sessionId, playerId, tableId) {
  try {
    console.log("🔵 STEP 1: Starting rakeback session with params:", {
      tablePlayerId,
      sessionId,
      playerId,
      tableId
    });

    // Validate inputs
    if (!tablePlayerId || !sessionId || !playerId || !tableId) {
      throw new Error(`Invalid parameters - tablePlayerId: ${tablePlayerId}, sessionId: ${sessionId}, playerId: ${playerId}, tableId: ${tableId}`);
    }

    const now = new Date();
    
    const insertData = {
      daily_session_id: sessionId,
      table_player_id: tablePlayerId,
      player_id: playerId,
      table_id: tableId,
      session_start_time: now,
      current_timer_start: now,
      accumulated_seconds: 0,
      active_play_seconds: 0,
      break_seconds: 0,
      is_on_break: false,
      is_active: true,
    };

    console.log("🔵 STEP 2: Insert data prepared:", insertData);

    // Create rakeback session (SEPARATE from CRM tracking)
    console.log("🔵 STEP 3: Attempting db.insert into tbl_rakeback_sessions...");
    const result = await db.insert("tbl_rakeback_sessions", insertData);

    console.log("🔵 STEP 4: Insert result:", result);
    
    if (!result || !result.insert_id) {
      throw new Error(`db.insert failed or returned no insert_id: ${JSON.stringify(result)}`);
    }

    console.log(`✅ STEP 5: Rakeback session started successfully! rakeback_session_id: ${result.insert_id}`);
    
    // Verify it was inserted
    console.log("🔵 STEP 6: Verifying insertion...");
    const verify = await db.select(
      "tbl_rakeback_sessions",
      "*",
      "rakeback_session_id = ?",
      [result.insert_id]
    );
    console.log("🔵 STEP 7: Verification query result:", verify);
    
    if (!verify) {
      console.warn("⚠️ WARNING: Verification query returned null/empty!");
    }
    
    return {
      rakeback_session_id: result.insert_id,
      session_start_time: now
    };
  } catch (error) {
    console.error("❌ CRITICAL ERROR starting rakeback session!");
    console.error("❌ Error type:", typeof error);
    console.error("❌ Error message:", error.message);
    console.error("❌ Full error:", error);
    console.error("❌ Error stack:", error.stack);
    throw error;
  }
}
  // ==========================================
  // PAUSE RAKEBACK SESSION (on break)
  // ==========================================
  async pauseRakebackSession(tablePlayerId) {
    try {
      // Get active rakeback session
      const session = await db.select(
        "tbl_rakeback_sessions",
        "*",
        "table_player_id = ? AND (is_active = TRUE OR is_active = 1)",
        [tablePlayerId]
      );

      if (!session) {
        console.warn(`⚠️ No active rakeback session found for tablePlayerId: ${tablePlayerId} during pause`);
        return;
      }

      const now = new Date();
      const timerStart = new Date(session.current_timer_start);
      const currentSegmentSeconds = Math.floor((now - timerStart) / 1000);
      const newAccumulated = (session.accumulated_seconds || 0) + currentSegmentSeconds;

      // Pause timer - save accumulated time
      await db.update(
        "tbl_rakeback_sessions",
        {
          accumulated_seconds: newAccumulated,
          current_timer_start: null, // Paused
          is_on_break: true,
          updated_at: now,
        },
        "rakeback_session_id = ?",
        [session.rakeback_session_id]
      );

      console.log(`✅ Rakeback session paused at ${newAccumulated} seconds`);
    } catch (error) {
      console.error("Error pausing rakeback session:", error);
    }
  }

  // ==========================================
  // RESUME RAKEBACK SESSION (from break)
  // ==========================================
  async resumeRakebackSession(tablePlayerId) {
    try {
      const session = await db.select(
        "tbl_rakeback_sessions",
        "*",
        "table_player_id = ? AND (is_active = TRUE OR is_active = 1)",
        [tablePlayerId]
      );

      if (!session) {
        console.warn(`⚠️ No active rakeback session found for tablePlayerId: ${tablePlayerId} during resume`);
        return;
      }

      const now = new Date();

      // Resume timer from accumulated time
      await db.update(
        "tbl_rakeback_sessions",
        {
          current_timer_start: now, // Resume
          is_on_break: false,
          updated_at: now,
        },
        "rakeback_session_id = ?",
        [session.rakeback_session_id]
      );

      console.log(`✅ Rakeback session resumed from ${session.accumulated_seconds} seconds`);
    } catch (error) {
      console.error("Error resuming rakeback session:", error);
    }
  }

  // ==========================================
  // END RAKEBACK SESSION (when player leaves)
  // ==========================================
  async endRakebackSession(tablePlayerId) {
    try {
      console.log(`🔵 endRakebackSession called for tablePlayerId: ${tablePlayerId}`);
      
      // Query with both conditions to handle 1/0 or TRUE/FALSE
      const session = await db.select(
        "tbl_rakeback_sessions",
        "*",
        "table_player_id = ? AND (is_active = TRUE OR is_active = 1)",
        [tablePlayerId]
      );

      console.log(`🔵 Query result:`, session);

      if (!session) {
        console.warn(`⚠️ No active rakeback session found for tablePlayerId: ${tablePlayerId}`);
        return null;
      }

      const now = new Date();
      let finalSeconds = session.accumulated_seconds || 0;

      // If timer is running, add current segment
      if (session.current_timer_start && !session.is_on_break) {
        const timerStart = new Date(session.current_timer_start);
        const currentSegmentSeconds = Math.floor((now - timerStart) / 1000);
        finalSeconds += currentSegmentSeconds;
      }

      // End session
      await db.update(
        "tbl_rakeback_sessions",
        {
          session_end_time: now,
          active_play_seconds: finalSeconds,
          current_timer_start: null,
          is_active: false,
          updated_at: now,
        },
        "rakeback_session_id = ?",
        [session.rakeback_session_id]
      );

      console.log(`✅ Rakeback session ended: ${finalSeconds} seconds (${Math.floor(finalSeconds/60)} minutes)`);
      
      return {
        rakeback_session_id: session.rakeback_session_id,
        total_seconds: finalSeconds,
        total_minutes: Math.floor(finalSeconds / 60),
        total_hours: parseFloat((finalSeconds / 3600).toFixed(2))
      };
    } catch (error) {
      console.error("Error ending rakeback session:", error);
      return null;
    }
  }

  // ==========================================
  // GET ACTIVE SEATED PLAYERS WITH RAKEBACK TIMERS
  // ==========================================
// ==========================================
// GET ACTIVE SEATED PLAYERS WITH RAKEBACK TIMERS
// ==========================================
async getActiveSeatedPlayers(sessionId) {
  try {
    console.log(`🔵 getActiveSeatedPlayers called for sessionId: ${sessionId}`);
    
    // Query the rakeback sessions table directly - NO VIEW
    const players = await db.queryAll(
      `SELECT 
        rs.rakeback_session_id,
        rs.daily_session_id,
        rs.table_player_id,
        rs.player_id,
        rs.table_id,
        rs.session_start_time,
        rs.accumulated_seconds,
        rs.active_play_seconds,
        rs.is_on_break,
        rs.is_active,
        rs.current_timer_start,
        
        -- Calculate current elapsed time
        CASE 
          WHEN rs.is_on_break = 1 OR rs.current_timer_start IS NULL THEN 
            COALESCE(rs.accumulated_seconds, 0)
          ELSE 
            COALESCE(rs.accumulated_seconds, 0) + 
            GREATEST(0, TIMESTAMPDIFF(SECOND, rs.current_timer_start, NOW()))
        END as current_elapsed_seconds,
        
        -- Player info
        p.player_name,
        COALESCE(p.player_code, '') as player_code,
        
        -- Table info
        t.table_number,
        COALESCE(tp.seat_number, 0) as seat_number,
        
        -- Assignment info (if exists)
        ra.assignment_id,
        ra.rakeback_type_code,
        rt.type_label as rakeback_type_label,
        ra.required_hours,
        ra.target_amount,
        ra.assignment_status
        
      FROM tbl_rakeback_sessions rs
      INNER JOIN tbl_players p ON rs.player_id = p.player_id
      INNER JOIN tbl_tables t ON rs.table_id = t.table_id
      LEFT JOIN tbl_table_players tp ON rs.table_player_id = tp.table_player_id
      LEFT JOIN tbl_rakeback_assignments ra ON rs.rakeback_session_id = ra.rakeback_session_id 
        AND ra.assignment_status COLLATE utf8mb4_unicode_ci IN ('active', 'eligible')
      LEFT JOIN tbl_rakeback_types rt ON ra.rakeback_type_code COLLATE utf8mb4_unicode_ci = rt.type_code COLLATE utf8mb4_unicode_ci
      WHERE rs.daily_session_id = ?
        AND rs.is_active = 1
        AND (tp.table_player_id IS NULL OR tp.is_removed = 0)
      ORDER BY t.table_number, p.player_name`,
      [sessionId]
    );

    console.log(`🔵 Query returned ${players?.length || 0} players`);

    // Make sure to return array
    return (players || []).map(player => this.formatPlayerData(player));
  } catch (error) {
    console.error("❌ Error fetching active players:", error);
    return []; // Return empty array on error
  }
}

// ==========================================
// GET ELIGIBLE PLAYERS
// ==========================================
async getEligiblePlayers(sessionId) {
  try {
    // Query directly - NO VIEW
    const eligible = await db.queryAll(
      `SELECT 
        rs.rakeback_session_id,
        rs.daily_session_id,
        rs.table_player_id,
        rs.player_id,
        rs.table_id,
        
        -- Calculate current elapsed time
        CASE 
          WHEN rs.is_on_break = 1 OR rs.current_timer_start IS NULL THEN 
            COALESCE(rs.accumulated_seconds, 0)
          ELSE 
            COALESCE(rs.accumulated_seconds, 0) + 
            GREATEST(0, TIMESTAMPDIFF(SECOND, rs.current_timer_start, NOW()))
        END as current_elapsed_seconds,
        
        -- Player info
        p.player_name,
        
        -- Table info
        t.table_number,
        
        -- Assignment info
        ra.assignment_id,
        ra.rakeback_type_code,
        rt.type_label as rakeback_type_label,
        ra.required_hours,
        ra.target_amount,
        ra.assignment_status
        
      FROM tbl_rakeback_sessions rs
      INNER JOIN tbl_players p ON rs.player_id = p.player_id
      INNER JOIN tbl_tables t ON rs.table_id = t.table_id
      INNER JOIN tbl_rakeback_assignments ra ON rs.rakeback_session_id = ra.rakeback_session_id
      LEFT JOIN tbl_rakeback_types rt ON ra.rakeback_type_code COLLATE utf8mb4_unicode_ci = rt.type_code COLLATE utf8mb4_unicode_ci
      WHERE rs.daily_session_id = ?
        AND rs.is_active = 1
        AND ra.assignment_status COLLATE utf8mb4_unicode_ci = 'active'
      HAVING current_elapsed_seconds >= (ra.required_hours * 3600)
      ORDER BY t.table_number, p.player_name`,
      [sessionId]
    );

    return (eligible || []).map(player => this.formatPlayerData(player));
  } catch (error) {
    console.error("❌ Error fetching eligible players:", error);
    return [];
  }
}
  // ==========================================
  // FORMAT PLAYER DATA WITH LIVE TIMER
  // ==========================================
  formatPlayerData(player) {
    const elapsedSeconds = parseInt(player.current_elapsed_seconds) || 0;
    
    const hours = Math.floor(elapsedSeconds / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);
    const seconds = elapsedSeconds % 60;
    
    let remainingSeconds = 0;
    let remainingHours = 0;
    let remainingMinutes = 0;
    let progressPercentage = 0;
    
    if (player.required_hours) {
      const requiredSeconds = player.required_hours * 3600;
      remainingSeconds = Math.max(0, requiredSeconds - elapsedSeconds);
      remainingHours = Math.floor(remainingSeconds / 3600);
      remainingMinutes = Math.floor((remainingSeconds % 3600) / 60);
      progressPercentage = Math.min(100, (elapsedSeconds / requiredSeconds) * 100);
    }
    
    return {
      ...player,
      current_elapsed_seconds: elapsedSeconds,
      session_time_display: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
      session_hours: hours,
      session_minutes: minutes,
      session_seconds: seconds,
      
      remaining_seconds: remainingSeconds,
      remaining_hours: remainingHours,
      remaining_minutes: remainingMinutes,
      progress_percentage: Math.round(progressPercentage),
      is_eligible: player.assignment_status === 'active' && elapsedSeconds >= (player.required_hours * 3600),
      
      rakeback_status: player.assignment_id 
        ? (elapsedSeconds >= (player.required_hours * 3600) ? 'eligible' : 'pending')
        : 'none'
    };
  }

  // ==========================================
  // ASSIGN RAKEBACK TO PLAYER
  // ==========================================
  async assignRakeback(data, userId) {
    try {
      const { table_player_id, rakeback_type_code } = data;
      
      const session = await cashierService.getTodaySession();
      if (!session) {
        throw new Error("No active session found");
      }

      // Get rakeback session
      const rakebackSession = await db.select(
        "tbl_rakeback_sessions",
        "*",
        "table_player_id = ? AND is_active = TRUE",
        [table_player_id]
      );

      if (!rakebackSession) {
        throw new Error("No active rakeback session found for this player");
      }

      // Check if player already has active assignment
      const existingAssignment = await db.select(
        "tbl_rakeback_assignments",
        "*",
        "rakeback_session_id = ? AND assignment_status IN ('active', 'eligible')",
        [rakebackSession.rakeback_session_id]
      );

      if (existingAssignment) {
        throw new Error("Player already has an active rakeback assignment");
      }

      // Get rakeback type
      const rakebackType = await db.select(
        "tbl_rakeback_types",
        "*",
        "type_code = ? AND is_active = 1",
        [rakeback_type_code]
      );

      if (!rakebackType || !rakebackType.required_hours) {
        throw new Error("Invalid rakeback type");
      }

      // Get player info
      const player = await db.select(
        "tbl_table_players tp INNER JOIN tbl_players p ON tp.player_id = p.player_id",
        "tp.*, p.player_name",
        "tp.table_player_id = ?",
        [table_player_id]
      );

      // Create assignment
      const result = await db.insert("tbl_rakeback_assignments", {
        daily_session_id: session.session_id,
        rakeback_session_id: rakebackSession.rakeback_session_id,
        table_player_id: table_player_id,
        player_id: rakebackSession.player_id,
        table_id: rakebackSession.table_id,
        rakeback_type_code: rakebackType.type_code,
        required_hours: rakebackType.required_hours,
        target_amount: rakebackType.default_amount,
        assignment_status: 'active',
        assigned_at: new Date(),
        assigned_by: userId,
      });

      return {
        success: true,
        assignment_id: result.insert_id,
        player_name: player.player_name,
        rakeback_type: rakebackType.type_label,
        required_hours: rakebackType.required_hours,
        target_amount: rakebackType.default_amount,
        message: `Rakeback assigned: ${player.player_name} must play ${rakebackType.required_hours} hours for ₹${rakebackType.default_amount.toLocaleString("en-IN")}`
      };
    } catch (error) {
      throw error;
    }
  }

  // ==========================================
  // PROCESS RAKEBACK
  // ==========================================
  async processRakeback(data, userId) {
    try {
      const { assignment_id, chip_breakdown } = data;

      // Get assignment with session details
      const assignment = await db.queryOne(
        `SELECT 
          ra.*,
          rs.active_play_seconds,
          rs.session_start_time,
          p.player_name,
          t.table_number
        FROM tbl_rakeback_assignments ra
        INNER JOIN tbl_rakeback_sessions rs ON ra.rakeback_session_id = rs.rakeback_session_id
        INNER JOIN tbl_players p ON ra.player_id = p.player_id
        INNER JOIN tbl_tables t ON ra.table_id = t.table_id
        WHERE ra.assignment_id = ?`,
        [assignment_id]
      );

      if (!assignment) {
        throw new Error("Assignment not found");
      }

      if (assignment.assignment_status === 'completed') {
        throw new Error("Rakeback already processed");
      }

      // Get current session status
      const currentSession = await db.select(
        "tbl_rakeback_sessions",
        "*",
        "rakeback_session_id = ?",
        [assignment.rakeback_session_id]
      );

      // Calculate current elapsed time
      let currentElapsed = currentSession.accumulated_seconds || 0;
      if (currentSession.current_timer_start && !currentSession.is_on_break) {
        const timerStart = new Date(currentSession.current_timer_start);
        const now = new Date();
        const currentSegment = Math.floor((now - timerStart) / 1000);
        currentElapsed += currentSegment;
      }

      const requiredSeconds = assignment.required_hours * 3600;
      if (currentElapsed < requiredSeconds) {
        const remaining = Math.ceil((requiredSeconds - currentElapsed) / 60);
        throw new Error(`Player needs ${remaining} more minutes`);
      }

      // Validate chip breakdown
      const chipBreakdown = chip_breakdown || {};
      const chips100 = parseInt(chipBreakdown.chips_100 || 0);
      const chips500 = parseInt(chipBreakdown.chips_500 || 0);
      const chips5000 = parseInt(chipBreakdown.chips_5000 || 0);
      const chips10000 = parseInt(chipBreakdown.chips_10000 || 0);

      const totalChipValue =
        chips100 * 100 + chips500 * 500 + chips5000 * 5000 + chips10000 * 10000;
      const totalChipsCount = chips100 + chips500 + chips5000 + chips10000;

      if (Math.abs(totalChipValue - assignment.target_amount) > 0.01) {
        throw new Error(`Chip value must match target amount`);
      }

      const session = await cashierService.getTodaySession();
      const now = new Date();

      // Create rakeback record
      const rakebackResult = await db.insert("tbl_rakeback", {
        session_id: session.session_id,
        rakeback_session_id: assignment.rakeback_session_id,
        assignment_id: assignment_id,
        player_id: assignment.player_id,
        table_id: assignment.table_id,
        rakeback_type: assignment.rakeback_type_code,
        rakeback_type_label: assignment.rakeback_type_code,
        amount: totalChipValue,
        chips_100: chips100,
        chips_500: chips500,
        chips_5000: chips5000,
        chips_10000: chips10000,
        total_chips_given: totalChipsCount,
        
        rakeback_duration_hours: assignment.required_hours,
        session_start_time: assignment.session_start_time || currentSession.session_start_time,
        session_end_time: now,
        active_play_seconds: currentElapsed,
        rakeback_status: 'completed',
        processed_at: now,
        
        notes: `Rakeback for ${assignment.required_hours}hrs session`,
        recorded_by: userId,
      });

      // Update assignment
      await db.update(
        "tbl_rakeback_assignments",
        {
          assignment_status: 'completed',
          completed_at: now,
        },
        "assignment_id = ?",
        [assignment_id]
      );

      // Update session totals
      await db.update(
        "tbl_daily_sessions",
        {
          chips_100_out: parseInt(session.chips_100_out || 0) + chips100,
          chips_500_out: parseInt(session.chips_500_out || 0) + chips500,
          chips_5000_out: parseInt(session.chips_5000_out || 0) + chips5000,
          chips_10000_out: parseInt(session.chips_10000_out || 0) + chips10000,
          total_chips_out: parseFloat(session.total_chips_out || 0) + totalChipValue,
          total_rakeback_given: (parseFloat(session.total_rakeback_given) || 0) + totalChipValue,
        },
        "session_id = ?",
        [session.session_id]
      );

      // Update player total
      await db.query(
        `UPDATE tbl_players
         SET total_rakeback_received = COALESCE(total_rakeback_received, 0) + ?
         WHERE player_id = ?`,
        [totalChipValue, assignment.player_id]
      );

      // Log chip movement
      await this.logChipMovement(session.session_id, {
        movement_type: "rakeback",
        direction: "out",
        player_id: assignment.player_id,
        chip_breakdown: chipBreakdown,
        total_value: totalChipValue,
        notes: `Rakeback (${assignment.required_hours}hrs) to ${assignment.player_name}`,
        created_by: userId,
      });

      return {
        success: true,
        rakeback_id: rakebackResult.insert_id,
        player_name: assignment.player_name,
        amount: totalChipValue,
        session_hours: parseFloat((currentElapsed / 3600).toFixed(2)),
        message: `Rakeback of ₹${totalChipValue.toLocaleString("en-IN")} processed`
      };
    } catch (error) {
      throw error;
    }
  }



  // ==========================================
  // CANCEL ASSIGNMENT
  // ==========================================
  async cancelAssignment(assignmentId, userId) {
    try {
      await db.update(
        "tbl_rakeback_assignments",
        {
          assignment_status: 'cancelled',
          cancelled_at: new Date(),
        },
        "assignment_id = ?",
        [assignmentId]
      );

      return { success: true, message: "Assignment cancelled" };
    } catch (error) {
      throw error;
    }
  }

  // ==========================================
  // GET PLAYER RAKEBACK HISTORY
  // ==========================================
  async getPlayerRakebackHistory(playerId) {
    try {
      const history = await db.queryAll(
        `SELECT 
          r.*,
          t.table_number,
          rs.session_start_time as rakeback_session_start,
          rs.session_end_time as rakeback_session_end,
          ROUND(rs.active_play_seconds / 3600, 2) as hours_played
        FROM tbl_rakeback r
        LEFT JOIN tbl_rakeback_sessions rs ON r.rakeback_session_id = rs.rakeback_session_id
        LEFT JOIN tbl_tables t ON r.table_id = t.table_id
        WHERE r.player_id = ?
        ORDER BY r.created_at DESC`,
        [playerId]
      );

      let total = 0;
      (history || []).forEach(r => {
        total += parseFloat(r.amount || 0);
      });

      return {
        rakebacks: history || [],
        total_rakeback: total,
        count: history?.length || 0
      };
    } catch (error) {
      throw error;
    }
  }

  // ==========================================
  // GET RAKEBACKS FOR SESSION
  // ==========================================
  async getRakebacksForSession(sessionId) {
    const rakebacks = await db.queryAll(
      `SELECT 
        r.*, 
        p.player_name, 
        p.player_code, 
        t.table_number,
        ROUND(r.active_play_seconds / 3600, 2) as hours_played,
        u.username as created_by_name,
        u.full_name as created_by_full_name
       FROM tbl_rakeback r
       JOIN tbl_players p ON r.player_id = p.player_id
       LEFT JOIN tbl_tables t ON r.table_id = t.table_id
       LEFT JOIN tbl_users u ON r.created_by = u.user_id
       WHERE r.session_id = ?
       ORDER BY r.created_at DESC`,
      [sessionId]
    );

    return rakebacks || [];
  }

  // ==========================================
  // CHIP MOVEMENT LOG
  // ==========================================
  async logChipMovement(sessionId, data) {
    const chipBreakdown = data.chip_breakdown || {};
    const totalChips =
      (chipBreakdown.chips_100 || 0) +
      (chipBreakdown.chips_500 || 0) +
      (chipBreakdown.chips_5000 || 0) +
      (chipBreakdown.chips_10000 || 0);

    await db.insert("tbl_chip_movement_log", {
      session_id: sessionId,
      movement_type: data.movement_type,
      direction: data.direction,
      player_id: data.player_id || null,
      chips_100: chipBreakdown.chips_100 || 0,
      chips_500: chipBreakdown.chips_500 || 0,
      chips_5000: chipBreakdown.chips_5000 || 0,
      chips_10000: chipBreakdown.chips_10000 || 0,
      total_chips: totalChips,
      total_value: data.total_value || 0,
      notes: data.notes || null,
      created_by: data.created_by,
    });
  }
}

module.exports = new RakebackService();