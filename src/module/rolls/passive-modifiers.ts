/**
 * Passive (always-on) modifier rows for the roll dialog (#484).
 *
 * Talents, traits, curses/malignancies, drug/active effects and conditions all
 * fold their flat numeric modifiers into an actor's characteristic / skill /
 * combat values through `creature.ts _applyItemModifiers`, which also records the
 * provenance (`{ name, type, value }`) in `actor.system.modifierSources`. The
 * Roll Test dialog surfaces those contributions as READ-ONLY rows so a player can
 * see WHY the target number is what it is — they are already baked into the base
 * target and are therefore never re-summed (that would double-count).
 *
 * The selection is a pure function so the display is unit-tested independently of
 * the dialog: a bucket/key mismatch here is the exact "the +20 is applied but
 * shows up nowhere" failure #484 tracks, and it must be caught by a runnable test
 * rather than only the licensed Tier-B suite.
 */

/** One passive modifier as `creature.ts _applyItemModifiers` writes it. Internal
 *  to this module — `ModifierSourcesShape` is the exported surface. */
interface PassiveModifierEntry {
    name?: string;
    type?: string;
    value?: number;
}

/** `actor.system.modifierSources` — per-bucket passive provenance (#484). */
export interface ModifierSourcesShape {
    characteristics?: Record<string, PassiveModifierEntry[] | undefined> | undefined;
    skills?: Record<string, PassiveModifierEntry[] | undefined> | undefined;
    combat?: Record<string, PassiveModifierEntry[] | undefined> | undefined;
}

/** A read-only passive row rendered in the modifiers panel (#484). */
export interface PassiveModifierRow {
    label: string;
    value: number;
    valueLabel: string;
    type: string;
}

/**
 * The always-on `modifiers.combat.<key>` contributions (Path A) as a roll modifier
 * map, one entry per contributing item keyed by its name, so each lands on the roll
 * card as its own sourced row rather than an unexplained total. Unlike the
 * characteristic / skill buckets, combat modifiers (to-hit, damage, penetration) are
 * NOT baked into any base value the roll starts from, so the roll must add them —
 * this is the read the roll / damage paths use to do so. Two entries sharing a name
 * are summed rather than one overwriting the other; zero-valued entries are dropped.
 *
 * @param sources  the actor's `system.modifierSources`, or `undefined`.
 * @param key      the combat key (`'attack'` / `'damage'` / `'penetration'`).
 */
export function passiveCombatModifiers(sources: ModifierSourcesShape | undefined, key: string): Record<string, number> {
    const totals: Record<string, number> = {};
    for (const entry of sources?.combat?.[key] ?? []) {
        if (typeof entry.value !== 'number' || entry.value === 0) continue;
        const label = entry.name ?? key;
        totals[label] = (totals[label] ?? 0) + entry.value;
    }
    return totals;
}

/** The `modifierSources` bucket a roll of the given `type` reads from. */
function bucketForType(type: string, sources: ModifierSourcesShape): Record<string, PassiveModifierEntry[] | undefined> | undefined {
    if (type === 'Skill') return sources.skills;
    if (type === 'Characteristic') return sources.characteristics;
    return sources.combat;
}

/**
 * The read-only passive-modifier rows for a roll — the always-on contributions
 * to `rollKey` from the bucket matching `type`. Empty when the roll has no key,
 * no provenance was recorded, or every entry is zero-valued.
 *
 * @param type     the roll's `type` (`'Skill'` / `'Characteristic'` / a combat type).
 * @param rollKey  the rolled key (e.g. `'medicae'`, `'weaponSkill'`).
 * @param sources  the actor's `system.modifierSources`, or `undefined`.
 */
export function selectPassiveModifierRows(type: string, rollKey: string, sources: ModifierSourcesShape | undefined): PassiveModifierRow[] {
    if (rollKey === '' || sources === undefined) return [];
    const entries = bucketForType(type, sources)?.[rollKey];
    if (entries === undefined) return [];
    return entries
        .filter((entry): entry is PassiveModifierEntry & { value: number } => typeof entry.value === 'number' && entry.value !== 0)
        .map((entry) => ({
            label: entry.name ?? '',
            value: entry.value,
            valueLabel: '–',
            type: entry.type ?? '',
        }));
}
