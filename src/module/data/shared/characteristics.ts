/**
 * Canonical characteristic short→full key map (#271).
 *
 * Core Rulebook characteristic abbreviations (`WS`, `BS`, …) → the full schema
 * keys (`weaponSkill`, …). Previously declared twice — `CreatureTemplate`
 * (missing `Inf`) and `npc-import-migration` (with `Inf`) — which drifted; this
 * is the single superset both import.
 */
export const CHARACTERISTIC_SHORT_TO_FULL: Record<string, string> = {
    WS: 'weaponSkill',
    BS: 'ballisticSkill',
    S: 'strength',
    T: 'toughness',
    Ag: 'agility',
    Int: 'intelligence',
    Per: 'perception',
    WP: 'willpower',
    Fel: 'fellowship',
    Inf: 'influence',
};
