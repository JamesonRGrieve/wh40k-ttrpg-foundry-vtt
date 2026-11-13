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
import { localizeKey } from '../stories/mocks/lang-localize.ts';
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
 * label (and confirm each key resolves). Resolution goes through the shared
 * {@link localizeKey} (which flattens en.json once) rather than a hand-copied
 * key→string map, so a langpack reword can't pass these tests against a stale
 * string (#364). The `name=` path assertions below are the real save/load
 * contract and are unaffected by labels.
 */
beforeAll(() => {
    G.game = {
        i18n: {
            localize: (key: string): string => localizeKey(key),
            format: (key: string): string => localizeKey(key),
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

    it('bc reads its own steps: Race + Archetype + Pride + Disgrace + Motivation (#728)', () => {
        const fields = SystemConfigRegistry.get('bc').getHeaderFields(makeActor());
        expect(names(fields)).toEqual([
            'system.originPath.race',
            'system.originPath.archetype',
            'system.originPath.pride',
            'system.originPath.disgrace',
            'system.originPath.motivation',
        ]);
        // The first field once read "Home World"; Black Crusade has no home worlds.
        expect(fields.some((f) => f.label === 'Home World')).toBe(false);
    });

    it('bc rows show the names of the origins the Black Crusade builder committed (#728)', () => {
        // `system.originPath` is derived from each owned origin item's `step`, so a
        // BC character's committed origins land under race / archetype / pride / disgrace.
        const actor = makeActor({
            system: {
                originPath: { race: 'Chaos Space Marine', archetype: 'Chosen', pride: 'Unbroken', disgrace: 'Failure', motivation: 'Perfection' },
            },
        });
        const fields = SystemConfigRegistry.get('bc').getHeaderFields(actor);
        expect(fields.map((f) => [f.label, f.value])).toEqual([
            ['Race', 'Chaos Space Marine'],
            ['Archetype', 'Chosen'],
            ['Pride', 'Unbroken'],
            ['Disgrace', 'Failure'],
            ['Motivation', 'Perfection'],
        ]);
    });

    it('ow returns HomeWorld + Regiment(background) + Speciality + Demeanour(motivation)', () => {
        const fields = SystemConfigRegistry.get('ow').getHeaderFields(makeActor());
        expect(names(fields)).toEqual([
            'system.originPath.homeWorld',
            'system.originPath.background',
            'system.originPath.speciality',
            'system.originPath.motivation',
        ]);
        expect(fields.find((f) => f.label === 'Regiment')?.name).toBe('system.originPath.background');
        expect(fields.find((f) => f.label === 'Speciality')?.name).toBe('system.originPath.speciality');
        expect(fields.find((f) => f.label === 'Demeanour')?.name).toBe('system.originPath.motivation');
    });

    it('dw returns Chapter + Speciality + Rank(career) + Demeanour(motivation)', () => {
        const fields = SystemConfigRegistry.get('dw').getHeaderFields(makeActor());
        expect(names(fields)).toEqual([
            'system.originPath.chapter',
            'system.originPath.speciality',
            'system.originPath.career',
            'system.originPath.motivation',
        ]);
        expect(fields.find((f) => f.label === 'Chapter')?.name).toBe('system.originPath.chapter');
        expect(fields.find((f) => f.label === 'Rank')?.name).toBe('system.originPath.career');
    });

    /**
     * Rows that read an origin slot no origin document of the line fills: they are
     * not origin steps of that line (Rank, Demeanour, Endeavour) or are built from
     * several steps (Only War's Regiment). `system.originPath` is derived from the
     * owned origin items, so these rows always read blank. Recorded on #728; every
     * other origin row must read one of its line's own steps.
     */
    const NON_STEP_ROWS: ReadonlyArray<readonly [GameSystemId, string]> = [
        ['dh1', 'role'],
        ['ow', 'background'],
        ['ow', 'motivation'],
        ['dw', 'career'],
        ['dw', 'motivation'],
        ['im', 'motivation'],
    ];

    it.each(ALL_SYSTEM_IDS)('%s: every origin row reads a step its own origin documents carry (#728)', (id) => {
        const config = SystemConfigRegistry.get(id);
        const steps = new Set(config.getOriginPathStepKeys());
        const prefix = 'system.originPath.';
        const offStep = config
            .getHeaderFields(makeActor())
            .map((f) => f.name)
            .filter((name) => name.startsWith(prefix))
            .map((name) => name.slice(prefix.length))
            .filter((key) => !steps.has(key) && !NON_STEP_ROWS.some(([line, row]) => line === id && row === key));
        expect(offStep).toEqual([]);
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

    it('values flow through from the actor — each origin row shows the value at its own slot (DH2 excepted, #226)', () => {
        // DH2 drops the origin-step text rows (shown as bubbles instead). Every other
        // system's first row is an origin step; its value comes from the slot it names.
        // Derived from the canonical list (#312) so a newly-added system is covered.
        const ids: readonly GameSystemId[] = ALL_SYSTEM_IDS.filter((s) => s !== 'dh2');
        for (const id of ids) {
            const first = SystemConfigRegistry.get(id).getHeaderFields(makeActor()).at(0);
            if (first === undefined) throw new Error(`system ${id} has no header rows`);
            const key = first.name.replace('system.originPath.', '');
            const actor = makeActor({ system: { bio: { playerName: 'Mona' }, originPath: { [key]: 'Origin Name' } } });
            const row = SystemConfigRegistry.get(id)
                .getHeaderFields(actor)
                .find((f) => f.name === first.name);
            expect(row?.value, `system ${id}`).toBe('Origin Name');
        }
    });
});
