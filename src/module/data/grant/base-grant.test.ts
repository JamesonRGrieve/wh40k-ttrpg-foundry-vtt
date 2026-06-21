import { afterAll, describe, expect, it } from 'vitest';
import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { importModelOrSkip } from '../../testing/model-import.ts';

/**
 * base-grant.ts evaluates `extends foundry.abstract.DataModel` at module-load —
 * undefined under happy-dom. Stub a no-op base BEFORE the dynamic import so the
 * class loads; `_reverseWithDeltaMap` is a pure method that never touches the
 * schema. (Same recipe as grants-manager.test.)
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

const { default: BaseGrantData } = await import('./base-grant.ts');

/** Actor stub recording every `update` payload so the helper's apply-tail is observable. */
function recordingActor(): { actor: WH40KBaseActor; calls: Array<Record<string, unknown>> } {
    const calls: Array<Record<string, unknown>> = [];
    const actor = {
        update: (payload: Record<string, unknown>) => {
            calls.push(payload);
            return Promise.resolve(undefined);
        },
    } as unknown as WH40KBaseActor;
    return { actor, calls };
}

/** Build a grant instance without invoking the (schema-touching) constructor. */
function makeGrant(): InstanceType<typeof BaseGrantData> {
    return Object.create(BaseGrantData.prototype) as InstanceType<typeof BaseGrantData>;
}

describe('BaseGrantData', () => {
    it('has a default BaseGrantData symbol exported', async () => {
        const mod = await importModelOrSkip(import('./base-grant.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });
});

describe('BaseGrantData._reverseWithDeltaMap (#345)', () => {
    interface State {
        previous: number;
    }

    it('merges per-entry deltas into one update and returns restore records', async () => {
        const grant = makeGrant();
        const { actor, calls } = recordingActor();
        const applied: Record<string, State> = { a: { previous: 1 }, b: { previous: 2 } };

        const restores = await grant._reverseWithDeltaMap(actor, applied, (key, state) => ({
            deltas: { [`system.x.${key}`]: state.previous },
            restore: { key, previous: state.previous },
        }));

        expect(calls).toEqual([{ 'system.x.a': 1, 'system.x.b': 2 }]);
        expect(restores).toEqual([
            { key: 'a', previous: 1 },
            { key: 'b', previous: 2 },
        ]);
    });

    it('skips entries whose mapper returns null (no delta, no restore record)', async () => {
        const grant = makeGrant();
        const { actor, calls } = recordingActor();
        const applied: Record<string, State> = { keep: { previous: 5 }, drop: { previous: 9 } };

        const restores = await grant._reverseWithDeltaMap(actor, applied, (key, state) =>
            key === 'drop' ? null : { deltas: { [`system.x.${key}`]: state.previous }, restore: key },
        );

        expect(calls).toEqual([{ 'system.x.keep': 5 }]);
        expect(restores).toEqual(['keep']);
    });

    it('does not call actor.update when no deltas accumulate', async () => {
        const grant = makeGrant();
        const { actor, calls } = recordingActor();

        const restores = await grant._reverseWithDeltaMap(actor, {} as Record<string, State>, () => ({ deltas: {}, restore: null }));

        expect(calls).toEqual([]);
        expect(restores).toEqual([]);
    });

    it('does not call actor.update when every mapped entry contributes empty deltas', async () => {
        const grant = makeGrant();
        const { actor, calls } = recordingActor();
        const applied: Record<string, State> = { a: { previous: 1 } };

        const restores = await grant._reverseWithDeltaMap(actor, applied, (key) => ({ deltas: {}, restore: key }));

        expect(calls).toEqual([]);
        expect(restores).toEqual(['a']);
    });
});
