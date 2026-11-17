/**
 * Career-based lines offer every rank's advances up to the actor's rank
 * (operator ruling 2026-11-14), read from the line's own career registry.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { resetCareerAdvancementIndexForTesting, setCareerAdvancementsForTesting, type CareerTable } from '../advancements/career-advancement-cache.ts';
import { CareerBasedSystemConfig } from './career-based-system-config.ts';
import { SystemConfigRegistry } from './index.ts';
import type { SystemConfigActor } from './types.ts';

const advance = (name: string): CareerTable['RANK_1_ADVANCES'][number] => ({ name, cost: 100, type: 'skill', prerequisites: [] });

const ADEPT: CareerTable = {
    CAREER_INFO: { key: 'adept', name: 'Adept', description: '', ranks: ['Initiate', 'Archivist'] },
    CHARACTERISTIC_COSTS: {},
    RANK_1_ADVANCES: [advance('Literacy')],
    RANKS: [
        { rank: 1, branch: '', title: 'Initiate', minXp: 0, advances: [advance('Literacy')] },
        { rank: 2, branch: '', title: 'Archivist', minXp: 500, advances: [advance('Inquiry')] },
        { rank: 3, branch: '', title: 'Lexographer', minXp: 1000, advances: [advance('Scrutiny')] },
    ],
    TIER_ORDER: ['simple', 'intermediate', 'trained', 'expert'],
};

/** A DH1 character of `career` at `rank`. */
/** A DH1 character of `career` the GM has set to `rank` (the override), or on no override. */
function acolyte(career: string, rank: number | undefined, careerBranches: string[] = []): SystemConfigActor {
    return { system: { originPath: { career }, careerBranches, ...(rank === undefined ? {} : { rankOverride: rank }) }, items: { some: () => false } };
}

/** A DH1 character of `career` with `total` XP earned, its rank left to the line. */
function veteran(career: string, total: number, stored?: number): SystemConfigActor {
    return { system: { originPath: { career }, experience: { total }, ...(stored === undefined ? {} : { rank: stored }) }, items: { some: () => false } };
}

/** A Guardsman whose rank 6-7 branch into three paths, as DH1 prints them. */
const GUARDSMAN: CareerTable = {
    ...ADEPT,
    CAREER_INFO: { key: 'guardsman', name: 'Guardsman', description: '', ranks: [] },
    RANKS: [
        { rank: 5, branch: '', title: 'Veteran', minXp: 3000, advances: [advance('Command')] },
        { rank: 6, branch: 'assault-veteran', title: 'Assault Veteran', minXp: 6000, advances: [advance('Climb')] },
        { rank: 6, branch: 'lieutenant', title: 'Lieutenant', minXp: 6000, advances: [advance('Charm')] },
        { rank: 6, branch: 'scout', title: 'Scout', minXp: 6000, advances: [advance('Tracking')] },
        { rank: 7, branch: 'scout', title: 'Marksman', minXp: 8000, advances: [advance('Concealment')] },
        { rank: 7, branch: 'lieutenant', title: 'Captain', minXp: 8000, advances: [advance('Interrogation')] },
    ],
};

afterEach(() => {
    resetCareerAdvancementIndexForTesting();
});

describe('career advances by rank (operator ruling 2026-11-14)', () => {
    const dh1 = SystemConfigRegistry.get('dh1');

    it('offers every rank up to the character’s, found by the career’s name', () => {
        setCareerAdvancementsForTesting({ adept: ADEPT }, 'dh1');
        expect(dh1.getAvailableAdvances(acolyte('Adept', 2)).map((a) => a.name)).toEqual(['Literacy', 'Inquiry']);
        expect(dh1.getAvailableAdvances(acolyte('Adept', 3)).map((a) => a.name)).toEqual(['Literacy', 'Inquiry', 'Scrutiny']);
    });

    it('treats a character with no rank as rank 1', () => {
        setCareerAdvancementsForTesting({ adept: ADEPT }, 'dh1');
        expect(dh1.getAvailableAdvances(acolyte('Adept', undefined)).map((a) => a.name)).toEqual(['Literacy']);
    });

    it('falls back to the rank-1 list for a career with no rank tables', () => {
        setCareerAdvancementsForTesting({ adept: { ...ADEPT, RANKS: [] } }, 'dh1');
        expect(dh1.getAvailableAdvances(acolyte('Adept', 3)).map((a) => a.name)).toEqual(['Literacy']);
    });
});

