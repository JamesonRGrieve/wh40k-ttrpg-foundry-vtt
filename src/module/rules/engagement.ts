/**
 * Melee engagement (#804): who is engaged with whom, Ganging Up, shooting into a
 * melee, and what an engaged character may fire.
 *
 * Every FFG line's combat chapter prints the same core: an attacker adjacent to
 * his target is engaged in melee with it, and both are engaged. A group that
 * outnumbers its foe two to one gains +10 to Weapon Skill tests against it, three
 * to one or more +20. A Ballistic Skill test against a target engaged in melee
 * takes −20, waived in most lines when anyone in that melee is Stunned, Helpless
 * or Unaware. An engaged character may fire only a Pistol-class weapon, and in
 * Deathwatch may make melee attacks only. The per-line differences live on each
 * game-system config's `meleeEngagement` ({@link MeleeEngagementRules}).
 *
 * Pure: callers pass token-like rectangles (grid origin in pixels, footprint in
 * grid squares, disposition) and this module decides adjacency and sides.
 */

/** A token reduced to what engagement reads. */
export interface EngagementToken {
    readonly id: string;
    /** Grid origin in pixels (`TokenDocument.x/y`). */
    readonly x: number;
    readonly y: number;
    /** Footprint in grid squares. */
    readonly width: number;
    readonly height: number;
    /** Foundry disposition: 1 friendly, 0 neutral, −1 hostile, −2 secret. */
    readonly disposition: number;
    /** Stunned, Helpless or Unaware: waives the shooting-into-melee penalty where the line says so. */
    readonly defenceless?: boolean;
    /** The bearer's outnumbering talents, summed from its owned items' `modifiers.outnumbering`. */
    readonly outnumbering?: OutnumberingTraits;
}

/**
 * What a combatant's talents do to Ganging Up, authored on the talents as
 * `modifiers.outnumbering` (Combat Master: `denies`; Double Team: `bonus` 10,
 * `sharedBonus` 10).
 */
export interface OutnumberingTraits {
    /** Opponents gain no Ganging Up bonus against the bearer. */
    readonly denies: boolean;
    /** Added to the bearer's WS tests while ganging up. */
    readonly bonus: number;
    /** Added again when another attacker in the gang also has a shared bonus. */
    readonly sharedBonus: number;
}

/** One rung of the Ganging Up ladder: at this ratio of attackers to defenders or more, this bonus. */
export interface GangUpTier {
    readonly ratio: number;
    readonly bonus: number;
}

/** What an engaged character may attack with. */
export type RangedWhileEngaged = 'pistol' | 'none';

/** A line's engagement rules. */
export interface MeleeEngagementRules {
    /** Whether the system tracks engagement for this line at all. */
    readonly tracked: boolean;
    /** Ganging Up tiers, highest ratio last; empty = the line has no Ganging Up. */
    readonly gangUp: readonly GangUpTier[];
    /** The BS modifier for shooting at a target engaged in melee (−20). */
    readonly shootingIntoMelee: number;
    /** Whether a Stunned, Helpless or Unaware participant waives that modifier. */
    readonly shootingIntoMeleeWaivedByDefenceless: boolean;
    /** What an engaged attacker may fire: Pistol-class weapons, or nothing. */
    readonly rangedWhileEngaged: RangedWhileEngaged;
}

/** The FFG core rule, as DH2, RT, BC and OW print it. */
export const STANDARD_MELEE_ENGAGEMENT: MeleeEngagementRules = {
    tracked: true,
    gangUp: [
        { ratio: 2, bonus: 10 },
        { ratio: 3, bonus: 20 },
    ],
    shootingIntoMelee: -20,
    shootingIntoMeleeWaivedByDefenceless: true,
    rangedWhileEngaged: 'pistol',
};

/** A line the system does not track engagement for. */
export const UNTRACKED_MELEE_ENGAGEMENT: MeleeEngagementRules = {
    tracked: false,
    gangUp: [],
    shootingIntoMelee: 0,
    shootingIntoMeleeWaivedByDefenceless: false,
    rangedWhileEngaged: 'pistol',
};

interface CellRect {
    col0: number;
    row0: number;
    col1: number;
    row1: number;
}

/** The grid cells a token occupies (inclusive); a token under a square fills the one it sits in. */
function cellRect(token: EngagementToken, gridSize: number): CellRect {
    const size = gridSize > 0 ? gridSize : 1;
    const col0 = Math.floor((token.x + 1) / size);
    const row0 = Math.floor((token.y + 1) / size);
    const width = Math.max(1, Math.round(token.width));
    const height = Math.max(1, Math.round(token.height));
    return { col0, row0, col1: col0 + width - 1, row1: row0 + height - 1 };
}

/** Whether two tokens are on adjacent (or the same) squares; diagonals count. */
export function tokensAdjacent(a: EngagementToken, b: EngagementToken, gridSize: number): boolean {
    if (a.id === b.id) return false;
    const ra = cellRect(a, gridSize);
    const rb = cellRect(b, gridSize);
    const gapX = Math.max(0, ra.col0 - rb.col1, rb.col0 - ra.col1);
    const gapY = Math.max(0, ra.row0 - rb.row1, rb.row0 - ra.row1);
    return Math.max(gapX, gapY) <= 1;
}

/** Whether two tokens are on opposing sides: one friendly, one hostile. Neutral and secret tokens are bystanders. */
export function opposed(a: EngagementToken, b: EngagementToken): boolean {
    return (a.disposition === 1 && b.disposition === -1) || (a.disposition === -1 && b.disposition === 1);
}

