/**
 * Charge (#806).
 *
 * Every line's Charge: a Full Action that moves up to the Charge Move and makes one
 * melee attack at +20. The target must be at least four metres away and within the
 * Charge Move; the last four metres are a straight line. Operator (2026-11-24): Charge
 * is declared before moving; choosing it against an enemy in range moves the attacker
 * into contact as part of the attack, and the target list greys out the enemies a
 * charge can't reach.
 *
 * Pure: whether a target is in charge range, and where the charger ends up.
 */
import type { EngagementToken } from './engagement.ts';

/** The closest a charge target may be, in metres. */
const CHARGE_MINIMUM_METRES = 4;

/** Whether a target at `distance` metres can be charged with a Charge Move of `chargeMove` metres. */
export type ChargeReach = 'in-range' | 'too-close' | 'too-far';

export function chargeReach(distance: number, chargeMove: number): ChargeReach {
    if (distance < CHARGE_MINIMUM_METRES) return 'too-close';
    if (distance > chargeMove) return 'too-far';
    return 'in-range';
}

/**
 * Where the charger stops: the grid position in contact with the target, on the
 * target's side facing the charger (so the last stretch runs straight at it). Pixel
 * origin of the charger's token, snapped to the grid.
 */
export function chargeContactPosition(charger: EngagementToken, target: EngagementToken, gridSize: number): { x: number; y: number } {
    const size = gridSize > 0 ? gridSize : 1;
    const w = Math.max(1, Math.round(charger.width));
    const h = Math.max(1, Math.round(charger.height));
    const tCol0 = Math.floor((target.x + 1) / size);
    const tRow0 = Math.floor((target.y + 1) / size);
    const tCol1 = tCol0 + Math.max(1, Math.round(target.width)) - 1;
    const tRow1 = tRow0 + Math.max(1, Math.round(target.height)) - 1;
    const fromCol = charger.x / size;
    const fromRow = charger.y / size;
    let best = { col: tCol0 - w, row: tRow0, d: Infinity };
    // Every origin that puts the charger's footprint next to the target's, without overlap.
    for (let col = tCol0 - w; col <= tCol1 + 1; col += 1) {
        for (let row = tRow0 - h; row <= tRow1 + 1; row += 1) {
            const overlaps = col + w - 1 >= tCol0 && col <= tCol1 && row + h - 1 >= tRow0 && row <= tRow1;
            if (overlaps) continue;
            const d = Math.hypot(col - fromCol, row - fromRow);
            if (d < best.d) best = { col, row, d };
        }
    }
    return { x: best.col * size, y: best.row * size };
}
