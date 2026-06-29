/**
 * Tests for the pure aptitude-derivation logic (#381).
 *
 * Aptitudes are computed from the origin path; only the player's elective
 * double-up picks (DH2 Core p.79) are persisted. These helpers are Foundry-free,
 * so they load and run directly under happy-dom without the DataModel cascade.
 */

import { describe, expect, it } from 'vitest';
import {
    type AptitudeGrantSource,
    CHARACTERISTIC_APTITUDES,
    aptitudeIdentity,
    collectGrantedAptitudes,
    deriveAptitudes,
    extractLegacyElectives,
} from './aptitude-derivation.ts';

describe('aptitudeIdentity', () => {
    it('normalizes case and whitespace', () => {
        expect(aptitudeIdentity('Willpower')).toBe('willpower');
        expect(aptitudeIdentity('  willpower ')).toBe('willpower');
        expect(aptitudeIdentity('Ballistic   Skill')).toBe('ballistic skill');
    });
});

describe('CHARACTERISTIC_APTITUDES', () => {
    it('is exactly the nine Characteristic aptitudes (DH2 Core p.79)', () => {
        expect([...CHARACTERISTIC_APTITUDES]).toEqual([
            'Weapon Skill',
            'Ballistic Skill',
            'Strength',
            'Toughness',
            'Agility',
            'Intelligence',
            'Perception',
            'Willpower',
            'Fellowship',
        ]);
    });

    it('does not include General (the universal aptitude, injected by consumers)', () => {
        expect(CHARACTERISTIC_APTITUDES.map(aptitudeIdentity)).not.toContain('general');
    });
});

describe('collectGrantedAptitudes', () => {
    it('returns [] for undefined grants', () => {
        expect(collectGrantedAptitudes(undefined, {})).toEqual([]);
    });

    it('collects fixed grants.aptitudes', () => {
        const grants: AptitudeGrantSource = { aptitudes: ['Toughness', 'Fieldcraft'] };
        expect(collectGrantedAptitudes(grants, {})).toEqual(['Toughness', 'Fieldcraft']);
    });

    it('drops empty strings and dedupes within the item by identity', () => {
        const grants: AptitudeGrantSource = { aptitudes: ['Toughness', '', ' toughness ', 'Agility'] };
        expect(collectGrantedAptitudes(grants, {})).toEqual(['Toughness', 'Agility']);
    });

    it('resolves aptitude-typed choices via selectedChoices (by option value)', () => {
        const grants: AptitudeGrantSource = {
            aptitudes: ['Toughness'],
            choices: [{ type: 'aptitude', label: 'Pick Aptitude', options: [{ value: 'Agility' }, { value: 'Perception' }] }],
        };
        const selected = { 'Pick Aptitude': ['Agility'] };
        expect(collectGrantedAptitudes(grants, selected)).toEqual(['Toughness', 'Agility']);
    });

    it('resolves choices keyed by option name', () => {
        const grants: AptitudeGrantSource = {
            choices: [{ type: 'aptitude', name: 'Aptitude', options: [{ name: 'Willpower' }] }],
        };
        expect(collectGrantedAptitudes(grants, { Aptitude: ['Willpower'] })).toEqual(['Willpower']);
    });

    it('falls back to the raw selected value when no option matches', () => {
        const grants: AptitudeGrantSource = { choices: [{ type: 'aptitude', label: 'Aptitude', options: [] }] };
        expect(collectGrantedAptitudes(grants, { Aptitude: ['Intelligence'] })).toEqual(['Intelligence']);
    });

    it('ignores non-aptitude choice types', () => {
        const grants: AptitudeGrantSource = {
            choices: [{ type: 'skill', label: 'Skill', options: [{ value: 'Awareness' }] }],
        };
        expect(collectGrantedAptitudes(grants, { Skill: ['Awareness'] })).toEqual([]);
    });
});

