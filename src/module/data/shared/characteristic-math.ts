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
}

/**
 * Compute a characteristic's `total` and unnatural-adjusted `bonus`.
 * `extra` folds in the PC-only `advance*5 - damage` term (NPCs pass `0`).
 * Bonus is the tens digit, multiplied by the Unnatural level when ≥ 2.
 */
export function computeCharacteristicTotals(base: number, modifier: number, unnatural: number, extra = 0): { total: number; bonus: number } {
    const total = base + modifier + extra;
    const baseBonus = Math.floor(total / 10);
    const bonus = unnatural >= 2 ? baseBonus * unnatural : baseBonus;
    return { total, bonus };
}

/**
 * Spread characteristics into a roll-data bag: `<short>` and `<key>` → total,
 * `<short>B` → bonus. The identical loop in both models' `getRollData()`.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry roll-data is a free-form Record<string, unknown> bag the consumer mutates
export function applyCharacteristicRollData(data: Record<string, unknown>, characteristics: Record<string, CharacteristicLike>): void {
    for (const [key, char] of Object.entries(characteristics)) {
        data[char.short] = char.total;
        data[`${char.short}B`] = char.bonus;
        data[key] = char.total;
    }
}
