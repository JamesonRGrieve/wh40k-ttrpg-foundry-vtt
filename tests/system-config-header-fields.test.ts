/**
 * Frozen-shape regression tests for `BaseSystemConfig.getHeaderFields(actor)`.
 *
 * Each per-system config returns the field list that populates the player sheet sidebar
 * identity panel. The Foundry form parser writes back to the actor through the field's
 * `name=` path, so any rename of these strings silently breaks character save/load —
 * these tests assert byte-identical name paths and shape.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SystemConfigRegistry } from '../src/module/config/game-systems/index.ts';
import type { GameSystemId, SidebarHeaderField } from '../src/module/config/game-systems/types.ts';
import type { WH40KBaseActor } from '../src/module/documents/base-actor.ts';

type ActorLike = {
    system?: {
        bio?: Record<string, string | number>;
        originPath?: Record<string, string | number>;
        rank?: string | number;
    };
};

const ORIGINAL_GAME = (globalThis as Record<string, unknown>).game;

beforeAll(() => {
    (globalThis as Record<string, unknown>).game = {
        i18n: {
            localize: (key: string) => key,
            format: (key: string) => key,
        },
    };
});

afterAll(() => {
    (globalThis as Record<string, unknown>).game = ORIGINAL_GAME;
});

function makeActor(overrides: ActorLike = {}): WH40KBaseActor {
    return {
        system: {
            bio: { playerName: 'Mona' },
            originPath: {
                homeWorld: 'Hive World',
                background: 'Imperial Guard',
                role: 'Warrior',
                career: 'Adept',
                motivation: 'Duty',
                trialsAndTravails: 'Ambushed',
                divination: 'Trust the Emperor.',
            },
            rank: 3,
            ...overrides.system,
        },
    } as unknown as WH40KBaseActor;
}

function names(fields: SidebarHeaderField[]): string[] {
    return fields.map((f) => f.name);
}

describe('BaseSystemConfig.getHeaderFields — name-path stability per system', () => {
    it('dh2e returns Player + HomeWorld + Background + Role + Divination', () => {
        const fields = SystemConfigRegistry.get('dh2e').getHeaderFields(makeActor());
        expect(names(fields)).toEqual([
            'system.bio.playerName',
            'system.originPath.homeWorld',
            'system.originPath.background',
            'system.originPath.role',
            'system.originPath.divination',
        ]);
        expect(fields.every((f) => f.type === 'text')).toBe(true);
    });

    it('dh1e returns Player + HomeWorld + Career + Rank(role) + Divination', () => {
        const fields = SystemConfigRegistry.get('dh1e').getHeaderFields(makeActor());
        expect(names(fields)).toEqual([
            'system.bio.playerName',
            'system.originPath.homeWorld',
            'system.originPath.career',
            'system.originPath.role',
            'system.originPath.divination',
        ]);
        const rankField = fields.find((f) => f.label === 'Rank');
        expect(rankField?.name).toBe('system.originPath.role');
    });

    it('bc returns Player + HomeWorld + Archetype(role) + Pride(background) + Disgrace(trialsAndTravails) + Motivation', () => {
        const fields = SystemConfigRegistry.get('bc').getHeaderFields(makeActor());
        expect(names(fields)).toEqual([
            'system.bio.playerName',
            'system.originPath.homeWorld',
            'system.originPath.role',
            'system.originPath.background',
            'system.originPath.trialsAndTravails',
            'system.originPath.motivation',
        ]);
        expect(fields.find((f) => f.label === 'Archetype')?.name).toBe('system.originPath.role');
        expect(fields.find((f) => f.label === 'Pride')?.name).toBe('system.originPath.background');
        expect(fields.find((f) => f.label === 'Disgrace')?.name).toBe('system.originPath.trialsAndTravails');
    });

    it('ow returns Player + HomeWorld + Regiment(background) + Speciality(role) + Demeanour(motivation)', () => {
        const fields = SystemConfigRegistry.get('ow').getHeaderFields(makeActor());
        expect(names(fields)).toEqual([
            'system.bio.playerName',
            'system.originPath.homeWorld',
            'system.originPath.background',
            'system.originPath.role',
            'system.originPath.motivation',
        ]);
        expect(fields.find((f) => f.label === 'Regiment')?.name).toBe('system.originPath.background');
        expect(fields.find((f) => f.label === 'Speciality')?.name).toBe('system.originPath.role');
        expect(fields.find((f) => f.label === 'Demeanour')?.name).toBe('system.originPath.motivation');
    });

    it('dw returns Player + Chapter(homeWorld) + Speciality(role) + Rank(career) + Demeanour(motivation)', () => {
        const fields = SystemConfigRegistry.get('dw').getHeaderFields(makeActor());
        expect(names(fields)).toEqual([
            'system.bio.playerName',
            'system.originPath.homeWorld',
            'system.originPath.role',
            'system.originPath.career',
            'system.originPath.motivation',
        ]);
        expect(fields.find((f) => f.label === 'Chapter')?.name).toBe('system.originPath.homeWorld');
        expect(fields.find((f) => f.label === 'Rank')?.name).toBe('system.originPath.career');
    });

    it('im returns Player + Patron(homeWorld) + Faction(background) + Role + Endeavour(motivation)', () => {
        const fields = SystemConfigRegistry.get('im').getHeaderFields(makeActor());
        expect(names(fields)).toEqual([
            'system.bio.playerName',
            'system.originPath.homeWorld',
            'system.originPath.background',
            'system.originPath.role',
            'system.originPath.motivation',
        ]);
        expect(fields.find((f) => f.label === 'Patron')?.name).toBe('system.originPath.homeWorld');
        expect(fields.find((f) => f.label === 'Faction')?.name).toBe('system.originPath.background');
        expect(fields.find((f) => f.label === 'Endeavour')?.name).toBe('system.originPath.motivation');
    });

    it('rt returns Player + HomeWorld + Career + Rank(system.rank, type=number)', () => {
        const fields = SystemConfigRegistry.get('rt').getHeaderFields(makeActor());
        expect(names(fields)).toEqual(['system.bio.playerName', 'system.originPath.homeWorld', 'system.originPath.career', 'system.rank']);
        const rankField = fields[3];
        expect(rankField.type).toBe('number');
        expect(rankField.value).toBe(3);
    });

    it('rt rank field is special — it has inputClass="wh40k-rank-input"', () => {
        const fields = SystemConfigRegistry.get('rt').getHeaderFields(makeActor());
        const rankField = fields.find((f) => f.name === 'system.rank');
        expect(rankField?.inputClass).toBe('wh40k-rank-input');
    });

    it('every system has Player as the first row, with empty-string fallback when bio.playerName is missing', () => {
        const ids: GameSystemId[] = ['rt', 'dh1e', 'dh2e', 'bc', 'ow', 'dw', 'im'];
        const actor = makeActor({ system: { bio: {} } });
        for (const id of ids) {
            const fields = SystemConfigRegistry.get(id).getHeaderFields(actor);
            expect(fields[0].name).toBe('system.bio.playerName');
            expect(fields[0].value).toBe('');
        }
    });

    it('values flow through from the actor — homeWorld value populates the matching row across all systems', () => {
        const ids: GameSystemId[] = ['rt', 'dh1e', 'dh2e', 'bc', 'ow', 'dw', 'im'];
        const actor = makeActor({
            system: {
                bio: { playerName: 'Mona' },
                originPath: { homeWorld: 'Hive World' },
            },
        });
        for (const id of ids) {
            const fields = SystemConfigRegistry.get(id).getHeaderFields(actor);
            const hw = fields.find((f) => f.name === 'system.originPath.homeWorld');
            expect(hw?.value, `system ${id}`).toBe('Hive World');
        }
    });
});
