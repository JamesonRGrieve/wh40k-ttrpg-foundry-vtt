/**
 * Combat circumstance modifier registry (core.md §"Modifiers in Combat",
 * Table 7–5 Combat Circumstances Summary, p. 230).
 *
 * Each entry pins the canonical name, the modifier value, and which skill
 * the modifier targets so the roll dialog (and chat-card breakdown) can
 * apply them consistently. Cap enforcement (±60) lives in
 * `rules/roll-data.ts:clampModifierToCap` (#127).
 *
 * Wiring into the unified roll dialog as toggleable rows is tracked as a
 * follow-up under #121 (this commit lays the data foundation only).
 *
 * The list is intentionally exhaustive of the RAW table; the GM toggles
 * which apply per attack via the dialog. Several entries are conditional
 * (e.g. Cover targets evasion-test, not the attacker's BS) — see the
 * `appliesTo` field for each row.
 */

/** Which roll the modifier targets. */
export type CombatModifierTarget =
    /** Ballistic Skill (ranged attack). */
    | 'bs'
    /** Weapon Skill (melee attack). */
    | 'ws'
    /** Either BS or WS — caller picks based on attack type. */
    | 'bs-or-ws'
    /** Dodge / Parry / Evasion test by the defender. */
    | 'evasion'
    /** Stealth skill test. */
    | 'stealth';

export interface CombatCircumstanceModifier {
    /** Stable identifier (kebab-case). */
    id: string;
    /** Display name (matches RAW). */
    label: string;
    /** Signed modifier value (positive = bonus, negative = penalty). */
    value: number;
    /** Which roll this modifier targets. */
    appliesTo: CombatModifierTarget;
    /** Short rule reference (page / line citation). */
    source: string;
    /** Optional human-readable description / caveat. */
    note?: string;
}

/**
 * Canonical DH2 combat circumstance modifiers. Indexed by `id`.
 *
 * Order intentionally matches the RAW headers in core.md §"Modifiers in
 * Combat" so a reader can cross-walk this list to page 229–231 directly.
 */
