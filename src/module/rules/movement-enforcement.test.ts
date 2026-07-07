/**
 * Tests for combat movement-enforcement decision logic + wiring (#235).
 *
 * The canvas-touching hook handlers (distance measurement, flag tracking, turn
 * reset) need the Foundry runtime; here we assert the pure decision and that the
 * hooks are registered. The budget maths live in movement-budget.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../testing/repo-file.ts';
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
    const src = readRepoFile('src/module/rules/movement-enforcement.ts');
    const hooks = readRepoFile('src/module/hooks-manager.ts');
    const turnHooks = readRepoFile('src/module/rules/combat-turn-hooks.ts');

    it('registers the token move-gate hooks and resets via the shared turn-start boundary', () => {
        expect(src).toContain("Hooks.on('preUpdateToken'");
        expect(src).toContain("Hooks.on('updateToken'");
        // The per-turn budget reset moved onto the shared turn-start hook (#413):
        // movement-enforcement subscribes to onTurnStart instead of registering
        // its own updateCombat listener; combat-turn-hooks owns the updateCombat wiring.
        expect(src).toContain('onTurnStart(resetMovementOnTurnStart)');
        expect(turnHooks).toContain("Hooks.on('updateCombat'");
    });

    it('is conservative: GM bypass and allow-on-error', () => {
        expect(src).toContain('game.user.isGM');
        expect(src).toContain('allowing on error');
    });

    it('is wired into the boot hook registration', () => {
        expect(hooks).toContain('registerMovementEnforcement()');
    });
});
