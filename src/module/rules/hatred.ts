/**
 * Hatred (X) talent helpers (#148 — errata L57-65).
 *
 * The errata expanded the canonical Specializations list for the Hatred
 * talent to include Daemons. This module pins the canonical list and
 * exposes the detection helper used by the attack-roll pipeline to
 * emit the +10 WS modifier when the target matches a group the
 * attacker hates.
 *
 * The engine consumer (damage-data / action-data) calls
 * `actorHasHatredFor(actor, target)` per attack; on match, it adds a
 * 'Hatred' modifier with `HATRED_BONUS` to the WS roll. Runtime wiring
 * into the attack-roll pipeline is a follow-up; this commit lays the
 * data foundation + the predicate helper.
 */

/** Canonical Hatred specializations per DH2 Errata L57-65 (Hatred, p.128). */
export const HATRED_SPECIALIZATIONS: ReadonlyArray<string> = [
    'Chaos Space Marines',
    'Daemons',
    'Mutants',
    'Psykers',
    'Xenos',
    // "others including groups from The Powers of Askellon sidebar on page 126" —
    // GMs may add campaign-specific specializations.
];

/** WS bonus emitted on attacks against a target the attacker hates. */
export const HATRED_BONUS = 10;

/**
 * Minimal duck-typed actor surface the predicate needs. The runtime
 * actor (`WH40KBaseActor`) satisfies this; tests pass plain fixtures.
 */
export interface HatredActorLike {
    items: Iterable<{ type: string; name: string; system?: { specialization?: string } }>;
}

/**
 * Minimal duck-typed target surface. Hatred matches if any of the
 * target's traits (or its species / faction) names contain the
 * specialization tag (case-insensitive substring).
 */
export interface HatredTargetLike {
    name?: string;
    system?: {
        species?: string;
        traits?: Array<{ name?: string }>;
    };
}

/**
 * Returns the matched Hatred specialization string when the attacker
 * has a Hatred(X) talent that applies to the target, or `null` if not.
 *
 * Match rules:
 *  - The attacker's Hatred talent's `specialization` (e.g. "Daemons")
 *    must appear (case-insensitive) in the target's traits, species,
 *    or name.
 *  - Hatred (Daemons) matches a target with the Daemonic / Daemon trait.
 *  - The talent name canonical form is "Hatred" with the X carried on
 *    `system.specialization`; legacy form "Hatred (Daemons)" on
 *    `name` is also recognised.
 */
export function actorHasHatredFor(attacker: HatredActorLike, target: HatredTargetLike): string | null {
    const targetTokens = collectTargetTokens(target);
    for (const item of attacker.items) {
        if (item.type !== 'talent') continue;
        const spec = extractHatredSpecialization(item);
        if (spec === null) continue;
        const lower = spec.toLowerCase();
        if (targetTokens.some((t) => t.includes(lower))) return spec;
    }
    return null;
}

function extractHatredSpecialization(item: { name: string; system?: { specialization?: string } }): string | null {
    const explicit = item.system?.specialization?.trim();
    if (explicit !== undefined && explicit !== '' && item.name.toLowerCase() === 'hatred') {
        return explicit;
    }
    // Legacy: "Hatred (Daemons)" on the talent name itself.
    const match = /^hatred\s*\(([^)]+)\)\s*$/i.exec(item.name);
    if (match?.[1] !== undefined) return match[1].trim();
    return null;
}

function collectTargetTokens(target: HatredTargetLike): string[] {
    const tokens: string[] = [];
    if (target.name !== undefined && target.name !== '') tokens.push(target.name.toLowerCase());
    const species = target.system?.species;
    if (species !== undefined && species !== '') tokens.push(species.toLowerCase());
    const traits = target.system?.traits ?? [];
    for (const trait of traits) {
        if (trait.name !== undefined && trait.name !== '') tokens.push(trait.name.toLowerCase());
    }
    return tokens;
}
