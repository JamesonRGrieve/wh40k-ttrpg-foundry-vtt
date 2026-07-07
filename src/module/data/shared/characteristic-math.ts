/**
 * Pure characteristic math shared by `CreatureTemplate` (PC path) and `NPCData`
 * (#271). Both computed `total`/`bonus` and spread characteristics into roll data
 * with the same formulas; only the PC-only `advance*5 - damage` term differed.
 */

/** A characteristic's roll-relevant projection. */
export interface CharacteristicLike {
    short: string;
    total: number;
    bonus: number;
    /**
     * Post-modifier characteristic value used by outcome math (#415). Equals
     * `total`; a named alias so the base-vs-effective split reads explicitly at
     * consumer sites. Optional so NPC/vehicle projections that don't populate it
     * fall back to `total`.
     */
    effectiveValue?: number;
    /**
     * Effective characteristic bonus = base bonus (tens digit of the effective
     * value) + bonus-only modifiers ("+X Strength Bonus"). Damage / carry /
     * movement read this (#415). Optional; falls back to `bonus` when absent.
     */
    effectiveBonus?: number;
}

/**
 * The base-vs-effective projection a prepared characteristic carries (#415).
 * `total`/`bonus` remain the effective value and base bonus; the added fields
 * name the split explicitly and open a bonus-only modifier channel.
 */
export interface EffectiveCharacteristicFields {
    total: number;
    bonus: number;
    /** Alias of `total` — the post-modifier characteristic value. */
    effectiveValue: number;
    /** Sum of bonus-only modifiers ("+X Bonus" effects); 0 when none. */
    bonusModifier: number;
    /** `bonus` + `bonusModifier`. */
    effectiveBonus: number;
}

/**
 * Populate the derived base-vs-effective fields on a prepared characteristic
 * from its already-computed `total`/`bonus` (#415). `effectiveValue` mirrors the
 * effective `total`; `effectiveBonus` adds the bonus-only modifier channel on top
 * of the base bonus. Shared by the creature (item-modifier), NPC, and vehicle
 * prepare passes so the split stays homologated. `bonusModifier` defaults to 0
 * for models with no bonus-only channel.
 */
export function applyEffectiveCharacteristicFields(char: EffectiveCharacteristicFields, bonusModifier = 0): void {
    char.effectiveValue = char.total;
    char.bonusModifier = bonusModifier;
    char.effectiveBonus = char.bonus + bonusModifier;
}

/**
 * Compute a characteristic's `total` and unnatural-adjusted `bonus`.
 * `extra` folds in the PC-only `advance*5 - damage` term (NPCs pass `0`); the
 * post-item recompute additionally folds in its item/origin-path modifier here.
 * When `clampTotalToZero` is set, the total floors at 0 before the bonus is
 * derived (a characteristic cannot drop below 0 once item modifiers land).
 * Bonus is the tens digit, multiplied by the Unnatural level when ≥ 2.
 */
export function computeCharacteristicTotals(
    base: number,
    modifier: number,
    unnatural: number,
    extra = 0,
    clampTotalToZero = false,
): { total: number; bonus: number } {
    const rawTotal = base + modifier + extra;
    const total = clampTotalToZero ? Math.max(0, rawTotal) : rawTotal;
    const baseBonus = Math.floor(total / 10);
    const bonus = unnatural >= 2 ? baseBonus * unnatural : baseBonus;
    return { total, bonus };
}

/**
 * Spread characteristics into a roll-data bag: `<short>` and `<key>` → effective
 * value, `<short>B` → effective bonus. The identical loop in both models'
 * `getRollData()`. Outcome formulas read the effective value/bonus (#415), so a
 * fatigue / trait / drug modifier flows in implicitly; models that don't populate
 * the effective fields fall back to `total`/`bonus` (behaviour-preserving).
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry roll-data is a free-form Record<string, unknown> bag the consumer mutates
export function applyCharacteristicRollData(data: Record<string, unknown>, characteristics: Record<string, CharacteristicLike>): void {
    for (const [key, char] of Object.entries(characteristics)) {
        const value = char.effectiveValue ?? char.total;
        data[char.short] = value;
        data[`${char.short}B`] = char.effectiveBonus ?? char.bonus;
        data[key] = value;
    }
}
