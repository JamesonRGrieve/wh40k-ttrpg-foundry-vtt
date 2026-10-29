/**
 * Shared primitives for the Rogue Trader ship-to-ship assault actions —
 * Ramming, Boarding Actions and Hit and Run (RT core rules).
 *
 * Each of those actions is one or more d100 tests whose target is composed
 * from a base skill plus a stack of ship-derived and situational modifiers.
 * Roll transparency requires every component of that stack to reach the chat
 * card with its provenance, so the target is never carried as a bare number:
 * it is a {@link ShipTestDerivation} — base + named components = target — that
 * the card renders row by row.
 *
 * Components name themselves by langpack key so the rules layer stays
 * Foundry-free; the presentation layer localizes them. Pure module: no RNG,
 * no Foundry. Callers roll the dice and feed the totals in.
 */

import { printedDegrees, type DegreesMethod } from '../rolls/roll-helpers.ts';
import { isD100Success } from './_dice.ts';

/**
 * Game-system id the ship assault actions are gated on. Ramming, boarding and
 * Hit and Run are Rogue Trader starship-combat rules; the other lines' void
 * craft have no such actions, so every entry point checks this explicitly.
 */
const SHIP_ASSAULT_GAME_SYSTEM = 'rt';

/** Whether a voidcraft of the given game system can take the assault actions. */
export function supportsShipAssault(gameSystem: string): boolean {
    return gameSystem === SHIP_ASSAULT_GAME_SYSTEM;
}

/** Interpolation data a component's langpack key formats with. */
type ShipComponentData = Readonly<Record<string, string | number>>;

/**
 * One provenance-bearing term of a test target or a damage total. `labelKey`
 * is a `WH40K.*` langpack key; `data` fills its placeholders (a ship name, a
 * rating, a GM-entered label).
 */
export interface ShipTestComponent {
    readonly labelKey: string;
    readonly value: number;
    readonly data?: ShipComponentData;
}

/** A test target with its full derivation: base ± every modifier = target. */
export interface ShipTestDerivation {
    readonly base: ShipTestComponent;
    readonly modifiers: readonly ShipTestComponent[];
    readonly target: number;
}

/** A rolled test: the derivation plus the roll and its degrees. */
export interface ShipTestResult extends ShipTestDerivation {
    readonly roll: number;
    readonly success: boolean;
    /** Degrees of Success as the line prints them (0 on a failure). */
    readonly dos: number;
    /** Degrees of Failure as the line prints them (0 on a success). */
    readonly dof: number;
    /** How the degrees were counted: the line's method, or the `degreesMode` world override. */
    readonly method: DegreesMethod;
}

/** The stats of one ship an assault action reads. */
export interface ShipAssaultShip {
    readonly name: string;
    readonly hullType: string;
    /** Manoeuvrability as the ship has it now, any Crippled penalty included. */
    readonly manoeuvrability: number;
    /** The Crippled penalty inside `manoeuvrability` (−10 for an RT ship at 0 Hull, #187), else 0. */
    readonly crippledManoeuvrability: number;
    readonly armour: number;
    readonly turretRating: number;
    readonly crewPopulation: number;
    readonly hullIntegrity: number;
    readonly morale: number;
}

/** A GM-entered situational modifier (component bonuses, talents, GM fiat). */
export interface SituationalModifier {
    readonly value: number;
    readonly label: string;
}

/** Langpack key for a GM-entered situational modifier row. */
export const SITUATIONAL_MODIFIER_KEY = 'WH40K.Voidcraft.Assault.Component.Situational';

/** Langpack key for the Hard (−20) difficulty row shared by ramming and boarding lock-on. */
export const HARD_DIFFICULTY_KEY = 'WH40K.Voidcraft.Assault.Component.Hard';

/** Langpack key for a manoeuvrability row. */
export const MANOEUVRABILITY_KEY = 'WH40K.Voidcraft.Assault.Component.Manoeuvrability';

/** Langpack key for the Crippled-ship Manoeuvrability penalty row (shared with the ship-action tests). */
export const CRIPPLED_MANOEUVRABILITY_KEY = 'WH40K.Voidcraft.Crippled.Component.Manoeuvrability';

/**
 * Turn a GM-entered situational modifier into a component, or nothing when it
 * is zero — a +0 row would only add noise to the card.
 */
