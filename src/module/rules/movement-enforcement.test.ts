/**
 * Tests for combat movement-enforcement decision logic + wiring (#235).
 *
 * The canvas-touching hook handlers (distance measurement, flag tracking, turn
 * reset) need the Foundry runtime; here we assert the pure decision and that the
 * hooks are registered. The budget maths live in movement-budget.test.ts.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideTokenMove } from './movement-enforcement.ts';

describe('decideTokenMove', () => {
    it('only enforces under full automation in an active combat', () => {
        const off = { hasActiveCombat: true, isActorsTurn: false, movedThisTurnMetres: 0, requestedMetres: 99, allowanceMetres: 5 };
        expect(decideTokenMove({ automation: 'display', ...off }).allowed).toBe(true);
        expect(decideTokenMove({ automation: 'none', ...off }).allowed).toBe(true);
        expect(
            decideTokenMove({
                automation: 'full',
                hasActiveCombat: false,
                isActorsTurn: false,
                movedThisTurnMetres: 0,
                requestedMetres: 99,
                allowanceMetres: 5,
            }).allowed,
        ).toBe(true);
    });

    it('blocks off-turn movement under full automation', () => {
        const r = decideTokenMove({
            automation: 'full',
            hasActiveCombat: true,
            isActorsTurn: false,
            movedThisTurnMetres: 0,
            requestedMetres: 1,
            allowanceMetres: 8,
        });
        expect(r.allowed).toBe(false);
        expect(r.reason).toBe('not-your-turn');
    });

    it("blocks an over-budget move on the actor's turn", () => {
        const r = decideTokenMove({
            automation: 'full',
            hasActiveCombat: true,
            isActorsTurn: true,
            movedThisTurnMetres: 6,
            requestedMetres: 4,
            allowanceMetres: 8,
        });
        expect(r.allowed).toBe(false);
        expect(r.reason).toBe('over-budget');
    });

    it("allows a within-budget move on the actor's turn", () => {
        expect(
            decideTokenMove({ automation: 'full', hasActiveCombat: true, isActorsTurn: true, movedThisTurnMetres: 2, requestedMetres: 4, allowanceMetres: 8 })
                .allowed,
        ).toBe(true);
    });
});

describe('movement enforcement wiring (#235)', () => {
    const src = readFileSync(resolve(__dirname, './movement-enforcement.ts'), 'utf8');
    const hooks = readFileSync(resolve(__dirname, '../hooks-manager.ts'), 'utf8');

    it('registers preUpdateToken / updateToken / updateCombat hooks', () => {
        expect(src).toContain("Hooks.on('preUpdateToken'");
        expect(src).toContain("Hooks.on('updateToken'");
        expect(src).toContain("Hooks.on('updateCombat'");
    });

    it('is conservative: GM bypass and allow-on-error', () => {
        expect(src).toContain('game.user.isGM');
        expect(src).toContain('allowing on error');
    });

    it('is wired into the boot hook registration', () => {
        expect(hooks).toContain('registerMovementEnforcement()');
    });
});
