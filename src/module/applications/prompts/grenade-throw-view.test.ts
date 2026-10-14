import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GrenadeRiderData } from '../../rules/grenade-rider.ts';
import { buildLangStub } from '../../testing/lang-stub.ts';
import { HAS_PRIVATE_CONTENT } from '../../testing/private-content.ts';
import { buildGrenadeChoice, buildGrenadeThrowContext, type GrenadeItemView, type GrenadeLabels } from './grenade-throw-view.ts';

/**
 * The grenade throw view (#135): every word on the dialog and its card comes from the
 * grenade's own data — the rider its compendium document authors, its damage and its
 * qualities — through the real English langpack.
 */

const lang = buildLangStub();
const CHARACTERISTIC_NAMES: Record<string, string> = { agility: 'Agility', toughness: 'Toughness', willpower: 'Willpower' };
const LABELS: GrenadeLabels = {
    localize: (key, params) =>
        params === undefined ? lang.localize(key) : lang.format(key, Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))),
    characteristic: (key) => CHARACTERISTIC_NAMES[key] ?? key,
};

function rider(overrides: Partial<GrenadeRiderData> = {}): GrenadeRiderData {
    return {
        test: { characteristic: 'agility', modifier: 10 },
        area: { size: '', measure: 'radius' },
        duration: { kind: 'degreesOfFailure', base: 0, formula: '' },
        effectRollShift: { perDegree: 0, max: 0 },
        effect: 'Blinded for a number of rounds equal to his degrees of failure.',
        ...overrides,
    };
}

function grenade(id: string, name: string, riderData: GrenadeRiderData | null, extra: Partial<GrenadeItemView['system']> = {}): GrenadeItemView {
    return {
        id,
        name,
        system: {
            rider: riderData,
            effectiveSpecial: new Set(['blast-6']),
            fullDamageFormula: '',
            damageTypeAbbr: 'X',
            qualitiesArray: [{ label: 'Blast', level: 6 }],
            ...extra,
        },
    };
}

describe('buildGrenadeChoice', () => {
    it('reads a Photon Flash rider into its card: Blast radius, Agility test, rounds per degree', () => {
        const choice = buildGrenadeChoice(grenade('pf', 'Photon Flash Grenade', rider()), 'pf', LABELS);
        expect(choice).toMatchObject({
            id: 'pf',
            name: 'Photon Flash Grenade',
            areaLabel: '6 m radius',
            damage: '',
            qualities: ['Blast (6)'],
            hasTest: true,
            testLabel: 'Agility +10',
            durationLabel: '1 round per degree of failure',
            shiftLabel: '',
            effectLabel: 'On a failed test',
            isSelected: true,
        });
    });

    it('shows a damaging grenade with no test under Effect, lasting the encounter', () => {
        const tears = rider({ test: { characteristic: '', modifier: 0 }, duration: { kind: 'encounter', base: 0, formula: '' }, effect: 'Perils.' });
        const choice = buildGrenadeChoice(
            grenade('te', 'Tears of the Emperor', tears, { effectiveSpecial: new Set(['blast-2', 'sanctified']), fullDamageFormula: '1d10' }),
            'other',
            LABELS,
        );
        expect(choice).toMatchObject({
            areaLabel: '2 m radius',
            damage: '1d10 X',
            hasTest: false,
            testLabel: 'None',
            durationLabel: 'Until the end of the encounter',
            effectLabel: 'Effect',
            isSelected: false,
        });
    });

    it('labels a step-up per degree of failure, a base duration, a negative test and a rolled diameter', () => {
        const psychotroke = rider({
            test: { characteristic: 'toughness', modifier: -40 },
            duration: { kind: 'degreesOfFailure', base: 1, formula: '' },
            effectRollShift: { perDegree: 1, max: 10 },
        });
        expect(buildGrenadeChoice(grenade('p', 'Psychotroke Grenade', psychotroke), '', LABELS)).toMatchObject({
            testLabel: 'Toughness -40',
            durationLabel: '1 round(s), plus 1 per degree of failure',
            shiftLabel: '+1 to the effect roll per degree of failure (max 10)',
        });
        const smoke = rider({
            test: { characteristic: '', modifier: 0 },
            area: { size: '3d10', measure: 'diameter' },
            duration: { kind: 'roll', base: 0, formula: '2d10' },
        });
        expect(buildGrenadeChoice(grenade('s', 'Smoke Grenade', smoke), '', LABELS)).toMatchObject({
            areaLabel: '3d10 m diameter',
            durationLabel: '2d10 rounds',
        });
    });

    it('prints no area or duration when the grenade gives neither', () => {
        const bare = rider({ duration: { kind: '', base: 0, formula: '' } });
        expect(buildGrenadeChoice(grenade('b', 'Bare', bare, { effectiveSpecial: new Set() }), '', LABELS)).toMatchObject({ areaLabel: '', durationLabel: '' });
    });

    it('is null for a weapon without a rider', () => {
        expect(buildGrenadeChoice(grenade('f', 'Frag Grenade', null), 'f', LABELS)).toBeNull();
    });
});

