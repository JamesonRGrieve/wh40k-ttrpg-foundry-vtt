/**
 * Daemonology ritual chat card — Exorcism (#83) and Summoning (#80), DH2.
 *
 * Contexts come from the real orchestration (`runExorcism` / `runSummoning`)
 * driven by scripted dice and the real card builders, localised from en.json,
 * so the card always renders the live payload shape. Covers a cast-out Daemon
 * with the host's survival test, a collapse, a bound / free / failed summoning,
 * and the exorcism card framed under each game system.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import type { SystemId } from '../../../stories/mocks/extended';
import { localizeKey } from '../../../stories/mocks/lang-localize';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { renderSheet } from '../../../stories/test-helpers';
import {
    buildExorcismCard,
    buildSummoningCard,
    runExorcism,
    runSummoning,
    type RitualActorSystem,
    type RitualDice,
} from '../../module/actions/daemonology-actions';
import cardSrc from './daemonology-ritual-chat.hbs?raw';

initializeStoryHandlebars();

const EXORCIST: RitualActorSystem = {
    characteristics: { willpower: { total: 50, bonus: 5 }, toughness: { total: 38, bonus: 3 } },
    skills: { forbiddenLore: { current: 20, entries: [{ name: 'Daemonology', current: 45 }] } },
    fatigue: { value: 0, max: 3 },
    corruption: 8,
};

function dice(d100: number[], d5: number[], d10: number[] = []): RitualDice {
    const queues = { '1d100': [...d100], '1d5': [...d5], '1d10': [...d10] };
    return { roll: async (formula) => Promise.resolve(queues[formula].shift() ?? 50) };
}

const INPUTS = {
    modifiers: ['SACRED_GROUND', 'NO_PROPER_TOOLS'] as const,
    daemonWillpowerBonus: 3,
    possessedCorruptionBonus: 2,
    circumstanceLabel: 'Holy relic',
    circumstanceValue: 5,
};

async function card(kind: 'banished' | 'collapsed', gameSystem: SystemId): Promise<HTMLElement> {
    const rolled =
        kind === 'banished'
            ? // Lore 3 DoS (+15) → attempts at 40 vs threshold 5: 3 + 3 DoS casts it out; host survives on 33.
              await runExorcism(EXORCIST, { toughness: 41 }, { ...INPUTS, modifiers: [...INPUTS.modifiers] }, dice([24, 20, 15, 33], [2, 4]))
            : // Lore fails; attempt at 25 fails by 8 DoF > Fatigue threshold 3 → collapse, 1d10 = 7 Corruption.
              await runExorcism(EXORCIST, null, { ...INPUTS, modifiers: [...INPUTS.modifiers] }, dice([88, 95], [5], [7]));
    const context = buildExorcismCard({
        exorcistName: 'Interrogator Vael',
        hostName: kind === 'banished' ? 'Brother Ostrava' : null,
        outcome: rolled,
        localize: (key) => localizeKey(key),
        gameSystem,
        hostCleared: kind === 'banished',
    });
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = gameSystem;
    wrapper.appendChild(renderSheet(cardSrc, { ...context, _gameSystemId: gameSystem }));
    return wrapper;
}

const meta: Meta = { title: 'Chat / Daemonology Ritual — Exorcism (#83)' };
export default meta;
type Story = StoryObj;

export const Banished: Story = {
    loaders: [async () => ({ el: await card('banished', 'dh2') })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-exorcism-outcome="banished"]')).not.toBeNull();
        // Every sourced component is a hoverable provenance row with a parseable payload.
        const rows = canvasElement.querySelectorAll<HTMLElement>('[data-wh40k-tooltip="modifier"]');
        await expect(rows.length).toBeGreaterThan(3);
        const parseable = Array.from(rows).every((row) => {
            try {
                JSON.parse(row.dataset['wh40kTooltipData'] ?? '');
                return true;
            } catch {
                return false;
            }
        });
        await expect(parseable).toBe(true);
        await expect(canvasElement.querySelectorAll('[data-wh40k-hook="exorcism-attempts"] tbody tr').length).toBeGreaterThan(0);
        // Legibility: the card is a dark surface, so the shared breakdown rows and the attempts table read the light text tokens.
        const root = canvasElement.querySelector('[data-wh40k-hook="daemonology-ritual-card"]');
        await expect(root?.getAttribute('data-wh40k-surface')).toBe('dark');
        const muted = getComputedStyle(canvasElement.querySelector('[data-wh40k-tooltip="modifier"] span') ?? document.body).color;
        await expect(muted).not.toBe('rgb(106, 90, 67)');
    },
};

export const Collapsed: Story = {
    loaders: [async () => ({ el: await card('collapsed', 'dh2') })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-exorcism-outcome="collapsed"]')).not.toBeNull();
    },
};

const SYSTEMS: readonly SystemId[] = ['dh2', 'dh1', 'rt', 'bc', 'ow', 'dw', 'im'];

export const PerSystem: Story = {
    loaders: [async () => ({ els: await Promise.all(SYSTEMS.map(async (system) => card('banished', system))) })],
    render: (_args, { loaded }) => {
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gap = '12px';
        for (const el of (loaded as { els: HTMLElement[] }).els) grid.appendChild(el);
        return grid;
    },
};

const SUMMONING_INPUTS = {
    hasTrueName: true,
    servesPatron: false,
    daemonWillpower: 45,
    daemonWillpowerBonus: 4,
    loreCircumstanceLabel: 'Summoning power (PR 3)',
    loreCircumstanceValue: 30,
    masteryCircumstanceLabel: '',
    masteryCircumstanceValue: 0,
};

/** Ritual at 45 − 60 + 30 + 30 = 45; Mastery at 50 − 30 + 30 = 50 against the Daemon's WP 45. */
async function summoningCard(d100: number[]): Promise<HTMLElement> {
    const outcome = await runSummoning(EXORCIST, SUMMONING_INPUTS, dice(d100, []));
    const context = buildSummoningCard({
        summonerName: 'Interrogator Vael',
        daemonName: 'Ka’zhar the Unbidden',
        outcome,
        localize: (key) => localizeKey(key),
        gameSystem: 'dh2',
    });
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'dh2';
    wrapper.appendChild(renderSheet(cardSrc, { ...context, _gameSystemId: 'dh2' }));
    return wrapper;
}

export const SummoningBound: Story = {
    loaders: [async () => ({ el: await summoningCard([10, 15, 70]) })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-summoning-outcome="bound"]')?.textContent).toContain('4');
        await expect(canvasElement.querySelectorAll('[data-wh40k-tooltip="modifier"]').length).toBeGreaterThan(3);
    },
};

export const SummoningFree: Story = {
    loaders: [async () => ({ el: await summoningCard([10, 80, 20]) })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-summoning-outcome="free"]')).not.toBeNull();
    },
};

export const SummoningRitualFails: Story = {
    loaders: [async () => ({ el: await summoningCard([90]) })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-summoning-outcome="failed"]')).not.toBeNull();
    },
};
