// ============================================
// FILE: modules/promotion/services/promotion.service.js
// Promotion Management Service - Deposit Bonus System
// ============================================

const db = require("../../../config/database");

class PromotionService {
  /**
   * Create a new deposit bonus promotion
   */
  async createPromotion(data, userId) {
    const {
      promotion_name,
      status,
      start_date,
      end_date,
      user_type,
      player_limit_24h,
      claims_per_user_per_day,
      bonus_tiers
    } = data;

    // Validate dates
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    if (endDate <= startDate) {
      throw new Error("End date must be after start date");
    }

    // Validate bonus tiers
    if (!bonus_tiers || bonus_tiers.length === 0) {
      throw new Error("At least one bonus tier is required");
    }

    // Validate tiers don't overlap
    for (let i = 0; i < bonus_tiers.length; i++) {
      const tier = bonus_tiers[i];
      if (tier.min_deposit >= tier.max_deposit) {
        throw new Error(`Tier ${i + 1}: Min deposit must be less than max deposit`);
      }
      for (let j = i + 1; j < bonus_tiers.length; j++) {
        const otherTier = bonus_tiers[j];
        if (
          (tier.min_deposit <= otherTier.max_deposit && tier.max_deposit >= otherTier.min_deposit)
        ) {
          throw new Error(`Tier ${i + 1} and Tier ${j + 1} have overlapping deposit ranges`);
        }
      }
    }

    // Create promotion
    const promotionResult = await db.insert("tbl_promotions", {
      promotion_name,
      status: status || "enabled",
      start_date: startDate,
      end_date: endDate,
      user_type: user_type || "all_players",
      player_limit_24h: player_limit_24h || 0, // 0 = unlimited
      claims_per_user_per_day: claims_per_user_per_day || 1,
      created_by: userId,
      created_at: new Date()
    });

    const promotionId = promotionResult.insert_id;

    // Create bonus tiers
    for (const tier of bonus_tiers) {
      await db.insert("tbl_promotion_bonus_tiers", {
        promotion_id: promotionId,
        min_deposit: tier.min_deposit,
        max_deposit: tier.max_deposit,
        flat_bonus_amount: tier.flat_bonus_amount,
        created_at: new Date()
      });
    }

    return {
      promotion_id: promotionId,
      message: "Promotion created successfully"
    };
  }

  /**
   * Get all promotions
   */
 async getAllPromotions() {
  const promotions = await db.queryAll(
    `SELECT p.*, 
      COUNT(DISTINCT pt.tier_id) as tier_count,
      u.username as created_by_username
     FROM tbl_promotions p
     LEFT JOIN tbl_promotion_bonus_tiers pt ON p.promotion_id = pt.promotion_id
     LEFT JOIN tbl_users u ON p.created_by = u.user_id
     GROUP BY p.promotion_id, u.username
     ORDER BY p.created_at DESC`
  );

  // Get tiers for each promotion
  for (const promotion of promotions) {
    promotion.bonus_tiers = await db.selectAll(
      "tbl_promotion_bonus_tiers",
      "*",
      "promotion_id = ?",
      [promotion.promotion_id],
      "ORDER BY min_deposit ASC"
    );
  }

  return promotions || [];
}

