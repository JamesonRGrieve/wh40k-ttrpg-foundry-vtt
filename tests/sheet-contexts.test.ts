/**
 * Fixture-stability tests for the unified sheet-context factories.
 *
 * The factories in `stories/mocks/sheet-contexts.ts` are imported by both the
 * Storybook stories and the runtime composition tests. A drift here means
 * stories and tests describe different fixtures — exactly the failure these
 * factories are meant to prevent.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    mockNpcSheetContext,
    mockPlayerSheetContext,
    mockStarshipSheetContext,
    mockVehicleSheetContext,
} from '../stories/mocks/sheet-contexts';
import type { GameSystemId } from '../src/module/config/game-systems/types';

const ORIGINAL_GAME = (globalThis as Record<string, unknown>).game;

beforeAll(() => {
    // Some configs call game.i18n.localize; the factory installs a stub if absent,
    // but tests that run in isolation rely on the same passthrough.
    (globalThis as Record<string, unknown>).game = {
        i18n: { localize: (k: string) => k, format: (k: string) => k },
    };
});

afterAll(() => {
    (globalThis as Record<string, unknown>).game = ORIGINAL_GAME;
});

describe('mockPlayerSheetContext', () => {
    it('produces a fully-populated context for dh2e by default', () => {
        const ctx = mockPlayerSheetContext();
        expect(ctx.actor).toBeTruthy();
        expect(ctx.system).toBeTruthy();
        expect(ctx.source).toBe(ctx.system);
        expect(ctx.editable).toBe(true);
        expect(ctx.inEditMode).toBe(false);
        expect(ctx.isGM).toBe(true);
        expect(ctx.isNPC).toBe(false);
        expect(ctx.tabs.length).toBeGreaterThan(0);
        expect(ctx.tab.id).toBe('biography');
        expect(ctx.headerFields.length).toBeGreaterThan(0);
        expect(ctx.originPathSteps.length).toBe(3);
        expect(ctx.originPathComplete).toBe(true);
        expect(ctx.biography.source.notes).toContain('Background notes');
        expect(ctx.journalEntries.length).toBe(1);
    });

    it('uses SystemConfigRegistry.getHeaderFields for header rows — DH2e shape', () => {
        const ctx = mockPlayerSheetContext({ systemId: 'dh2e' });
        const names = ctx.headerFields.map((f) => f.name);
        expect(names).toEqual([
            'system.bio.playerName',
            'system.originPath.homeWorld',
            'system.originPath.background',
            'system.originPath.role',
            'system.originPath.divination',
        ]);
    });

    it('uses SystemConfigRegistry.getHeaderFields for header rows — IM shape', () => {
        const ctx = mockPlayerSheetContext({ systemId: 'im' });
        const names = ctx.headerFields.map((f) => f.name);
        expect(names).toEqual([
            'system.bio.playerName',
            'system.originPath.homeWorld',
            'system.originPath.background',
            'system.originPath.role',
            'system.originPath.motivation',
        ]);
        // IM field labels confirm the per-system mapping
        const labels = ctx.headerFields.map((f) => f.label);
        expect(labels).toContain('Patron');
        expect(labels).toContain('Faction');
        expect(labels).toContain('Endeavour');
    });

    it('uses SystemConfigRegistry.getHeaderFields for header rows — RT has numeric Rank', () => {
        const ctx = mockPlayerSheetContext({ systemId: 'rt' });
        const rankField = ctx.headerFields.find((f) => f.name === 'system.rank');
        expect(rankField?.type).toBe('number');
        expect(rankField?.inputClass).toBe('wh40k-rank-input');
    });

    it('contextOverrides.headerFields wins over the registry default', () => {
        const custom = [{ label: 'X', name: 'system.x', type: 'text' as const, value: 'Y' }];
        const ctx = mockPlayerSheetContext({ contextOverrides: { headerFields: custom } });
        expect(ctx.headerFields).toBe(custom);
    });

    it('actorOverrides flow through to actor.system without clobbering bio defaults', () => {
        const ctx = mockPlayerSheetContext({
            systemId: 'dh2e',
            actorOverrides: {
                system: {
                    bio: { age: '99' },
                },
            },
        });
        const bio = ctx.actor.system.bio;
        expect(bio.age).toBe('99');
        // playerName default survives because mergeActorInput preserves un-overridden bio keys
        expect(bio.playerName).toBe('Player One');
    });

    it('emits non-empty origin-step IDs (sourced via randomId)', () => {
        const ctx = mockPlayerSheetContext({ systemId: 'dh2e' });
        const stepIds = ctx.originPathSteps.map((s) => s.item?._id ?? '');
        expect(stepIds.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
        // All three IDs are unique even within a single fixture build.
        expect(new Set(stepIds).size).toBe(stepIds.length);
    });
});

describe('mockPlayerSheetContext — per-system parity', () => {
    const ALL_SYSTEMS: GameSystemId[] = ['rt', 'dh1e', 'dh2e', 'bc', 'ow', 'dw', 'im'];

    it('every system produces a valid context with non-empty headerFields', () => {
        for (const id of ALL_SYSTEMS) {
            const ctx = mockPlayerSheetContext({ systemId: id });
            expect(ctx.actor, `system ${id}`).toBeTruthy();
            expect(ctx.headerFields.length, `system ${id}`).toBeGreaterThan(0);
            expect(ctx.headerFields[0].name, `system ${id}`).toBe('system.bio.playerName');
        }
    });

    it('every system passes the homeWorld value through to its sidebar row', () => {
        for (const id of ALL_SYSTEMS) {
            const ctx = mockPlayerSheetContext({
                systemId: id,
                actorOverrides: { system: { originPath: { homeWorld: 'Cadia' } } },
            });
            const hw = ctx.headerFields.find((f) => f.name === 'system.originPath.homeWorld');
            expect(hw?.value, `system ${id}`).toBe('Cadia');
        }
    });

    it('actor.type is namespaced by system after withSystem is applied', () => {
        const dh2 = mockPlayerSheetContext({ systemId: 'dh2e' });
        expect(dh2.actor.type).toBe('dh2-character');
        const im = mockPlayerSheetContext({ systemId: 'im' });
        expect(im.actor.type).toBe('im-character');
    });
});

describe('mockNpcSheetContext', () => {
    it('builds an NPC context with horde, transactionProfile, and tags', () => {
        const ctx = mockNpcSheetContext();
        expect(ctx.isNPC).toBe(true);
        expect(ctx.actor.type).toBe('im-npc');
        expect(ctx.system.threatLevel).toBe(7);
        expect(ctx.headerFields.find((f) => f.name === 'system.threatLevel')).toBeTruthy();
        expect(ctx.horde).toBeTruthy();
        expect(ctx.transactionProfile).toBeTruthy();
        expect(ctx.tags).toContain('chaos');
        expect(ctx.actor.inCombat).toBe(false);
    });

    it('contextOverrides win over defaults', () => {
        const ctx = mockNpcSheetContext({ contextOverrides: { isGM: false, journalEntries: [] } });
        expect(ctx.isGM).toBe(false);
        expect(ctx.journalEntries).toEqual([]);
    });
});

describe('mockVehicleSheetContext', () => {
    it('builds a minimal vehicle context with type-namespaced actor', () => {
        const ctx = mockVehicleSheetContext({ systemId: 'dh2e' });
        expect(ctx.actor.type).toBe('dh2-vehicle');
        expect(ctx.tabs.length).toBeGreaterThan(0);
        expect(ctx.headerFields).toEqual([]);
        expect(ctx.originPathComplete).toBe(false);
    });
});

describe('mockStarshipSheetContext', () => {
    it('builds a starship context defaulting to RT', () => {
        const ctx = mockStarshipSheetContext();
        expect(ctx.actor.type).toBe('rt-vehicle');
        expect(ctx.tab.id).toBe('bridge');
    });
});
