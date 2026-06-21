import { afterAll, describe, expect, it } from 'vitest';
import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { importModelOrSkip } from '../../testing/model-import.ts';

/**
 * skill-grant.ts evaluates `extends foundry.abstract.DataModel` at module-load —
 * undefined under happy-dom. Stub a no-op DataModel base BEFORE the dynamic
 * import so the class loads; the pure `_getSchemaSkillKey` resolver never touches
 * the schema, so a no-op base is sufficient. (Same recipe as grants-manager.test.)
 */
class FakeDataModel {
    isFakeDataModel = true;
}
type AnyCtor = abstract new (...args: never[]) => object;
interface FoundryStub {
    abstract: { DataModel: AnyCtor; TypeDataModel: AnyCtor };
}
interface GlobalShim {
    foundry?: FoundryStub | undefined;
}
const G = globalThis as GlobalShim;
const ORIGINAL_FOUNDRY = G.foundry;
G.foundry = { abstract: { DataModel: FakeDataModel, TypeDataModel: FakeDataModel } };

afterAll(() => {
    G.foundry = ORIGINAL_FOUNDRY;
});

const { default: SkillGrantData } = await import('./skill-grant.ts');

/** Minimal actor stub exposing only `system.skills` (the schema surface the resolver validates against). */
function actorWithSkills(...keys: string[]): WH40KBaseActor {
    const skills: Record<string, { trained: boolean; plus10: boolean; plus20: boolean }> = {};
    for (const key of keys) skills[key] = { trained: false, plus10: false, plus20: false };
    return { system: { skills } } as unknown as WH40KBaseActor;
}

/** Build a grant instance without invoking the (schema-touching) constructor. */
function makeGrant(): InstanceType<typeof SkillGrantData> {
    return Object.create(SkillGrantData.prototype) as InstanceType<typeof SkillGrantData>;
}

describe('SkillGrantData', () => {
    it('has a default SkillGrantData symbol exported', async () => {
        const mod = await importModelOrSkip(import('./skill-grant.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });
});

describe('SkillGrantData._getSchemaSkillKey (#279)', () => {
    // Regression: the deleted local keyMap omitted these five, so origin-path
    // grants naming them silently failed to resolve (null → "Unknown skill").
    const FORMERLY_DROPPED = ['athletics', 'linguistics', 'navigate', 'parry', 'stealth'] as const;

    it('resolves the five skills the stale table omitted', () => {
        const grant = makeGrant();
        const actor = actorWithSkills(...FORMERLY_DROPPED);
        for (const key of FORMERLY_DROPPED) {
            expect(grant._getSchemaSkillKey(key, actor)).toBe(key);
        }
    });

    it('resolves display names through the catalog (e.g. "Common Lore" → commonLore)', () => {
        const grant = makeGrant();
        const actor = actorWithSkills('commonLore', 'sleightOfHand', 'chemUse');
        expect(grant._getSchemaSkillKey('Common Lore', actor)).toBe('commonLore');
        expect(grant._getSchemaSkillKey('Sleight of Hand', actor)).toBe('sleightOfHand');
        expect(grant._getSchemaSkillKey('Chem-Use', actor)).toBe('chemUse');
    });

    it('passes already-canonical schema keys through unchanged', () => {
        const grant = makeGrant();
        const actor = actorWithSkills('dodge', 'commonLore');
        expect(grant._getSchemaSkillKey('dodge', actor)).toBe('dodge');
        expect(grant._getSchemaSkillKey('commonLore', actor)).toBe('commonLore');
    });

    it('returns null for an empty key or a skill absent from the actor schema', () => {
        const grant = makeGrant();
        const actor = actorWithSkills('dodge');
        expect(grant._getSchemaSkillKey('', actor)).toBeNull();
        // Resolvable name, but the actor's schema does not carry it.
        expect(grant._getSchemaSkillKey('Parry', actorWithSkills('dodge'))).toBeNull();
    });
});