  /**
   * Get active promotions for a deposit amount
   */
  async getActivePromotionsForDeposit(depositAmount, playerId = null) {
    const now = new Date();
    
    const promotions = await db.queryAll(
      `SELECT p.* 
       FROM tbl_promotions p
       WHERE p.status = 'enabled'
         AND p.start_date <= ?
         AND p.end_date >= ?
         AND (p.user_type = 'all_players' OR ? IS NULL)
       ORDER BY p.created_at DESC`,
      [now, now, playerId]
    );

    const eligiblePromotions = [];
    const restrictionMessages = [];

    for (const promotion of promotions) {
      // Get tiers first to check if deposit matches
      const tiers = await db.selectAll(
        "tbl_promotion_bonus_tiers",
        "*",
        "promotion_id = ?",
        [promotion.promotion_id],
        "ORDER BY min_deposit ASC"
      );

      let matchingTier = null;
      for (const tier of tiers) {
        if (depositAmount >= tier.min_deposit && depositAmount <= tier.max_deposit) {
          matchingTier = tier;
          break;
        }
      }

      if (!matchingTier) {
        continue; // Deposit amount doesn't match any tier
      }

      // Check player limit (24h) and get current usage count
      let currentPlayerCount = 0;
      if (promotion.player_limit_24h > 0) {
        const last24hClaimsResult = await db.query(
          `SELECT COUNT(DISTINCT player_id) as count
           FROM tbl_promotion_claims
           WHERE promotion_id = ?
             AND claimed_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
          [promotion.promotion_id]
        );
        currentPlayerCount = parseInt(last24hClaimsResult?.count || 0);
        if (currentPlayerCount >= promotion.player_limit_24h) {
          restrictionMessages.push(`Bonus limit reached for this promotion (${currentPlayerCount}/${promotion.player_limit_24h} players)`);
          continue; // Limit reached
        }
      }

      // Check per-user per-day limit
      if (playerId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayClaimsResult = await db.query(
          `SELECT COUNT(*) as count
           FROM tbl_promotion_claims
           WHERE promotion_id = ?
             AND player_id = ?
             AND DATE(claimed_at) = DATE(?)`,
          [promotion.promotion_id, playerId, today]
        );
        const todayClaimsCount = parseInt(todayClaimsResult?.count || 0);
        if (todayClaimsCount >= promotion.claims_per_user_per_day) {
          restrictionMessages.push(`Bonus already taken for today`);
          continue; // Already claimed today
        }
      }

      // If we get here, promotion is eligible
      // Get current usage count for display
      let usageCount = 0;
      if (promotion.player_limit_24h > 0) {
        const last24hClaimsResult = await db.query(
          `SELECT COUNT(DISTINCT player_id) as count
           FROM tbl_promotion_claims
           WHERE promotion_id = ?
             AND claimed_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
          [promotion.promotion_id]
        );
        usageCount = parseInt(last24hClaimsResult?.count || 0);
      }

      eligiblePromotions.push({
        ...promotion,
        matching_tier: matchingTier,
        bonus_amount: matchingTier.flat_bonus_amount,
        current_usage: usageCount,
        player_limit: promotion.player_limit_24h
      });
    }

    // If no eligible promotions but we have restriction messages, throw error with first message
    if (eligiblePromotions.length === 0 && restrictionMessages.length > 0) {
      throw new Error(restrictionMessages[0]);
    }

    return eligiblePromotions;
  }

