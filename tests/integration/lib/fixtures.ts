/**
 * Bridge from `stories/mocks/extended.ts` shapes to real Foundry Documents
 * once a runtime has been booted. The mock factories stay authoritative for
 * canonical fixture data; this helper hydrates them into actual Document
 * instances so Tier A asserts against the real class hierarchy.
 *
 * Documents are CONSTRUCTED, not created. `Actor.create()` persists, and
 * persistence is a server round-trip: it emits over `game.socket` and waits for
 * the server's reply. Tier A has no server and stubs the socket as a no-op, so
 * the returned promise never settled and every test that made a document hung
 * until vitest's 60s timeout — 25 of the tier's 35 tests, which is what #515 was
 * really measuring rather than a missing `game.model`.
 *
 * `new klass(data)` runs the full DataModel path — `cleanData`, `migrateData`,
 * `prepareData`, the schema validation — which is precisely what this tier
 * asserts on. Nothing here needs the document to exist in a world afterwards.
 */

import type { FoundryRuntime } from './boot';

interface CreateData {
    type: string;
    name?: string;
    system?: object;
    /** Embedded item documents to create alongside the actor. */
    items?: object[];
}

/** A Foundry Document class, as a constructor. `create` is deliberately unused — see the file header. */
type DocumentClass = new (data: CreateData) => object;

interface RuntimeWithActor {
    game: {
        documentTypes?: { Actor?: string[]; Item?: string[] };
    };
    CONFIG: {
        Actor?: { documentClass?: DocumentClass };
        Item?: { documentClass?: DocumentClass };
    };
}

export async function createActor(runtime: FoundryRuntime, data: CreateData): Promise<object> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: FoundryRuntime.CONFIG is typed as `object` in boot.ts; the integration helper needs to read the well-known shape
    const r = runtime as unknown as RuntimeWithActor;
    const klass = r.CONFIG.Actor?.documentClass;
    if (klass === undefined) {
        throw new Error('CONFIG.Actor.documentClass is unavailable — Foundry not fully booted');
    }
    return Promise.resolve(new klass({ name: data.name ?? 'Test Actor', ...data }));
}

export async function createItem(runtime: FoundryRuntime, data: CreateData): Promise<object> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: FoundryRuntime.CONFIG is typed as `object` in boot.ts
    const r = runtime as unknown as RuntimeWithActor;
    const klass = r.CONFIG.Item?.documentClass;
    if (klass === undefined) {
        throw new Error('CONFIG.Item.documentClass is unavailable — Foundry not fully booted');
    }
    return Promise.resolve(new klass({ name: data.name ?? 'Test Item', ...data }));
}

// Single-sourced from the engine's canonical list (#312) so the per-system integration
// loop iterates exactly the systems the system config knows about — no drift.
export { ALL_SYSTEM_IDS as GAME_SYSTEM_IDS, type GameSystemId } from '../../../src/module/config/game-systems/types.ts';
