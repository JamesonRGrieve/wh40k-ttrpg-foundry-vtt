/**
 * Rogue Trader Starship Manoeuvre Action catalogue (core.md §"Manoeuvre
 * Actions", p. 213-215; Table 8-10 p. 214). Sibling registry to
 * `vehicle-actions.ts` for ground/atmosphere craft and `combat-actions.ts`
 * for personal combatants.
 *
 * The fixed RAW list (Adjust Bearing, Adjust Speed, Adjust Speed & Bearing,
 * Come to New Heading, Disengage, Evasive Manoeuvres) is encoded here as
 * a content-agnostic *primitive* — these are mechanics-only rows
 * (id, difficulty modifier, opposed flag, benefit summary). Per Direction
 * #7 the full human-readable card text continues to live on the matching
 * compendium documents in `rt-items-ship-manoeuvre-actions` (read by
 * `starship-sheet#_prepareManoeuvreActions`); this registry exists so
 * roll plumbing, the prompt dialog, and tests can resolve a stable id
 * → difficulty mapping without string-matching the localized name.
 *
 * The combined-test pathway (`resolveShipManoeuvreCombinedTest`) follows
 * RT's "Pilot (Space Craft) + Manoeuvrability Test" wording: the helmsman
 * rolls 1d100 vs. (Pilot characteristic + ship Manoeuvrability + the
 * action's flat difficulty modifier). This is the same +Manoeuvrability
 * combined-test math used by every entry in Table 8-10, so the resolver
 * is intentionally a pure function with no Foundry coupling.
 *
 * RT-gated: every entry sets `gameSystem: 'rt'`; helpers filter on the
 * active actor's game-system id so a DH2/IM/etc. starship surface (if
 * one is ever wired up) does not surface RT-only Manoeuvres by default.
 *
 * @issue #185
 */

import type { GameSystemId } from '../config/game-systems/types.ts';

/** Stable ids for the six RAW RT Manoeuvre Actions. */
export type ShipManoeuvreId = 'adjust-bearing' | 'adjust-speed' | 'adjust-speed-and-bearing' | 'come-to-new-heading' | 'disengage' | 'evasive-manoeuvres';

/** Shape of a single Manoeuvre Action registry entry. */
export interface ShipManoeuvre {
    /** Stable identifier — never localized, safe to persist. */
    id: ShipManoeuvreId;
    /** i18n key for the action's display name (resolved at render time). */
    labelKey: string;
    /**
     * Skill name the helmsman tests against. RAW always
     * `'Pilot (Space Craft)'` for Manoeuvre Actions — kept as a field so
     * future per-system variants (e.g. IM's `'Drive'` for atmospheric
     * craft) can override.
     */
    test: string;
    /**
     * Difficulty modifier from Table 8-10. Keys mirror those in
     * `difficulties.ts` (a positive number is a bonus, negative a
     * penalty). `0` = Challenging, `-10` = Difficult, `-20` = Hard.
     */
    difficulty: number;
    /**
     * Localization-key suffix under the action's `WH40K.Starship.Manoeuvre.*`
     * namespace for the one-line benefit summary (matches Table 8-10
     * "Benefit" column).
     */
    benefitKey: string;
    /**
     * True for Manoeuvres whose test is *opposed* by an enemy ship
     * rather than resolved against a flat difficulty. RAW only
     * Disengage qualifies (opposed Detection+Scrutiny within 20 VU).
     */
    opposed?: boolean;
    /** Game-system gating — RT-only at present. */
    gameSystem: GameSystemId;
}

/**
 * Canonical Table 8-10 catalogue. The order matches the in-book
 * presentation so dropdown enumeration is stable and reviewable.
 */
