/**
 * Black Crusade apotheosis resolver (#182 — BC Core p267).
 *
 * When a champion's Corruption reaches 100 the Ruinous Powers claim them.
 * If they have reached the Infamy threshold the GM sets (a world setting;
 * the book suggests 75, 90 or 100) they ascend to Daemon Princehood;
 * otherwise they become a Chaos Spawn. Either way the character leaves
 * play. The book prints no stat changes for either fate, so this module
 * only decides eligibility and the outcome.
 *
 * No DataModel coupling, no actor lookups, no Foundry imports. The caller
 * (sheet, action, chat card) reads the live values and the GM's threshold.
 */

/** Corruption at which a champion is claimed (BC Core p267). */
export const APOTHEOSIS_CORRUPTION = 100;

/** Chaos alignment identifiers used to tag an apotheosis record. */
export type DaemonPrinceAlignment = 'khorne' | 'slaanesh' | 'nurgle' | 'tzeentch' | 'unaligned';

/** The two fates a claimed champion meets. */
export const APOTHEOSIS_OUTCOMES = ['daemonPrince', 'chaosSpawn'] as const;

/** A claimed champion's fate: Daemon Prince or Chaos Spawn. */
export type ApotheosisOutcome = (typeof APOTHEOSIS_OUTCOMES)[number];

/**
 * Persisted apotheosis record. Its presence means the champion has been
 * claimed and has left play.
 */
export interface DaemonPrinceAscension {
    /** World-time at which the champion was claimed. */
    ascendedAt: number;
    /** Chaos alignment held at the moment of the claim. */
    alignmentAtAscension: DaemonPrinceAlignment;
    /** The fate the champion met. */
    outcome: ApotheosisOutcome;
}

/** Input shape for {@link resolveApotheosis}. */
interface ApotheosisArgs {
    /** Current Corruption points. */
    corruption: number;
    /** Current Infamy score. */
    infamy: number;
    /** The GM-set Infamy threshold for apotheosis. */
    infamyThreshold: number;
}

/** Result of {@link resolveApotheosis}. */
interface ApotheosisReadout {
    /** True once Corruption has reached {@link APOTHEOSIS_CORRUPTION}: the champion is claimed. */
    claimed: boolean;
    /** The fate the champion meets when claimed — or would meet if claimed now. */
    outcome: ApotheosisOutcome;
}

/**
 * Evaluate the apotheosis rule. The champion is claimed at 100 Corruption;
 * Infamy at or above the GM's threshold makes the fate Daemon Prince, below
 * it Chaos Spawn. The outcome is reported even before the claim so the panel
 * can show what the champion faces. Non-finite inputs are sanitised to 0.
 */
export function resolveApotheosis(args: ApotheosisArgs): ApotheosisReadout {
    const corruption = sanitiseNonNegativeInt(args.corruption);
    const infamy = sanitiseNonNegativeInt(args.infamy);
    const threshold = sanitiseNonNegativeInt(args.infamyThreshold);
    return {
        claimed: corruption >= APOTHEOSIS_CORRUPTION,
        outcome: infamy >= threshold ? 'daemonPrince' : 'chaosSpawn',
    };
}

/**
 * Whether the supplied record represents a claimed champion. A `null` record
 * means "never claimed".
 */
export function isAscended(ascension: DaemonPrinceAscension | null): boolean {
    return ascension !== null;
}

/* -------------------------------------------- */
/*  internals                                   */
/* -------------------------------------------- */

function sanitiseNonNegativeInt(value: number): number {
    if (!Number.isFinite(value)) return 0;
    const v = Math.trunc(value);
    return v < 0 ? 0 : v;
}
