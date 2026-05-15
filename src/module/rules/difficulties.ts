/**
 * Canonical DH2 difficulty ladder (core.md §"Test Difficulty"). Keyed by
 * modifier string for stable dropdown ordering; values are localised
 * labels suitable for display in roll dialogs.
 *
 * Range: Trivial (+60) through Hellish (−60). Some product lines also
 * include Infernal (−70) — not RAW in DH2 core, so omitted here. If a
 * sibling system needs it, surface it via a per-system override rather
 * than amending this baseline.
 */
export function rollDifficulties(): Record<string, string> {
    return {
        '0': 'Challenging (+0)',
        '60': 'Trivial (+60)',
        '50': 'Elementary (+50)',
        '40': 'Simple (+40)',
        '30': 'Easy (+30)',
        '20': 'Routine (+20)',
        '10': 'Ordinary (+10)',
        '-10': 'Difficult (-10)',
        '-20': 'Hard (-20)',
        '-30': 'Very Difficult (-30)',
        '-40': 'Arduous (-40)',
        '-50': 'Punishing (-50)',
        '-60': 'Hellish (-60)',
    };
}
