import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { buildRiderResultsCard } from '../../src/module/applications/prompts/grenade-rider-results-view.ts';
import { buildGrenadeChoice, type GrenadeLabels } from '../../src/module/applications/prompts/grenade-throw-view.ts';
import { type RiderCreature, resolveRiderCreature } from '../../src/module/rules/grenade-rider-resolution.ts';
import type { GrenadeRiderData } from '../../src/module/rules/grenade-rider.ts';
import { riderFixture } from '../../src/module/testing/grenade-rider-fixture.ts';
import cardSrc from '../../src/templates/chat/grenade-rider-results-chat.hbs?raw';
import { formatKey, localizeKey } from '../mocks/lang-localize';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

/**
 * A grenade rider's results card (#623): each creature caught, its test printed as
 * base ± every provenance row = target against the d100 (rows hoverable through the
 * shared "modifier" tooltip), and what the rider did — the condition applied for its
 * duration, left for the GM, the effect-roll step, or nothing. Every row comes from the
 * resolution path's own `resolveRiderCreature` and `buildRiderResultsCard`, fed the
 * riders the packs author (DH2 Core p.158; Enemies Beyond p.41; Enemies Within p.44–45;
 * RT Faith and Coin p.85).
 */
initializeStoryHandlebars();

const NAMES: Record<string, string> = { agility: 'Agility', toughness: 'Toughness', willpower: 'Willpower' };
const LABELS: GrenadeLabels = {
    localize: (key, params) =>
        params === undefined ? localizeKey(key) : formatKey(key, Object.fromEntries(Object.entries(params).map(([name, value]) => [name, String(value)]))),
    characteristic: (key) => NAMES[key] ?? key,
    lang: 'en',
};
const CONDITIONS: Record<string, string> = { blinded: 'Blinded', stunned: 'Stunned' };

/** One creature caught: its name, its characteristic, whether it is a psyker, its d100 and any rolled rounds. */
interface Caught {
    name: string;
    characteristic: number;
    isPsyker?: boolean;
    roll: number | null;
    rounds?: number;
    /** The rolled characteristic-damage formula (#698). */
    damage?: number;
    /** The damage it suffered from the grenade's hit, after soak (#698). */
    damageSuffered?: number;
    /** Whether its condition was applied (false: the GM applies it). */
    applied?: boolean;
}

function card(name: string, special: string[], rider: GrenadeRiderData, caught: Caught[]): HTMLElement {
    const choice = buildGrenadeChoice({ id: 'g', name, system: { rider, effectiveSpecial: new Set(special) } }, 'g', LABELS);
    if (choice === null) throw new Error('no rider');
    const results = caught.map((c, index) => {
        const creature: RiderCreature = {
            tokenId: `t${index}`,
            actorUuid: `Actor.${c.name}`,
            name: c.name,
            isPsyker: c.isPsyker === true,
            characteristic: c.characteristic,
            damageSuffered: c.damageSuffered ?? 0,
        };
        return resolveRiderCreature({ rider, creature, roll: c.roll, rolledRounds: c.rounds ?? null, rolledDamage: c.damage ?? null });
    });
    const applied = new Map(caught.flatMap((c, index) => (c.applied === undefined ? [] : [[`t${index}`, c.applied] as const])));
    const ctx = buildRiderResultsCard(choice, results, applied, (id) => CONDITIONS[id] ?? id, LABELS, rider.test.characteristic);
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'dh2';
    wrapper.style.width = '300px';
    wrapper.append(renderSheet(cardSrc, { ...ctx }));
    return wrapper;
}

const PHOTON_FLASH = riderFixture({
    test: { characteristic: 'agility', modifier: 10 },
    condition: 'blinded',
    duration: { kind: 'degreesOfFailure', base: 0, formula: '' },
    effect: 'Everyone in the flash tests Agility (+10); a failure leaves them blinded for a round per degree of failure.',
});

const RT_PSYK_OUT = riderFixture({
    test: { characteristic: 'willpower', modifier: -10 },
    affects: 'psyker',
    condition: 'stunned',
    duration: { kind: 'roll', base: 0, formula: '1d5+3' },
    effect: 'Psykers in the blast test Willpower (−10) or are Stunned for 1d5+3 Rounds.',
});

const SPORE_BOMB = riderFixture({
    test: { characteristic: 'toughness', modifier: 10, psykerModifier: -20 },
    effect: 'Everyone in the blast is exposed to the spores.',
});

const PSYCHOTROKE = riderFixture({
    test: { characteristic: 'toughness', modifier: -40 },
    duration: { kind: 'degreesOfFailure', base: 1, formula: '' },
    effectRollShift: { perDegree: 1, max: 10 },
    effect: 'Roll 1d10 on Table 5–3: Hallucinogen Effects.',
});

