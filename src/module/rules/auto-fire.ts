/**
 * @file Auto-fire burst resolution — shots fired vs hits scored (#510, #511, #512).
 *
 * DH2 core ch. VII gives a burst three separate numbers, and the system used to
 * collapse them into one (`rollData.fireRate`), which is where all three bugs
 * came from:
 *
 *   1. HOW MANY ROUNDS LEAVE THE GUN. Ch. V, Rate of Fire: the RoF entry is
 *      the ammunition a firing mode consumes; ch. V, Indirect, confirms a burst
 *      spends its full count even when shots miss. Storm doubles the ammunition
 *      used.
 *   2. HOW MANY HITS THE ROLL EARNS. Semi-Auto: one hit for passing, then one
 *      more per two further DoS. Full Auto: one hit per DoS. Suppressing Fire
 *      uses the two-DoS progression whichever mode was fired.
 *   3. THE CEILING ON HITS. Hits are capped at the mode's rate of fire. WHAT is
 *      capped, and whether Storm lifts the cap, differ per line (#607) — see
 *      {@link BurstCapRules}; each game-system config carries its line's rule.
 *
 * Pure: no Foundry globals, no document reads. The callers supply the weapon's
 * rate of fire, how many shots the clip can afford, and the line's cap rule.
 */

import type { I18nKey } from '../types/i18n-keys';

/**
 * What a line's rate-of-fire ceiling counts (#607).
 *   - `total` — the TOTAL hits may not exceed the RoF (DH2 core; RT core with
 *     the 1.4 errata: "The total number of hits scored … cannot exceed").
 *   - `extra` — only the EXTRA hits past the first may not exceed it, so a burst
 *     can land RoF + 1 (BC, DH1, DW and OW cores: "The number of extra hits …").
 */
export type BurstCapBasis = 'total' | 'extra';

/**
 * Whether Storm lifts the ceiling (#607, #511).
 *   - `rof` — "up to the weapon's firing rate, as normal" (DH2, OW).
 *   - `double-rof` — "to a maximum of twice the weapon's Full Automatic rate of
 *     fire" (BC, DW); RT's 1.4 errata FAQ answers "Double the Rate of Fire"; DH1's
 *     supplement Storm doubles every hit "up to
 *     the weapon's listed rate of fire".
 */
export type StormCap = 'rof' | 'double-rof';

/** A line's printed burst-ceiling rule, carried on its game-system config. */
export interface BurstCapRules {
    /** What the Semi-Auto / Full Auto Burst ceiling counts. */
    readonly burstCap: BurstCapBasis;
    /**
     * What the Suppressing Fire ceiling counts. Every line prints "The number of
     * hits scored may not exceed …" here, so it is `total` even in `extra` lines.
     */
    readonly suppressingCap: BurstCapBasis;
    /** Whether Storm doubles the ceiling. */
    readonly stormCap: StormCap;
}

/**
 * One provenance-bearing part of the hit ceiling, for the card's hoverable rows.
 * The parts sum to {@link BurstResolution.maxHits}.
 *   - `rof`        — the fired mode's rate of fire;
 *   - `storm`      — Storm's doubling of the ceiling (0 in a line where Storm leaves it alone);
 *   - `first-hit`  — the first hit that sits outside an `extra` cap;
 *   - `ammo`       — the cut a short clip (or a re-rating round) makes.
 */
export interface BurstCapComponent {
    readonly key: 'rof' | 'storm' | 'first-hit' | 'ammo';
    readonly value: number;
}

/** Which rate-of-fire entry a burst action draws its ceiling and ammunition from. */
export type BurstMode = 'semi' | 'full';

/** The action a burst costs: DH2 / BC / OW print both bursts as Half Actions, DH1 / DW / RT as Full Actions. */
export type BurstActionCost = 'half' | 'full';

/** How a line prints one burst action (#607): its to-hit modifier and its action cost. */
export interface BurstActionRule {
    readonly attackModifier: number;
    readonly actionCost: BurstActionCost;
}

/**
 * A line's printed rule for each burst action (#607): DH2 / BC / OW Semi-Auto +0
 * and Full Auto −10, both Half Actions; DH1 / DW / RT Semi-Auto +10 and Full Auto
 * +20, both Full Actions.
 */
export type BurstActionRules = Readonly<Record<BurstMode, BurstActionRule>>;

/** The burst actions whose modifier and cost are the line's {@link BurstActionRules} entry. */
const BURST_ATTACK_ACTIONS: Readonly<Record<string, BurstMode>> = {
    'Semi-Auto Burst': 'semi',
    'Full Auto Burst': 'full',
};

/**
 * The burst mode whose printed to-hit modifier an action takes, or null. Only the
 * two burst ATTACK actions: Suppressing Fire draws on a burst's ammunition but
 * prints its own −20.
 */
export function burstAttackModeForAction(action: string): BurstMode | null {
    return BURST_ATTACK_ACTIONS[action] ?? null;
}

