// ============================================
// FILE: modules/floor-manager/services/table.service.js
// Business logic for table management
//
// ✅ FIX: addPlayerToTable now delegates to playerService
//    to ensure rakeback session is started
// ============================================

const db = require('../../../config/database');

class TableService {
  
  // ✅ LAZY LOADING - to avoid circular dependency
  _getPlayerService() {
    return require('./player.service');
  }

  /**
   * ✅ CREATE NEW TABLE
   */
  async createTable(data, userId) {
    try {
      const {
        table_number,
        table_name,
        game_type,
        stakes,
        max_seats,
        dealer_id
      } = data;

      const existing = await db.select(
        'tbl_tables',
        'table_id',
        'table_number = ? AND table_status = "active"',
        [table_number]
      );

      if (existing) {
        throw new Error(`Table ${table_number} already exists`);
      }

      if (dealer_id) {
        const dealer = await db.select(
          'tbl_dealers',
          'dealer_id, dealer_status',
          'dealer_id = ?',
          [dealer_id]
        );

        if (!dealer) {
          throw new Error('Dealer not found');
        }

        if (dealer.dealer_status !== 'available') {
          throw new Error('Dealer is not available');
        }
      }

      const result = await db.insert('tbl_tables', {
        table_number,
        table_name,
        game_type,
        stakes,
        max_seats,
        dealer_id: dealer_id || null,
        current_occupied_seats: 0,
        table_status: 'active',
        created_by: userId,
        created_at: new Date()
      });

      if (dealer_id) {
        await this.assignDealerToTable(result.insert_id, dealer_id, userId);
      }

      return {
        table_id: result.insert_id,
        table_number,
        table_name,
        game_type,
        stakes,
        max_seats,
        dealer_assigned: !!dealer_id,
        message: `Table ${table_number} created successfully`
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * ✅ GET ALL ACTIVE TABLES WITH PLAYERS & DEALER INFO
   */
  async getAllTables(sessionId) {
    try {
      const tables = await db.queryAll(
        `SELECT 
          t.*,
          d.dealer_name,
          d.dealer_status,
          ds.shift_status as dealer_shift_status,
          ds.shift_ends_at as dealer_shift_ends_at,
          ds.current_shift_started_at as dealer_shift_started_at,
          ds.shift_duration_minutes as dealer_shift_duration_minutes,
          ds.break_started_at as dealer_break_started_at,
          ds.break_ends_at as dealer_break_ends_at,
          ds.break_duration_minutes as dealer_break_duration_minutes,
          ds.shift_paused_remaining_seconds as dealer_shift_paused_seconds
        FROM tbl_tables t
        LEFT JOIN tbl_dealers d ON t.dealer_id = d.dealer_id
        LEFT JOIN tbl_dealer_shifts ds ON d.dealer_id = ds.dealer_id 
          AND ds.session_id = ? 
          AND ds.shift_status IN ('on_table', 'on_break')
        WHERE t.table_status = 'active'
        ORDER BY CAST(t.table_number AS UNSIGNED)`,
        [sessionId]
      );

      if (!tables || tables.length === 0) {
        return [];
      }

      const allPlayers = await db.queryAll(
        `SELECT 
          tp.*,
          tp.play_timer_status,
          tp.played_time_before_break,
          p.player_name,
          p.phone_number as player_phone,
          bcr.request_id as confirmation_request_id,
          bcr.request_status as confirmation_status
        FROM tbl_table_players tp
        INNER JOIN tbl_players p ON tp.player_id = p.player_id
        LEFT JOIN tbl_buyin_confirmation_requests bcr 
          ON tp.confirmation_request_id = bcr.request_id
        WHERE tp.session_id = ? 
          AND tp.is_removed = FALSE
        ORDER BY tp.table_id, tp.seat_number`,
        [sessionId]
      );

      const playersByTable = {};
      allPlayers.forEach(player => {
        if (!playersByTable[player.table_id]) {
          playersByTable[player.table_id] = [];
        }
        playersByTable[player.table_id].push(this.formatPlayerData(player));
      });

      const now = new Date();
      const tablesWithPlayers = tables.map(table => {
        const players = playersByTable[table.table_id] || [];
        
        const occupiedSeats = players.map(p => p.seat_number);
        const allSeats = Array.from({ length: table.max_seats }, (_, i) => i + 1);
        const emptySeats = allSeats.filter(seat => !occupiedSeats.includes(seat));

        let dealerShiftRemainingSeconds = 0;
        let dealerBreakRemainingSeconds = 0;
        let isDealerShiftEnding = false;
        let isDealerShiftOverdue = false;
        
        if (table.dealer_id && table.dealer_shift_ends_at) {
          const shiftEndsAt = new Date(table.dealer_shift_ends_at);
          dealerShiftRemainingSeconds = Math.floor((shiftEndsAt - now) / 1000);
          isDealerShiftEnding = dealerShiftRemainingSeconds > 0 && dealerShiftRemainingSeconds <= 300;
          isDealerShiftOverdue = dealerShiftRemainingSeconds <= 0;
        }
        
        if (table.dealer_break_ends_at) {
          const breakEndsAt = new Date(table.dealer_break_ends_at);
          dealerBreakRemainingSeconds = Math.max(0, Math.floor((breakEndsAt - now) / 1000));
        }

        return {
          table_id: table.table_id,
          table_number: table.table_number,
          table_name: table.table_name,
          game_type: table.game_type,
          stakes: table.stakes,
          max_seats: table.max_seats,
          occupied_seats: table.current_occupied_seats,
          empty_seats: emptySeats,
          table_status: table.table_status,
          
          dealer: table.dealer_id ? {
            dealer_id: table.dealer_id,
            dealer_name: table.dealer_name,
            dealer_status: table.dealer_status,
            shift_status: table.dealer_shift_status,
            shift_start_time: table.dealer_shift_started_at,
            shift_duration_minutes: table.dealer_shift_duration_minutes,
            shift_ends_at: table.dealer_shift_ends_at,
            shift_remaining_seconds: dealerShiftRemainingSeconds,
            break_started_at: table.dealer_break_started_at,
            break_ends_at: table.dealer_break_ends_at,
            break_duration_minutes: table.dealer_break_duration_minutes,
            break_remaining_seconds: dealerBreakRemainingSeconds,
            shift_paused_remaining_seconds: table.dealer_shift_paused_seconds || 0,
            is_shift_ending: isDealerShiftEnding,
            is_shift_overdue: isDealerShiftOverdue
          } : null,
          
          players: players,
          created_at: table.created_at
        };
      });

      return tablesWithPlayers;
    } catch (error) {
      throw error;
    }
  }

  /**
   * ✅ FORMAT PLAYER DATA WITH TIME CALCULATIONS
   */
  formatPlayerData(player) {
    const now = new Date();
    const seatedAt = new Date(player.seated_at);
    const minimumPlayUntil = player.minimum_play_until ? new Date(player.minimum_play_until) : null;
    
    const playedBeforeBreakSeconds = parseInt(player.played_time_before_break) || 0;
    
    let totalPlayedSeconds = 0;
    let currentSessionSeconds = 0;
    
    if (player.player_status === 'playing') {
      const sessionStart = player.last_timer_update 
        ? new Date(player.last_timer_update) 
        : seatedAt;
      
      currentSessionSeconds = Math.floor((now - sessionStart) / 1000);
      totalPlayedSeconds = playedBeforeBreakSeconds + currentSessionSeconds;
    } else if (player.player_status === 'on_break') {
      totalPlayedSeconds = playedBeforeBreakSeconds;
    } else if (player.player_status === 'call_time_active') {
      totalPlayedSeconds = playedBeforeBreakSeconds;
    }
    
    const playedMinutes = Math.floor(totalPlayedSeconds / 60);
    
    const remainingMs = minimumPlayUntil ? minimumPlayUntil - now : 0;
    const remainingMinutes = Math.max(0, Math.floor(remainingMs / (1000 * 60)));
    
    const canCallTime = playedMinutes >= (player.minimum_play_time || 120);
    
    let callTimeRemaining = null;
    let callTimeRemainingSeconds = null;
    let mustLeaveIn = null;
    
    if (player.player_status === 'call_time_active' && player.call_time_ends_at) {
      const callTimeEndsAt = new Date(player.call_time_ends_at);
      const callTimeRemainingMs = callTimeEndsAt - now;
      callTimeRemainingSeconds = Math.floor(callTimeRemainingMs / 1000);
      callTimeRemaining = Math.max(0, Math.floor(callTimeRemainingMs / (1000 * 60)));
      
      if (callTimeRemaining === 0) {
        mustLeaveIn = 0;
      }
    }
    
    let breakRemaining = null;
    let breakRemainingSeconds = null;
    if (player.player_status === 'on_break' && player.break_ends_at) {
      const breakEndsAt = new Date(player.break_ends_at);
      const breakRemainingMs = breakEndsAt - now;
      breakRemainingSeconds = Math.max(0, Math.floor(breakRemainingMs / 1000));
      breakRemaining = Math.max(0, Math.floor(breakRemainingMs / (1000 * 60)));
    }
    
    return {
      table_player_id: player.table_player_id,
      player_id: player.player_id,
      player_name: player.player_name,
      player_phone: player.player_phone,
      seat_number: player.seat_number,
      buy_in_amount: parseFloat(player.buy_in_amount),
      
      buy_in_status: player.buy_in_status,
      player_status: player.player_status,
      play_timer_status: player.play_timer_status,
      
      confirmation_request_id: player.confirmation_request_id,
      confirmation_status: player.confirmation_status,
      
      seated_at: player.seated_at,
      last_timer_update: player.last_timer_update,
      
      total_played_seconds: totalPlayedSeconds,
      played_time_before_break: playedBeforeBreakSeconds,
      
      played_minutes: playedMinutes,
      played_hours: Math.floor(playedMinutes / 60),
      played_mins: playedMinutes % 60,
      
      minimum_play_time: player.minimum_play_time,
      minimum_play_until: player.minimum_play_until,
      remaining_minutes: remainingMinutes,
      can_call_time: canCallTime,
      
      call_time_active: player.player_status === 'call_time_active',
      call_time_requested_at: player.call_time_requested_at,
      call_time_duration: player.call_time_duration,
      call_time_ends_at: player.call_time_ends_at,
      call_time_remaining_minutes: callTimeRemaining,
      call_time_remaining_seconds: callTimeRemainingSeconds,
      must_leave_in_minutes: mustLeaveIn,
      
      on_break: player.player_status === 'on_break',
      break_started_at: player.break_started_at,
      break_ends_at: player.break_ends_at,
      break_remaining_minutes: breakRemaining,
      break_remaining_seconds: breakRemainingSeconds,
      
      needs_auto_removal: mustLeaveIn === 0,
      overdue: player.buy_in_status === 'AWAITING_CONFIRMATION'
    };
  }

  /**
   * ✅ ADD PLAYER TO TABLE - DELEGATES TO PLAYER SERVICE
   * This ensures rakeback session is started properly
   */
  async addPlayerToTable(data, userId) {
    console.log("🔄 tableService.addPlayerToTable -> Delegating to playerService");
    const playerService = this._getPlayerService();
    return await playerService.addPlayerToTable(data, userId);
  }

  /**
   * ✅ ASSIGN DEALER TO TABLE
   */
  async assignDealerToTable(tableId, dealerId, userId) {
    try {
      const session = await this.getCurrentSession();
      const now = new Date();
      
      const dealer = await db.select(
        'tbl_dealers',
        '*',
        'dealer_id = ?',
        [dealerId]
      );
      
      if (!dealer) {
        throw new Error('Dealer not found');
      }
      
      const activeOnTable = await db.select(
        'tbl_dealer_shifts',
        '*',
        'dealer_id = ? AND session_id = ? AND shift_status = "on_table"',
        [dealerId, session.session_id]
      );
      
      if (activeOnTable) {
        throw new Error('Dealer is already assigned to another table');
      }

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
      console.log('Table ID:', tableId);
      console.log('Session ID:', session.session_id);
      console.log('Existing shift with paused time:', existingShift);

      let shiftEndsAt;
      let shiftRemainingSeconds;
      let resumedFromPause = false;

      if (existingShift && existingShift.shift_paused_remaining_seconds > 0) {
        shiftRemainingSeconds = existingShift.shift_paused_remaining_seconds;
        shiftEndsAt = new Date(now.getTime() + shiftRemainingSeconds * 1000);
        resumedFromPause = true;

        console.log('✅ RESUMING shift with', shiftRemainingSeconds, 'seconds =', Math.floor(shiftRemainingSeconds/60), 'minutes');

        await db.update(
          'tbl_dealer_shifts',
          {
            table_id: tableId,
            shift_status: 'on_table',
            shift_timer_status: 'counting',
            shift_ends_at: shiftEndsAt,
            current_shift_started_at: now,
            shift_paused_remaining_seconds: 0,
            break_started_at: null,
            break_ends_at: null,
            break_duration_minutes: null,
            last_timer_update: now
          },
          'shift_id = ?',
          [existingShift.shift_id]
        );
      } else {
        const shiftDuration = 60;
        shiftRemainingSeconds = shiftDuration * 60;
        shiftEndsAt = new Date(now.getTime() + shiftRemainingSeconds * 1000);

        console.log('✅ STARTING NEW shift with', shiftDuration, 'minutes');

        await db.insert('tbl_dealer_shifts', {
          session_id: session.session_id,
          dealer_id: dealerId,
          table_id: tableId,
          shift_status: 'on_table',
          shift_timer_status: 'counting',
          shift_start_time: now,
          current_shift_started_at: now,
          shift_duration_minutes: shiftDuration,
          shift_duration_remaining_seconds: shiftRemainingSeconds,
          shift_ends_at: shiftEndsAt,
          shift_paused_remaining_seconds: 0,
          assigned_by: userId,
          last_timer_update: now
        });
      }
      
      await db.update(
        'tbl_tables',
        { dealer_id: dealerId },
        'table_id = ?',
        [tableId]
      );
      
      await db.update(
        'tbl_dealers',
        { dealer_status: 'on_table' },
        'dealer_id = ?',
        [dealerId]
      );
      
      return {
        success: true,
        shift_ends_at: shiftEndsAt,
        shift_remaining_seconds: shiftRemainingSeconds,
        resumed_from_pause: resumedFromPause,
        message: resumedFromPause
          ? `Dealer ${dealer.dealer_name} assigned. Shift RESUMED with ${Math.floor(shiftRemainingSeconds / 60)} minutes remaining.`
          : `Dealer ${dealer.dealer_name} assigned. New 60 minute shift started.`
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * ✅ REMOVE DEALER FROM TABLE (Send to break)
   */
  async removeDealerFromTable(tableId, userId) {
    try {
      const table = await db.select('tbl_tables', '*', 'table_id = ?', [tableId]);
      
      if (!table || !table.dealer_id) {
        throw new Error('No dealer assigned to this table');
      }
      
      const session = await this.getCurrentSession();
      const now = new Date();
      
      const currentShift = await db.select(
        'tbl_dealer_shifts',
        '*',
        'dealer_id = ? AND session_id = ? AND shift_status = "on_table"',
        [table.dealer_id, session.session_id]
      );
      
      let shiftPausedRemainingSeconds = 0;
      if (currentShift && currentShift.shift_ends_at) {
        const shiftEndsAt = new Date(currentShift.shift_ends_at);
        shiftPausedRemainingSeconds = Math.max(0, Math.floor((shiftEndsAt - now) / 1000));
      }

      console.log('=== BREAK DEBUG ===');
      console.log('Pausing shift with', shiftPausedRemainingSeconds, 'seconds =', Math.floor(shiftPausedRemainingSeconds/60), 'minutes');
      
      const breakDuration = 15;
      const breakStartedAt = now;
      const breakEndsAt = new Date(breakStartedAt.getTime() + breakDuration * 60 * 1000);
      
      await db.update(
        'tbl_dealer_shifts',
        {
          table_id: null,
          shift_status: 'on_break',
          shift_timer_status: 'paused',
          break_started_at: breakStartedAt,
          break_duration_minutes: breakDuration,
          break_ends_at: breakEndsAt,
          shift_paused_remaining_seconds: shiftPausedRemainingSeconds
        },
        'dealer_id = ? AND session_id = ? AND shift_status = "on_table"',
        [table.dealer_id, session.session_id]
      );
      
      await db.update(
        'tbl_dealers',
        { dealer_status: 'on_break' },
        'dealer_id = ?',
        [table.dealer_id]
      );
      
      await db.update(
        'tbl_tables',
        { dealer_id: null },
        'table_id = ?',
        [tableId]
      );
      
      return {
        success: true,
        break_ends_at: breakEndsAt,
        shift_paused_remaining_seconds: shiftPausedRemainingSeconds,
        message: `Dealer sent on break. Shift PAUSED with ${Math.floor(shiftPausedRemainingSeconds / 60)} minutes remaining.`
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * ✅ CLOSE TABLE
   */
  async closeTable(tableId, userId) {
    try {
      const activePlayers = await db.selectAll(
        'tbl_table_players',
        'player_id',
        'table_id = ? AND is_removed = FALSE',
        [tableId]
      );
      
      if (activePlayers && activePlayers.length > 0) {
        throw new Error(`Cannot close table. ${activePlayers.length} players still seated.`);
      }
      
      const table = await db.select('tbl_tables', 'dealer_id', 'table_id = ?', [tableId]);
      if (table && table.dealer_id) {
        await this.removeDealerFromTable(tableId, userId);
      }
      
      await db.update(
        'tbl_tables',
        { 
          table_status: 'closed',
          updated_at: new Date()
        },
        'table_id = ?',
        [tableId]
      );
      
      return {
        success: true,
        message: 'Table closed successfully'
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * ✅ GET CURRENT SESSION
   */
  async getCurrentSession() {
    const today = new Date().toISOString().split('T')[0];
    const session = await db.select(
      'tbl_daily_sessions',
      '*',
      'session_date = ?',
      [today]
    );
    
    if (!session) {
      throw new Error('No active session found for today');
    }
    
    return session;
  }

  /**
   * ✅ GET TABLE STATISTICS BEFORE CLOSING
   */
  async getTableStatistics(tableId) {
    try {
      const session = await this.getCurrentSession();
      
      // Get table info
      const table = await db.select('tbl_tables', '*', 'table_id = ?', [tableId]);
      if (!table) {
        throw new Error('Table not found');
      }

      // Get table start time (first player seated time or table creation time)
      const firstPlayerSeated = await db.query(
        `SELECT MIN(seated_at) as first_seated_at 
         FROM tbl_table_players 
         WHERE table_id = ? AND session_id = ?`,
        [tableId, session.session_id]
      );
      const tableStartTime = firstPlayerSeated?.[0]?.first_seated_at || table.created_at;

      // Get all players who joined this table
      const allPlayers = await db.queryAll(
        `SELECT DISTINCT tp.player_id, DATE(p.created_at) as player_created_date
         FROM tbl_table_players tp
         INNER JOIN tbl_players p ON tp.player_id = p.player_id
         WHERE tp.table_id = ? AND tp.session_id = ?`,
        [tableId, session.session_id]
      );
      const totalPlayersJoined = allPlayers?.length || 0;
      
      // Count unique new players (players created today)
      const today = new Date().toISOString().split('T')[0];
      const uniqueNewPlayers = allPlayers?.filter(p => {
        const createdDate = p.player_created_date;
        if (!createdDate) return false;
        // Handle both string and Date object
        const dateStr = typeof createdDate === 'string' 
          ? createdDate 
          : new Date(createdDate).toISOString().split('T')[0];
        return dateStr === today;
      }).length || 0;

      // Get current players count
      const currentPlayers = await db.selectAll(
        'tbl_table_players',
        'table_player_id',
        'table_id = ? AND session_id = ? AND is_removed = FALSE',
        [tableId, session.session_id]
      );
      const currentPlayersCount = currentPlayers?.length || 0;

      // Get player IDs who were at this table in this session
      const tablePlayers = await db.queryAll(
        `SELECT DISTINCT player_id 
         FROM tbl_table_players 
         WHERE table_id = ? AND session_id = ?`,
        [tableId, session.session_id]
      );
      const playerIds = tablePlayers?.map(p => p.player_id) || [];
      
      // Get all buy-ins from tbl_table_players (includes both confirmed and pending, regardless of status)
      const allTableBuyIns = await db.queryAll(
        `SELECT SUM(buy_in_amount) as total_table_buy_ins
         FROM tbl_table_players
         WHERE table_id = ? 
         AND session_id = ?
         AND buy_in_amount > 0`,
        [tableId, session.session_id]
      );
      const totalBuyIns = parseFloat(allTableBuyIns?.[0]?.total_table_buy_ins || 0);

      // Get total buy-outs (cash-outs) from transactions for players at this table
      let totalBuyOuts = 0;
      if (playerIds.length > 0) {
        const placeholders = playerIds.map(() => '?').join(',');
        const buyOutTransactions = await db.queryAll(
          `SELECT SUM(amount) as total_buy_outs
           FROM tbl_transactions
           WHERE session_id = ?
           AND transaction_type = 'cash_out'
           AND player_id IN (${placeholders})`,
          [session.session_id, ...playerIds]
        );
        totalBuyOuts = parseFloat(buyOutTransactions?.[0]?.total_buy_outs || 0);
      }

      // Calculate chips on table (sum of current chip balances of players at this table)
      const chipsOnTable = await db.queryAll(
        `SELECT 
           COALESCE(SUM(pcb.current_chip_balance), 0) as chips_on_table
         FROM tbl_table_players tp
         LEFT JOIN tbl_player_chip_balances pcb 
           ON tp.player_id = pcb.player_id 
           AND pcb.session_id = ?
         WHERE tp.table_id = ? 
           AND tp.session_id = ?
           AND tp.is_removed = FALSE`,
        [session.session_id, tableId, session.session_id]
      );
      const chipsOnTableAmount = parseFloat(chipsOnTable?.[0]?.chips_on_table || 0);

      // Get rake (manual entry from expenses or transaction notes)
      // Rake is typically recorded as an expense with type 'rake' or in transaction notes
      // Since transactions don't have table_id, we'll check if there's a table reference in notes
      const rakeTransactions = await db.queryAll(
        `SELECT SUM(t.amount) as total_rake
         FROM tbl_transactions t
         WHERE t.session_id = ?
         AND (t.transaction_type = 'rake' OR t.notes LIKE '%rake%')
         AND (t.notes LIKE ? OR t.notes LIKE ?)`,
        [session.session_id, `%Table ${tableId}%`, `%table ${tableId}%`]
      );
      let rake = parseFloat(rakeTransactions?.[0]?.total_rake || 0);
      
      // Also check expenses table if rake is tracked there (if expenses table has table_id)
      // For now, return 0 as default - can be manually entered in the modal

      // Calculate reconciliation
      const expected = totalBuyOuts + chipsOnTableAmount + rake;
      const difference = totalBuyIns - expected;

      return {
        table_id: tableId,
        table_number: table.table_number,
        table_start_time: tableStartTime,
        total_players_joined: totalPlayersJoined,
        unique_new_players: uniqueNewPlayers,
        current_players: currentPlayersCount,
        total_buy_ins: totalBuyIns,
        total_buy_outs: totalBuyOuts,
        chips_on_table: chipsOnTableAmount,
        rake: rake,
        reconciliation: {
          total_buy_in: totalBuyIns,
          total_buy_out: totalBuyOuts,
          chips_on_table: chipsOnTableAmount,
          rake: rake,
          expected: expected,
          difference: difference
        }
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new TableService();