/**
 * Bridge from `stories/mocks/extended.ts` shapes to real Foundry Documents
 * once a runtime has been booted. The mock factories stay authoritative for
 * canonical fixture data; this helper hydrates them into actual
 * `Actor.create` / `Item.create` calls so Tier A asserts against the real
 * Document class hierarchy.
 */

import type { FoundryRuntime } from './boot';

interface RuntimeWithActor extends FoundryRuntime {
    game: {
        documentTypes?: { Actor?: string[]; Item?: string[] };
    } & object;
    CONFIG: {
        Actor?: { documentClass?: { create?: (data: unknown) => Promise<unknown> } };
        Item?: { documentClass?: { create?: (data: unknown) => Promise<unknown> } };
    } & object;
}

export async function createActor(
    runtime: FoundryRuntime,
    data: { type: string; name?: string; system?: object },
): Promise<unknown> {
    const r = runtime as RuntimeWithActor;
    const klass = r.CONFIG.Actor?.documentClass;
    if (!klass?.create) {
        throw new Error('CONFIG.Actor.documentClass.create is unavailable — Foundry not fully booted');
    }
    return klass.create({ name: data.name ?? 'Test Actor', ...data });
}

export async function createItem(
    runtime: FoundryRuntime,
    data: { type: string; name?: string; system?: object },
): Promise<unknown> {
    const r = runtime as RuntimeWithActor;
    const klass = r.CONFIG.Item?.documentClass;
    if (!klass?.create) {
        throw new Error('CONFIG.Item.documentClass.create is unavailable — Foundry not fully booted');
    }
    return klass.create({ name: data.name ?? 'Test Item', ...data });
}

export const GAME_SYSTEM_IDS = ['bc', 'dh1e', 'dh2e', 'dw', 'ow', 'rt', 'im'] as const;
export type GameSystemId = (typeof GAME_SYSTEM_IDS)[number];