describe('career branches (operator ruling 2026-11-15: the player picks the path in Advancement)', () => {
    const config = SystemConfigRegistry.get('dh1');
    if (!(config instanceof CareerBasedSystemConfig)) throw new Error('DH1 is a career-based line');
    const dh1 = config;

    it('offers a branched rank only on the chosen path', () => {
        setCareerAdvancementsForTesting({ guardsman: GUARDSMAN }, 'dh1');
        expect(dh1.getAvailableAdvances(acolyte('Guardsman', 7, ['scout'])).map((a) => a.name)).toEqual(['Command', 'Tracking', 'Concealment']);
    });

    it('offers no branched advances before a path is chosen, and asks for the first unchosen branch point', () => {
        setCareerAdvancementsForTesting({ guardsman: GUARDSMAN }, 'dh1');
        expect(dh1.getAvailableAdvances(acolyte('Guardsman', 7)).map((a) => a.name)).toEqual(['Command']);
        expect(dh1.pendingCareerBranch(acolyte('Guardsman', 7))).toEqual({
            rank: 6,
            options: [
                { branch: 'assault-veteran', title: 'Assault Veteran' },
                { branch: 'lieutenant', title: 'Lieutenant' },
                { branch: 'scout', title: 'Scout' },
            ],
        });
    });

    it('asks nothing below the branch point or once the path is chosen', () => {
        setCareerAdvancementsForTesting({ guardsman: GUARDSMAN }, 'dh1');
        expect(dh1.pendingCareerBranch(acolyte('Guardsman', 5))).toBeNull();
        expect(dh1.pendingCareerBranch(acolyte('Guardsman', 7, ['lieutenant']))).toBeNull();
    });
});

describe("a Battle-Brother's advances: his speciality's and his Chapter's", () => {
    const dw = SystemConfigRegistry.get('dw');
    const brother = (speciality: string, chapter: string): SystemConfigActor => ({
        system: { originPath: { speciality, chapter }, rank: 1 },
        items: { some: () => false },
    });

    it("offers the speciality's ranks and the Chapter's advances together", () => {
        setCareerAdvancementsForTesting(
            {
                'tactical-marine': { ...ADEPT, RANKS: [{ rank: 1, branch: '', title: '', minXp: 0, advances: [advance('Awareness')] }] },
                'ultramarines': { ...ADEPT, RANKS: [{ rank: 1, branch: '', title: '', minXp: 0, advances: [advance('Command')] }] },
            },
            'dw',
        );
        expect(dw.getAvailableAdvances(brother('Tactical Marine', 'Ultramarines')).map((a) => a.name)).toEqual(['Awareness', 'Command']);
        // Without a Chapter, the speciality alone.
        expect(dw.getAvailableAdvances(brother('Tactical Marine', '')).map((a) => a.name)).toEqual(['Awareness']);
    });
});

describe("a DH1 character's elite advances add their tables", () => {
    const dh1 = SystemConfigRegistry.get('dh1');
    const eliteItem = (identifier: string, step = 'elite'): { name: string; isOriginPath: boolean; system: object } => ({
        name: identifier,
        isOriginPath: true,
        system: { step, identifier },
    });
    const withItems = (items: Array<{ name: string; isOriginPath: boolean; system: object }>): SystemConfigActor => ({
        system: { originPath: { career: 'Adept' }, rank: 1 },
        items: { some: (predicate) => items.some(predicate) },
    });

    it("offers an owned elite advance's table beside the career's, found by the item's identifier", () => {
        setCareerAdvancementsForTesting(
            {
                'adept': ADEPT,
                'salvation-demagogue': { ...ADEPT, RANKS: [{ rank: 1, branch: '', title: '', minXp: 0, advances: [advance('Command')] }] },
            },
            'dh1',
        );
        expect(dh1.getAvailableAdvances(withItems([eliteItem('salvation-demagogue')])).map((a) => a.name)).toEqual(['Literacy', 'Command']);
        // An origin on another step, or no elite at all: the career alone.
        expect(dh1.getAvailableAdvances(withItems([eliteItem('salvation-demagogue', 'background')])).map((a) => a.name)).toEqual(['Literacy']);
        expect(dh1.getAvailableAdvances(withItems([])).map((a) => a.name)).toEqual(['Literacy']);
    });
});

describe('career rank from experience (operator ruling 2026-11-16)', () => {
    const dh1 = SystemConfigRegistry.get('dh1');

    it('is the highest rank whose printed starting XP the total XP has reached', () => {
        setCareerAdvancementsForTesting({ adept: ADEPT }, 'dh1');
        expect([0, 499, 500, 999, 1000, 9000].map((total) => dh1.effectiveRank(veteran('Adept', total)))).toEqual([1, 1, 2, 2, 3, 3]);
        expect(dh1.getAvailableAdvances(veteran('Adept', 500)).map((a) => a.name)).toEqual(['Literacy', 'Inquiry']);
    });

    it("gives way to the GM's override", () => {
        setCareerAdvancementsForTesting({ adept: ADEPT }, 'dh1');
        const overridden: SystemConfigActor = {
            system: { originPath: { career: 'Adept' }, experience: { total: 9000 }, rankOverride: 1 },
            items: { some: () => false },
        };
        expect(dh1.effectiveRank(overridden)).toBe(1);
    });

    it('keeps the stored rank when the career prints no starting XP', () => {
        const unpriced: CareerTable = { ...ADEPT, RANKS: ADEPT.RANKS.map((entry) => ({ ...entry, minXp: null })) };
        setCareerAdvancementsForTesting({ adept: unpriced }, 'dh1');
        expect(dh1.effectiveRank(veteran('Adept', 9000, 2))).toBe(2);
        expect(dh1.effectiveRank(veteran('Adept', 9000))).toBe(1);
    });
});
