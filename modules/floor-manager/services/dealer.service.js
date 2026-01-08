// ============================================
// FILE: modules/floor-manager/services/dealer.service.js
// Business logic for dealer management
//
// DEALER TIMER LOGIC:
// 1. Dealer assigned to table → Start shift countdown (e.g., 60 min)
// 2. Dealer goes on break → PAUSE shift timer, start break countdown (15 min)
// 3. Dealer returns from break → RESUME shift timer from paused point
// 4. Dealer assigned to new table → Resume paused shift OR start new shift
// ============================================

const db = require('../../../config/database');
const tableService = require('./table.service');

class DealerService {
  /**
   * ✅ GET ALL DEALERS WITH CURRENT STATUS
   */
  async getAllDealers(sessionId) {
    try {
      const dealers = await db.queryAll(
        `SELECT 
          d.*,
          ds.shift_id,
          ds.shift_status,
          ds.table_id as assigned_table_id,
          ds.current_shift_started_at,
          ds.shift_duration_minutes,
          ds.shift_ends_at,
          ds.break_ends_at,
          ds.break_started_at,
          ds.break_duration_minutes,
          ds.shift_paused_remaining_seconds,
          ds.shift_timer_status,
          ds.shift_start_time,
          t.table_number,
          t.table_name
        FROM tbl_dealers d
        LEFT JOIN (
          SELECT ds1.* FROM tbl_dealer_shifts ds1
          INNER JOIN (
            SELECT dealer_id, MAX(shift_id) as max_shift_id
            FROM tbl_dealer_shifts
            WHERE session_id = ?
            GROUP BY dealer_id
          ) ds2 ON ds1.dealer_id = ds2.dealer_id AND ds1.shift_id = ds2.max_shift_id
        ) ds ON d.dealer_id = ds.dealer_id
        LEFT JOIN tbl_tables t ON ds.table_id = t.table_id
        WHERE d.dealer_status != 'inactive'
        ORDER BY d.dealer_name`,
        [sessionId]
      );

      const now = new Date();

      return (dealers || []).map(dealer => {
        let shiftRemainingSeconds = 0;
        let shiftElapsedSeconds = 0;
        
        if (dealer.dealer_status === 'on_table') {
          if (dealer.shift_ends_at) {
            const shiftEndsAt = new Date(dealer.shift_ends_at);
            shiftRemainingSeconds = Math.floor((shiftEndsAt - now) / 1000);
          }
          const shiftStartTime = dealer.current_shift_started_at || dealer.shift_start_time;
          if (shiftStartTime) {
            shiftElapsedSeconds = Math.max(0, Math.floor((now - new Date(shiftStartTime)) / 1000));
          }
        } else if (dealer.dealer_status === 'on_break' || dealer.dealer_status === 'available') {
          // Use paused remaining time (frozen)
          shiftRemainingSeconds = dealer.shift_paused_remaining_seconds || 0;
        }
        
        let breakRemainingSeconds = 0;
        if (dealer.dealer_status === 'on_break' && dealer.break_ends_at) {
          const breakEndsAt = new Date(dealer.break_ends_at);
          breakRemainingSeconds = Math.max(0, Math.floor((breakEndsAt - now) / 1000));
        }
        
        return {
          dealer_id: dealer.dealer_id,
          dealer_code: dealer.dealer_code,
          dealer_name: dealer.dealer_name,
          dealer_status: dealer.dealer_status,
          shift_status: dealer.shift_status,
          available: dealer.dealer_status === 'available',
          
          assigned_table: dealer.assigned_table_id && dealer.dealer_status === 'on_table' ? {
            table_id: dealer.assigned_table_id,
            table_number: dealer.table_number,
            table_name: dealer.table_name
          } : null,
          
          shift_start_time: dealer.current_shift_started_at || dealer.shift_start_time,
          shift_duration_minutes: dealer.shift_duration_minutes,
          shift_ends_at: dealer.shift_ends_at,
          shift_remaining_seconds: shiftRemainingSeconds,
          shift_elapsed_seconds: shiftElapsedSeconds,
          shift_timer_status: dealer.dealer_status === 'on_table' ? 'counting' : 
                              dealer.dealer_status === 'on_break' ? 'paused' : 
                              (dealer.shift_timer_status || 'stopped'),
          
          break_started_at: dealer.break_started_at,
          break_ends_at: dealer.break_ends_at,
          break_duration_minutes: dealer.break_duration_minutes,
          break_remaining_seconds: breakRemainingSeconds,
          
          // ✅ IMPORTANT: This is the paused time that will resume
          shift_paused_remaining_seconds: dealer.shift_paused_remaining_seconds || 0,
          
          is_shift_ending: shiftRemainingSeconds > 0 && shiftRemainingSeconds <= 300,
          is_shift_overdue: shiftRemainingSeconds <= 0 && dealer.dealer_status === 'on_table',
          is_break_ending: breakRemainingSeconds > 0 && breakRemainingSeconds <= 120,
          is_break_overdue: breakRemainingSeconds <= 0 && dealer.dealer_status === 'on_break'
        };
      });
    } catch (error) {
      throw error;
    }
  }

