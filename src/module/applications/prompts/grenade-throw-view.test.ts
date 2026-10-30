import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type DeclaredPack, readDeclaredPacks } from '../../../../scripts/lib/pack-manifest.mjs';
import type { GrenadeRiderData } from '../../rules/grenade-rider.ts';
import { type RiderOverrides, riderFixture } from '../../testing/grenade-rider-fixture.ts';
import { buildLangStub } from '../../testing/lang-stub.ts';
import { HAS_PRIVATE_CONTENT } from '../../testing/private-content.ts';
import { isLineBookPack, lineCategoryPack } from '../../utils/line-packs.ts';
import { buildDamageCardRider, buildGrenadeChoice, buildGrenadeThrowContext, type GrenadeItemView, type GrenadeLabels } from './grenade-throw-view.ts';

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
    lang: 'en',
};

/** A Photon Flash-like rider under `overrides`. */
function rider(overrides: RiderOverrides = {}): GrenadeRiderData {
    return riderFixture({
        test: { characteristic: 'agility', modifier: 10 },
        duration: { kind: 'degreesOfFailure', base: 0, formula: '' },
        effect: 'Blinded for a number of rounds equal to his degrees of failure.',
        ...overrides,
    });
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
            durationLabel: '1 round, plus 1 per degree of failure',
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

    it('labels a psyker-only rider and says whether there is anything to resolve (#623)', () => {
        const psykOut = rider({ test: { characteristic: 'willpower', modifier: -30 }, affects: 'psyker' });
        expect(buildGrenadeChoice(grenade('p', 'Psyk-Out Grenade', psykOut), '', LABELS)).toMatchObject({ affectsLabel: 'Psykers only', resolvable: true });
        const smoke = rider({ test: { characteristic: '', modifier: 0 } });
        expect(buildGrenadeChoice(grenade('s', 'Smoke Grenade', smoke), '', LABELS)).toMatchObject({ affectsLabel: '', resolvable: false });
    });

    it('is null for a weapon without a rider', () => {
        expect(buildGrenadeChoice(grenade('f', 'Frag Grenade', null), 'f', LABELS)).toBeNull();
    });
});

