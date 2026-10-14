/**
 * Storybook stories for the Navigator Powers panel (dd17cf9c6, RT core
 * §"Using Navigator Powers").
 *
 * Each owned power is a row with its test, its action and three controls: Use
 * Power (`rollPower`, which rolls it through the RAW engine), Post to Chat and
 * the details toggle. The details hold the Novice / Adept / Master effects.
 *
 *   - Rogue Trader  — two powers, one with a difficulty on its test.
 *   - Empty         — a Navigator with no powers: the empty state and drop zone.
 *   - OtherLine     — the same rows themed for Dark Heresy 2e (the panel is not
 *                     line-gated; Navigator powers are RT content).
 *
 * Fixtures are structural, not catalogue content (Direction #7).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { captureActionClicks, renderSheet } from '../../../../stories/test-helpers';
import panelSrc from './navigator-powers-panel.hbs?raw';

initializeStoryHandlebars();

interface PowerRow {
    id: string;
    name: string;
    img: string;
    system: {
        pills: Array<{ bgClass: string; textClass: string; icon: string; label: string }>;
        testLabel: string;
        activationLabel: string;
        levels: { novice: { effect: string }; adept: { effect: string }; master: { effect: string } };
        sideEffects: string;
        description: string;
    };
}

interface PanelArgs {
    systemId: 'rt' | 'dh2';
    navigatorPowers: PowerRow[];
    navigatorPowersCount: number;
}

function power(id: string, name: string, testLabel: string): PowerRow {
    return {
        id,
        name,
        img: 'icons/svg/eye.svg',
        system: {
            pills: [{ bgClass: 'tw-bg-[rgba(8,145,178,0.2)]', textClass: 'tw-text-[#0891b2]', icon: 'fa-eye', label: 'Navigator' }],
            testLabel,
            activationLabel: 'Full Action',
            levels: {
                novice: { effect: `<p>${name}: novice effect.</p>` },
                adept: { effect: `<p>${name}: adept effect.</p>` },
                master: { effect: `<p>${name}: master effect.</p>` },
            },
            sideEffects: '',
            description: '',
        },
    };
}

const POWERS = [power('powerAlpha00001', 'Fixture Sight', 'Perception'), power('powerBeta000001', 'Fixture Stare', 'Willpower -10')];

function panelArgs(systemId: PanelArgs['systemId'], powers: PowerRow[]): PanelArgs {
    return { systemId, navigatorPowers: powers, navigatorPowersCount: powers.length };
}

function renderPanel(args: PanelArgs): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = args.systemId;
    wrapper.appendChild(renderSheet(panelSrc, args));
    return wrapper;
}

/** Every row offers Use Power for its own item, and the click carries that item's id. */
async function expectUsablePowers(canvasElement: HTMLElement, powers: PowerRow[]): Promise<void> {
    const rows = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-item-type="navigatorPower"]'));
    await expect(rows.map((row) => row.dataset['itemId'])).toEqual(powers.map((p) => p.id));
    const clicks = captureActionClicks(canvasElement);
    for (const row of rows) row.querySelector<HTMLElement>('[data-action="rollPower"]')?.click();
    await expect(clicks.map((c) => [c.action, c.dataset['itemId']])).toEqual(powers.map((p) => ['rollPower', p.id]));
    const text = canvasElement.textContent;
    await expect(powers.filter((p) => !text.includes(p.system.testLabel)).map((p) => p.name)).toEqual([]);
}

const meta: Meta<PanelArgs> = {
    title: 'Actor/Character/NavigatorPowersPanel',
    render: (args) => renderPanel(args),
};
export default meta;
type Story = StoryObj<PanelArgs>;

export const RogueTrader: Story = {
    name: 'Rogue Trader — two powers, Use Power per row',
    args: panelArgs('rt', POWERS),
    play: async ({ canvasElement }) => {
        await expectUsablePowers(canvasElement, POWERS);
        // The details (the level effects) start hidden behind the toggle.
        const details = canvasElement.querySelector<HTMLElement>('[data-power-id="powerAlpha00001"]');
        await expect(details?.hidden).toBe(true);
        await expect(details?.textContent).toContain('Fixture Sight: master effect.');
    },
};

export const Empty: Story = {
    name: 'Empty — no powers yet',
    args: panelArgs('rt', []),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-action="rollPower"]')).toBeNull();
        await expect(canvasElement.querySelector('[data-drop-zone="powers"][data-accepts="navigatorPower"]')).not.toBeNull();
    },
};

export const OtherLine: Story = {
    name: 'Other line (DH2 theme) — same rows and controls',
    args: panelArgs('dh2', POWERS),
    play: async ({ canvasElement }) => expectUsablePowers(canvasElement, POWERS),
};
