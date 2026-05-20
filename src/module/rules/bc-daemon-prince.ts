/**
 * Black Crusade Daemon Prince ascension RAW resolver (#182 — core.md
 * §"Apotheosis" :1490 and §"Daemon Princes" :16053).
 *
 * Pure functions for the apotheosis gate (Infamy ≥ 100 AND Corruption
 * ≥ 70) and the stat-block boost granted to a newly ascended Daemon
 * Prince: Unnatural Strength/Toughness multipliers, bonus wounds, the
 * Daemonic and Fear traits, and the immune-to-conditions list.
 *
 * No DataModel coupling, no actor lookups, no Foundry imports. The
 * caller (sheet, advancement dialog, chat card) owns I/O and the
 * downstream actor sub-type integration is a separate follow-up.
 */

/** Multiplier on Strength Bonus granted by apotheosis (RAW: x4). */
export const DAEMON_PRINCE_UNNATURAL_STRENGTH = 4;

/** Multiplier on Toughness Bonus granted by apotheosis (RAW: x4). */
export const DAEMON_PRINCE_UNNATURAL_TOUGHNESS = 4;

/** Fear rating granted by apotheosis (RAW: Fear (3)). */
export const DAEMON_PRINCE_FEAR_RATING = 3;

/** Bonus wounds added on top of the character's existing total. */
export const DAEMON_PRINCE_BONUS_WOUNDS = 20;

/** Infamy threshold required to ascend (RAW). */
export const DAEMON_PRINCE_INFAMY_THRESHOLD = 100;

/** Corruption threshold required to ascend (RAW). */
export const DAEMON_PRINCE_CORRUPTION_THRESHOLD = 70;

/**
 * Conditions a Daemon Prince is immune to per RAW. Stored as a
 * read-only string list so callers can render the labels through the
 * langpack without mutating this canonical set.
 */
export const DAEMON_PRINCE_IMMUNE_CONDITIONS: ReadonlyArray<string> = ['fatigue', 'fear', 'pinning', 'poison', 'stunning', 'suffocation'];

/** Chaos alignment identifiers used to tag an ascension record. */
export type DaemonPrinceAlignment = 'khorne' | 'slaanesh' | 'nurgle' | 'tzeentch' | 'unaligned';

/**
 * Persisted ascension record. Stored on the character (separate
 * follow-up) once apotheosis succeeds; treated as opaque by this
 * module — used only to detect "is this character ascended?" and to
 * compose the boost.
 */
export interface DaemonPrinceAscension {
    /** World-time (or session number) at which apotheosis fired. */
    ascendedAt: number;
    /** Chaos alignment held at the moment of ascension. */
    alignmentAtAscension: DaemonPrinceAlignment;
}

/**
 * The mechanical package granted to a Daemon Prince. Consumers apply
 * these as derived modifiers in `prepareDerivedData()`; the engine
 * does not mutate any actor state itself.
 */
export interface DaemonPrinceStatBoost {
    /** Strength Bonus multiplier (Unnatural Strength). */
    strengthBonusMultiplier: number;
    /** Toughness Bonus multiplier (Unnatural Toughness). */
    toughnessBonusMultiplier: number;
    /** Wounds added on top of the character's existing total. */
    bonusWounds: number;
    /** Fear rating granted. */
    fearRating: number;
    /** The Daemonic trait is always granted on ascension. */
    daemonicTrait: true;
    /** Conditions the prince is immune to. */
    immuneToConditions: ReadonlyArray<string>;
}

/** Reason an attempted ascension was blocked. */
export type AscensionBlockedReason = 'insufficient-infamy' | 'insufficient-corruption';

/** Input shape for {@link ascendCharacter}. */
export interface AscendCharacterArgs {
    /** Current Infamy score. */
    currentInfamy: number;
    /** Current Corruption points. */
    currentCorruption: number;
    /** Alignment at the moment of the attempt. */
    alignment: DaemonPrinceAlignment;
}

/** Result of an attempted ascension. */
export interface AscendCharacterResult {
    /** True when the apotheosis succeeded. */
    ascended: boolean;
    /** Populated only when {@link ascended} is `false`. */
    reason?: AscensionBlockedReason;
}

/* -------------------------------------------- */
/*  Boost                                       */
/* -------------------------------------------- */

/**
 * Resolve the mechanical package granted by an ascension record. The
 * alignment is preserved on the record for downstream effects (gifts,
 * patron interactions) but does NOT alter the base boost — RAW grants
 * the same Unnatural multipliers, fear, daemonic trait, and condition
 * immunities regardless of patron god.
 */
export function getDaemonPrinceBoost(_ascension: DaemonPrinceAscension): DaemonPrinceStatBoost {
    return {
        strengthBonusMultiplier: DAEMON_PRINCE_UNNATURAL_STRENGTH,
        toughnessBonusMultiplier: DAEMON_PRINCE_UNNATURAL_TOUGHNESS,
        bonusWounds: DAEMON_PRINCE_BONUS_WOUNDS,
        fearRating: DAEMON_PRINCE_FEAR_RATING,
        daemonicTrait: true,
        immuneToConditions: DAEMON_PRINCE_IMMUNE_CONDITIONS,
    };
}

/* -------------------------------------------- */
/*  Ascension query                             */
/* -------------------------------------------- */

/**
 * Whether the supplied record represents a successfully ascended
 * Daemon Prince. A `null` record means "never ascended".
 */
export function isAscended(ascension: DaemonPrinceAscension | null): boolean {
    return ascension !== null;
}

/* -------------------------------------------- */
/*  Ascension gate                              */
/* -------------------------------------------- */

/**
 * Evaluate the RAW apotheosis gate. Ascension requires Infamy ≥ 100
 * AND Corruption ≥ 70; otherwise the attempt is blocked with the
 * matching reason. Infamy is checked first so the caller surfaces the
 * most prestigious blocker.
 *
 * Non-finite inputs are sanitised to 0 (which always fails both
 * thresholds).
 */
export function ascendCharacter(args: AscendCharacterArgs): AscendCharacterResult {
    const infamy = sanitiseNonNegativeInt(args.currentInfamy);
    const corruption = sanitiseNonNegativeInt(args.currentCorruption);

    if (infamy < DAEMON_PRINCE_INFAMY_THRESHOLD) {
        return { ascended: false, reason: 'insufficient-infamy' };
    }
    if (corruption < DAEMON_PRINCE_CORRUPTION_THRESHOLD) {
        return { ascended: false, reason: 'insufficient-corruption' };
    }
    return { ascended: true };
}

/* -------------------------------------------- */
/*  internals                                   */
/* -------------------------------------------- */

function sanitiseNonNegativeInt(value: number): number {
    if (!Number.isFinite(value)) return 0;
    const v = Math.trunc(value);
    return v < 0 ? 0 : v;
}
