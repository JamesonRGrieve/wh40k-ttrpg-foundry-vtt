import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../../testing/model-import.ts';

/**
 * Consolidates the per-(system, kind) concrete DataModel wrapper tests (#268).
 * Each concrete model is a thin `extends <Kind>BaseData` shell tagged with a
 * `gameSystem` literal; the 10 character/npc tests differed only by that literal
 * + their kind-base, so they collapse to one table-driven suite. (rt-terracraft
 * keeps its own file — it adds an armourSummary-getter assertion + a different
 * base.) Skip semantics are unchanged: these models can't load under happy-dom,
 * so each case skips cleanly when the import resolves to undefined.
 *
 * Imports are kicked off eagerly and handed straight to importModelOrSkip (which
 * attaches its catch immediately, so no unhandled rejection) — static paths keep
 * them typed, and there are no `() => import()` thunks to trip
 * promise-function-async.
 */

type Loaded = Promise<{ default: object } | undefined>;
interface ConcreteModelCase {
    label: string;
    gameSystem: string;
    mod: Loaded;
    base: Loaded;
}

const characterBase: Loaded = importModelOrSkip<{ default: object }>(import('../bases/character-base.ts'));
const npcBase: Loaded = importModelOrSkip<{ default: object }>(import('../bases/npc-base.ts'));

const CASES: ConcreteModelCase[] = [
    { label: 'BCCharacterData', gameSystem: 'bc', mod: importModelOrSkip<{ default: object }>(import('./bc-character.ts')), base: characterBase },
    { label: 'BCNPCData', gameSystem: 'bc', mod: importModelOrSkip<{ default: object }>(import('./bc-npc.ts')), base: npcBase },
    { label: 'DH1CharacterData', gameSystem: 'dh1', mod: importModelOrSkip<{ default: object }>(import('./dh1-character.ts')), base: characterBase },
    { label: 'DH1NPCData', gameSystem: 'dh1', mod: importModelOrSkip<{ default: object }>(import('./dh1-npc.ts')), base: npcBase },
    { label: 'DH2CharacterData', gameSystem: 'dh2', mod: importModelOrSkip<{ default: object }>(import('./dh2-character.ts')), base: characterBase },
    { label: 'DH2NPCData', gameSystem: 'dh2', mod: importModelOrSkip<{ default: object }>(import('./dh2-npc.ts')), base: npcBase },
    { label: 'DWCharacterData', gameSystem: 'dw', mod: importModelOrSkip<{ default: object }>(import('./dw-character.ts')), base: characterBase },
    { label: 'IMCharacterData', gameSystem: 'im', mod: importModelOrSkip<{ default: object }>(import('./im-character.ts')), base: characterBase },
    { label: 'OWCharacterData', gameSystem: 'ow', mod: importModelOrSkip<{ default: object }>(import('./ow-character.ts')), base: characterBase },
    { label: 'RTCharacterData', gameSystem: 'rt', mod: importModelOrSkip<{ default: object }>(import('./rt-character.ts')), base: characterBase },
];

describe('concrete per-system actor DataModels', () => {
    for (const { label, gameSystem, mod, base } of CASES) {
        it(`${label}: default export, static gameSystem='${gameSystem}', inherits its kind-base`, async () => {
            const [m, b] = await Promise.all([mod, base]);
            // eslint-disable-next-line @vitest/no-conditional-in-test -- single skip guard: these DataModels can't load under happy-dom (they eval `extends foundry.*` at module-load)
            if (m === undefined || b === undefined) return;
            expect(m.default).toBeTruthy();
            expect((m.default as { gameSystem?: string }).gameSystem).toBe(gameSystem);
            expect((m.default as { prototype: object }).prototype).toBeInstanceOf(b.default as new (...args: never[]) => object);
        });
    }
});
