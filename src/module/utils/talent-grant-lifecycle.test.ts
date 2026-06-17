import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WH40KBaseActor as WH40KActor } from '../documents/base-actor.ts';
import type { WH40KItem } from '../documents/item.ts';
import { handleGrantRemoval } from './grants-processor.ts';
import { processTalentGrants } from './talent-grants.ts';

/**
 * Behavioural regression contract for the talent grant-on-drop / grant-on-delete
 * lifecycle (#304, step 1 — land BEFORE the GrantsProcessor → GrantsManager
 * cutover). These assert the *observable* outcome a user sees, not engine
 * internals, so they survive the eventual engine swap and become its acceptance
 * gate:
 *
 *  - Dropping a talent with `hasGrants` applies its grants (here: a skill
 *    training upgrade on a skill the actor already has).
 *  - Deleting a granting talent offers to remove the items it granted (tracked
 *    via `flags.wh40k-rpg.grantedById`) and removes exactly those on confirm.
 *
 * Run across two game systems (dh2 + ow) so the lifecycle is proven homologated,
 * per Direction #3. The path is exercised through the real bridge
 * (`processTalentGrants`) and the real removal handler (`handleGrantRemoval`) the
 * base-actor descendant hooks call.
 */

type MockFn = ReturnType<typeof vi.fn>;
type MockActor = WH40KActor & { deleteEmbeddedDocuments: MockFn; createEmbeddedDocuments: MockFn; update: MockFn };

interface MockSkill {
    id: string;
    type: 'skill';
    name: string;
    system: { specialization?: string };
    update: MockFn;
}

/** A talent whose grants drive the on-drop path. */
function makeTalent(grants: { skills: Array<{ name: string; level: string }> }, id = 'talent-1'): WH40KItem {
    const talent = { id, type: 'talent', name: 'Granting Talent', system: { hasGrants: true, grants }, flags: {} };
    // eslint-disable-next-line no-restricted-syntax -- test boundary: structural mock of the Foundry WH40KItem surface processTalentGrants/handleGrantRemoval read (type/system.grants/id/flags); the full Document type is not the unit under test
    return talent as unknown as WH40KItem;
}

/** An item the actor carries, optionally flagged as granted by a talent. */
function makeGranted(id: string, name: string, grantedById: string | undefined): WH40KItem {
    const item = { id, type: 'talent', name, system: {}, flags: grantedById === undefined ? {} : { 'wh40k-rpg': { grantedById } } };
    // eslint-disable-next-line no-restricted-syntax -- test boundary: structural mock of the Foundry WH40KItem surface (id/type/name/flags.wh40k-rpg.grantedById) the removal handler filters on
    return item as unknown as WH40KItem;
}

function makeSkill(id: string, name: string): MockSkill {
    return { id, type: 'skill', name, system: { specialization: '' }, update: vi.fn(async () => Promise.resolve()) };
}

/** Minimal actor exposing only the collection + mutation surface the grant lifecycle uses. */
function makeActor(gameSystem: string, items: Array<WH40KItem | MockSkill>): MockActor {
    // eslint-disable-next-line no-restricted-syntax -- test boundary: the mixed talent/skill mock list is presented to production code as the actor's WH40KItem collection
    const list = items as unknown as WH40KItem[];
    const collection = {
        find: (fn: (i: WH40KItem) => boolean) => list.find(fn),
        filter: (fn: (i: WH40KItem) => boolean) => list.filter(fn),
        some: (fn: (i: WH40KItem) => boolean) => list.some(fn),
        get: (id: string) => list.find((i) => i.id === id),
        get contents() {
            return list;
        },
    };
    const actor = {
        id: 'actor-1',
        name: 'Test Acolyte',
        system: { gameSystem },
        flags: {},
        items: collection,
        update: vi.fn(async () => Promise.resolve()),
        createEmbeddedDocuments: vi.fn(async () => Promise.resolve([])),
        deleteEmbeddedDocuments: vi.fn(async () => Promise.resolve([])),
    };
    // eslint-disable-next-line no-restricted-syntax -- test boundary: structural mock of the Foundry WH40KActor surface the grant lifecycle uses (items collection + create/delete/update); the full Document type is not the unit under test
    return actor as unknown as MockActor;
}

const SYSTEMS = ['dh2', 'ow'] as const;

beforeEach(() => {
    vi.stubGlobal('game', { wh40k: { log: vi.fn() }, user: { id: 'u1' } });
    vi.stubGlobal('ui', { notifications: { info: vi.fn(), warn: vi.fn() } });
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('talent grant lifecycle — on-drop applies grants (#304 regression gate)', () => {
    for (const system of SYSTEMS) {
        it(`[${system}] dropping a talent that grants skill training upgrades an existing skill`, async () => {
            const awareness = makeSkill('sk-aware', 'Awareness');
            const actor = makeActor(system, [awareness]);
            const talent = makeTalent({ skills: [{ name: 'Awareness', level: 'trained' }] });

            await processTalentGrants(talent, actor);

            expect(awareness.update).toHaveBeenCalledTimes(1);
            expect(awareness.update).toHaveBeenCalledWith({ 'system.trained': true });
        });

        it(`[${system}] a talent without hasGrants applies nothing on drop`, async () => {
            const awareness = makeSkill('sk-aware', 'Awareness');
            const actor = makeActor(system, [awareness]);
            const inert = {
                id: 't',
                type: 'talent',
                name: 'Inert',
                system: { hasGrants: false, grants: { skills: [{ name: 'Awareness', level: 'trained' }] } },
                flags: {},
            };

            // eslint-disable-next-line no-restricted-syntax -- test boundary: structural mock of a grant-less talent (hasGrants:false) to assert the early return
            await processTalentGrants(inert as unknown as WH40KItem, actor);

            expect(awareness.update).not.toHaveBeenCalled();
        });
    }
});

describe('talent grant lifecycle — on-delete removes granted items (#304 regression gate)', () => {
    for (const system of SYSTEMS) {
        it(`[${system}] confirming removal deletes exactly the items this talent granted`, async () => {
            const granted = makeGranted('g1', 'Granted Ability', 'talent-1');
            const other = makeGranted('g2', 'Unrelated', 'some-other-talent');
            const actor = makeActor(system, [granted, other]);
            const talent = makeTalent({ skills: [] }, 'talent-1');
            vi.stubGlobal('Dialog', { confirm: vi.fn(async () => Promise.resolve(true)) });

            await handleGrantRemoval(talent, actor);

            expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledTimes(1);
            expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith('Item', ['g1']);
        });

        it(`[${system}] declining removal deletes nothing`, async () => {
            const granted = makeGranted('g1', 'Granted Ability', 'talent-1');
            const actor = makeActor(system, [granted]);
            const talent = makeTalent({ skills: [] }, 'talent-1');
            vi.stubGlobal('Dialog', { confirm: vi.fn(async () => Promise.resolve(false)) });

            await handleGrantRemoval(talent, actor);

            expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
        });

        it(`[${system}] a talent that granted nothing prompts nothing and deletes nothing`, async () => {
            const actor = makeActor(system, [makeGranted('g2', 'Unrelated', 'some-other-talent')]);
            const talent = makeTalent({ skills: [] }, 'talent-1');
            const confirm = vi.fn(async () => Promise.resolve(true));
            vi.stubGlobal('Dialog', { confirm });

            await handleGrantRemoval(talent, actor);

            expect(confirm).not.toHaveBeenCalled();
            expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
        });
    }
});
