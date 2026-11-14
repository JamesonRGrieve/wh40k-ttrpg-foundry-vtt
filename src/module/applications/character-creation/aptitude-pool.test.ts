import { describe, expect, it } from 'vitest';
import {
    aptitudeCollisions,
    electivePicks,
    aptitudeGrantCounts,
    findAptitudeOverride,
    grantedAptitudes,
    normalizeAptitudeIdentity,
    referencedAptitudes,
    swapCandidates,
} from './aptitude-pool.ts';

const LABELS = ['Weapon Skill', 'Strength', 'Willpower'];

describe('aptitude pool (#717)', () => {
    it('compares aptitudes by trimmed, collapsed, lower-cased identity', () => {
        expect(normalizeAptitudeIdentity('  Weapon   Skill ')).toBe('weapon skill');
    });

    it('collects fixed grants and resolved aptitude choices, once each', () => {
        const granted = grantedAptitudes({
            grants: {
                aptitudes: ['Fieldcraft', '', 'Fieldcraft'],
                choices: [{ type: 'aptitude', label: 'Aptitude', options: [{ value: 'Strength' }, { value: 'Toughness' }] }],
            },
            selectedChoices: { Aptitude: ['Strength'] },
        });
        expect([...granted]).toEqual(['Fieldcraft', 'Strength']);
    });

    it('counts how many origins grant each aptitude', () => {
        expect(aptitudeGrantCounts([new Set(['Strength', 'Tech']), new Set(['Strength'])])).toEqual(
            new Map([
                ['Strength', 2],
                ['Tech', 1],
            ]),
        );
    });

    it('lists every aptitude an origin names, including bare-string options', () => {
        expect(
            referencedAptitudes({
                grants: {
                    aptitudes: ['Tech'],
                    choices: [
                        { type: 'aptitude', options: ['Strength', { name: 'Willpower' }] },
                        { type: 'skill', options: ['Dodge'] },
                    ],
                },
            }),
        ).toEqual(['Tech', 'Strength', 'Willpower']);
    });

    it('offers only untaken characteristic aptitudes, topped up from the labels and sorted', () => {
        expect(swapCandidates(['Tech', 'strength', 'Strength'], LABELS, ['WILLPOWER'])).toEqual(['strength', 'Weapon Skill']);
    });

    it('finds a recorded swap under another spelling', () => {
        const overrides = new Map([['willpower', 'Strength']]);
        expect(findAptitudeOverride(overrides, ' Willpower')).toBe('Strength');
        expect(findAptitudeOverride(overrides, 'Tech')).toBeUndefined();
    });

    it('reports duplicates folded by identity and re-grants of an existing aptitude', () => {
        const counts = new Map([
            ['Willpower', 1],
            ['willpower', 1],
            ['Tech', 1],
            ['Offence', 1],
        ]);
        const collisions = aptitudeCollisions(counts, ['offence'], (original) => (original === 'Offence' ? '' : undefined));
        expect(collisions).toEqual([
            { original: 'Offence', replacement: '' },
            { original: 'Willpower', replacement: null },
        ]);
    });

    it('stores each chosen replacement once, and nothing for a skipped collision (#738)', () => {
        const overrides = new Map([
            ['Willpower', 'Strength'],
            ['Tech', ''],
            ['Offence', 'Strength'],
            ['Defence', 'Agility'],
        ]);
        expect(electivePicks(overrides)).toEqual(['Strength', 'Agility']);
    });
});