  /**
   * Claim promotion bonus
   */
  async claimPromotionBonus(promotionId, playerId, depositAmount, transactionId, userId) {
    const promotion = await db.select(
      "tbl_promotions",
      "*",
      "promotion_id = ?",
      [promotionId]
    );

    if (!promotion) {
      throw new Error("Promotion not found");
    }

    if (promotion.status !== "enabled") {
      throw new Error("Promotion is not active");
    }

    const now = new Date();
    if (now < new Date(promotion.start_date) || now > new Date(promotion.end_date)) {
      throw new Error("Promotion is not currently active");
    }

    // Check player limit (24h)
    if (promotion.player_limit_24h > 0) {
      const last24hClaims = await db.query(
        `SELECT COUNT(DISTINCT player_id) as count
         FROM tbl_promotion_claims
         WHERE promotion_id = ?
           AND claimed_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
        [promotionId]
      );
      if (parseInt(last24hClaims?.count || 0) >= promotion.player_limit_24h) {
        throw new Error("Bonus limit reached for this promotion");
      }
    }

    // Check per-user per-day limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayClaims = await db.query(
      `SELECT COUNT(*) as count
       FROM tbl_promotion_claims
       WHERE promotion_id = ?
         AND player_id = ?
         AND DATE(claimed_at) = DATE(?)`,
      [promotionId, playerId, today]
    );
    if (parseInt(todayClaims?.count || 0) >= promotion.claims_per_user_per_day) {
      throw new Error("Bonus already taken for today");
    }

    // Get matching tier
    const tiers = await db.selectAll(
      "tbl_promotion_bonus_tiers",
      "*",
      "promotion_id = ?",
      [promotionId],
      "ORDER BY min_deposit ASC"
    );

    let matchingTier = null;
    for (const tier of tiers) {
      if (depositAmount >= tier.min_deposit && depositAmount <= tier.max_deposit) {
        matchingTier = tier;
        break;
      }
    }

    if (!matchingTier) {
      throw new Error("Deposit amount does not match any promotion tier");
    }

    // Record claim (claimed_by is optional - no foreign key needed)
    await db.insert("tbl_promotion_claims", {
      promotion_id: promotionId,
      player_id: playerId,
      transaction_id: transactionId,
      deposit_amount: depositAmount,
      bonus_amount: matchingTier.flat_bonus_amount,
      tier_id: matchingTier.tier_id,
      claimed_at: new Date(),
      claimed_by: userId || null // Make it nullable to avoid foreign key issues
    });

    return {
      promotion_id: promotionId,
      bonus_amount: matchingTier.flat_bonus_amount,
      message: "Bonus claimed successfully"
    };
  }

  /**
   * Update promotion
   */
  async updatePromotion(promotionId, data, userId) {
    const promotion = await db.select(
      "tbl_promotions",
      "*",
      "promotion_id = ?",
      [promotionId]
    );

    if (!promotion) {
      throw new Error("Promotion not found");
    }

    const updateData = {};
    if (data.promotion_name) updateData.promotion_name = data.promotion_name;
    if (data.status) updateData.status = data.status;
    if (data.start_date) updateData.start_date = new Date(data.start_date);
    if (data.end_date) updateData.end_date = new Date(data.end_date);
    if (data.user_type) updateData.user_type = data.user_type;
    if (data.player_limit_24h !== undefined) updateData.player_limit_24h = data.player_limit_24h;
    if (data.claims_per_user_per_day !== undefined) updateData.claims_per_user_per_day = data.claims_per_user_per_day;
    updateData.updated_at = new Date();

    await db.update(
      "tbl_promotions",
      updateData,
      "promotion_id = ?",
      [promotionId]
    );

    // Update tiers if provided
    if (data.bonus_tiers && data.bonus_tiers.length > 0) {
      // Delete existing tiers
      await db.delete("tbl_promotion_bonus_tiers", "promotion_id = ?", [promotionId]);

      // Insert new tiers
      for (const tier of data.bonus_tiers) {
        await db.insert("tbl_promotion_bonus_tiers", {
          promotion_id: promotionId,
          min_deposit: tier.min_deposit,
          max_deposit: tier.max_deposit,
          flat_bonus_amount: tier.flat_bonus_amount,
          created_at: new Date()
        });
      }
    }

    return {
      promotion_id: promotionId,
      message: "Promotion updated successfully"
    };
  }

  /**
   * Delete promotion
   */
  async deletePromotion(promotionId) {
    const promotion = await db.select(
      "tbl_promotions",
      "*",
      "promotion_id = ?",
      [promotionId]
    );

    if (!promotion) {
      throw new Error("Promotion not found");
    }

    // Delete tiers
    await db.delete("tbl_promotion_bonus_tiers", "promotion_id = ?", [promotionId]);

    // Delete promotion
    await db.delete("tbl_promotions", "promotion_id = ?", [promotionId]);

    return {
      message: "Promotion deleted successfully"
    };
  }

  /**
   * Get promotion by ID
   */
  async getPromotionById(promotionId) {
    const promotion = await db.select(
      "tbl_promotions",
      "*",
      "promotion_id = ?",
      [promotionId]
    );

    if (!promotion) {
      return null;
    }

    promotion.bonus_tiers = await db.selectAll(
      "tbl_promotion_bonus_tiers",
      "*",
      "promotion_id = ?",
      [promotionId],
      "ORDER BY min_deposit ASC"
    );

    return promotion;
  }
}

module.exports = new PromotionService();