/** Whether two tokens are engaged in melee: adjacent and on opposing sides. */
export function engaged(a: EngagementToken, b: EngagementToken, gridSize: number): boolean {
    return opposed(a, b) && tokensAdjacent(a, b, gridSize);
}

/** The foes a token is engaged with. */
export function engagedFoes(token: EngagementToken, tokens: readonly EngagementToken[], gridSize: number): EngagementToken[] {
    return tokens.filter((other) => engaged(token, other, gridSize));
}

/** A Ganging Up reading: the two sides of the melee and the bonus. */
export interface GangUpReading {
    /** The attacker's side engaged with the target, the attacker included. */
    readonly attackers: number;
    /** The target's side: the target and its allies engaged with any of those attackers. */
    readonly defenders: number;
    /** The to-hit bonus the tiers give. */
    readonly bonus: number;
    /** The attacker's outnumbering talents' bonus on top, while ganging up. */
    readonly talentBonus: number;
    /** The target's talents deny any Ganging Up bonus against it. */
    readonly denied: boolean;
}

/**
 * Ganging Up for a melee attack. The attacker must be engaged with the target.
 * The attackers are everyone on the attacker's side engaged with the target; the
 * defenders are the target plus everyone on its side engaged with one of those
 * attackers. The bonus is the highest tier whose ratio the attackers reach.
 */
export function gangUp(
    attacker: EngagementToken,
    target: EngagementToken,
    tokens: readonly EngagementToken[],
    gridSize: number,
    rules: MeleeEngagementRules,
): GangUpReading {
    if (!rules.tracked || !engaged(attacker, target, gridSize)) return { attackers: 0, defenders: 0, bonus: 0, talentBonus: 0, denied: false };
    const attackers = tokens.filter(
        (t) => t.id === attacker.id || (t.disposition === attacker.disposition && t.id !== target.id && engaged(t, target, gridSize)),
    );
    const defenders = tokens.filter(
        (t) => t.id === target.id || (t.disposition === target.disposition && t.id !== attacker.id && attackers.some((a) => engaged(t, a, gridSize))),
    );
    const ratio = attackers.length / Math.max(1, defenders.length);
    let bonus = 0;
    for (const tier of rules.gangUp) if (ratio >= tier.ratio) bonus = Math.max(bonus, tier.bonus);
    const denied = target.outnumbering?.denies === true;
    if (denied || bonus === 0) return { attackers: attackers.length, defenders: defenders.length, bonus: 0, talentBonus: 0, denied };
    const own = attacker.outnumbering;
    const partnerShares = attackers.some((a) => a.id !== attacker.id && (a.outnumbering?.sharedBonus ?? 0) > 0);
    const talentBonus = (own?.bonus ?? 0) + (partnerShares ? own?.sharedBonus ?? 0 : 0);
    return { attackers: attackers.length, defenders: defenders.length, bonus, talentBonus, denied };
}

/**
 * The BS modifier for shooting at `target`: the line's shooting-into-melee modifier
 * when the target is engaged with anyone other than the shooter, 0 otherwise or
 * when the line waives it because someone in that melee is defenceless.
 */
export function shootingIntoMelee(
    shooter: EngagementToken,
    target: EngagementToken,
    tokens: readonly EngagementToken[],
    gridSize: number,
    rules: MeleeEngagementRules,
): number {
    if (!rules.tracked) return 0;
    const foes = engagedFoes(target, tokens, gridSize).filter((foe) => foe.id !== shooter.id);
    if (foes.length === 0) return 0;
    if (rules.shootingIntoMeleeWaivedByDefenceless && [target, ...foes].some((t) => t.defenceless === true)) return 0;
    return rules.shootingIntoMelee;
}

/** Why an engaged attacker may not make this ranged attack, or null when it may. */
export type RangedRefusal = 'pistol-only' | 'melee-only' | null;

/** Whether an attacker engaged in melee may make a ranged attack with a weapon of this class. */
export function rangedAttackWhileEngaged(attackerEngaged: boolean, weaponClass: string, rules: MeleeEngagementRules): RangedRefusal {
    if (!rules.tracked || !attackerEngaged) return null;
    if (rules.rangedWhileEngaged === 'none') return 'melee-only';
    return weaponClass === 'pistol' ? null : 'pistol-only';
}

/**
 * The statuses that make a participant defenceless for the shooting-into-melee
 * waiver: Stunned and Helpless as printed, and Unconscious, which is Helpless.
 * (Unaware is a situational state, not a status the token carries.)
 */
const DEFENCELESS_STATUSES: readonly string[] = ['stunned', 'helpless', 'unconscious'];

/** Whether a token's statuses make it defenceless for the shooting-into-melee waiver. */
export function isDefenceless(statuses: Iterable<string>): boolean {
    for (const status of statuses) if (DEFENCELESS_STATUSES.includes(status)) return true;
    return false;
}

/** An owned item, as the outnumbering sum reads it. */
export interface OutnumberingItemLike {
    readonly system?: { readonly modifiers?: { readonly outnumbering?: Partial<OutnumberingTraits> } };
}

/** Sum an actor's items' outnumbering traits: any item denies; bonuses add. */
export function outnumberingTraitsOf(items: Iterable<OutnumberingItemLike>): OutnumberingTraits {
    let denies = false;
    let bonus = 0;
    let sharedBonus = 0;
    for (const item of items) {
        const traits = item.system?.modifiers?.outnumbering;
        if (traits === undefined) continue;
        denies ||= traits.denies === true;
        bonus += traits.bonus ?? 0;
        sharedBonus += traits.sharedBonus ?? 0;
    }
    return { denies, bonus, sharedBonus };
}
