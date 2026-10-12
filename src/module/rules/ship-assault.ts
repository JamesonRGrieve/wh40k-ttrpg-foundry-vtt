/**
 * Shared primitives for the Rogue Trader ship-to-ship assault actions —
 * Ramming, Boarding Actions and Hit and Run (RT Core pp.215, 218, 220).
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

import { degreesOfFailure, degreesOfSuccess, isD100Success } from './_dice.ts';

/**
 * Game-system id the ship assault actions are gated on. Ramming, boarding and
 * Hit and Run are Rogue Trader starship-combat rules; the other lines' void
 * craft have no such actions, so every entry point checks this explicitly.
 */
export const SHIP_ASSAULT_GAME_SYSTEM = 'rt';

/** Whether a voidcraft of the given game system can take the assault actions. */
export function supportsShipAssault(gameSystem: string): boolean {
    return gameSystem === SHIP_ASSAULT_GAME_SYSTEM;
}

/** Interpolation data a component's langpack key formats with. */
export type ShipComponentData = Readonly<Record<string, string | number>>;

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
    /** Degrees of Success (0 on a failure). */
    readonly dos: number;
    /** Degrees of Failure (0 on a success). */
    readonly dof: number;
}

/** The stats of one ship an assault action reads. */
export interface ShipAssaultShip {
    readonly name: string;
    readonly hullType: string;
    readonly manoeuvrability: number;
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
 * rule (natural 01 passes, natural 100 fails); a passing roll always scores at
 * least one degree, so an auto-pass on 01 against a target below 1 is still 1
 * DoS. Degrees of Failure count from the target itself.
 */
export function resolveShipTest(derivation: ShipTestDerivation, roll: number): ShipTestResult {
    const success = isD100Success(roll, derivation.target);
    const dos = success ? Math.max(1, degreesOfSuccess(roll, derivation.target)) : 0;
    const dof = success ? 0 : Math.max(1, degreesOfFailure(roll, derivation.target));
    return { ...derivation, roll, success, dos, dof };
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
 * ram and locks two ships together for a boarding action (RT Core p.215).
 */
export function composePilotManoeuvrabilityTest(input: PilotManoeuvrabilityInput): ShipTestDerivation {
    return deriveTarget({ labelKey: PILOT_SKILL_KEY, value: input.pilotSkill }, [
        { labelKey: MANOEUVRABILITY_KEY, value: input.ship.manoeuvrability, data: { ship: input.ship.name } },
        { labelKey: input.difficultyKey, value: input.difficulty },
        ...situationalComponents(input.situational),
    ]);
}