export function situationalComponents(modifier: SituationalModifier | undefined): ShipTestComponent[] {
    if (modifier === undefined || modifier.value === 0) return [];
    return [{ labelKey: SITUATIONAL_MODIFIER_KEY, value: modifier.value, data: { label: modifier.label } }];
}

/** Sum a component list. */
export function sumComponents(components: readonly ShipTestComponent[]): number {
    return components.reduce((total, component) => total + component.value, 0);
}

/** Compose a test target from its base and modifiers. */
export function deriveTarget(base: ShipTestComponent, modifiers: readonly ShipTestComponent[]): ShipTestDerivation {
    return { base, modifiers, target: base.value + sumComponents(modifiers) };
}

/**
 * Resolve a rolled d100 against a derivation. Success follows the shared d100
 * rule (natural 01 passes, natural 100 fails). Degrees are counted the way the
 * roll engine counts them for the line (`printedDegrees`): Rogue Trader counts
 * each full 10 points of margin with no base degree, so a bare pass or a bare
 * failure is 0 degrees (RT Core "Degrees of Success and Failure"); the Gen 2
 * method counts the first degree, so a result there is never below 1.
 */
export function resolveShipTest(derivation: ShipTestDerivation, roll: number, method: DegreesMethod): ShipTestResult {
    const success = isD100Success(roll, derivation.target);
    const least = method === 'gen2' ? 1 : 0;
    const degrees = Math.max(least, printedDegrees(method, success, derivation.target, roll));
    return { ...derivation, roll, success, method, dos: success ? degrees : 0, dof: success ? 0 : degrees };
}

/** Which side of an opposed ship test won, and by how many degrees. */
export interface OpposedShipOutcome {
    /** Ties, and a contest both sides fail, go to the defender. */
    readonly winner: 'attacker' | 'defender';
    /** The winner's Degrees of Success less the loser's (a failed side scores 0). */
    readonly degrees: number;
}

/**
 * Resolve an opposed pair of rolled ship tests: the side that succeeds wins,
 * and when both succeed, more degrees of success wins. Success is checked first because
 * under the RT count a bare pass scores 0 degrees, the same as a failure.
 * Equal results go to the defender (the boarded / raided ship).
 */
export function resolveOpposedShipTests(attacker: ShipTestResult, defender: ShipTestResult): OpposedShipOutcome {
    const attackerWins = attacker.success !== defender.success ? attacker.success : attacker.dos > defender.dos;
    const degrees = attackerWins ? attacker.dos - defender.dos : defender.dos - attacker.dos;
    return { winner: attackerWins ? 'attacker' : 'defender', degrees: Math.max(0, degrees) };
}

/** Inputs for a Pilot (Space Craft) + Manoeuvrability test. */
export interface PilotManoeuvrabilityInput {
    /** The helmsman's Pilot (Space Craft) skill target. */
    readonly pilotSkill: number;
    /** The ship whose Manoeuvrability is added. */
    readonly ship: ShipAssaultShip;
    /** The action's printed difficulty modifier (e.g. Hard −20). */
    readonly difficulty: number;
    /** Langpack key naming the difficulty. */
    readonly difficultyKey: string;
    readonly situational?: SituationalModifier;
}

/** Langpack key for the helmsman's Pilot (Space Craft) base row. */
export const PILOT_SKILL_KEY = 'WH40K.Voidcraft.Assault.Component.PilotSkill';

/**
 * Compose a Pilot (Space Craft) + Manoeuvrability test — the test that lands a
 * ram and locks two ships together for a boarding action (RT core rules).
 */
export function composePilotManoeuvrabilityTest(input: PilotManoeuvrabilityInput): ShipTestDerivation {
    const crippled = input.ship.crippledManoeuvrability;
    return deriveTarget({ labelKey: PILOT_SKILL_KEY, value: input.pilotSkill }, [
        { labelKey: MANOEUVRABILITY_KEY, value: input.ship.manoeuvrability - crippled, data: { ship: input.ship.name } },
        // RT "Crippled Ships" (#187): the −10 is its own row, not folded into the stat.
        ...(crippled === 0 ? [] : [{ labelKey: CRIPPLED_MANOEUVRABILITY_KEY, value: crippled }]),
        { labelKey: input.difficultyKey, value: input.difficulty },
        ...situationalComponents(input.situational),
    ]);
}
