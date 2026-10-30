/**
 * Story fixtures for the RT ship assault actions (#188): a langpack-backed
 * {@link Localize} that formats `{placeholder}` data like production, and a
 * pair of mock ship profiles.
 */
import type { ShipActionOrder, ShipActionShip } from '../../src/module/applications/ship-action/ship-action-flow.ts';
import type { Localize } from '../../src/module/applications/ship-assault/ship-assault-card.ts';
import type { AssaultShipActor } from '../../src/module/applications/ship-assault/ship-assault-flow.ts';
import type { ShipAssaultShip } from '../../src/module/rules/ship-assault.ts';
import { localizeKey } from './lang-localize';

/** Localize against en.json, substituting `{name}` placeholders from `data`. */
export const storyLocalize: Localize = (key, data) => {
    const template = localizeKey(key);
    if (data === undefined) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in data ? String(data[name]) : match));
};

/** The players' frigate. */
export const ATTACKER_SHIP: ShipAssaultShip = {
    name: 'The Errant Vector',
    hullType: 'frigate',
    manoeuvrability: 15,
    crippledManoeuvrability: 0,
    armour: 18,
    turretRating: 1,
    crewPopulation: 80,
    hullIntegrity: 35,
    morale: 75,
};

/** An enemy raider. */
export const DEFENDER_SHIP: ShipAssaultShip = {
    name: 'Whispering Star',
    hullType: 'raider',
    manoeuvrability: 20,
    crippledManoeuvrability: 0,
    armour: 16,
    turretRating: 1,
    crewPopulation: 55,
    hullIntegrity: 28,
    morale: 60,
};

/** A story ship actor: the assault flows read only this surface. */
export function storyShipActor(profile: ShipAssaultShip, crewRating = 45, voidShields = 1): AssaultShipActor {
    return {
        name: profile.name,
        isOwner: true,
        assaultProfile: profile,
        system: { gameSystem: 'rt', crew: { crewRating } },
        crew: { morale: { value: profile.morale } },
        hullIntegrity: { value: profile.hullIntegrity, max: profile.hullIntegrity },
        activeVoidShields: voidShields,
        overloadVoidShields: async (count: number) => Promise.resolve(count),
        applyHullDamage: async (amount: number) => Promise.resolve({ hullLoss: amount, crewLoss: amount, moraleLoss: amount }),
        applyCrewMoraleDamage: async (crew: number, morale: number) => Promise.resolve({ crewLoss: crew, moraleLoss: morale }),
        rollShipCriticalHit: async () => Promise.resolve(),
        takeCrippledCriticalHit: async () => Promise.resolve(),
    };
}

/** Deterministic dice for stories: each evaluation pops the next queued total. */
class StoryRoll {
    static totals: number[] = [];
    readonly formula: string;
    total = 0;
    dice: { results: { result: number }[] }[] = [];
    constructor(formula: string) {
        this.formula = formula;
    }
    async evaluate(): Promise<this> {
        this.total = StoryRoll.totals.shift() ?? 50;
        this.dice = [{ results: [{ result: this.total }] }];
        return Promise.resolve(this);
    }
}

/** Install {@link StoryRoll} as the global `Roll` and queue its totals. */
export function queueStoryRolls(...totals: number[]): void {
    StoryRoll.totals = totals;
    Object.assign(globalThis, { Roll: StoryRoll });
}

/**
 * A story ship for the RT ship-action roll (#186, #189): the players' frigate
 * with two Weapon Components; effects are accepted and dropped.
 */
export function storyActionShip(restored = 3, hull = ATTACKER_SHIP.hullIntegrity): ShipActionShip {
    return {
        name: ATTACKER_SHIP.name,
        system: { gameSystem: 'rt', crew: { crewRating: 40 } },
        manoeuvrability: ATTACKER_SHIP.manoeuvrability,
        detection: 25,
        hullIntegrity: { value: hull, max: ATTACKER_SHIP.hullIntegrity },
        shipActionEffects: [],
        shipWeaponChoices: [
            { id: 'macro', name: 'Sunsear Laser Battery' },
            { id: 'lance', name: 'Titanforge Lance' },
        ],
        reducePriorTurnDamage: async (_pool, amount) => Promise.resolve(Math.min(amount, restored)),
        applyShipActionModifier: async () => Promise.resolve(),
    };
}

/** Hold Fast! and Lock on Target as the RT pack authors them. */
export const STORY_HOLD_FAST: ShipActionOrder = {
    uuid: 'Compendium.wh40k-rpg.rt-ship-orders.Item.s67eT5kqEhgBT2It',
    name: 'Hold Fast!',
    img: '',
    test: { skill: '', characteristic: 'Willpower', modifier: 0, shipStat: '' },
    shipEffect: { kind: 'reducePriorTurnDamage', targets: ['morale'], base: 1, step: 1, per: 1, rounds: 0, expiry: '' },
};
export const STORY_LOCK_ON_TARGET: ShipActionOrder = {
    uuid: 'Compendium.wh40k-rpg.rt-ship-orders.Item.O37ZbK1Nvi3cGwGc',
    name: 'Lock on Target',
    img: '',
    test: { skill: 'Scrutiny', characteristic: '', modifier: 0, shipStat: 'detection' },
    shipEffect: { kind: 'shipModifier', targets: ['weaponBallisticSkill'], base: 5, step: 5, per: 2, rounds: 0, expiry: 'turnEnd' },
};
