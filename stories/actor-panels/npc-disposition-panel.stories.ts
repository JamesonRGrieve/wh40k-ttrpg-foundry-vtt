/**
 * Stories for the NPC Disposition panel (#73).
 *
 * The context is the panel's own view (`npcDispositionView`) over each line's
 * real Disposition model (`getDispositionModel()`): DH2's 0–100 characteristic
 * with a Disposition test and a Personality, the seven-step ladder of DH1, RT,
 * BC, DW and OW, and no panel on IM.
 *
 * The companion Tier B spec (`tests/e2e/npc-disposition.spec.ts`) tests a live
 * DH2 NPC's Disposition and photographs the panel and the cards.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { type NpcDispositionView, npcDispositionView } from '../../src/module/applications/actor/npc-disposition-view.ts';
import { SystemConfigRegistry } from '../../src/module/config/game-systems/index.ts';
import type { GameSystemId } from '../../src/module/config/game-systems/types.ts';
import { skillLabel } from '../../src/module/data/shared/skill-definitions.ts';
import type { NpcPersonality, PersonalityRow } from '../../src/module/rules/disposition.ts';
import panelSrc from '../../src/templates/actor/panel/npc-disposition-panel.hbs?raw';
import { initializeStoryHandlebars } from '../template-support';
import { captureActionClicks, renderSheet } from '../test-helpers';

initializeStoryHandlebars();

interface PanelArgs {
    editable: boolean;
    npcDisposition: NpcDispositionView;
}

const EMPTY_ROW: PersonalityRow = { modifier: 0, effect: '', basis: '' };

/** A Personality as a GM enters it (here the Aggressive example, DH2 Table 8–5). */
const AGGRESSIVE: NpcPersonality = {
    name: 'Aggressive',
    zeroDisposition: 'Lashes out at the Acolytes.',
    skills: {
        charm: { modifier: -20, effect: '5', basis: 'dos' },
        command: { modifier: 0, effect: '5', basis: 'dof' },
        deceive: { modifier: 10, effect: '10', basis: 'dos' },
        inquiry: { modifier: 10, effect: '-10', basis: 'dof' },
        intimidate: { modifier: -10, effect: '5', basis: 'dof' },
        scrutiny: { modifier: 20, effect: '', basis: '' },
    },
};

const BLANK: NpcPersonality = {
    name: '',
    zeroDisposition: '',
    skills: { charm: EMPTY_ROW, command: EMPTY_ROW, deceive: EMPTY_ROW, inquiry: EMPTY_ROW, intimidate: EMPTY_ROW, scrutiny: EMPTY_ROW },
};

function panel(line: GameSystemId, value: number, personality: NpcPersonality = AGGRESSIVE, editable = true): PanelArgs {
    const model = SystemConfigRegistry.get(line).getDispositionModel();
    return { editable, npcDisposition: npcDispositionView({ value, model, personality: model.model === 'characteristic' ? personality : null }, skillLabel) };
}

function renderPanel(story: PanelArgs, line: GameSystemId): HTMLElement {
    const el = renderSheet(panelSrc, story);
    el.dataset['wh40kSystem'] = line;
    return el;
}

const meta: Meta<PanelArgs> = {
    title: 'Actor/Panels/NpcDispositionPanel',
    render: (story) => renderPanel(story, 'dh2'),
};
export default meta;
type Story = StoryObj<PanelArgs>;

function valueInput(canvasElement: HTMLElement): HTMLInputElement | HTMLSelectElement | null {
    return canvasElement.querySelector<HTMLInputElement | HTMLSelectElement>('[name="system.disposition.value"]');
}

/** DH2: the 0–100 value, the scale stamp, the test, and the Personality rows. */
async function assertCharacteristic(canvasElement: HTMLElement, value: number): Promise<void> {
    const root = canvasElement.querySelector('[data-wh40k-hook="npc-disposition-panel"]');
    await expect(root?.getAttribute('data-disposition-model')).toBe('characteristic');
    const input = valueInput(canvasElement);
    await expect(input?.getAttribute('type')).toBe('number');
    await expect(input?.getAttribute('min')).toBe('0');
    await expect(input?.getAttribute('max')).toBe('100');
    await expect(input?.value).toBe(String(value));
    await expect(canvasElement.querySelector<HTMLInputElement>('[name="system.disposition.scale"]')?.value).toBe('characteristic');
    await expect(Array.from(canvasElement.querySelectorAll('[data-personality-row]')).map((row) => row.getAttribute('data-personality-row'))).toEqual([
        'charm',
        'command',
        'deceive',
        'inquiry',
        'intimidate',
        'scrutiny',
    ]);
}

