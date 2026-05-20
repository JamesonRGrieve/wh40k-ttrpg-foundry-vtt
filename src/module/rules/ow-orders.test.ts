import { describe, expect, it } from 'vitest';

import {
    GENERIC_ORDERS,
    GENERIC_ORDER_CLOSE_QUARTERS,
    GENERIC_ORDER_RANGED_VOLLEY,
    GENERIC_ORDER_TAKE_COVER,
    applyOrderEffect,
    canIssueOrder,
    getSweepingOrders,
    type OrderDef,
    type SquadMemberMods,
} from './ow-orders.ts';

describe('ow-orders · generic Order constants', () => {
    it('exposes the three RAW generic Orders with the expected ids and kind', () => {
        expect(GENERIC_ORDER_RANGED_VOLLEY.id).toBe('ranged-volley');
        expect(GENERIC_ORDER_RANGED_VOLLEY.kind).toBe('generic');
        expect(GENERIC_ORDER_CLOSE_QUARTERS.id).toBe('close-quarters');
        expect(GENERIC_ORDER_CLOSE_QUARTERS.kind).toBe('generic');
        expect(GENERIC_ORDER_TAKE_COVER.id).toBe('take-cover');
        expect(GENERIC_ORDER_TAKE_COVER.kind).toBe('generic');
        expect(GENERIC_ORDERS).toHaveLength(3);
        expect(GENERIC_ORDERS.map((o) => o.id)).toEqual(['ranged-volley', 'close-quarters', 'take-cover']);
    });

    it('Ranged Volley grants +5 Ballistic Skill', () => {
        expect(GENERIC_ORDER_RANGED_VOLLEY.effect.characteristic).toBe('ballisticSkill');
        expect(GENERIC_ORDER_RANGED_VOLLEY.effect.modifier).toBe(5);
    });

    it('Close Quarters and Take Cover tag traits rather than numeric mods', () => {
        expect(GENERIC_ORDER_CLOSE_QUARTERS.effect.trait).toBe('ganging-up');
        expect(GENERIC_ORDER_TAKE_COVER.effect.trait).toBe('cover-bonus');
    });

    it('marks no generic Order as Cohesion-gated', () => {
        for (const order of GENERIC_ORDERS) {
            expect(order.cohesionRequired ?? false).toBe(false);
        }
    });
});

describe('ow-orders · canIssueOrder', () => {
    it('blocks when the required action cost is unavailable', () => {
        const result = canIssueOrder({
            order: GENERIC_ORDER_RANGED_VOLLEY,
            hasFullAction: false,
            hasHalfAction: false,
            cohesionAvailable: true,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('insufficient-action');
    });

    it('blocks a full-action Order when only a half-action is available', () => {
        const fullOrder: OrderDef = {
            id: 'speciality-x',
            kind: 'speciality',
            actionCost: 'full',
            effect: { description: 'opaque' },
        };
        const result = canIssueOrder({
            order: fullOrder,
            hasFullAction: false,
            hasHalfAction: true,
            cohesionAvailable: true,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('insufficient-action');
    });

    it('allows a half-action Order when only a half-action is available and no Cohesion is required', () => {
        const result = canIssueOrder({
            order: GENERIC_ORDER_RANGED_VOLLEY,
            hasFullAction: false,
            hasHalfAction: true,
            cohesionAvailable: false,
        });
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
    });

    it('allows the Order when Cohesion is not required regardless of cohesionAvailable', () => {
        const result = canIssueOrder({
            order: GENERIC_ORDER_TAKE_COVER,
            hasFullAction: true,
            hasHalfAction: true,
            cohesionAvailable: false,
        });
        expect(result.allowed).toBe(true);
    });

    it('blocks when Cohesion is required and unavailable', () => {
        const cohesionOrder: OrderDef = {
            id: 'speciality-cohesion',
            kind: 'speciality',
            actionCost: 'half',
            cohesionRequired: true,
            effect: { description: 'opaque' },
        };
        const result = canIssueOrder({
            order: cohesionOrder,
            hasFullAction: true,
            hasHalfAction: true,
            cohesionAvailable: false,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('insufficient-cohesion');
    });

    it('always allows free-cost Orders ignoring action state', () => {
        const sweep: OrderDef = {
            id: 'sweep-x',
            kind: 'sweeping',
            actionCost: 'free',
            sweeping: true,
            effect: { trait: 'morale-up' },
        };
        const result = canIssueOrder({
            order: sweep,
            hasFullAction: false,
            hasHalfAction: false,
            cohesionAvailable: false,
        });
        expect(result.allowed).toBe(true);
    });
});

describe('ow-orders · applyOrderEffect', () => {
    it('appends the order effect to every squad member', () => {
        const squad: SquadMemberMods[] = [
            { id: 'a', mods: [] },
            { id: 'b', mods: [{ trait: 'pre-existing' }] },
            { id: 'c', mods: [] },
        ];

        const next = applyOrderEffect(GENERIC_ORDER_RANGED_VOLLEY, squad);

        expect(next).toHaveLength(3);
        for (const m of next) {
            const last = m.mods[m.mods.length - 1];
            expect(last).toEqual({ characteristic: 'ballisticSkill', modifier: 5 });
        }
        // Member b's prior mod is preserved.
        expect(next[1]?.mods[0]).toEqual({ trait: 'pre-existing' });
        // Pure function — original squad unchanged.
        expect(squad[0]?.mods).toEqual([]);
        expect(squad[1]?.mods).toHaveLength(1);
    });

    it('handles an empty squad without throwing', () => {
        const next = applyOrderEffect(GENERIC_ORDER_TAKE_COVER, []);
        expect(next).toEqual([]);
    });
});

describe('ow-orders · getSweepingOrders', () => {
    it('picks only sweeping orders out of a mixed list', () => {
        const sweep: OrderDef = {
            id: 'sweep-x',
            kind: 'sweeping',
            actionCost: 'free',
            sweeping: true,
            effect: { trait: 'morale-up' },
        };
        const speciality: OrderDef = {
            id: 'spec-y',
            kind: 'speciality',
            actionCost: 'half',
            effect: { description: 'opaque' },
        };

        const result = getSweepingOrders([GENERIC_ORDER_RANGED_VOLLEY, sweep, speciality]);

        expect(result).toHaveLength(1);
        expect(result[0]?.id).toBe('sweep-x');
    });

    it('returns an empty array when nothing is sweeping', () => {
        expect(getSweepingOrders(GENERIC_ORDERS)).toEqual([]);
    });

    it('accepts the convenience flag without a sweeping kind', () => {
        const hybrid: OrderDef = {
            id: 'hybrid',
            kind: 'speciality',
            actionCost: 'half',
            sweeping: true,
            effect: { description: 'opaque' },
        };
        const result = getSweepingOrders([hybrid]);
        expect(result).toHaveLength(1);
        expect(result[0]?.id).toBe('hybrid');
    });
});