export const SHIP_MANOEUVRES: readonly ShipManoeuvre[] = [
    {
        id: 'adjust-bearing',
        labelKey: 'WH40K.Starship.Manoeuvre.AdjustBearing.Label',
        test: 'Pilot (Space Craft)',
        difficulty: 0,
        benefitKey: 'WH40K.Starship.Manoeuvre.AdjustBearing.Benefit',
        gameSystem: 'rt',
    },
    {
        id: 'adjust-speed',
        labelKey: 'WH40K.Starship.Manoeuvre.AdjustSpeed.Label',
        test: 'Pilot (Space Craft)',
        difficulty: 0,
        benefitKey: 'WH40K.Starship.Manoeuvre.AdjustSpeed.Benefit',
        gameSystem: 'rt',
    },
    {
        id: 'adjust-speed-and-bearing',
        labelKey: 'WH40K.Starship.Manoeuvre.AdjustSpeedAndBearing.Label',
        test: 'Pilot (Space Craft)',
        difficulty: -20,
        benefitKey: 'WH40K.Starship.Manoeuvre.AdjustSpeedAndBearing.Benefit',
        gameSystem: 'rt',
    },
    {
        id: 'come-to-new-heading',
        labelKey: 'WH40K.Starship.Manoeuvre.ComeToNewHeading.Label',
        test: 'Pilot (Space Craft)',
        difficulty: -10,
        benefitKey: 'WH40K.Starship.Manoeuvre.ComeToNewHeading.Benefit',
        gameSystem: 'rt',
    },
    {
        id: 'disengage',
        labelKey: 'WH40K.Starship.Manoeuvre.Disengage.Label',
        test: 'Pilot (Space Craft)',
        difficulty: 0,
        benefitKey: 'WH40K.Starship.Manoeuvre.Disengage.Benefit',
        opposed: true,
        gameSystem: 'rt',
    },
    {
        id: 'evasive-manoeuvres',
        labelKey: 'WH40K.Starship.Manoeuvre.EvasiveManoeuvres.Label',
        test: 'Pilot (Space Craft)',
        difficulty: -10,
        benefitKey: 'WH40K.Starship.Manoeuvre.EvasiveManoeuvres.Benefit',
        gameSystem: 'rt',
    },
] as const;

/** Look up a Manoeuvre by its stable id (case-sensitive, exact match). */
export function getShipManoeuvre(id: ShipManoeuvreId): ShipManoeuvre | undefined {
    return SHIP_MANOEUVRES.find((m) => m.id === id);
}

/** Return Manoeuvre ids in canonical Table 8-10 order. */
export function getShipManoeuvreIds(): readonly ShipManoeuvreId[] {
    return SHIP_MANOEUVRES.map((m) => m.id);
}

/**
 * Return all Manoeuvres available to a starship under the given game
 * system. RT returns the full RAW catalogue; non-RT systems return an
 * empty list until/unless their own ship-combat layer is authored.
 */
export function getShipManoeuvresForSystem(systemId: GameSystemId): readonly ShipManoeuvre[] {
    return SHIP_MANOEUVRES.filter((m) => m.gameSystem === systemId);
}

// ---------------------------------------------------------------------------
// Combined-test math (Pilot characteristic + ship Manoeuvrability + difficulty)
// ---------------------------------------------------------------------------

/** Inputs to the combined Manoeuvre test. */
export interface ShipManoeuvreTestInput {
    /**
     * The helmsman's Pilot (Space Craft) skill total — typically the
     * character's Intelligence + advances applied to the Pilot skill.
     */
    pilot: number;
    /** The ship's Manoeuvrability stat (positive or negative). */
    manoeuvrability: number;
    /**
     * Optional situational modifier (e.g. component bonus, GM
     * adjudication). Added on top of the action's `difficulty`.
     */
    situational?: number;
}

/** Result of `resolveShipManoeuvreCombinedTest`. */
export interface ShipManoeuvreTarget {
    /** The Manoeuvre that was tested. */
    id: ShipManoeuvreId;
    /** Localization key for the action's display name. */
    labelKey: string;
    /** Localization key for the benefit summary line. */
    benefitKey: string;
    /** Combined-test target number (Pilot + Manoeuvrability + difficulty + situational). */
    target: number;
    /** Breakdown for chat-card display. */
    breakdown: {
        pilot: number;
        manoeuvrability: number;
        difficulty: number;
        situational: number;
    };
    /** Was the underlying Manoeuvre opposed (vs. enemy ship)? */
    opposed: boolean;
}

/**
 * Pure resolver for the combined Pilot+Manoeuvrability target number of
 * a starship Manoeuvre Action. No RNG, no Foundry — deterministic so
 * unit tests can assert each Table 8-10 tier independently and the
 * prompt dialog can preview the target before the dice roll.
 *
 * Throws on an unknown id so callers cannot silently drop a bad action
 * onto the chain.
 */
export function resolveShipManoeuvreCombinedTest(id: ShipManoeuvreId, input: ShipManoeuvreTestInput): ShipManoeuvreTarget {
    const manoeuvre = getShipManoeuvre(id);
    if (manoeuvre === undefined) {
        throw new Error(`Unknown ship Manoeuvre id: ${id}`);
    }
    const situational = input.situational ?? 0;
    const target = input.pilot + input.manoeuvrability + manoeuvre.difficulty + situational;
    return {
        id: manoeuvre.id,
        labelKey: manoeuvre.labelKey,
        benefitKey: manoeuvre.benefitKey,
        target,
        breakdown: {
            pilot: input.pilot,
            manoeuvrability: input.manoeuvrability,
            difficulty: manoeuvre.difficulty,
            situational,
        },
        opposed: manoeuvre.opposed === true,
    };
}
