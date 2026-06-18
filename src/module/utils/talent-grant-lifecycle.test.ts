import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression contract for the talent grant-on-drop / grant-on-delete lifecycle
 * (#304). The base-actor descendant hooks call `processTalentGrants` on drop and
 * `handleTalentRemoval` on delete; both now bridge to the single GrantsManager
 * engine (the former GrantsProcessor was removed). These pin the bridge's
 * observable contract — the guards and the correct delegation — across two game
 * systems (dh2 + ow) per Direction #3. The deep apply/reverse behaviour (skill
 * upgrade, item create/dedupe, resource math, reversal) is covered by the
 * `data/grant/*` and `grants-manager` suites the bridge delegates into.
 *
 * talent-grants.ts statically imports GrantsManager, which transitively evaluates
 * `extends foundry.abstract.DataModel` at module-load (undefined under happy-dom).
 * Stub a no-op DataModel base BEFORE a dynamic import (static imports hoist above
 * the stub), exactly as grants-manager.test.ts does.
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

const { GrantsManager } = await import('../managers/grants-manager.ts');
const { processTalentGrants, handleTalentRemoval } = await import('./talent-grants.ts');

type ManagerActor = Parameters<typeof processTalentGrants>[1];

function makeTalent(opts: { hasGrants?: boolean; type?: string; id?: string; uuid?: string } = {}): Parameters<typeof processTalentGrants>[0] {
    const talent = {
        type: opts.type ?? 'talent',
        name: 'Granting Talent',
        id: opts.id ?? 'talent-1',
        uuid: opts.uuid,
        system: { hasGrants: opts.hasGrants ?? true },
    };
    // eslint-disable-next-line no-restricted-syntax -- test boundary: structural mock of the WH40KItem surface the bridge reads (type / system.hasGrants / id / uuid); the full Document type is not the unit under test
    return talent as unknown as Parameters<typeof processTalentGrants>[0];
}

function makeActor(gameSystem: string): ManagerActor {
    const actor = { id: 'actor-1', name: 'Test Acolyte', system: { gameSystem } };
    // eslint-disable-next-line no-restricted-syntax -- test boundary: the bridge only forwards the actor to the (spied) GrantsManager, so a minimal stub suffices
    return actor as unknown as ManagerActor;
}

const SYSTEMS = ['dh2', 'ow'] as const;

afterEach(() => {
    vi.restoreAllMocks();
});

describe('talent grant lifecycle — on-drop applies via GrantsManager (#304)', () => {
    for (const system of SYSTEMS) {
        it(`[${system}] a talent with hasGrants applies its grants idempotently`, async () => {
            const apply = vi
                .spyOn(GrantsManager, 'applyItemGrants')
                .mockResolvedValue({ success: true, appliedState: {}, notifications: [], errors: [], skipped: false });
            const talent = makeTalent();
            const actor = makeActor(system);

            await processTalentGrants(talent, actor);

            expect(apply).toHaveBeenCalledTimes(1);
            expect(apply).toHaveBeenCalledWith(talent, actor, { showNotification: true, depth: 0 });
        });

        it(`[${system}] a talent without hasGrants applies nothing`, async () => {
            const apply = vi.spyOn(GrantsManager, 'applyItemGrants');
            await processTalentGrants(makeTalent({ hasGrants: false }), makeActor(system));
            expect(apply).not.toHaveBeenCalled();
        });

        it(`[${system}] a non-talent item applies nothing`, async () => {
            const apply = vi.spyOn(GrantsManager, 'applyItemGrants');
            await processTalentGrants(makeTalent({ type: 'weapon' }), makeActor(system));
            expect(apply).not.toHaveBeenCalled();
        });
    }
});

describe('talent grant lifecycle — on-delete reverses via GrantsManager (#304)', () => {
    for (const system of SYSTEMS) {
        it(`[${system}] removing a talent reverses exactly what it applied, keyed by its source`, async () => {
            const reverse = vi.spyOn(GrantsManager, 'reverseAppliedGrants').mockResolvedValue({ success: true, reversed: {}, notifications: [], errors: [] });
            const talent = makeTalent({ uuid: 'Actor.actor-1.Item.talent-1' });
            const actor = makeActor(system);

            await handleTalentRemoval(talent, actor);

            expect(reverse).toHaveBeenCalledTimes(1);
            expect(reverse).toHaveBeenCalledWith(actor, GrantsManager.sourceKeyFor(talent));
        });

        it(`[${system}] removing a non-talent reverses nothing`, async () => {
            const reverse = vi.spyOn(GrantsManager, 'reverseAppliedGrants');
            await handleTalentRemoval(makeTalent({ type: 'trait' }), makeActor(system));
            expect(reverse).not.toHaveBeenCalled();
        });
    }
});
