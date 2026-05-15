/**
 * Disposition test helpers (core.md §"Disposition", p. 277).
 *
 * Disposition runs −3 (Hostile) through +3 (Helpful). It modifies
 * social-skill tests (Charm / Command / Intimidate / Deceive / Inquiry)
 * by ±10 per step in the direction of the test.
 *
 * The "direction of the test" matters: Charm pushes disposition up,
 * Intimidate pushes it down. The result interpretation depends on the
 * skill — this module just exposes the numeric modifier.
 */

export type DispositionLabel = 'Hostile' | 'Antagonistic' | 'Wary' | 'Neutral' | 'Cooperative' | 'Friendly' | 'Helpful';

export const DISPOSITION_LABELS: ReadonlyArray<DispositionLabel> = ['Hostile', 'Antagonistic', 'Wary', 'Neutral', 'Cooperative', 'Friendly', 'Helpful'];

/** Map −3..+3 to the canonical label. */
export function labelForDisposition(value: number): DispositionLabel {
    const idx = Math.max(0, Math.min(6, Math.trunc(value) + 3));
    return DISPOSITION_LABELS[idx] ?? 'Neutral';
}

/**
 * Modifier applied to a social-skill test made against this NPC.
 * Positive disposition makes Charm / Command / Inquiry easier, and
 * Intimidate harder (NPC resists harder when friendly). Reverse for
 * negative disposition.
 *
 * @param disposition NPC's −3..+3 disposition.
 * @param skill which social skill is being attempted.
 */
export function getDispositionModifier(disposition: number, skill: 'charm' | 'command' | 'inquiry' | 'deceive' | 'intimidate'): number {
    const d = Math.max(-3, Math.min(3, Math.trunc(disposition)));
    if (skill === 'intimidate') return -d * 10;
    return d * 10;
}