/** A weapon's three rate-of-fire entries (`S/2/4` → single, semi 2, full 4). */
interface RateOfFire {
    readonly semi: number;
    readonly full: number;
}

/**
 * Every action that fires a burst, and which RoF entry it draws on.
 *
 * Suppressing Fire is here because RAW treats it as a semi- or full-auto burst
 * that spends that mode's ammunition (DH2 core ch. VII) — omitting it left it
 * firing a single round and scoring a single hit.
 *
 * Melee multi-attacks (Swift / Lightning) and psychic barrage / storm share the
 * hit PROGRESSIONS but are deliberately absent: they have no rate of fire, so no
 * ceiling and no ammunition.
 */
const BURST_ACTIONS: Readonly<Record<string, BurstMode>> = {
    'Semi-Auto Burst': 'semi',
    'Full Auto Burst': 'full',
    'Suppressing Fire - Semi': 'semi',
    'Suppressing Fire - Full': 'full',
};

/** The RoF entry a burst action draws on, or null when the action is not a burst. */
export function burstModeForAction(action: string): BurstMode | null {
    return BURST_ACTIONS[action] ?? null;
}

/** Whether this action's hits are capped by the weapon's rate of fire. */
export function isBurstAction(action: string): boolean {
    return burstModeForAction(action) !== null;
}

