import { describe, expect, it } from 'vitest';
import { opposedDegrees, type OpposedSide, resolveOpposed } from './opposed.ts';

const side = (over: Partial<OpposedSide> = {}): OpposedSide => ({ success: true, dos: 1, dof: 0, charBonus: 3, roll: 40, ...over });

describe('resolveOpposed — RAW victor ladder (#449)', () => {
    it('a success beats a failure', () => {
        expect(resolveOpposed(side({ success: true, dos: 1, dof: 0 }), side({ success: false, dos: 0, dof: 2 })).winner).toBe('initiator');
        expect(resolveOpposed(side({ success: false, dos: 0, dof: 2 }), side({ success: true, dos: 1, dof: 0 })).winner).toBe('target');
    });

    it('both fail → stalemate', () => {
        expect(resolveOpposed(side({ success: false, dos: 0, dof: 1 }), side({ success: false, dos: 0, dof: 3 }))).toEqual({ winner: 'stalemate', margin: 0 });
    });

    it('both succeed → most degrees of success wins, margin = degree difference', () => {
        expect(resolveOpposed(side({ dos: 4 }), side({ dos: 1 }))).toEqual({ winner: 'initiator', margin: 3 });
        expect(resolveOpposed(side({ dos: 1 }), side({ dos: 4 }))).toEqual({ winner: 'target', margin: 3 });
    });

    it('degree tie → higher characteristic bonus wins (margin 0)', () => {
        expect(resolveOpposed(side({ dos: 2, charBonus: 5 }), side({ dos: 2, charBonus: 3 }))).toEqual({ winner: 'initiator', margin: 0 });
        expect(resolveOpposed(side({ dos: 2, charBonus: 3 }), side({ dos: 2, charBonus: 5 }))).toEqual({ winner: 'target', margin: 0 });
    });

    it('degree + bonus tie → lowest roll wins', () => {
        expect(resolveOpposed(side({ dos: 2, charBonus: 4, roll: 12 }), side({ dos: 2, charBonus: 4, roll: 55 })).winner).toBe('initiator');
        expect(resolveOpposed(side({ dos: 2, charBonus: 4, roll: 55 }), side({ dos: 2, charBonus: 4, roll: 12 })).winner).toBe('target');
    });

    it('true dead heat → stalemate', () => {
        expect(resolveOpposed(side({ dos: 2, charBonus: 4, roll: 30 }), side({ dos: 2, charBonus: 4, roll: 30 }))).toEqual({ winner: 'stalemate', margin: 0 });
    });

    it('margin across the win/loss boundary sums the winner DoS and loser DoF', () => {
        // initiator succeeds by 2, target fails by 3 → margin 5.
        expect(resolveOpposed(side({ success: true, dos: 2, dof: 0 }), side({ success: false, dos: 0, dof: 3 })).margin).toBe(5);
    });
});

describe('opposedDegrees — signed initiator-perspective margin', () => {
    it('both succeed: initiator DoS minus target DoS', () => {
        expect(opposedDegrees({ dos: 4, dof: 0 }, { dos: 1, dof: 0 })).toBe(3);
    });
    it('initiator succeeds, target fails: sums the degrees', () => {
        expect(opposedDegrees({ dos: 2, dof: 0 }, { dos: 0, dof: 3 })).toBe(5);
    });
    it('initiator fails, target succeeds: negative sum', () => {
        expect(opposedDegrees({ dos: 0, dof: 2 }, { dos: 3, dof: 0 })).toBe(-5);
    });
    it('both fail: negative difference of failures', () => {
        expect(opposedDegrees({ dos: 0, dof: 1 }, { dos: 0, dof: 4 })).toBe(3);
    });
});
