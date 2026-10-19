import { describe, expect, it } from 'vitest';
import { comradeOrdersFor } from '../config/game-systems/index.ts';
import type { ComradeRecord } from './ow-comrade.ts';
import {
    COMRADE_ACTION_HALVES,
    type ComradeOrderContext,
    type ComradeOrderDef,
    comradeOrderTestComponents,
    ordersInForce,
    readActiveComradeOrders,
    resolveComradeOrder,
    sumComradeOrderComponents,
} from './ow-orders.ts';

/** Only War's printed Orders (OW Core pp. 269–271), from the line config. */
const ORDERS = comradeOrdersFor('ow');

function order(id: string): ComradeOrderDef {
    const found = ORDERS.find((candidate) => candidate.id === id);
    if (found === undefined) throw new Error(`Only War prints no ${id} Order`);
    return found;
}

const FIT: Pick<ComradeRecord, 'state' | 'fleeing' | 'pinned'> = { state: 'unharmed', fleeing: false, pinned: false };

function resolve(id: string, over: Partial<ComradeOrderContext> = {}): ReturnType<typeof resolveComradeOrder> {
    return resolveComradeOrder({ order: order(id), comrade: FIT, inCohesion: true, actionsLeft: 2, inCombat: true, ...over });
}

describe('ow-orders — the printed Orders (OW Core pp. 269–271)', () => {
    it('Only War prints Maintain Cohesion, the five move Actions, Ranged Volley, Close Quarters and Take Cover!', () => {
        expect(ORDERS.map((candidate) => [candidate.id, candidate.actionCost])).toEqual([
            ['follow', 'half'],
            ['disengage', 'full'],
            ['move-half', 'half'],
            ['move-full', 'full'],
            ['run', 'full'],
            ['stand-mount', 'half'],
            ['tactical-advance', 'full'],
            ['ranged-volley', 'half'],
            ['close-quarters', 'half'],
            ['take-cover', 'full'],
        ]);
    });

    it('Ranged Volley gives +5 to Ballistic Skill tests, only in Cohesion', () => {
        expect(order('ranged-volley')).toMatchObject({
            cohesion: 'for-benefit',
            benefit: { kind: 'characteristic', characteristic: 'ballisticSkill', modifier: 5 },
        });
    });

    it.each(['dh1', 'dh2', 'rt', 'bc', 'dw', 'im'])('%s prints no Comrade Orders', (line) => {
        expect(comradeOrdersFor(line)).toEqual([]);
    });

    it('a Full Action is the whole Turn: two Half Actions', () => {
        expect(COMRADE_ACTION_HALVES).toEqual({ half: 1, full: 2 });
    });
});

describe('ow-orders — resolveComradeOrder', () => {
    it('an Order in Cohesion with the action left is carried out and grants its benefit', () => {
        expect(resolve('ranged-volley')).toEqual({ enacted: true, block: null, halves: 1, grantsBenefit: true });
        expect(resolve('take-cover')).toEqual({ enacted: true, block: null, halves: 2, grantsBenefit: false });
    });

    it('out of Cohesion a for-benefit Order is carried out but grants nothing', () => {
        expect(resolve('ranged-volley', { inCohesion: false })).toEqual({ enacted: true, block: null, halves: 1, grantsBenefit: false });
    });

    it('out of Cohesion the Comrade cannot follow, but can still be moved by the move Orders', () => {
        expect(resolve('follow', { inCohesion: false }).block).toBe('needs-cohesion');
        const moves = ['disengage', 'move-half', 'move-full', 'run', 'stand-mount', 'tactical-advance'];
        expect(moves.filter((id) => !resolve(id, { inCohesion: false }).enacted)).toEqual([]);
    });

    it('an Order given after the Comrade has used its Actions has no effect', () => {
        expect(resolve('ranged-volley', { actionsLeft: 0 }).block).toBe('no-actions');
        expect(resolve('take-cover', { actionsLeft: 1 }).block).toBe('no-actions');
        expect(resolve('move-half', { actionsLeft: 1 }).enacted).toBe(true);
    });

    it('a wounded Comrade cannot Run, but can still Move', () => {
        expect(resolve('run', { comrade: { ...FIT, state: 'wounded' } }).block).toBe('wounded');
        expect(resolve('move-full', { comrade: { ...FIT, state: 'wounded' } }).enacted).toBe(true);
    });

    it('a dead, pinned or fleeing Comrade carries out nothing; nor is there a Turn out of combat', () => {
        expect(resolve('move-half', { comrade: { ...FIT, state: 'dead' } }).block).toBe('dead');
        expect(resolve('move-half', { comrade: { ...FIT, pinned: true } }).block).toBe('pinned');
        expect(resolve('move-half', { comrade: { ...FIT, fleeing: true } }).block).toBe('fleeing');
        expect(resolve('move-half', { inCombat: false }).block).toBe('not-in-combat');
    });
});

describe('ow-orders — benefits in force (Path B)', () => {
    const NOW = { combatId: 'c1', round: 3 };
    const volley = { orderId: 'ranged-volley', combatId: 'c1', round: 3 };
    const describeOrder = (def: ComradeOrderDef): { label: string; source: string } => ({ label: def.id, source: `${def.id} (Vask)` });

    it('a benefit lasts the Turn it was given in', () => {
        expect(ordersInForce([volley, { ...volley, round: 2 }], NOW)).toEqual([volley]);
        expect(ordersInForce([volley], null)).toEqual([]);
    });

    it('Ranged Volley adds a sourced +5 row to Ballistic Skill tests this Turn, and nothing to others', () => {
        const rows = comradeOrderTestComponents([volley], ORDERS, NOW, 'ballisticSkill', describeOrder);
        expect(rows).toEqual([{ key: 'comrade-order-ranged-volley', label: 'ranged-volley', value: 5, source: 'ranged-volley (Vask)' }]);
        expect(sumComradeOrderComponents(rows)).toBe(5);
        expect(comradeOrderTestComponents([volley], ORDERS, NOW, 'weaponSkill', describeOrder)).toEqual([]);
        expect(comradeOrderTestComponents([volley], ORDERS, { combatId: 'c1', round: 4 }, 'ballisticSkill', describeOrder)).toEqual([]);
    });

    it('reads the stored benefits, skipping malformed entries and actor types without the slot', () => {
        expect(readActiveComradeOrders({ activeOrders: [volley, { orderId: 3 }, null] })).toEqual([volley]);
        expect(readActiveComradeOrders({})).toEqual([]);
    });
});
