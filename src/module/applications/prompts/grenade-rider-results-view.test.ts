import { describe, expect, it } from 'vitest';
import { type RiderTargetResult, resolveRiderCreature } from '../../rules/grenade-rider-resolution.ts';
import { riderFixture } from '../../testing/grenade-rider-fixture.ts';
import { buildLangStub } from '../../testing/lang-stub.ts';
import { buildRiderResultsCard, riderOutcome } from './grenade-rider-results-view.ts';
import { buildGrenadeChoice, type GrenadeChoice, type GrenadeLabels } from './grenade-throw-view.ts';

/**
 * The rider results card's view (#623), through the real English langpack: each
 * creature's outcome, its test with provenance rows and degrees of failure, and what
 * landed — a condition for its rounds (applied, or left for the GM), the encounter, an
 * effect-roll step, or the effect prose.
 */

const lang = buildLangStub();
const LABELS: GrenadeLabels = {
    localize: (key, params) =>
        params === undefined ? lang.localize(key) : lang.format(key, Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))),
    characteristic: (key) => ({ agility: 'Agility', willpower: 'Willpower', toughness: 'Toughness' }[key] ?? key),
    lang: 'en',
};
const CONDITION_NAMES: Record<string, string> = { blinded: 'Blinded', stunned: 'Stunned' };
const conditionName = (id: string): string => CONDITION_NAMES[id] ?? id;

const PHOTON_FLASH = riderFixture({
    test: { characteristic: 'agility', modifier: 10 },
    condition: 'blinded',
    duration: { kind: 'degreesOfFailure', base: 0, formula: '' },
    effect: 'Blinded for a number of rounds equal to his degrees of failure.',
});

function choiceFor(name: string, rider = PHOTON_FLASH): GrenadeChoice {
    const choice = buildGrenadeChoice({ id: 'g', name, system: { rider, effectiveSpecial: new Set(['blast-6']) } }, 'g', LABELS);
    if (choice === null) throw new Error('no rider');
    return choice;
}

function result(name: string, roll: number | null, rider = PHOTON_FLASH, extra: { isPsyker?: boolean; rolledRounds?: number } = {}): RiderTargetResult {
    return resolveRiderCreature({
        rider,
        creature: { tokenId: name, actorUuid: `Actor.${name}`, name, isPsyker: extra.isPsyker === true, characteristic: 30 },
        roll,
        rolledRounds: extra.rolledRounds ?? null,
    });
}

describe('riderOutcome', () => {
    it('reads unaffected, resisted and suffers', () => {
        expect(riderOutcome(result('A', 20))).toBe('resisted');
        expect(riderOutcome(result('B', 90))).toBe('suffers');
        const psykOut = riderFixture({ test: { characteristic: 'willpower', modifier: -30 }, affects: 'psyker' });
        expect(riderOutcome(result('C', null, psykOut))).toBe('unaffected');
    });
});

describe('buildRiderResultsCard', () => {
    it('prints each test with its provenance, degrees of failure and the condition applied for its rounds', () => {
        const card = buildRiderResultsCard(
            choiceFor('Photon Flash Grenade'),
            [result('Heretic', 20), result('Accomplice', 68)],
            new Map([['Accomplice', true]]),
            conditionName,
            LABELS,
            'agility',
        );
        expect(card).toMatchObject({ grenade: 'Photon Flash Grenade', testLabel: 'Agility +10', affectsLabel: '' });
        const heretic = card.rows.at(0);
        const accomplice = card.rows.at(1);
        expect(heretic).toMatchObject({ name: 'Heretic', outcome: 'resisted', outcomeLabel: 'Resisted', effectLabel: '', applied: null });
        expect(heretic?.test).toMatchObject({ label: 'Agility test', base: 30, target: 40, roll: 20, degreesLabel: '' });
        expect(accomplice).toMatchObject({ outcome: 'suffers', outcomeLabel: 'Suffers', effectLabel: 'Blinded for 3 rounds', applied: true });
        expect(accomplice?.test?.degreesLabel).toBe('3 DoF');
        expect(accomplice?.test?.components).toEqual([
            { label: 'Photon Flash Grenade', value: 10, tooltipData: JSON.stringify({ source: 'grenade', label: 'Photon Flash Grenade', value: 10 }) },
        ]);
    });

    it('names a psyker row, a condition left for the GM, an encounter-long effect, a step and plain prose', () => {
        const rtPsykOut = riderFixture({
            test: { characteristic: 'willpower', modifier: -10, psykerModifier: -5 },
            affects: 'psyker',
            condition: 'stunned',
            duration: { kind: 'roll', base: 0, formula: '1d5+3' },
        });
        const stunned = buildRiderResultsCard(
            choiceFor('Psyk-Out Grenade', rtPsykOut),
            [result('Psyker', 90, rtPsykOut, { isPsyker: true, rolledRounds: 6 })],
            new Map([['Psyker', false]]),
            conditionName,
            LABELS,
            'willpower',
        );
        expect(stunned.affectsLabel).toBe('Psykers only');
        expect(stunned.rows[0]).toMatchObject({ effectLabel: 'Stunned for 6 rounds', applied: false });
        expect(stunned.rows[0]?.test?.components.map((c) => c.label)).toEqual(['Psyk-Out Grenade', 'Psyker']);

        const encounter = riderFixture({ condition: 'stunned', duration: { kind: 'encounter', base: 0, formula: '' } });
        expect(
            buildRiderResultsCard(choiceFor('G', encounter), [result('X', null, encounter)], new Map(), conditionName, LABELS, '').rows[0]?.effectLabel,
        ).toBe('Stunned until the end of the encounter');

        const psychotroke = riderFixture({ test: { characteristic: 'toughness', modifier: -40 }, effectRollShift: { perDegree: 1, max: 10 } });
        expect(
            buildRiderResultsCard(choiceFor('P', psychotroke), [result('Y', 15, psychotroke)], new Map(), conditionName, LABELS, 'toughness').rows[0]
                ?.effectLabel,
        ).toBe(
            // Toughness 30 − 40 = −10 against 15: three degrees of failure.
            '+3 to the effect roll',
        );

        const rad = riderFixture({ test: { characteristic: 'toughness', modifier: -20 } });
        expect(buildRiderResultsCard(choiceFor('R', rad), [result('Z', 90, rad)], new Map(), conditionName, LABELS, 'toughness').rows[0]).toMatchObject({
            effectLabel: 'Suffers the effect',
            applied: null,
        });
    });
});