export const COMBAT_CIRCUMSTANCE_MODIFIERS: readonly CombatCircumstanceModifier[] = [
    // Cover doesn't modify the BS test itself — hits to a concealed location
    // are absorbed by the cover's Armour. Listed here for discoverability;
    // value is 0 and the engine handles the AP redirect in damage-data.
    {
        id: 'cover',
        label: 'Cover',
        value: 0,
        appliesTo: 'bs',
        source: 'core.md p.229',
        note: 'Hits to concealed locations are absorbed by cover AP, not penalised at the BS test.',
    },
    { id: 'darkness-melee', label: 'Darkness (melee)', value: -20, appliesTo: 'ws', source: 'core.md p.229' },
    { id: 'darkness-ranged', label: 'Darkness (ranged)', value: -30, appliesTo: 'bs', source: 'core.md p.229' },
    { id: 'darkness-stealth', label: 'Darkness (stealth concealment)', value: 20, appliesTo: 'stealth', source: 'core.md p.229' },
    { id: 'difficult-terrain', label: 'Difficult Terrain (mud)', value: -10, appliesTo: 'ws', source: 'core.md p.229', note: 'Also applies to Evasion tests.' },
    { id: 'arduous-terrain', label: 'Arduous Terrain (snow / ice)', value: -30, appliesTo: 'ws', source: 'core.md p.229', note: 'Also applies to Evasion tests.' },
    {
        id: 'shooting-into-melee',
        label: 'Shooting into melee',
        value: -20,
        appliesTo: 'bs',
        source: 'core.md p.229',
        note: 'Ignored if any combatant in the melee is Stunned, Helpless, or Unaware.',
    },
    { id: 'extreme-range', label: 'Extreme Range (>3× weapon range)', value: -30, appliesTo: 'bs', source: 'core.md p.229' },
    { id: 'long-range', label: 'Long Range (>weapon range, ≤2×)', value: -10, appliesTo: 'bs', source: 'core.md p.230' },
    { id: 'short-range', label: 'Short Range (≤½ weapon range)', value: 10, appliesTo: 'bs', source: 'core.md p.230' },
    { id: 'point-blank-range', label: 'Point-Blank Range (≤2m)', value: 30, appliesTo: 'bs', source: 'core.md p.230', note: 'Not applied when attacker and target are engaged in melee.' },
    { id: 'fog-mist-smoke', label: 'Fog / Mist / Shadow / Smoke', value: -20, appliesTo: 'bs', source: 'core.md p.229' },
    { id: 'fog-stealth', label: 'Fog / Mist / Shadow (stealth)', value: 10, appliesTo: 'stealth', source: 'core.md p.229' },
    { id: 'ganging-up-2-1', label: 'Ganging Up (2:1 outnumber)', value: 10, appliesTo: 'ws', source: 'core.md p.229' },
    { id: 'ganging-up-3-1', label: 'Ganging Up (3:1 outnumber)', value: 20, appliesTo: 'ws', source: 'core.md p.229', note: 'Replaces the 2:1 bonus; does not stack.' },
    {
        id: 'helpless-target',
        label: 'Helpless Target',
        value: 0,
        appliesTo: 'ws',
        source: 'core.md p.229',
        note: 'WS auto-succeeds with DoS = WS bonus; damage dice rolled twice and summed. Not a flat modifier.',
    },
    { id: 'higher-ground', label: 'Higher Ground', value: 10, appliesTo: 'ws', source: 'core.md p.230' },
    { id: 'prone-attacker-melee', label: 'Attacking from Prone (melee)', value: -10, appliesTo: 'ws', source: 'core.md p.230' },
    { id: 'prone-attacker-evasion', label: 'Evasion while Prone', value: -20, appliesTo: 'evasion', source: 'core.md p.230' },
    { id: 'prone-target-melee', label: 'Target is Prone (melee attack)', value: 10, appliesTo: 'ws', source: 'core.md p.230' },
    {
        id: 'prone-target-ranged',
        label: 'Target is Prone (ranged attack)',
        value: -10,
        appliesTo: 'bs',
        source: 'core.md p.230',
        note: 'Not applied at Point-Blank range.',
    },
    { id: 'stunned-target', label: 'Stunned Target', value: 20, appliesTo: 'bs-or-ws', source: 'core.md p.230' },
    { id: 'unaware-target', label: 'Unaware / Surprised Target', value: 30, appliesTo: 'bs-or-ws', source: 'core.md p.231' },
    // Size modifiers are a lookup-table (Table 4-6 p.138), not a single
    // constant. Surface the placeholder entries here so the dialog can
    // render a Size dropdown that selects the appropriate row.
    { id: 'size-miniscule', label: 'Target Size: Miniscule (1)', value: -30, appliesTo: 'bs-or-ws', source: 'core.md p.138, Table 4-6' },
    { id: 'size-puny', label: 'Target Size: Puny (2)', value: -20, appliesTo: 'bs-or-ws', source: 'core.md p.138, Table 4-6' },
    { id: 'size-scrawny', label: 'Target Size: Scrawny (3)', value: -10, appliesTo: 'bs-or-ws', source: 'core.md p.138, Table 4-6' },
    { id: 'size-average', label: 'Target Size: Average (4)', value: 0, appliesTo: 'bs-or-ws', source: 'core.md p.138, Table 4-6' },
    { id: 'size-hulking', label: 'Target Size: Hulking (5)', value: 10, appliesTo: 'bs-or-ws', source: 'core.md p.138, Table 4-6' },
    { id: 'size-enormous', label: 'Target Size: Enormous (6)', value: 20, appliesTo: 'bs-or-ws', source: 'core.md p.138, Table 4-6' },
    { id: 'size-massive', label: 'Target Size: Massive (7)', value: 30, appliesTo: 'bs-or-ws', source: 'core.md p.138, Table 4-6' },
];

/** O(1) lookup by id. Frozen at module load. */
const MODIFIERS_BY_ID: ReadonlyMap<string, CombatCircumstanceModifier> = new Map(COMBAT_CIRCUMSTANCE_MODIFIERS.map((m) => [m.id, m]));

/** Resolve a modifier by id; returns `undefined` for unknown ids. */
export function getCombatModifier(id: string): CombatCircumstanceModifier | undefined {
    return MODIFIERS_BY_ID.get(id);
}

/** Filter the registry to entries that target a specific roll. */
export function getCombatModifiersForTarget(target: CombatModifierTarget): readonly CombatCircumstanceModifier[] {
    return COMBAT_CIRCUMSTANCE_MODIFIERS.filter((m) => m.appliesTo === target || m.appliesTo === 'bs-or-ws');
}

/**
 * Sum a list of selected modifier ids into a raw total. Unknown ids are
 * skipped (returning 0 contribution). Cap enforcement is the caller's
 * responsibility — pipe the result through
 * `rules/roll-data.ts:clampModifierToCap`.
 */
export function sumSelectedCombatModifiers(selectedIds: readonly string[]): number {
    let total = 0;
    for (const id of selectedIds) {
        const mod = MODIFIERS_BY_ID.get(id);
        if (mod !== undefined) total += mod.value;
    }
    return total;
}
