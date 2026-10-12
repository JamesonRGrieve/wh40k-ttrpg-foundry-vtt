/**
 * Daemonology ritual chat card — Exorcism (#83, DH2 Enemies Beyond p. 71).
 *
 * Contexts come from the real orchestration (`runExorcism`) driven by scripted
 * dice and the real card builder, localised from en.json, so the card always
 * renders the live payload shape. Covers a cast-out Daemon with the host's
 * survival test, a collapse, and the same card framed under each game system.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import type { SystemId } from '../../../stories/mocks/extended';
import { localizeKey } from '../../../stories/mocks/lang-localize';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { renderSheet } from '../../../stories/test-helpers';
import { buildExorcismCard, runExorcism, type RitualActorSystem, type RitualDice } from '../../module/actions/daemonology-actions';
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
