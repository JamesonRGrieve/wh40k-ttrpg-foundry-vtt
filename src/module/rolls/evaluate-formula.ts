/**
 * Pure formula-evaluation helper (#280).
 *
 * Centralizes the `new Roll(formula, params); await roll.evaluate(); roll.total ?? 0`
 * boilerplate (including swallow-to-zero error handling) used across roll
 * resolution. Kept in its own dependency-free module rather than `roll-helpers.ts`
 * so the per-roll hot path (`roll-data.ts`) can import it without forming an
 * import cycle (`roll-helpers` → `action-data` → … → `roll-data`).
 */

/**
 * Evaluate a dice / arithmetic formula and return its numeric total, or `0` if
 * the formula is invalid or fails to evaluate.
 */
export async function evaluateFormula(formula: string, params: Record<string, number> = {}): Promise<number> {
    try {
        const roll = new Roll(formula, params);
        await roll.evaluate();
        return roll.total ?? 0;
    } catch {
        return 0;
    }
}