/** Coerce an authored rate-of-fire entry to a non-negative integer. */
function rofEntry(rateOfFire: RateOfFire | null | undefined, mode: BurstMode): number {
    const raw = mode === 'full' ? rateOfFire?.full : rateOfFire?.semi;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/** What a burst actually does: how much ammunition it burns and how many hits it may score. */
export interface BurstResolution {
    /** Rounds/charges that leave the weapon — Storm-doubled, clamped by the clip. */
    readonly shotsFired: number;
    /** Ceiling on hits scored, per the line's {@link BurstCapRules}; never above the shots a short clip fired. */
    readonly maxHits: number;
    /** The parts the ceiling is built from (empty for a non-burst action). */
    readonly capComponents: readonly BurstCapComponent[];
}

/** Inputs to {@link resolveBurst}. */
export interface BurstInput {
    /** The declared action name. */
    readonly action: string;
    /** The weapon's rate of fire. */
    readonly rateOfFire: RateOfFire | null | undefined;
    /** Whether the weapon has the Storm quality. */
    readonly storm: boolean;
    /**
     * How many shots the clip can pay for right now, or null when the weapon
     * does not consume ammunition (a RoF ceiling still applies — see #512).
     */
    readonly affordableShots: number | null;
    /**
     * The line's printed ceiling rule, or null for a line that prints no burst
     * rules — which keeps the conservative `total` / `rof` ceiling.
     */
    readonly rules: BurstCapRules | null;
}

/** The ceiling applied when a line prints no burst rule of its own. */
const UNRULED_BURST: BurstCapRules = { burstCap: 'total', suppressingCap: 'total', stormCap: 'rof' };

/** The Suppressing Fire actions, whose ceiling follows {@link BurstCapRules.suppressingCap}. */
const SUPPRESSING_ACTIONS: ReadonlySet<string> = new Set(['Suppressing Fire - Semi', 'Suppressing Fire - Full']);

/**
 * Resolve a burst into its ammunition cost and its hit ceiling.
 *
 * Returns `shotsFired: 1, maxHits: 1` for a non-burst action, so a Standard
 * Attack and a melee swing pass through unchanged.
 * @param {BurstInput} input  The declared action, the weapon's RoF, Storm, the affordable shots and the line's rule.
 * @returns {BurstResolution}  Rounds expended, the ceiling on hits, and the ceiling's parts.
 */
export function resolveBurst(input: BurstInput): BurstResolution {
    const mode = burstModeForAction(input.action);
    if (mode === null) {
        const single = input.affordableShots === null ? 1 : Math.max(0, Math.min(1, input.affordableShots));
        return { shotsFired: single, maxHits: single, capComponents: [] };
    }

    const rules = input.rules ?? UNRULED_BURST;
    const rof = rofEntry(input.rateOfFire, mode);

    // Storm burns twice the ammunition in every line…
    const wanted = rof * (input.storm ? 2 : 1);
    const shotsFired = input.affordableShots === null ? wanted : Math.max(0, Math.min(wanted, Math.trunc(input.affordableShots)));

    // …and lifts the ceiling only where the line says so.
    const stormLift = input.storm && rules.stormCap === 'double-rof' ? rof : 0;
    const basis = SUPPRESSING_ACTIONS.has(input.action) ? rules.suppressingCap : rules.burstCap;
    // An `extra` cap leaves the first hit outside it — but a mode the weapon
    // cannot fire (RoF 0) scores nothing at all.
    const firstHit = basis === 'extra' && rof > 0 ? 1 : 0;
    const ruleCeiling = rof + stormLift + firstHit;

    // A burst cut short by the clip cannot land more hits than it fired shots.
    const maxHits = shotsFired < wanted ? Math.min(ruleCeiling, shotsFired) : ruleCeiling;

    const capComponents: BurstCapComponent[] = [{ key: 'rof', value: rof }];
    if (input.storm) capComponents.push({ key: 'storm', value: stormLift });
    if (firstHit > 0) capComponents.push({ key: 'first-hit', value: firstHit });
    if (maxHits < ruleCeiling) capComponents.push({ key: 'ammo', value: maxHits - ruleCeiling });

    return { shotsFired, maxHits, capComponents };
}

/**
 * Re-cap a resolved burst when something outside the burst cuts the rounds that
 * leave the weapon (a chambered round's fire-rate override, e.g. Hot-shot →
 * single shot). The ceiling then falls to the rounds actually fired, and the cut
 * is booked on the `ammo` component so the card still sums.
 * @param {BurstResolution} burst  The burst as {@link resolveBurst} resolved it.
 * @param {number} shotsFired  The rounds that actually leave the weapon (≤ `burst.shotsFired`).
 * @returns {BurstResolution}  The burst with its ceiling and parts adjusted.
 */
export function capBurstToShots(burst: BurstResolution, shotsFired: number): BurstResolution {
    if (shotsFired >= burst.shotsFired) return burst;
    const maxHits = Math.min(burst.maxHits, shotsFired);
    const cut = maxHits - burst.maxHits;
    if (cut === 0) return { ...burst, shotsFired };
    const others = burst.capComponents.filter((c) => c.key !== 'ammo');
    const priorAmmo = burst.capComponents.find((c) => c.key === 'ammo')?.value ?? 0;
    return { shotsFired, maxHits, capComponents: [...others, { key: 'ammo', value: priorAmmo + cut }] };
}

/** One hit-ceiling card row: the langpack keys for its label and its provenance. */
export interface HitCeilingRow {
    readonly key: BurstCapComponent['key'];
    readonly labelKey: I18nKey;
    /** Provenance phrase; `{line}` is the game line's display name. */
    readonly sourceKey: I18nKey;
    readonly value: number;
}

/**
 * The card rows for a burst's hit ceiling (#607): each part, what it is, and
 * which rule put it there. Empty for a non-burst action.
 * @param {string} action  The declared action.
 * @param {readonly BurstCapComponent[]} components  The ceiling's parts from {@link resolveBurst}.
 * @param {BurstCapRules | null} rules  The line's rule (null: the line prints none).
 * @returns {HitCeilingRow[]}  One row per part, in ceiling order.
 */
export function hitCeilingRows(action: string, components: readonly BurstCapComponent[], rules: BurstCapRules | null): HitCeilingRow[] {
    const mode = burstModeForAction(action);
    if (mode === null) return [];
    const basis = rules === null ? null : SUPPRESSING_ACTIONS.has(action) ? rules.suppressingCap : rules.burstCap;
    const rofSource: I18nKey =
        basis === null ? 'WH40K.Roll.HitCeiling.SourceUnruled' : basis === 'total' ? 'WH40K.Roll.HitCeiling.SourceTotal' : 'WH40K.Roll.HitCeiling.SourceExtra';
    const stormSource: I18nKey = rules?.stormCap === 'double-rof' ? 'WH40K.Roll.HitCeiling.SourceStormDouble' : 'WH40K.Roll.HitCeiling.SourceStormNormal';
    const meta: Record<BurstCapComponent['key'], { labelKey: I18nKey; sourceKey: I18nKey }> = {
        'rof': { labelKey: mode === 'full' ? 'WH40K.Roll.HitCeiling.RateOfFireFull' : 'WH40K.Roll.HitCeiling.RateOfFireSemi', sourceKey: rofSource },
        'storm': { labelKey: 'WH40K.Roll.HitCeiling.Storm', sourceKey: stormSource },
        'first-hit': { labelKey: 'WH40K.Roll.HitCeiling.FirstHit', sourceKey: 'WH40K.Roll.HitCeiling.SourceFirstHit' },
        'ammo': { labelKey: 'WH40K.Roll.HitCeiling.RoundsFired', sourceKey: 'WH40K.Roll.HitCeiling.SourceAmmo' },
    };
    return components.map((c) => ({ key: c.key, value: c.value, ...meta[c.key] }));
}

/**
 * Hits earned by the roll, before the rate-of-fire ceiling.
 *
 * `semi` is the "initial degree of success plus one per two additional degrees"
 * progression — which Suppressing Fire also uses, whichever mode it fired.
 * `full` is one hit per degree of success.
 * @param {BurstMode} progression  Which progression the action uses.
 * @param {number} degreesOfSuccess  Degrees of success on the attack test (≥ 1 on a hit).
 * @returns {number}  Total hits earned, at least 1.
 */
export function hitsForDegrees(progression: BurstMode, degreesOfSuccess: number): number {
    const dos = Number.isFinite(degreesOfSuccess) ? Math.trunc(degreesOfSuccess) : 1;
    if (dos < 1) return 1;
    return progression === 'full' ? dos : 1 + Math.floor((dos - 1) / 2);
}
