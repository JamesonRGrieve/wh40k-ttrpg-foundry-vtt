import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeActorSystem {
    gameSystem?: string;
    wounds?: { value: number; max: number };
    experience?: { current: number };
    originPath?: Record<string, string>;
    threat?: number;
    imOnly?: { patron: string };
    rtOnly?: { dynasty: string };
}
// FakeActorSource matches ActorDirectoryLike's `toObject: () => Record<string, unknown>`
// expectation — the index signature is required so the structural cast at the
// buildConvertedCharacterSource call site typechecks without a manual `as` boundary cast.
// eslint-disable-next-line no-restricted-syntax -- boundary: matches ActorDirectoryLike's `toObject: () => Record<string, unknown>` framework contract.
interface FakeActorSource extends Record<string, unknown> {
    _id: string;
    type: string;
    system: FakeActorSystem;
    flags: {
        core: {
            sheetClass?: string;
            extra?: string;
        };
    };
}

function installFoundryStubs(): void {
    Object.assign(globalThis, {
        CONFIG: {
            Actor: {
                dataModels: {
                    'rt-character': {
                        migrateData: vi.fn(),
                        shimData: vi.fn(),
                        cleanData: vi.fn((source: FakeActorSystem) => ({
                            gameSystem: source.gameSystem,
                            wounds: source.wounds,
                            experience: source.experience,
                            originPath: source.originPath,
                        })),
                    },
                    'dh2-character': {
                        migrateData: vi.fn(),
                        shimData: vi.fn(),
                        cleanData: vi.fn((source: FakeActorSystem) => ({
                            gameSystem: source.gameSystem,
                            wounds: source.wounds,
                            experience: source.experience,
                            originPath: source.originPath,
                        })),
                    },
                    'dh2-npc': {
                        migrateData: vi.fn(),
                        shimData: vi.fn(),
                        cleanData: vi.fn((source: FakeActorSystem) => ({
                            wounds: source.wounds,
                            threat: source.threat,
                        })),
                    },
                },
            },
        },
        foundry: {
            utils: {
                deepClone: <T>(value: T): T => structuredClone(value),
            },
        },
    });
}

describe('actor-system-converter', () => {
    beforeEach(() => {
        vi.resetModules();
        installFoundryStubs();
    });

    it('builds a replacement character source for the target system and drops stale fields', async () => {
        const { buildConvertedCharacterSource } = await import('../src/module/utils/actor-system-converter.ts');

        const actorSource: FakeActorSource = {
            _id: 'actor-1',
            type: 'dh2-character',
            system: {
                wounds: { value: 10, max: 10 },
                experience: { current: 400 },
                imOnly: { patron: 'Removed' },
            },
            flags: {
                core: {
                    sheetClass: 'wh40k-rpg.DarkHeresy2PlayerSheet',
                    extra: 'keep-me',
                },
            },
        };

        const actor = {
            id: actorSource._id,
            name: 'Test Character',
            type: actorSource.type,
            toObject: () => actorSource,
            delete: vi.fn(),
        };

        // eslint-disable-next-line no-restricted-syntax -- boundary: structural fake stands in for a Foundry Actor Document at the ActorDirectoryLike parameter boundary
        const converted = buildConvertedCharacterSource(actor as unknown as Parameters<typeof buildConvertedCharacterSource>[0], 'rt');

        expect(converted._id).toBeUndefined();
        expect(converted.type).toBe('rt-character');
        expect(converted.system).toEqual({
            gameSystem: 'rt',
            wounds: { value: 10, max: 10 },
            experience: { current: 400 },
            originPath: undefined,
        });
        expect(converted.flags?.core).toEqual({ extra: 'keep-me' });
    });

    it('builds a replacement npc source for the target system and preserves the actor kind', async () => {
        const { buildConvertedActorSource } = await import('../src/module/utils/actor-system-converter.ts');

        const actorSource: FakeActorSource = {
            _id: 'actor-2',
            type: 'rt-npc',
            system: {
                wounds: { value: 14, max: 14 },
                threat: 3,
                rtOnly: { dynasty: 'Drop me' },
            },
            flags: {
                core: {
                    sheetClass: 'wh40k-rpg.RogueTraderNPCSheet',
                },
            },
        };

        const actor = {
            id: actorSource._id,
            name: 'Test NPC',
            type: actorSource.type,
            toObject: () => actorSource,
            delete: vi.fn(),
        };

        // eslint-disable-next-line no-restricted-syntax -- boundary: structural fake stands in for a Foundry Actor Document at the ActorDirectoryLike parameter boundary
        const converted = buildConvertedActorSource(actor as unknown as Parameters<typeof buildConvertedActorSource>[0], 'dh2');

        expect(converted.type).toBe('dh2-npc');
        expect(converted.system).toEqual({
            wounds: { value: 14, max: 14 },
            threat: 3,
        });
        expect(converted.flags?.core).toBeUndefined();
    });

    it('clears non-DH2 origin-path fields when converting a character to DH2', async () => {
        const { buildConvertedActorSource } = await import('../src/module/utils/actor-system-converter.ts');

        const actorSource: FakeActorSource = {
            _id: 'actor-3',
            type: 'rt-character',
            system: {
                wounds: { value: 11, max: 11 },
                experience: { current: 250 },
                originPath: {
                    homeWorld: 'Void Born',
                    career: 'Seneschal',
                    background: 'Adeptus Administratum',
                    role: 'Chirurgeon',
                    divination: 'Knowledge is Power',
                    motivation: 'Profit',
                },
            },
            flags: {
                core: {},
            },
        };

        const actor = {
            id: actorSource._id,
            name: 'Converted PC',
            type: actorSource.type,
            toObject: () => actorSource,
            delete: vi.fn(),
        };

        // eslint-disable-next-line no-restricted-syntax -- boundary: structural fake stands in for a Foundry Actor Document at the ActorDirectoryLike parameter boundary
        const converted = buildConvertedActorSource(actor as unknown as Parameters<typeof buildConvertedActorSource>[0], 'dh2');

        expect(converted.type).toBe('dh2-character');
        expect(converted.system).toEqual(
            expect.objectContaining({
                gameSystem: 'dh2',
                wounds: { value: 11, max: 11 },
                experience: { current: 250 },
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest expect.objectContaining returns `any` by design
                originPath: expect.objectContaining({
                    homeWorld: 'Void Born',
                    career: '',
                    background: 'Adeptus Administratum',
                    role: 'Chirurgeon',
                    divination: 'Knowledge is Power',
                    motivation: '',
                }),
            }),
        );
    });
});