describe('buildGrenadeThrowContext', () => {
    const items = [grenade('f', 'Frag Grenade', null), grenade('pf', 'Photon Flash Grenade', rider()), grenade('s', 'Smoke Grenade', rider())];

    it('lists only rider grenades and selects the thrown one', () => {
        const context = buildGrenadeThrowContext(items, 's', LABELS);
        expect(context.grenades.map((g) => g.id)).toEqual(['pf', 's']);
        expect(context.selectedId).toBe('s');
        expect(context.selectedGrenade?.name).toBe('Smoke Grenade');
    });

    it('falls back to the first rider grenade for an unknown or rider-less selection, and to none when there is none', () => {
        expect(buildGrenadeThrowContext(items, 'f', LABELS).selectedId).toBe('pf');
        const empty = buildGrenadeThrowContext([grenade('f', 'Frag Grenade', null)], 'f', LABELS);
        expect(empty).toEqual({ grenades: [], selectedId: '', selectedGrenade: null });
    });
});

/** The pack documents and the line each is read for (the rider is per-line where the lines differ). */
const PACKS = resolve(__dirname, '../../../packs-private');
const PACK_RIDERS: Array<{ file: string; line: string; expected: Partial<Record<keyof GrenadeRiderData, object>> }> = [
    {
        // DH2 Core p.158: Ordinary (+10) Agility test, blinded for rounds equal to degrees of failure.
        file: 'dark-heresy-2/dh2-core-items-weapons/_source/photon-flash-grenade_rpn0j61j1euqi000.json',
        line: 'dh2',
        expected: { test: { characteristic: 'agility', modifier: 10 }, duration: { kind: 'degreesOfFailure', base: 0, formula: '' } },
    },
    {
        // DH1 Core p.137: anyone within 15 metres, Toughness test or blinded 1d5 rounds.
        file: 'dark-heresy-2/dh2-core-items-weapons/_source/photon-flash-grenade_rpn0j61j1euqi000.json',
        line: 'dh1',
        expected: {
            test: { characteristic: 'toughness', modifier: 0 },
            area: { size: '15', measure: 'radius' },
            duration: { kind: 'roll', base: 0, formula: '1d5' },
        },
    },
    {
        // DH2 Core p.149 Smoke (X): radius X metres, lasting 1d10+10 rounds.
        file: 'dark-heresy-2/dh2-core-items-weapons/_source/smoke-grenade_v5W6x7Y8z9A0b1C2.json',
        line: 'dh2',
        expected: {
            test: { characteristic: '', modifier: 0 },
            area: { size: '4', measure: 'radius' },
            duration: { kind: 'roll', base: 0, formula: '1d10+10' },
        },
    },
    {
        // Enemies Within p.44 + Core p.146: Hallucinogenic (4) is a -40 Toughness test; +1 per DoF to Table 5-3 (max 10).
        file: 'dark-heresy-2/dh2-within-items-weapons/_source/psychotroke-grenade_11H4xA4yCvZojuHn.json',
        line: 'dh2',
        expected: { test: { characteristic: 'toughness', modifier: -40 }, effectRollShift: { perDegree: 1, max: 10 } },
    },
    {
        // Enemies Within p.45: no test; psykers roll Perils, daemons gain Warp Instability until the encounter ends.
        file: 'dark-heresy-2/dh2-within-items-weapons/_source/tears-of-the-emperor_WUQMZb3rGzvRiJi8.json',
        line: 'dh2',
        expected: { test: { characteristic: '', modifier: 0 }, duration: { kind: 'encounter', base: 0, formula: '' } },
    },
    {
        // OW Core p.183 (as errata'd): Ordinary (+10) Agility test, rounds equal to degrees of failure.
        file: 'only-war/ow-core-items-weapons/_source/photon-flash-grenade-guard_uUNzo4fKh1SilVVD.json',
        line: 'ow',
        expected: { test: { characteristic: 'agility', modifier: 10 }, duration: { kind: 'degreesOfFailure', base: 0, formula: '' } },
    },
];

/** A rider as a pack authors it: whole, or one per line. */
type AuthoredRider = GrenadeRiderData | Partial<Record<string, GrenadeRiderData>>;

interface PackWeapon {
    system: { rider: AuthoredRider | null };
}

function isWholeRider(authored: AuthoredRider): authored is GrenadeRiderData {
    return 'effect' in authored && typeof authored.effect === 'string';
}

/** The rider a pack document authors for `line`: its per-line branch, or the plain rider. */
function packRider(file: string, line: string): GrenadeRiderData | null {
    // eslint-disable-next-line no-restricted-syntax -- boundary: JSON.parse returns unknown (ts-reset); narrowed to the authored weapon shape the assertions check
    const { rider: authored } = (JSON.parse(readFileSync(resolve(PACKS, file), 'utf8')) as PackWeapon).system;
    if (authored === null) return null;
    return isWholeRider(authored) ? authored : authored[line] ?? null;
}

describe.skipIf(!HAS_PRIVATE_CONTENT)('pack grenade riders (#135)', () => {
    it.each(PACK_RIDERS)('$file authors the book rider for $line', ({ file, line, expected }) => {
        const authored = packRider(file, line);
        expect(authored).not.toBeNull();
        expect(authored).toMatchObject(expected);
        expect(authored?.effect.length).toBeGreaterThan(0);
    });
});