  async generateDealerCode() {
    const lastDealer = await db.query(
      'SELECT dealer_code FROM tbl_dealers ORDER BY dealer_id DESC LIMIT 1'
    );
    if (!lastDealer || !lastDealer.dealer_code) {
      return 'DL00001';
    }
    const lastNumber = parseInt(lastDealer.dealer_code.replace('DL', ''));
    return `DL${String(lastNumber + 1).padStart(5, '0')}`;
  }

  async createDealer(data, userId) {
    try {
      const { dealer_name, phone_number, dealer_email } = data;
      const dealerCode = await this.generateDealerCode();

      const result = await db.insert('tbl_dealers', {
        dealer_code: dealerCode,
        dealer_name,
        phone_number: phone_number || null,
        email: dealer_email || null,
        dealer_status: 'available',
        created_at: new Date()
      });

      return {
        dealer_id: result.insert_id,
        dealer_code: dealerCode,
        dealer_name,
        message: 'Dealer created successfully'
      };
    } catch (error) {
      throw error;
    }
  }

  async getDealerById(dealerId) {
    try {
      return await db.select('tbl_dealers', '*', 'dealer_id = ?', [dealerId]);
    } catch (error) {
      throw error;
    }
  }

  /**
   * ✅ ASSIGN DEALER TO TABLE
   * ⚠️ KEY FIX: Check for paused shift time and RESUME from there
   */
  async assignDealerToTable(tableId, dealerId, userId, shiftDurationMinutes = 60) {
    try {
      const session = await tableService.getCurrentSession();
      const now = new Date();

      const dealer = await db.select('tbl_dealers', '*', 'dealer_id = ?', [dealerId]);
      if (!dealer) {
        throw new Error('Dealer not found');
      }
      if (dealer.dealer_status !== 'available') {
        throw new Error('Dealer is not available');
      }

      // ✅ KEY FIX: Find shift with paused remaining seconds
      // This is the critical query - look for ANY shift with paused time
      const existingShifts = await db.queryAll(
        `SELECT * FROM tbl_dealer_shifts 
         WHERE dealer_id = ? 
         AND session_id = ? 
         AND shift_paused_remaining_seconds > 0
         ORDER BY shift_id DESC 
         LIMIT 1`,
        [dealerId, session.session_id]
      );
      
      const existingShift = existingShifts && existingShifts.length > 0 ? existingShifts[0] : null;

      console.log('=== ASSIGN DEALER DEBUG ===');
      console.log('Dealer ID:', dealerId);
      console.log('Session ID:', session.session_id);
      console.log('Existing shift with paused time:', existingShift);

      let shiftEndsAt;
      let shiftRemainingSeconds;
      let resumedFromPause = false;

      if (existingShift && existingShift.shift_paused_remaining_seconds > 0) {
        // ✅ RESUME from paused time
        shiftRemainingSeconds = existingShift.shift_paused_remaining_seconds;
        shiftEndsAt = new Date(now.getTime() + shiftRemainingSeconds * 1000);
        resumedFromPause = true;

        console.log('RESUMING shift with', shiftRemainingSeconds, 'seconds =', Math.floor(shiftRemainingSeconds/60), 'minutes');

        // Update existing shift to resume
        await db.update(
          'tbl_dealer_shifts',
          {
            table_id: tableId,
            shift_status: 'on_table',
            shift_timer_status: 'counting',
            shift_ends_at: shiftEndsAt,
            current_shift_started_at: now,
            shift_paused_remaining_seconds: 0, // Clear paused state
            break_started_at: null,
            break_ends_at: null,
            break_duration_minutes: null
          },
          'shift_id = ?',
          [existingShift.shift_id]
        );
      } else {
        // ✅ START NEW SHIFT
        shiftRemainingSeconds = shiftDurationMinutes * 60;
        shiftEndsAt = new Date(now.getTime() + shiftRemainingSeconds * 1000);

        console.log('STARTING NEW shift with', shiftDurationMinutes, 'minutes');

        await db.insert('tbl_dealer_shifts', {
          dealer_id: dealerId,
          session_id: session.session_id,
          table_id: tableId,
          shift_status: 'on_table',
          shift_timer_status: 'counting',
          shift_start_time: now,
          current_shift_started_at: now,
          shift_duration_minutes: shiftDurationMinutes,
          shift_ends_at: shiftEndsAt,
          shift_paused_remaining_seconds: 0
        });
      }

      // Update dealer status
      await db.update('tbl_dealers', { dealer_status: 'on_table' }, 'dealer_id = ?', [dealerId]);

      // Assign dealer to table
      await db.update('tbl_tables', { dealer_id: dealerId }, 'table_id = ?', [tableId]);

      return {
        success: true,
        shift_ends_at: shiftEndsAt,
        shift_remaining_seconds: shiftRemainingSeconds,
        resumed_from_pause: resumedFromPause,
        message: resumedFromPause 
          ? `Dealer assigned. Shift RESUMED with ${Math.floor(shiftRemainingSeconds / 60)} minutes remaining.`
          : `Dealer assigned. New ${shiftDurationMinutes} minute shift started.`
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * ✅ SEND DEALER ON BREAK - PAUSES SHIFT TIMER
   */
  async sendDealerOnBreak(dealerId, userId, breakDurationMinutes = 15) {
    try {
      const dealer = await db.select('tbl_dealers', '*', 'dealer_id = ?', [dealerId]);
      if (!dealer) {
        throw new Error('Dealer not found');
      }

      const session = await tableService.getCurrentSession();

      const shift = await db.select(
        'tbl_dealer_shifts',
        '*',
        'dealer_id = ? AND session_id = ? AND shift_status = "on_table"',
        [dealerId, session.session_id]
      );

      if (!shift) {
        throw new Error('Dealer is not on table');
      }

      const tableId = shift.table_id;
      const now = new Date();

      // ✅ Calculate remaining shift time to pause
      let shiftPausedRemainingSeconds = 0;
      if (shift.shift_ends_at) {
        const shiftEndsAt = new Date(shift.shift_ends_at);
        shiftPausedRemainingSeconds = Math.max(0, Math.floor((shiftEndsAt - now) / 1000));
      }

      console.log('=== BREAK DEBUG ===');
      console.log('Pausing shift with', shiftPausedRemainingSeconds, 'seconds =', Math.floor(shiftPausedRemainingSeconds/60), 'minutes');

      const breakStartedAt = now;
      const breakEndsAt = new Date(breakStartedAt.getTime() + breakDurationMinutes * 60 * 1000);

      // ✅ Update shift - PAUSE and save remaining time
      await db.update(
        'tbl_dealer_shifts',
        {
          table_id: null,
          shift_status: 'on_break',
          shift_timer_status: 'paused',
          shift_paused_remaining_seconds: shiftPausedRemainingSeconds,
          break_started_at: breakStartedAt,
          break_duration_minutes: breakDurationMinutes,
          break_ends_at: breakEndsAt
        },
        'shift_id = ?',
        [shift.shift_id]
      );

      // Update dealer status
      await db.update('tbl_dealers', { dealer_status: 'on_break' }, 'dealer_id = ?', [dealerId]);

      // Remove dealer from table
      await db.update('tbl_tables', { dealer_id: null }, 'table_id = ?', [tableId]);

      // Auto-assign another dealer (optional)
      let autoAssignedDealer = null;
      try {
        const availableDealers = await db.queryAll(
          'SELECT * FROM tbl_dealers WHERE dealer_status = "available" AND dealer_id != ? LIMIT 1',
          [dealerId]
        );
        if (availableDealers && availableDealers.length > 0) {
          await this.assignDealerToTable(tableId, availableDealers[0].dealer_id, userId);
          autoAssignedDealer = availableDealers[0];
        }
      } catch (e) {
        console.log('No available dealer to auto-assign');
      }

      return {
        success: true,
        break_ends_at: breakEndsAt,
        shift_paused_remaining_seconds: shiftPausedRemainingSeconds,
        shift_paused_remaining_minutes: Math.floor(shiftPausedRemainingSeconds / 60),
        auto_assigned_new_dealer: !!autoAssignedDealer,
        message: `${dealer.dealer_name} on break. Shift PAUSED with ${Math.floor(shiftPausedRemainingSeconds / 60)} min remaining.`
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * ✅ MARK DEALER AS AVAILABLE (After break)
   * KEEPS the paused shift time - will resume when assigned to table
   */
  async markDealerAvailable(dealerId, userId) {
    try {
      const session = await tableService.getCurrentSession();

      const shift = await db.select(
        'tbl_dealer_shifts',
        '*',
        'dealer_id = ? AND session_id = ? AND shift_status = "on_break"',
        [dealerId, session.session_id]
      );

      if (!shift) {
        throw new Error('Dealer is not on break');
      }

      const pausedSeconds = shift.shift_paused_remaining_seconds || 0;
      
      console.log('=== AVAILABLE DEBUG ===');
      console.log('Marking available with', pausedSeconds, 'seconds to resume');

      // ✅ Update shift - KEEP the paused remaining seconds!
      await db.update(
        'tbl_dealer_shifts',
        {
          shift_status: 'available',
          shift_timer_status: 'paused', // Keep paused
          // ✅ DO NOT clear shift_paused_remaining_seconds here!
          break_started_at: null,
          break_ends_at: null
        },
        'shift_id = ?',
        [shift.shift_id]
      );

      // Update dealer status
      await db.update('tbl_dealers', { dealer_status: 'available' }, 'dealer_id = ?', [dealerId]);

      return {
        success: true,
        paused_remaining_seconds: pausedSeconds,
        paused_remaining_minutes: Math.floor(pausedSeconds / 60),
        message: `Dealer available. Will RESUME with ${Math.floor(pausedSeconds / 60)} min when assigned.`
      };
    } catch (error) {
      throw error;
    }
  }

  async endDealerShift(dealerId, userId) {
    try {
      const session = await tableService.getCurrentSession();

      const shifts = await db.queryAll(
        `SELECT * FROM tbl_dealer_shifts 
         WHERE dealer_id = ? AND session_id = ? 
         AND shift_status IN ('on_table', 'on_break', 'available')
         ORDER BY shift_id DESC LIMIT 1`,
        [dealerId, session.session_id]
      );

      const shift = shifts && shifts.length > 0 ? shifts[0] : null;
      if (!shift) {
        throw new Error('No active shift found');
      }

      await db.update(
        'tbl_dealer_shifts',
        {
          shift_status: 'ended',
          shift_timer_status: 'stopped',
          shift_ended_at: new Date(),
          shift_paused_remaining_seconds: 0
        },
        'shift_id = ?',
        [shift.shift_id]
      );

      if (shift.table_id) {
        await db.update('tbl_tables', { dealer_id: null }, 'table_id = ?', [shift.table_id]);
      }

      await db.update('tbl_dealers', { dealer_status: 'available' }, 'dealer_id = ?', [dealerId]);

      return { success: true, message: 'Shift ended. Dealer available for new shift.' };
    } catch (error) {
      throw error;
    }
  }

  async extendDealerShift(dealerId, additionalMinutes, userId) {
    try {
      const session = await tableService.getCurrentSession();

      const shift = await db.select(
        'tbl_dealer_shifts',
        '*',
        'dealer_id = ? AND session_id = ? AND shift_status = "on_table"',
        [dealerId, session.session_id]
      );

      if (!shift) {
        throw new Error('Dealer is not on table');
      }

      const now = new Date();
      const currentEndsAt = shift.shift_ends_at ? new Date(shift.shift_ends_at) : now;
      const newEndsAt = new Date(Math.max(currentEndsAt.getTime(), now.getTime()) + additionalMinutes * 60 * 1000);

      await db.update(
        'tbl_dealer_shifts',
        {
          shift_ends_at: newEndsAt,
          shift_duration_minutes: (shift.shift_duration_minutes || 60) + additionalMinutes
        },
        'shift_id = ?',
        [shift.shift_id]
      );

      return {
        success: true,
        new_shift_ends_at: newEndsAt,
        message: `Shift extended by ${additionalMinutes} minutes.`
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new DealerService();