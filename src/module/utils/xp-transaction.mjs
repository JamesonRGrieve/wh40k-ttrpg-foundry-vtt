/**
 * XP Transaction Utility
 * 
 * Handles XP spending for character advancements.
 * Provides validation and atomic updates to actor experience.
 */

/**
 * @typedef {Object} TransactionResult
 * @property {boolean} success - Whether the transaction succeeded
 * @property {string} [error] - Error message if failed
 * @property {number} [newAvailable] - New available XP after transaction
 */

/**
 * Get the available XP for an actor
 * @param {Actor} actor - The actor to check
 * @returns {number} Available XP
 */
export function getAvailableXP(actor) {
  const experience = actor.system?.experience;
  if (!experience) return 0;
  
  // Available = total - used
  return (experience.total ?? 0) - (experience.used ?? 0);
}

/**
 * Check if an actor can afford an XP cost
 * @param {Actor} actor - The actor to check
 * @param {number} cost - The XP cost
 * @returns {boolean}
 */
export function canAfford(actor, cost) {
  return getAvailableXP(actor) >= cost;
}

/**
 * Spend XP for an advancement
 * Updates the actor's experience.used field
 * 
 * @param {Actor} actor - The actor spending XP
 * @param {number} cost - The XP cost
 * @param {string} [reason] - Optional reason for the transaction (for logging)
 * @returns {Promise<TransactionResult>}
 */
export async function spendXP(actor, cost, reason = '') {
  // Validate inputs
  if (!actor) {
    return { success: false, error: 'No actor provided' };
  }
  
  if (cost <= 0) {
    return { success: false, error: 'Invalid cost: must be positive' };
  }

  const available = getAvailableXP(actor);
  
  if (available < cost) {
    return { 
      success: false, 
      error: game.i18n.format('RT.Advancement.Error.InsufficientXP', {
        cost,
        available
      })
    };
  }

  try {
    // Calculate new used value
    const currentUsed = actor.system.experience.used ?? 0;
    const newUsed = currentUsed + cost;

    // Update the actor
    await actor.update({
      'system.experience.used': newUsed
    });

    // Log the transaction
    if (reason) {
      console.log(`XP Transaction: ${actor.name} spent ${cost} XP on ${reason}. Available: ${available - cost}`);
    }

    return {
      success: true,
      newAvailable: available - cost
    };

  } catch (error) {
    console.error('XP Transaction failed:', error);
    return {
      success: false,
      error: game.i18n.localize('RT.Advancement.Error.TransactionFailed')
    };
  }
}

/**
 * Batch spend XP for multiple purchases
 * All purchases succeed or all fail (atomic)
 * 
 * @param {Actor} actor - The actor spending XP
 * @param {Array<{cost: number, reason: string}>} purchases - Array of purchases
 * @returns {Promise<TransactionResult>}
 */
export async function spendXPBatch(actor, purchases) {
  if (!actor || !purchases?.length) {
    return { success: false, error: 'Invalid arguments' };
  }

  // Calculate total cost
  const totalCost = purchases.reduce((sum, p) => sum + (p.cost ?? 0), 0);
  const available = getAvailableXP(actor);

  if (available < totalCost) {
    return {
      success: false,
      error: game.i18n.format('RT.Advancement.Error.InsufficientXP', {
        cost: totalCost,
        available
      })
    };
  }

  try {
    const currentUsed = actor.system.experience.used ?? 0;
    const newUsed = currentUsed + totalCost;

    await actor.update({
      'system.experience.used': newUsed
    });

    // Log all purchases
    const reasons = purchases.map(p => p.reason).filter(Boolean).join(', ');
    console.log(`XP Batch Transaction: ${actor.name} spent ${totalCost} XP on [${reasons}]. Available: ${available - totalCost}`);

    return {
      success: true,
      newAvailable: available - totalCost
    };

  } catch (error) {
    console.error('XP Batch Transaction failed:', error);
    return {
      success: false,
      error: game.i18n.localize('RT.Advancement.Error.TransactionFailed')
    };
  }
}

/**
 * Get XP spending summary for an actor
 * @param {Actor} actor - The actor to check
 * @returns {Object} Summary of XP allocation
 */
export function getXPSummary(actor) {
  const exp = actor.system?.experience ?? {};
  
  return {
    total: exp.total ?? 0,
    used: exp.used ?? 0,
    available: getAvailableXP(actor),
    spentOnCharacteristics: exp.spentCharacteristics ?? 0,
    spentOnSkills: exp.spentSkills ?? 0,
    spentOnTalents: exp.spentTalents ?? 0,
    spentOnPsychicPowers: exp.spentPsychicPowers ?? 0
  };
}

/**
 * Calculate the total XP cost of a list of advancements
 * @param {Array<{cost: number}>} advancements - List of advancements
 * @returns {number} Total cost
 */
export function calculateTotalCost(advancements) {
  if (!advancements?.length) return 0;
  return advancements.reduce((sum, adv) => sum + (adv.cost ?? 0), 0);
}
