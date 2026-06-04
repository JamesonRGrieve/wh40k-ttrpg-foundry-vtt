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
import { ALL_SYSTEM_IDS, type GameSystemId, type SidebarHeaderField } from '../src/module/config/game-systems/types.ts';
import type { WH40KBaseActor } from '../src/module/documents/base-actor.ts';
import { asBaseActor } from './lib/actor-stub.ts';

interface ActorLike {
    system?: {
        bio?: Record<string, string | number>;
        originPath?: Record<string, string | number>;
        rank?: string | number;
    };
}

interface I18nStub {
    localize: (key: string) => string;
    format: (key: string) => string;
}
interface GameStub {
    i18n: I18nStub;
}
interface GlobalShim {
    game?: GameStub | undefined;
}
const G = globalThis as GlobalShim;
const ORIGINAL_GAME = G.game;

/**
 * Header labels are now localized via makeOriginField (#298 item 3); resolve the
 * header-label keys to their English so these tests keep asserting the displayed
 * label (and confirm each key resolves). The `name=` path assertions below are the
 * real save/load contract and are unaffected by labels.
 */
const HEADER_I18N: Record<string, string> = {
    'WH40K.OriginPath.HomeWorld': 'Home World',
    'WH40K.OriginPath.Career': 'Career',
    'WH40K.OriginPath.CareerPath': 'Career Path',
    'WH40K.OriginPath.Regiment': 'Regiment',
    'WH40K.OriginPath.Speciality': 'Speciality',
    'WH40K.OriginPath.Demeanour': 'Demeanour',
    'WH40K.OriginPath.Patron': 'Patron',
    'WH40K.OriginPath.Faction': 'Faction',
    'WH40K.OriginPath.Role': 'Role',
    'WH40K.OriginPath.Endeavour': 'Endeavour',
    'WH40K.OriginPath.Archetype': 'Archetype',
    'WH40K.OriginPath.Pride': 'Pride',
    'WH40K.OriginPath.Disgrace': 'Disgrace',
    'WH40K.OriginPath.Motivation': 'Motivation',
    'WH40K.OriginPath.Chapter': 'Chapter',
    'WH40K.Character.Rank': 'Rank',
};

beforeAll(() => {
    G.game = {
        i18n: {
            localize: (key: string): string => HEADER_I18N[key] ?? key,
            format: (key: string): string => key,
        },
    };
});

afterAll(() => {
    G.game = ORIGINAL_GAME;
});

function makeActor(overrides: ActorLike = {}): WH40KBaseActor {
    return asBaseActor({
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
    });
}

function names(fields: SidebarHeaderField[]): string[] {
    return fields.map((f) => f.name);
}

describe('BaseSystemConfig.getHeaderFields — name-path stability per system', () => {
    // NOTE: As of commit 6b6f164 ("restore origin-path bubbles + show player name in identity row"),
    // the Player row was dropped from getHeaderFields() — the player name is rendered as a paired
    // input on the identity row instead. These tests assert the post-removal field order.

    it('dh2 returns no static header rows — Home World/Background/Role render as origin bubbles and Divination as the italic quote (#226)', () => {
        const fields = SystemConfigRegistry.get('dh2').getHeaderFields(makeActor());
        // Divination is the italic quote beneath the portrait; the origin steps are bubbles.
        // Nothing remains for the static sidebar fields panel.
        expect(names(fields)).toEqual([]);
    });

    it('dh1 returns HomeWorld + Career + Rank(role) — Divination renders as the italic quote, not a row (#226)', () => {
        const fields = SystemConfigRegistry.get('dh1').getHeaderFields(makeActor());
        expect(names(fields)).toEqual(['system.originPath.homeWorld', 'system.originPath.career', 'system.originPath.role']);
        const rankField = fields.find((f) => f.label === 'Rank');
        expect(rankField?.name).toBe('system.originPath.role');
    });

    it('bc returns HomeWorld + Archetype(role) + Pride(background) + Disgrace(trialsAndTravails) + Motivation', () => {
        const fields = SystemConfigRegistry.get('bc').getHeaderFields(makeActor());
        expect(names(fields)).toEqual([
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

    it('ow returns HomeWorld + Regiment(background) + Speciality(role) + Demeanour(motivation)', () => {
        const fields = SystemConfigRegistry.get('ow').getHeaderFields(makeActor());
        expect(names(fields)).toEqual([
            'system.originPath.homeWorld',
            'system.originPath.background',
            'system.originPath.role',
            'system.originPath.motivation',
        ]);
        expect(fields.find((f) => f.label === 'Regiment')?.name).toBe('system.originPath.background');
        expect(fields.find((f) => f.label === 'Speciality')?.name).toBe('system.originPath.role');
        expect(fields.find((f) => f.label === 'Demeanour')?.name).toBe('system.originPath.motivation');
    });

    it('dw returns Chapter(homeWorld) + Speciality(role) + Rank(career) + Demeanour(motivation)', () => {
        const fields = SystemConfigRegistry.get('dw').getHeaderFields(makeActor());
        expect(names(fields)).toEqual(['system.originPath.homeWorld', 'system.originPath.role', 'system.originPath.career', 'system.originPath.motivation']);
        expect(fields.find((f) => f.label === 'Chapter')?.name).toBe('system.originPath.homeWorld');
        expect(fields.find((f) => f.label === 'Rank')?.name).toBe('system.originPath.career');
    });

    it('im returns Patron(homeWorld) + Faction(background) + Role + Endeavour(motivation)', () => {
        const fields = SystemConfigRegistry.get('im').getHeaderFields(makeActor());
        expect(names(fields)).toEqual([
            'system.originPath.homeWorld',
            'system.originPath.background',
            'system.originPath.role',
            'system.originPath.motivation',
        ]);
        expect(fields.find((f) => f.label === 'Patron')?.name).toBe('system.originPath.homeWorld');
        expect(fields.find((f) => f.label === 'Faction')?.name).toBe('system.originPath.background');
        expect(fields.find((f) => f.label === 'Endeavour')?.name).toBe('system.originPath.motivation');
    });

    it('rt returns HomeWorld + Career + Rank(system.rank, type=number)', () => {
        const fields = SystemConfigRegistry.get('rt').getHeaderFields(makeActor());
        expect(names(fields)).toEqual(['system.originPath.homeWorld', 'system.originPath.career', 'system.rank']);
        const rankField = fields[2];
        expect(rankField.type).toBe('number');
        expect(rankField.value).toBe(3);
    });

    it('rt rank field is special — it has inputClass="wh40k-rank-input"', () => {
        const fields = SystemConfigRegistry.get('rt').getHeaderFields(makeActor());
        const rankField = fields.find((f) => f.name === 'system.rank');
        expect(rankField?.inputClass).toBe('wh40k-rank-input');
    });

    it('the player name field is no longer part of getHeaderFields (rendered separately on the identity row)', () => {
        const ids: readonly GameSystemId[] = ALL_SYSTEM_IDS;
        const actor = makeActor({ system: { bio: {} } });
        for (const id of ids) {
            const fields = SystemConfigRegistry.get(id).getHeaderFields(actor);
            expect(fields.every((f) => f.name !== 'system.bio.playerName')).toBe(true);
        }
    });

    it('values flow through from the actor — homeWorld value populates the matching row (DH2 excepted, #226)', () => {
        // DH2 drops the origin-step text rows (shown as bubbles instead), so it has no
        // homeWorld header row; every other system still surfaces one. Derived from the
        // canonical list (#312) so a newly-added system is covered automatically.
        const ids: readonly GameSystemId[] = ALL_SYSTEM_IDS.filter((s) => s !== 'dh2');
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
