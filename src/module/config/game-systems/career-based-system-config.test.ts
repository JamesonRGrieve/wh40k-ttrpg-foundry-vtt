/**
 * Career-based lines offer every rank's advances up to the actor's rank
 * (operator ruling 2026-11-14), read from the line's own career registry.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { resetCareerAdvancementIndexForTesting, setCareerAdvancementsForTesting, type CareerTable } from '../advancements/career-advancement-cache.ts';
import { SystemConfigRegistry } from './index.ts';
import type { SystemConfigActor } from './types.ts';

const advance = (name: string): CareerTable['RANK_1_ADVANCES'][number] => ({ name, cost: 100, type: 'skill', prerequisites: [] });

const ADEPT: CareerTable = {
    CAREER_INFO: { key: 'adept', name: 'Adept', description: '', ranks: ['Initiate', 'Archivist'] },
    CHARACTERISTIC_COSTS: {},
    RANK_1_ADVANCES: [advance('Literacy')],
    RANKS: [
        { rank: 1, title: 'Initiate', minXp: 0, advances: [advance('Literacy')] },
        { rank: 2, title: 'Archivist', minXp: 500, advances: [advance('Inquiry')] },
        { rank: 3, title: 'Lexographer', minXp: 1000, advances: [advance('Scrutiny')] },
    ],
    TIER_ORDER: ['simple', 'intermediate', 'trained', 'expert'],
};

/** A DH1 character of `career` at `rank`. */
function acolyte(career: string, rank: number | undefined): SystemConfigActor {
    return { system: { originPath: { career }, ...(rank === undefined ? {} : { rank }) }, items: { some: () => false } };
}

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
