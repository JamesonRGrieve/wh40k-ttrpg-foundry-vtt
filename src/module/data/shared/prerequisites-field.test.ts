import { describe, expect, it } from 'vitest';
import { type PrerequisiteActorView, toStructuredPrerequisites, unmetPrerequisites } from './prerequisites-field.ts';

const NONE = { text: '', characteristics: {}, skills: [], talents: [] };

describe('toStructuredPrerequisites (#673)', () => {
    it('keeps a legacy flat string as the printed text', () => {
        expect(toStructuredPrerequisites('Willpower 40')).toEqual({ ...NONE, text: 'Willpower 40' });
    });

    it('reads an absent or malformed value as no prerequisites', () => {
        expect(toStructuredPrerequisites(undefined)).toEqual(NONE);
        expect(toStructuredPrerequisites(null)).toEqual(NONE);
        expect(toStructuredPrerequisites(['Willpower 40'])).toEqual(NONE);
    });

    it('keeps the structured shape, coercing record-shaped lists and dropping non-numeric minimums', () => {
        const raw = {
            text: 'Willpower 40, Psyniscience',
            characteristics: { willpower: 40, agility: 'x' },
            skills: { 0: 'Psyniscience' },
            talents: ['Hatred'],
        };
        expect(toStructuredPrerequisites(raw)).toEqual({
            text: 'Willpower 40, Psyniscience',
            characteristics: { willpower: 40 },
            skills: ['Psyniscience'],
            talents: ['Hatred'],
        });
    });
});

describe('unmetPrerequisites (#673)', () => {
    const actor = (overrides: Partial<PrerequisiteActorView> = {}): PrerequisiteActorView => ({
        characteristics: { willpower: 40, agility: 25 },
        skillRanks: { Psyniscience: 2 },
        talents: ['Psychic Discipline'],
        ...overrides,
    });

    it('passes when every gate is met', () => {
        const prereqs = { ...NONE, characteristics: { willpower: 40 }, skills: ['Psyniscience +10'], talents: ['psychic discipline'] };
        expect(unmetPrerequisites(prereqs, actor())).toEqual([]);
    });

    it('names an unmet characteristic minimum, as DH2 Smite needs Willpower 40', () => {
        const prereqs = { ...NONE, characteristics: { willpower: 40 } };
        expect(unmetPrerequisites(prereqs, actor({ characteristics: { willpower: 25 } }))).toEqual(['willpower 40+']);
    });

    it('reads a skill suffix as the training level: none Known, +10 Trained, +20 Experienced', () => {
        const ranked = actor({ skillRanks: { psyniscience: 2 } });
        expect(unmetPrerequisites({ ...NONE, skills: ['Psyniscience'] }, ranked)).toEqual([]);
        expect(unmetPrerequisites({ ...NONE, skills: ['Psyniscience +10'] }, ranked)).toEqual([]);
        expect(unmetPrerequisites({ ...NONE, skills: ['Psyniscience +20'] }, ranked)).toEqual(['Psyniscience +20']);
        expect(unmetPrerequisites({ ...NONE, skills: ['Awareness'] }, ranked)).toEqual(['Awareness']);
    });

    it('names a talent the actor does not own', () => {
        expect(unmetPrerequisites({ ...NONE, talents: ['Warp Conduit'] }, actor())).toEqual(['Warp Conduit']);
    });

    it('lets text alone gate nothing', () => {
        expect(unmetPrerequisites({ ...NONE, text: 'Aligned Nurgle' }, actor())).toEqual([]);
    });
});