const RAD = riderFixture({
    test: { characteristic: 'toughness', modifier: -20 },
    characteristicDamage: { characteristic: 'toughness', formula: '2d10', perDegree: 0 },
    effect: 'All living creatures caught in the blast must pass a Hard (–20) Toughness test or suffer 2d10 Toughness damage.',
});

const RT_RAD = riderFixture({
    test: { characteristic: 'toughness', modifier: 0, damagePenalty: -5 },
    characteristicDamage: { characteristic: 'toughness', formula: '1d10', perDegree: 2 },
    effect: 'Each living target in the blast also tests Toughness, at −5 per point of damage taken; a failure costs 1d10 Toughness plus 2 per degree of failure.',
});

const meta: Meta = { title: 'Chat/Grenade Rider Results (#623)' };
export default meta;

type Story = StoryObj;

/** Rows of the rendered card, by creature name. */
function rowOf(root: HTMLElement, name: string): HTMLElement {
    const row = Array.from(root.querySelectorAll<HTMLElement>('[data-rider-target]')).find((el) => el.textContent.includes(name));
    if (row === undefined) throw new Error(`no row for ${name}`);
    return row;
}

/** A Photon Flash over three creatures: one resists, two are blinded for their degrees of failure. */
export const PhotonFlashBlinds: Story = {
    render: () =>
        card('Photon Flash Grenade', ['blast-6'], PHOTON_FLASH, [
            { name: 'Heretic', characteristic: 30, roll: 15 },
            { name: 'Accomplice', characteristic: 30, roll: 68, applied: true },
            { name: 'Lookout', characteristic: 35, roll: 100, applied: true },
        ]),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(canvasElement.querySelector('[data-rider-test]')?.textContent).toBe('Agility +10');
        const heretic = rowOf(canvasElement, 'Heretic');
        await expect(heretic.dataset['riderOutcome']).toBe('resisted');
        await expect(heretic.querySelector('[data-rider-effect]')).toBeNull();
        // 30 + 10 = 40 against 68: three degrees of failure, blinded three rounds.
        const accomplice = rowOf(canvasElement, 'Accomplice');
        await expect(accomplice.dataset['riderOutcome']).toBe('suffers');
        await expect(accomplice.querySelector('[data-rider-roll]')?.textContent).toContain('68');
        await expect(accomplice.querySelector('[data-rider-roll]')?.textContent).toContain('3 DoF');
        await expect(accomplice.querySelector('[data-rider-effect]')?.textContent).toContain('Blinded for 3 rounds');
        await expect(accomplice.querySelector('[data-rider-applied]')).toBeTruthy();
        // The grenade's +10 is a provenance row, hoverable through the "modifier" tooltip.
        const component = accomplice.querySelector<HTMLElement>('[data-rider-component]');
        await expect(component?.dataset['wh40kTooltip']).toBe('modifier');
        await expect(JSON.parse(component?.dataset['wh40kTooltipData'] ?? '{}')).toEqual({ source: 'grenade', label: 'Photon Flash Grenade', value: 10 });
        // A natural 100 always fails: 45 against 100 is six degrees.
        await expect(rowOf(canvasElement, 'Lookout').querySelector('[data-rider-effect]')?.textContent).toContain('Blinded for 6 rounds');
        await expect(view.getByText('Grenade Rider')).toBeTruthy();
    },
};

/** An RT Psyk-out touches psykers only: the psyker is stunned for its rolled rounds (left for the GM), the soldier is unaffected. */
export const PsykOutTouchesPsykersOnly: Story = {
    render: () =>
        card('Psyk-Out Grenade', ['blast-3'], RT_PSYK_OUT, [
            { name: 'Rogue Psyker', characteristic: 40, isPsyker: true, roll: 72, rounds: 6, applied: false },
            { name: 'Guardsman', characteristic: 30, roll: null },
        ]),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.textContent).toContain('Psykers only');
        const psyker = rowOf(canvasElement, 'Rogue Psyker');
        await expect(psyker.dataset['riderOutcome']).toBe('suffers');
        await expect(psyker.querySelector('[data-rider-effect]')?.textContent).toContain('Stunned for 6 rounds');
        await expect(psyker.querySelector('[data-rider-not-applied]')?.textContent).toContain('The GM applies it');
        const soldier = rowOf(canvasElement, 'Guardsman');
        await expect(soldier.dataset['riderOutcome']).toBe('unaffected');
        await expect(soldier.querySelector('[data-rider-roll]')).toBeNull();
    },
};