export const Dh2Indifferent: Story = {
    name: 'DH2 — 0–100 Disposition with a Personality',
    args: panel('dh2', 50),
    play: async ({ canvasElement }) => {
        await assertCharacteristic(canvasElement, 50);
        await expect(canvasElement.querySelector<HTMLInputElement>('[name="system.disposition.personality.name"]')?.value).toBe('Aggressive');
        await expect(canvasElement.querySelector<HTMLInputElement>('[name="system.disposition.personality.skills.charm.modifier"]')?.value).toBe('-20');
        await expect(canvasElement.querySelector<HTMLInputElement>('[name="system.disposition.personality.skills.inquiry.effect"]')?.value).toBe('-10');
        await expect(canvasElement.querySelector<HTMLSelectElement>('[name="system.disposition.personality.skills.command.basis"]')?.value).toBe('dof');
        await expect(canvasElement.querySelector<HTMLSelectElement>('[name="system.disposition.personality.skills.scrutiny.basis"]')?.value).toBe('');
        await expect(canvasElement.querySelector('[data-disposition-zero]')).toBeNull();

        // The Disposition test sends the sheet's roll action.
        const clicks = captureActionClicks(canvasElement);
        canvasElement.querySelector<HTMLElement>('[data-action="rollDisposition"]')?.click();
        await expect(clicks.map((click) => click.action)).toEqual(['rollDisposition']);
    },
};

export const Dh2ZeroDisposition: Story = {
    name: 'DH2 — zero Disposition, blank Personality',
    args: panel('dh2', 0, BLANK),
    play: async ({ canvasElement }) => {
        await assertCharacteristic(canvasElement, 0);
        await expect(canvasElement.querySelector('[data-disposition-zero]')).not.toBeNull();
        await expect(canvasElement.querySelector<HTMLInputElement>('[name="system.disposition.personality.skills.charm.effect"]')?.value).toBe('');
    },
};

export const Dh2ReadOnly: Story = {
    name: 'DH2 — not editable',
    args: panel('dh2', 64, AGGRESSIVE, false),
    play: async ({ canvasElement }) => {
        await expect(valueInput(canvasElement)?.hasAttribute('disabled')).toBe(true);
        await expect(canvasElement.querySelector('[name="system.disposition.personality.skills.charm.modifier"]')?.hasAttribute('disabled')).toBe(true);
    },
};

/** Ladder lines: the seven steps, the held one selected, no test and no Personality. */
function ladderStory(line: GameSystemId): Story {
    return {
        args: panel(line, -1),
        render: (story) => renderPanel(story, line),
        play: async ({ canvasElement }) => {
            await expect(canvasElement.dataset['wh40kSystem']).toBe(line);
            await expect(canvasElement.querySelector('[data-wh40k-hook="npc-disposition-panel"]')?.getAttribute('data-disposition-model')).toBe('ladder');
            const select = valueInput(canvasElement);
            await expect(select?.tagName).toBe('SELECT');
            await expect(select?.value).toBe('-1');
            const options = Array.from(select?.querySelectorAll('option') ?? []).map((option) => option.textContent.trim());
            await expect(options).toHaveLength(7);
            await expect(options.at(0)).toBe('+3: Easy (+30)');
            await expect(options.at(6)).toBe('-3: Very Hard (-30)');
            await expect(canvasElement.querySelector<HTMLInputElement>('[name="system.disposition.scale"]')?.value).toBe('ladder');
            await expect(canvasElement.querySelector('[data-action="rollDisposition"]')).toBeNull();
            await expect(canvasElement.querySelector('[data-disposition-personality]')).toBeNull();
        },
    };
}

/** DH2 under its own theme. */
export const HomologationDH2: Story = {
    args: panel('dh2', 72),
    render: (story) => renderPanel(story, 'dh2'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.dataset['wh40kSystem']).toBe('dh2');
        await assertCharacteristic(canvasElement, 72);
    },
};
export const HomologationDH1: Story = ladderStory('dh1');
export const HomologationRT: Story = ladderStory('rt');
export const HomologationBC: Story = ladderStory('bc');
export const HomologationOW: Story = ladderStory('ow');
export const HomologationDW: Story = ladderStory('dw');

/** IM prints no Disposition rule: no panel. */
export const ImHasNone: Story = {
    args: panel('im', 0),
    render: (story) => renderPanel(story, 'im'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="npc-disposition-panel"]')).toBeNull();
    },
};
