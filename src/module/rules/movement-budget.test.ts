/**
 * Tests for combat movement enforcement rule logic (#235).
 */

import { describe, expect, it } from 'vitest';
import { evaluateCombatMovement, turnMovementAllowance } from './movement-budget.ts';

const base = { enforced: true, isActorsTurn: true, movedThisTurnMetres: 0, requestedMetres: 5, allowanceMetres: 10 };

describe('evaluateCombatMovement', () => {
    it('allows freely when enforcement is off', () => {
        const r = evaluateCombatMovement({ ...base, enforced: false, isActorsTurn: false, requestedMetres: 999 });
        expect(r.allowed).toBe(true);
        expect(r.reason).toBe('ok');
    });

    it("blocks movement when it is not the mover's turn", () => {
        const r = evaluateCombatMovement({ ...base, isActorsTurn: false });
        expect(r.allowed).toBe(false);
        expect(r.reason).toBe('not-your-turn');
    });

    it('allows when the allowance is unknown (<= 0) — never enforce a budget we cannot compute', () => {
        expect(evaluateCombatMovement({ ...base, allowanceMetres: 0, requestedMetres: 999 }).allowed).toBe(true);
        expect(evaluateCombatMovement({ ...base, allowanceMetres: -1, requestedMetres: 999 }).allowed).toBe(true);
    });

    it('allows a move within the remaining budget and reports remaining', () => {
        const r = evaluateCombatMovement({ ...base, movedThisTurnMetres: 3, requestedMetres: 4, allowanceMetres: 10 });
        expect(r.allowed).toBe(true);
        expect(r.remaining).toBe(3); // 10 - (3 + 4)
    });

    it('blocks a move whose running total exceeds the allowance', () => {
        const r = evaluateCombatMovement({ ...base, movedThisTurnMetres: 8, requestedMetres: 4, allowanceMetres: 10 });
        expect(r.allowed).toBe(false);
        expect(r.reason).toBe('over-budget');
        expect(r.remaining).toBe(2);
    });

    it('tolerates tiny float/grid rounding at the allowance boundary', () => {
        expect(evaluateCombatMovement({ ...base, movedThisTurnMetres: 0, requestedMetres: 10.005, allowanceMetres: 10 }).allowed).toBe(true);
        expect(evaluateCombatMovement({ ...base, movedThisTurnMetres: 0, requestedMetres: 10.5, allowanceMetres: 10 }).allowed).toBe(false);
    });
});

describe('turnMovementAllowance', () => {
    const rates = { half: 4, full: 8, charge: 12, run: 24 };

    it('defaults to a full move when no mode is selected', () => {
        expect(turnMovementAllowance(rates, undefined)).toBe(8);
        expect(turnMovementAllowance({ full: 8 }, undefined)).toBe(8);
    });

    it('returns the rate for the selected move mode', () => {
        expect(turnMovementAllowance(rates, 'half')).toBe(4);
        expect(turnMovementAllowance(rates, 'full')).toBe(8);
        expect(turnMovementAllowance(rates, 'charge')).toBe(12);
        expect(turnMovementAllowance(rates, 'run')).toBe(24);
    });

    it('falls back to the full move when the selected mode has no rate', () => {
        expect(turnMovementAllowance({ full: 8 }, 'charge')).toBe(8);
    });

    it('returns 0 (unknown) when rates are missing', () => {
        expect(turnMovementAllowance(undefined, undefined)).toBe(0);
        expect(turnMovementAllowance({}, 'run')).toBe(0);
    });
});