/** A Spore Bomb's psyker tests at −20 more: both provenance rows, the grenade's +10 and the psyker's −20. */
export const SporeBombPsykerPenalty: Story = {
    render: () =>
        card('Spore Bomb', ['blast-5'], SPORE_BOMB, [
            { name: 'Sanctioned Psyker', characteristic: 35, isPsyker: true, roll: 30 },
            { name: 'Hab Worker', characteristic: 30, roll: 30 },
        ]),
    play: async ({ canvasElement }) => {
        const psyker = rowOf(canvasElement, 'Sanctioned Psyker');
        const rows = Array.from(psyker.querySelectorAll<HTMLElement>('[data-rider-component]')).map((el) => el.textContent.replace(/\s+/g, ' ').trim());
        await expect(rows).toEqual(['Spore Bomb +10', 'Psyker -20']);
        // 35 + 10 - 20 = 25 against 30: the psyker fails, and the effect is the GM's prose.
        await expect(psyker.querySelector('[data-rider-effect]')?.textContent).toContain('Suffers the effect');
        await expect(rowOf(canvasElement, 'Hab Worker').dataset['riderOutcome']).toBe('resisted');
    },
};

/** A Psychotroke failure by two degrees adds +2 to the Hallucinogen Effects roll. */
export const PsychotrokeStepsTheEffectRoll: Story = {
    render: () => card('Psychotroke Grenade', ['blast-3', 'hallucinogenic-4'], PSYCHOTROKE, [{ name: 'Cultist', characteristic: 40, roll: 15 }]),
    play: async ({ canvasElement }) => {
        // 40 - 40 = 0 against 15: two degrees of failure.
        await expect(rowOf(canvasElement, 'Cultist').querySelector('[data-rider-effect]')?.textContent).toContain('+2 to the effect roll');
        await expect(canvasElement.querySelector('[data-rider-effect-text]')?.textContent).toContain('Table 5–3');
    },
};

/** A Rad grenade failure deals its rolled 2d10 Toughness damage, applied, and names the amount (#698). */
export const RadDealsToughnessDamage: Story = {
    render: () =>
        card('Rad Grenade', ['blast-3'], RAD, [
            { name: 'Mutant', characteristic: 30, roll: 38, damage: 13, applied: true },
            { name: 'Enforcer', characteristic: 45, roll: 20 },
        ]),
    play: async ({ canvasElement }) => {
        // 30 − 20 = 10 against 38: three degrees of failure; 2d10 rolled 13.
        const mutant = rowOf(canvasElement, 'Mutant');
        await expect(mutant.dataset['riderOutcome']).toBe('suffers');
        await expect(mutant.querySelector('[data-rider-effect]')?.textContent).toContain('13 Toughness damage');
        await expect(mutant.querySelector('[data-rider-effect]')?.textContent).not.toContain('Suffers the effect');
        await expect(mutant.querySelector('[data-rider-applied]')).toBeTruthy();
        await expect(rowOf(canvasElement, 'Enforcer').querySelector('[data-rider-effect]')).toBeNull();
    },
};

/**
 * An RT Rad grenade's test takes −5 per point of damage suffered (Faith and Coin, #698): the
 * creature that took 4 damage tests at −20, a provenance row naming the damage, and fails.
 */
export const RtRadDamagePenalty: Story = {
    render: () =>
        card('Rad Grenade', ['blast-3'], RT_RAD, [
            { name: 'Mutineer', characteristic: 40, damageSuffered: 4, roll: 35, damage: 6, applied: true },
            { name: 'Deckhand', characteristic: 40, roll: 35 },
        ]),
    play: async ({ canvasElement }) => {
        const mutineer = rowOf(canvasElement, 'Mutineer');
        const rows = Array.from(mutineer.querySelectorAll<HTMLElement>('[data-rider-component]')).map((el) => el.textContent.replace(/\s+/g, ' ').trim());
        await expect(rows).toEqual(['4 damage suffered -20']);
        // 40 − 20 = 20 against 35: two degrees of failure; 1d10 rolled 6, +2 per degree.
        await expect(mutineer.querySelector('[data-rider-roll]')?.textContent).toContain('2 DoF');
        await expect(mutineer.querySelector('[data-rider-effect]')?.textContent).toContain('10 Toughness damage');
        // Unhurt, the same roll passes against the unmodified 40.
        const deckhand = rowOf(canvasElement, 'Deckhand');
        await expect(deckhand.dataset['riderOutcome']).toBe('resisted');
        await expect(deckhand.querySelector('[data-rider-component]')).toBeNull();
    },
};
