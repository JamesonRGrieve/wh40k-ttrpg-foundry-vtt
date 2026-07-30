/**
 * Scatter diagram resolver (#112 — core.md L10532-10548).
 *
 * Failed ranged / thrown attacks scatter per the canonical diagram:
 * direction = 1d10 (clock-face, with 12 implied; we use 1..10 per RAW),
 * distance = 1d5 metres. Blast and Spray template misses also scatter.
 *
 * Pure: takes (direction, distance) inputs and validates / normalises
 * them. Caller rolls the dice (e.g. via Foundry's Roll class) and
 * passes the integers here for cleanup and downstream consumption
 * (chat-card vector display, secondary-target damage emission).
 */

/**
 * Direction values per the RAW scatter diagram. 1..10 where 1 is
 * "behind the firer" and increases clockwise around the clock face.
 */
export type ScatterDirection = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface ScatterVector {
    /** Direction 1..10. */
    direction: ScatterDirection;
    /** Distance in metres, 1..5. */
    metres: number;
}

/**
 * Build a ScatterVector from caller-rolled inputs. Direction is clamped
 * into 1..10; metres is clamped into 1..5. Non-finite values default
 * to direction 1 / metres 1.
 */
export function buildScatterVector(direction: number, metres: number): ScatterVector {
    const d = clampScatterDirection(direction);
    const m = clampScatterMetres(metres);
    return { direction: d, metres: m };
}

function clampScatterDirection(value: number): ScatterDirection {
    const v = Number.isFinite(value) ? Math.trunc(value) : 1;
    if (v <= 1) return 1;
    if (v >= 10) return 10;
    return v as ScatterDirection;
}

function clampScatterMetres(value: number): number {
    const v = Number.isFinite(value) ? Math.trunc(value) : 1;
    if (v <= 1) return 1;
    if (v >= 5) return 5;
    return v;
}

/**
 * Doubled distance for Blast / Spray template misses per RAW
 * (area weapons scatter farther on miss). Caller passes the
 * already-rolled metres and gets the doubled value (capped at 10,
 * which is the practical engine ceiling for a single template miss).
 */
export function scaleScatterForArea(metres: number): number {
    const m = clampScatterMetres(metres);
    return Math.min(10, m * 2);
}

/**
 * Convenience: the canonical scatter diagram has 10 directions; this
 * is the cardinal-vector mapping used by chat-card display layers.
 * Index = direction−1 (so DIRECTION_LABELS[0] is direction 1).
 */
export const DIRECTION_LABELS: ReadonlyArray<string> = [
    'Behind (1)',
    'Behind-Right (2)',
    'Right-Behind (3)',
    'Right (4)',
    'Right-Forward (5)',
    'Forward-Right (6)',
    'Forward (7)',
    'Forward-Left (8)',
    'Left-Forward (9)',
    'Left (10)',
];

/** Resolve the human-readable label for a direction roll. */
export function labelForDirection(direction: ScatterDirection): string {
    return DIRECTION_LABELS[direction - 1] ?? 'Unknown';
}

/**
 * A synchronous source of a uniform draw in `[0, 1)`. Injectable so the
 * scatter roll is deterministic under test; the chat-card call sites use
 * the default.
 */
export type ScatterRng = () => number;

/** Roll a scatter direction on the canonical 1..10 diagram. */
export function rollScatterDirection(rng: ScatterRng = Math.random): ScatterDirection {
    return clampScatterDirection(Math.floor(rng() * 10) + 1);
}

/**
 * Roll a scatter direction and return its display label — the form the
 * chat-card deviation effects embed ("…deviates 1d5m off course to
 * {@link DIRECTION_LABELS}[n]!").
 *
 * This is the ONE scatter direction resolver. `rolls/damage-data.ts` used
 * to carry a second copy that mapped the same 1d10 onto absolute compass
 * points ('north west', 'south east', …); it collapsed 6+7 and 9+10 onto
 * one label each, so only 8 of the 10 diagram directions were reachable,
 * and a compass bearing is meaningless for a diagram RAW defines relative
 * to the firer's line of fire. Both roll sites now come here.
 */
export function scatterDirection(rng: ScatterRng = Math.random): string {
    return labelForDirection(rollScatterDirection(rng));
}
