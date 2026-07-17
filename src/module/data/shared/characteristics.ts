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
    // Imperium Maledictum (Cubicle 7) abbreviates the same 9 characteristics
    // differently (Str/Tgh/Wil vs the FFG S/T/WP); map them to the same full
    // schema keys so IM statblock Strength/Toughness/Willpower are not dropped.
    Str: 'strength',
    Tgh: 'toughness',
    Wil: 'willpower',
};

/** One characteristic's canonical identity: schema key, display label, short code. */
export interface CharacteristicDef {
    /** Full schema key, e.g. `weaponSkill`. */
    key: string;
    /** Display label, e.g. `Weapon Skill`. */
    label: string;
    /** Short code, e.g. `WS`. */
    short: string;
}

/**
 * Canonical ordered characteristic table (#464). The single source the four
 * DataModels that enumerate characteristics (creature / NPC / vehicle schemas
 * and the NPC-template generator) map over instead of each hand-listing the
 * key → label → short triple — a duplication that had already drifted (`vehicle`
 * omitted `influence`). `influence` is last; models with no Influence
 * characteristic (creature, vehicle) exclude it via
 * `buildCharacteristicFields({ includeInfluence: false })`.
 */
export const CHARACTERISTICS: readonly CharacteristicDef[] = [
    { key: 'weaponSkill', label: 'Weapon Skill', short: 'WS' },
    { key: 'ballisticSkill', label: 'Ballistic Skill', short: 'BS' },
    { key: 'strength', label: 'Strength', short: 'S' },
    { key: 'toughness', label: 'Toughness', short: 'T' },
    { key: 'agility', label: 'Agility', short: 'Ag' },
    { key: 'intelligence', label: 'Intelligence', short: 'Int' },
    { key: 'perception', label: 'Perception', short: 'Per' },
    { key: 'willpower', label: 'Willpower', short: 'WP' },
    { key: 'fellowship', label: 'Fellowship', short: 'Fel' },
    { key: 'influence', label: 'Influence', short: 'Inf' },
] as const;

/**
 * Build a `{ key → DataField }` characteristics schema block by mapping the
 * canonical {@link CHARACTERISTICS} table through a per-model field factory
 * (#464). `includeInfluence` defaults `true` (NPC schema); creature and vehicle
 * pass `false` — they carry no Influence characteristic. Runtime output is
 * byte-identical to each model's former hand-listed literal.
 */
export function buildCharacteristicFields<F>(fieldFn: (label: string, short: string) => F, options: { includeInfluence?: boolean } = {}): Record<string, F> {
    const { includeInfluence = true } = options;
    const block: Record<string, F> = {};
    for (const c of CHARACTERISTICS) {
        if (!includeInfluence && c.key === 'influence') continue;
        block[c.key] = fieldFn(c.label, c.short);
    }
    return block;
}
