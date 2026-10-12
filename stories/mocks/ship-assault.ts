/**
 * Story fixtures for the RT ship assault actions (#188): a langpack-backed
 * {@link Localize} that formats `{placeholder}` data like production, and a
 * pair of mock ship profiles.
 */
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
    armour: 16,
    turretRating: 1,
    crewPopulation: 55,
    hullIntegrity: 28,
    morale: 60,
};

/** A story ship actor: the assault flows read only this surface. */
export function storyShipActor(profile: ShipAssaultShip, crewRating = 45): AssaultShipActor {
    return {
        name: profile.name,
        isOwner: true,
        assaultProfile: profile,
        system: { gameSystem: 'rt', crew: { crewRating } },
        crew: { morale: { value: profile.morale } },
        applyHullDamage: async (amount: number) => Promise.resolve({ hullLoss: amount, crewLoss: amount, moraleLoss: amount }),
        applyCrewMoraleDamage: async (crew: number, morale: number) => Promise.resolve({ crewLoss: crew, moraleLoss: morale }),
        rollShipCriticalHit: async () => Promise.resolve(),
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
