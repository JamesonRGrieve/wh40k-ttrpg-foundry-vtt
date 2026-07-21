import { describe, expect, it, vi } from 'vitest';
import { importModelOrSkip } from '../testing/model-import.ts';

/**
 * The global `CONFIG.Combat.initiative.formula` every FFG-line creature uses.
 * Returned by the stub base class so a fallback is distinguishable from an
 * actor-declared formula.
 */
const GLOBAL_FALLBACK_FORMULA = '@initiative.base + @initiative.bonus';

/**
 * Stand-in for Foundry's `Combatant`, which `combatant.ts` extends at
 * module-evaluation time and happy-dom does not provide. Only
 * `_getInitiativeFormula` is exercised, so only it is stubbed.
 */
class StubCombatant {
    protected _getInitiativeFormula(): string {
        return GLOBAL_FALLBACK_FORMULA;
    }
}

vi.stubGlobal('Combatant', StubCombatant);

/**
 * Precise surface the tests reach into. `_getInitiativeFormula` is `protected`
 * on the real class, and `actor` is defined per-instance below, so a narrow
 * local interface beats casting the instance.
 */
interface InitiativeFormulaProbe {
    _getInitiativeFormula: () => string;
}

/** Actor stub shape: only the system DataModel's opt-in formula slot matters. */
interface ActorStub {
    system: { initiativeFormula?: string };
}

/**
 * Minimal constructor shape the tests need: instances are built prototype-only
 * (the real class needs a Foundry document context to construct).
 */
interface CombatantConstructor {
    readonly prototype: object;
}

describe('WH40KCombatant', () => {
    /** Build a prototype-only instance with the given actor attached. */
    function makeCombatant(Cls: CombatantConstructor, actor: ActorStub | null): InitiativeFormulaProbe {
        const combatant = Object.create(Cls.prototype) as InitiativeFormulaProbe;
        Object.defineProperty(combatant, 'actor', { value: actor, writable: true });
        return combatant;
    }

    it('exports WH40KCombatant class', async () => {
        const mod = await importModelOrSkip(import('./combatant.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod.WH40KCombatant).toBeTruthy();
    });

    it('prefers a formula the actor system DataModel declares', async () => {
        const mod = await importModelOrSkip(import('./combatant.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;

        const combatant = makeCombatant(mod.WH40KCombatant, {
            system: { initiativeFormula: '1d10 + @detBonus' },
        });
        expect(combatant._getInitiativeFormula()).toBe('1d10 + @detBonus');
    });

    it('falls back to the global formula when the system declares none', async () => {
        const mod = await importModelOrSkip(import('./combatant.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;

        const combatant = makeCombatant(mod.WH40KCombatant, { system: {} });
        expect(combatant._getInitiativeFormula()).toBe(GLOBAL_FALLBACK_FORMULA);
    });

    it('falls back when the declared formula is an empty string', async () => {
        const mod = await importModelOrSkip(import('./combatant.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;

        const combatant = makeCombatant(mod.WH40KCombatant, { system: { initiativeFormula: '' } });
        expect(combatant._getInitiativeFormula()).toBe(GLOBAL_FALLBACK_FORMULA);
    });

    it('falls back when the combatant has no actor', async () => {
        const mod = await importModelOrSkip(import('./combatant.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;

        const combatant = makeCombatant(mod.WH40KCombatant, null);
        expect(combatant._getInitiativeFormula()).toBe(GLOBAL_FALLBACK_FORMULA);
    });
});
