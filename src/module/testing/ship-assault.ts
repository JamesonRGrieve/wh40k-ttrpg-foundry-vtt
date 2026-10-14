/**
 * Test support for the RT ship assault flows (#188): a queued `Roll` stub and
 * a structural ship actor that records the damage applied to it.
 */
import { vi } from 'vitest';
import type { AssaultFormValues, AssaultShipActor, ShipAssaultContext } from '../applications/ship-assault/ship-assault-flow.ts';
import type { DegreesMethod } from '../rolls/roll-helpers.ts';
import type { ShipAssaultShip } from '../rules/ship-assault.ts';

/** One queued roll outcome: its total and (for pools) its individual dice. */
interface QueuedRoll {
    total: number;
    dice?: number[];
}

/** A `Roll` stand-in that answers each evaluation from a queue, in order. */
export class QueuedRollStub {
    static queue: QueuedRoll[] = [];
    static formulas: string[] = [];

    readonly formula: string;
    total = 0;
    dice: { results: { result: number }[] }[] = [];

    constructor(formula: string) {
        this.formula = formula;
    }

    async evaluate(): Promise<this> {
        QueuedRollStub.formulas.push(this.formula);
        const next = QueuedRollStub.queue.shift() ?? { total: 0 };
        this.total = next.total;
        this.dice = [{ results: (next.dice ?? [next.total]).map((result) => ({ result })) }];
        return Promise.resolve(this);
    }
}

/** Install the stub as the global `Roll` and queue the outcomes. */
export function queueRolls(...rolls: (number | QueuedRoll)[]): void {
    QueuedRollStub.queue = rolls.map((roll) => (typeof roll === 'number' ? { total: roll } : roll));
    QueuedRollStub.formulas = [];
    vi.stubGlobal('Roll', QueuedRollStub);
}

/** A structural ship actor recording every damage call. */
export interface RecordingShip extends AssaultShipActor {
    hullHits: number[];
    crewHits: [number, number][];
    criticalHits: (number | undefined)[];
    /** Each `overloadVoidShields` call's count. */
    shieldOverloads: number[];
}

export function recordingShip(profile: ShipAssaultShip, options: { crewRating?: number; isOwner?: boolean; voidShields?: number } = {}): RecordingShip {
    const ship: RecordingShip = {
        name: profile.name,
        isOwner: options.isOwner ?? true,
        assaultProfile: profile,
        system: { gameSystem: 'rt', crew: { crewRating: options.crewRating ?? 40 } },
        crew: { morale: { value: profile.morale } },
        hullIntegrity: { value: profile.hullIntegrity, max: profile.hullIntegrity },
        activeVoidShields: options.voidShields ?? 0,
        hullHits: [],
        crewHits: [],
        criticalHits: [],
        shieldOverloads: [],
        overloadVoidShields: async (count: number) => {
            ship.shieldOverloads.push(count);
            return Promise.resolve(count);
        },
        rollShipCriticalHit: async (rolled?: number) => {
            ship.criticalHits.push(rolled);
            return Promise.resolve();
        },
        applyHullDamage: async (amount: number) => {
            ship.hullHits.push(amount);
            return Promise.resolve({ hullLoss: amount, crewLoss: amount, moraleLoss: amount });
        },
        applyCrewMoraleDamage: async (crew: number, morale: number) => {
            ship.crewHits.push([crew, morale]);
            return Promise.resolve({ crewLoss: crew, moraleLoss: morale });
        },
    };
    return ship;
}

/** Echo localizer: returns the key, with data appended, so assertions can read both. */
export function echoLocalize(key: string, data?: Readonly<Record<string, string | number>>): string {
    return data === undefined ? key : `${key}${JSON.stringify(data)}`;
}

/** A flow context between two recording ships. Degrees count the Rogue Trader way unless `degreesMethod` overrides it. */
export function assaultContext(attacker: RecordingShip, defender: RecordingShip, degreesMethod: DegreesMethod = 'gen1'): ShipAssaultContext {
    return { attacker, defender, localize: echoLocalize, degreesMethod };
}

/** Form values backed by a plain record. */
export function formValues(values: Record<string, number | string | boolean>): AssaultFormValues {
    return {
        number: (name, fallback) => {
            const value = values[name];
            return typeof value === 'number' ? value : fallback;
        },
        text: (name, fallback) => {
            const value = values[name];
            return typeof value === 'string' ? value : fallback;
        },
        checked: (name) => values[name] === true,
    };
}