describe('buildDamageCardRider', () => {
    const rad = rider({ test: { characteristic: 'toughness', modifier: -20 }, duration: { kind: '', base: 0, formula: '' }, effect: '2d10 Toughness damage.' });

    it('states a damaging grenade’s rider after its damage, naming each creature struck once (#622)', () => {
        const card = buildDamageCardRider(
            grenade('r', 'Rad Grenade', rad, { effectiveSpecial: new Set(['blast-2']), fullDamageFormula: '1d10' }),
            ['Heretic', 'Accomplice', 'Heretic', ''],
            LABELS,
        );
        expect(card?.struck).toEqual(['Heretic', 'Accomplice']);
        expect(card?.rider).toMatchObject({ name: 'Rad Grenade', areaLabel: '2 m radius', testLabel: 'Toughness -20', effect: '2d10 Toughness damage.' });
    });

    it('is null for a weapon without a rider, and for a roll with no weapon', () => {
        expect(buildDamageCardRider(grenade('f', 'Frag Grenade', null), ['Heretic'], LABELS)).toBeNull();
        expect(buildDamageCardRider(null, ['Heretic'], LABELS)).toBeNull();
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

/**
 * The pack documents and the line each is read for (the rider is per-line where the
 * lines differ). `pack` is the line whose weapons packs hold the document: it is
 * found by the packs' manifest flags, never by a pack's name.
 */
const REPO_ROOT = resolve(__dirname, '../../../..');
const PACKS = resolve(REPO_ROOT, 'src/packs-private');
const PACK_RIDERS: Array<{ pack: string; file: string; line: string; expected: RiderOverrides }> = [
    {
        // DH2: Ordinary (+10) Agility test, blinded for rounds equal to degrees of failure.
        pack: 'dh2',
        file: 'photon-flash-grenade_rpn0j61j1euqi000.json',
        line: 'dh2',
        expected: { test: { characteristic: 'agility', modifier: 10 }, condition: 'blinded', duration: { kind: 'degreesOfFailure', base: 0, formula: '' } },
    },
    {
        // DH1: anyone within 15 metres, Toughness test or blinded 1d5 rounds.
        pack: 'dh2',
        file: 'photon-flash-grenade_rpn0j61j1euqi000.json',
        line: 'dh1',
        expected: {
            test: { characteristic: 'toughness', modifier: 0 },
            area: { size: '15', measure: 'radius' },
            duration: { kind: 'roll', base: 0, formula: '1d5' },
        },
    },
    {
        // DH2 Smoke (X): radius X metres, lasting 1d10+10 rounds.
        pack: 'dh2',
        file: 'smoke-grenade_v5W6x7Y8z9A0b1C2.json',
        line: 'dh2',
        expected: {
            test: { characteristic: '', modifier: 0 },
            area: { size: '4', measure: 'radius' },
            duration: { kind: 'roll', base: 0, formula: '1d10+10' },
        },
    },
    {
        // A DH2 supplement + the core Hallucinogenic (4) quality: a -40 Toughness test; +1 per DoF on the Hallucinogenic effects table (max 10).
        pack: 'dh2',
        file: 'psychotroke-grenade_11H4xA4yCvZojuHn.json',
        line: 'dh2',
        expected: { test: { characteristic: 'toughness', modifier: -40 }, effectRollShift: { perDegree: 1, max: 10 } },
    },
    {
        // A DH2 supplement: no test; psykers roll Perils, daemons gain Warp Instability until the encounter ends.
        pack: 'dh2',
        file: 'tears-of-the-emperor_WUQMZb3rGzvRiJi8.json',
        line: 'dh2',
        expected: { test: { characteristic: '', modifier: 0 }, duration: { kind: 'encounter', base: 0, formula: '' } },
    },
    {
        // OW (as errata'd): Ordinary (+10) Agility test, rounds equal to degrees of failure.
        pack: 'ow',
        file: 'photon-flash-grenade-guard_uUNzo4fKh1SilVVD.json',
        line: 'ow',
        expected: { test: { characteristic: 'agility', modifier: 10 }, condition: 'blinded', duration: { kind: 'degreesOfFailure', base: 0, formula: '' } },
    },
    {
        // DH2 supplements: a psyker hit tests Very Hard (–30) Willpower or loses psy rating per degree.
        pack: 'dh2',
        file: 'psyk-out-grenade_lScsj4tB78fJdtkt.json',
        line: 'dh2',
        expected: { test: { characteristic: 'willpower', modifier: -30, psykerModifier: 0 }, affects: 'psyker', condition: '' },
    },
    {
        // An RT supplement: a psyker in the blast tests Difficult (–10) Willpower or is Stunned for 1d5+3 rounds.
        pack: 'dh2',
        file: 'psyk-out-grenade_lScsj4tB78fJdtkt.json',
        line: 'rt',
        expected: {
            test: { characteristic: 'willpower', modifier: -10 },
            affects: 'psyker',
            condition: 'stunned',
            duration: { kind: 'roll', base: 0, formula: '1d5+3' },
        },
    },
    {
        // A DH1 supplement: Very Hard (–30) Willpower, psy rating lost per degree of failure.
        pack: 'dh1',
        file: 'psyk-out-grenade_581f419cbb89f4eb.json',
        line: 'dh1',
        expected: { test: { characteristic: 'willpower', modifier: -30 }, affects: 'psyker', condition: '' },
    },
    {
        // A DH2 supplement: everyone struck tests Hard (–20) Toughness or suffers 2d10 Toughness damage.
        pack: 'dh2',
        file: 'rad-grenade_Pr6BN0flDXSlUxnc.json',
        line: 'dh2',
        expected: { test: { characteristic: 'toughness', modifier: -20 }, affects: '', condition: '' },
    },
    {
        // An RT supplement: Hard (–20) Toughness or 2d10 Toughness damage.
        pack: 'dh2',
        file: 'rad-grenade_Pr6BN0flDXSlUxnc.json',
        line: 'rt',
        expected: { test: { characteristic: 'toughness', modifier: -20 }, condition: '' },
    },
    {
        // An RT supplement: Challenging (+0) Toughness (−5 per point of damage, stated in the effect).
        pack: 'rt',
        file: 'rad-grenade_JG4AY6KIs4F5bBDq.json',
        line: 'rt',
        expected: { test: { characteristic: 'toughness', modifier: 0 }, condition: '' },
    },
    {
        // A DH1 supplement: Hard (–20) Toughness or 2d10 Toughness damage.
        pack: 'dh1',
        file: 'rad-grenades_ad4ff72a1c734343.json',
        line: 'dh1',
        expected: { test: { characteristic: 'toughness', modifier: -20 }, condition: '' },
    },
    {
        // A DH2 supplement + the core rules (mind-mould): Ordinary (+10) Toughness, psykers −20.
        pack: 'dh2',
        file: 'spore-bomb_sLizyfBckVTXxp6g.json',
        line: 'dh2',
        expected: { test: { characteristic: 'toughness', modifier: 10, psykerModifier: -20 }, affects: '', condition: '' },
    },
    {
        // A DH2 supplement + the core Smoke (5) quality: no test; the 5 m cloud, lasting 1d10+10 rounds, burns whoever starts a turn in it.
        pack: 'dh2',
        file: 'whitefire-grenade_Vmqd3y5vL4mnavCq.json',
        line: 'dh2',
        expected: { test: { characteristic: '' }, area: { size: '5', measure: 'radius' }, duration: { kind: 'roll', base: 0, formula: '1d10+10' } },
    },
];

/** Shared grenade documents whose line prints no rider (an explicit null branch, #622). */
const PACK_NO_RIDER: Array<{ pack: string; file: string; line: string }> = [
    // A BC supplement: the Rad Grenade's radiation is its Irradiated (2) quality, no rider.
    { pack: 'dh2', file: 'rad-grenade_Pr6BN0flDXSlUxnc.json', line: 'bc' },
];

/** The declared packs (from the private manifest, so read only inside a test). */
function declaredPacks(): DeclaredPack[] {
    return readDeclaredPacks(REPO_ROOT).packs;
}

/** A declared pack's `_source` directory under the private content root. */
function sourceDir(pack: DeclaredPack): string {
    return resolve(PACKS, pack.path.replace(/^packs\//, ''), '_source');
}

/** The path of `file` in whichever of `line`'s book weapons packs holds it. */
function weaponSource(line: string, file: string): string {
    for (const pack of declaredPacks()) {
        if (!isLineBookPack(pack, line, 'weapons')) continue;
        const path = resolve(sourceDir(pack), file);
        if (existsSync(path)) return path;
    }
    throw new Error(`no ${line} weapons pack holds ${file}`);
}

/** The condition registry ids the condition packs author (`system.identifier`). */
function conditionIds(): Set<string> {
    const pack = lineCategoryPack(
        declaredPacks().map((metadata) => ({ metadata })),
        'dh2',
        'conditions',
    )?.metadata;
    if (pack === undefined) throw new Error('no dh2 conditions pack is declared');
    const dir = sourceDir(pack);
    // eslint-disable-next-line no-restricted-syntax -- boundary: JSON.parse returns unknown (ts-reset); narrowed to the condition identifier shape read here
    return new Set(
        readdirSync(dir).map((file) => (JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as { system: { identifier: string } }).system.identifier),
    );
}

/** A rider as a pack authors it: whole, or one per line. */
type AuthoredRider = GrenadeRiderData | Partial<Record<string, GrenadeRiderData>>;

interface PackWeapon {
    system: { rider: AuthoredRider | null };
}

function isWholeRider(authored: AuthoredRider): authored is GrenadeRiderData {
    return 'effect' in authored && typeof authored.effect === 'string';
}

/** The rider a pack document authors for `line`: its per-line branch, or the plain rider. */
function packRider(pack: string, file: string, line: string): GrenadeRiderData | null {
    // eslint-disable-next-line no-restricted-syntax -- boundary: JSON.parse returns unknown (ts-reset); narrowed to the authored weapon shape the assertions check
    const { rider: authored } = (JSON.parse(readFileSync(weaponSource(pack, file), 'utf8')) as PackWeapon).system;
    if (authored === null) return null;
    return isWholeRider(authored) ? authored : authored[line] ?? null;
}

describe.skipIf(!HAS_PRIVATE_CONTENT)('pack grenade riders (#135)', () => {
    it.each(PACK_RIDERS)('$file authors the book rider for $line', ({ pack, file, line, expected }) => {
        const authored = packRider(pack, file, line);
        expect(authored).not.toBeNull();
        expect(authored).toMatchObject(expected);
        expect(authored?.effect.length).toBeGreaterThan(0);
    });

    it.each(PACK_NO_RIDER)('$file prints no rider for $line', ({ pack, file, line }) => {
        expect(packRider(pack, file, line)).toBeNull();
    });

    it('names only conditions the condition packs author (#623)', () => {
        const ids = conditionIds();
        const named = PACK_RIDERS.map(({ pack, file, line }) => packRider(pack, file, line)?.condition ?? '').filter((id) => id !== '');
        expect(named.length).toBeGreaterThan(0);
        expect(named.filter((id) => !ids.has(id))).toEqual([]);
    });
});