describe('deriveAptitudes', () => {
    it('returns an empty, valid derivation for no grants and no electives', () => {
        const d = deriveAptitudes([], []);
        expect(d.computed).toEqual([]);
        expect(d.doubleUpCount).toBe(0);
        expect(d.aptitudes).toEqual([]);
        expect(d.isValid).toBe(true);
    });

    it('passes unique grants straight through with no double-ups', () => {
        const d = deriveAptitudes(['Toughness', 'Fieldcraft', 'Tech'], []);
        expect(d.computed).toEqual(['Toughness', 'Fieldcraft', 'Tech']);
        expect(d.doubleUpCount).toBe(0);
        expect(d.aptitudes).toEqual(['Toughness', 'Fieldcraft', 'Tech']);
        expect(d.isValid).toBe(true);
    });

    it('dedupes grants case/space-insensitively and counts the collapse as a double-up', () => {
        const d = deriveAptitudes(['Toughness', ' toughness '], []);
        expect(d.computed).toEqual(['Toughness']);
        expect(d.doubleUpCount).toBe(1);
        // One double-up with zero electives is invalid until the player picks one.
        expect(d.isValid).toBe(false);
    });

    it('does NOT auto-add General — only granted/elective aptitudes appear', () => {
        const d = deriveAptitudes(['Toughness'], []);
        expect(d.aptitudes.map(aptitudeIdentity)).not.toContain('general');
    });

    it('resolves a double-up with exactly one valid Characteristic elective', () => {
        const d = deriveAptitudes(['Toughness', 'Toughness'], ['Agility']);
        expect(d.doubleUpCount).toBe(1);
        expect(d.appliedElectives).toEqual(['Agility']);
        expect(d.invalidElectives).toEqual([]);
        expect(d.aptitudes).toEqual(['Toughness', 'Agility']);
        expect(d.isValid).toBe(true);
    });

    it('rejects an elective that is not a Characteristic aptitude', () => {
        const d = deriveAptitudes(['Toughness', 'Toughness'], ['Fieldcraft']);
        expect(d.appliedElectives).toEqual([]);
        expect(d.invalidElectives).toEqual(['Fieldcraft']);
        expect(d.isValid).toBe(false);
    });

    it('rejects an elective already present in the computed set', () => {
        // Toughness is a Characteristic aptitude, but it is already granted.
        const d = deriveAptitudes(['Toughness', 'Agility', 'Agility'], ['Toughness']);
        expect(d.doubleUpCount).toBe(1);
        expect(d.appliedElectives).toEqual([]);
        expect(d.invalidElectives).toEqual(['Toughness']);
        expect(d.isValid).toBe(false);
    });

    it('rejects a duplicate elective (each double-up needs a distinct pick)', () => {
        const d = deriveAptitudes(['Toughness', 'Toughness', 'Willpower', 'Willpower'], ['Agility', 'Agility']);
        expect(d.doubleUpCount).toBe(2);
        expect(d.appliedElectives).toEqual(['Agility']);
        expect(d.invalidElectives).toEqual(['Agility']);
        expect(d.isValid).toBe(false);
    });

    it('is invalid when there are too few electives for the double-up count', () => {
        const d = deriveAptitudes(['Toughness', 'Toughness', 'Willpower', 'Willpower'], ['Agility']);
        expect(d.doubleUpCount).toBe(2);
        expect(d.appliedElectives).toEqual(['Agility']);
        expect(d.isValid).toBe(false);
    });

    it('is invalid when there are more electives than double-ups', () => {
        const d = deriveAptitudes(['Toughness', 'Toughness'], ['Agility', 'Willpower']);
        expect(d.doubleUpCount).toBe(1);
        expect(d.appliedElectives).toEqual(['Agility', 'Willpower']);
        expect(d.invalidElectives).toEqual([]);
        expect(d.isValid).toBe(false);
    });

    it('counts multiple double-ups and resolves them with distinct Characteristic picks', () => {
        const d = deriveAptitudes(['Toughness', 'Toughness', 'Willpower', 'Willpower'], ['Agility', 'Perception']);
        expect(d.doubleUpCount).toBe(2);
        expect(d.appliedElectives).toEqual(['Agility', 'Perception']);
        expect(d.aptitudes).toEqual(['Toughness', 'Willpower', 'Agility', 'Perception']);
        expect(d.isValid).toBe(true);
    });
});

describe('extractLegacyElectives (migration)', () => {
    it('returns [] when the stored set is fully covered by the computed set', () => {
        expect(extractLegacyElectives(['Toughness', 'Fieldcraft'], ['Toughness', 'Fieldcraft'])).toEqual([]);
    });

    it('recovers a Characteristic aptitude that the origin path does not grant', () => {
        // Legacy actor hand-stored "Agility" to fix a double-up; origin grants Toughness/Fieldcraft.
        expect(extractLegacyElectives(['Toughness', 'Fieldcraft', 'Agility'], ['Toughness', 'Fieldcraft'])).toEqual(['Agility']);
    });

    it('drops a non-Characteristic stored entry not in the computed set (it must come from a grant, not an elective)', () => {
        // Fieldcraft is not a Characteristic aptitude, so it can never be an elective.
        expect(extractLegacyElectives(['Toughness', 'Fieldcraft'], ['Toughness'])).toEqual([]);
    });

    it('dedupes recovered electives by identity', () => {
        expect(extractLegacyElectives(['agility', 'Agility'], [])).toEqual(['agility']);
    });
});

describe('#381 acceptance scenarios reproduce as computed-or-elective', () => {
    it('A.Z. → Agility reproduces as a validated elective, not a hand-stored entry', () => {
        // Origin path double-ups Toughness; the recorded fix was a raw "Agility" entry.
        const granted = ['Toughness', 'Toughness', 'Willpower'];
        const computed = deriveAptitudes(granted, []).computed;
        const electives = extractLegacyElectives([...computed, 'Agility'], computed);
        expect(electives).toEqual(['Agility']);

        const d = deriveAptitudes(granted, electives);
        expect(d.isValid).toBe(true);
        expect(d.aptitudes).toContain('Agility');
    });

    it('Gus → Ballistic Skill reproduces as a validated elective', () => {
        const granted = ['Willpower', 'Willpower', 'Knowledge'];
        const computed = deriveAptitudes(granted, []).computed;
        const electives = extractLegacyElectives([...computed, 'Ballistic Skill'], computed);
        expect(electives).toEqual(['Ballistic Skill']);

        const d = deriveAptitudes(granted, electives);
        expect(d.isValid).toBe(true);
        expect(d.aptitudes).toContain('Ballistic Skill');
    });

    it('Ibnad → Fieldcraft reproduces as a COMPUTED grant (non-Characteristic, never an elective)', () => {
        // Once the origin grant is corrected to include Fieldcraft, it is computed;
        // the legacy hand-stored Fieldcraft is dropped and no elective is owed.
        const granted = ['Toughness', 'Fieldcraft'];
        const computed = deriveAptitudes(granted, []).computed;
        const electives = extractLegacyElectives([...computed], computed);
        expect(electives).toEqual([]);

        const d = deriveAptitudes(granted, electives);
        expect(d.aptitudes).toContain('Fieldcraft');
        expect(d.doubleUpCount).toBe(0);
        expect(d.isValid).toBe(true);
    });
});
