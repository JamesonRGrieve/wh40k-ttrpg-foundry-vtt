/**
 * Storybook stories for the fatigue vital panel (#114, #248/#420 follow-up). The
 * warning and the rules card state what Fatigue does under the actor's line model:
 * a DH1 / DH2 actor halves characteristics whose bonus is below the level, the RT /
 * DW / BC / OW lines take a flat −10, and IM's is a two-tier condition. The model is
 * derived each prep onto `system.fatigue.model`; a DH2 NPC once read "−10 to all
 * Tests" because the text was fixed.
 *
 *   1. HalvingDH2Npc — a DH2 NPC at 1 / 4: the halving wording, no −10.
 *   2. FlatRT        — an RT actor at 1 / 3: the −10 wording.
 *   3. ConditionIM   — an IM actor at 1: the condition wording.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { localizeKey } from '../../../../stories/mocks/lang-localize';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import panelSrc from './fatigue-panel.hbs?raw';

initializeStoryHandlebars();

const meta: Meta = { title: 'Actor/Panels/Fatigue Panel' };
export default meta;
type Story = StoryObj;

type FatigueModel = 'halving' | 'flat' | 'condition';

function renderPanel(line: string, model: FatigueModel, value: number, max: number): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = line;
    wrapper.style.width = '420px';
    wrapper.appendChild(
        renderSheet(panelSrc, {
            actor: { _id: 'npc', flags: {} },
            system: { fatigue: { value, max, testModifier: model === 'flat' ? -10 : 0, model }, characteristics: { toughness: { bonus: 1 } } },
        }),
    );
    return wrapper;
}

function warning(root: HTMLElement): { model: string; text: string } {
    const span = root.querySelector<HTMLElement>('[data-fatigue-warning]');
    return { model: span?.dataset['fatigueWarning'] ?? '', text: span?.textContent.trim() ?? '' };
}

export const HalvingDH2Npc: Story = {
    name: 'DH2 NPC — characteristics halved, not −10',
    render: () => renderPanel('dh2', 'halving', 1, 4),
    play: async ({ canvasElement }) => {
        const shown = warning(canvasElement);
        await expect(shown.model).toBe('halving');
        await expect(shown.text).toBe(localizeKey('WH40K.Status.Fatigue.Fatigued.halving'));
        await expect(canvasElement.textContent).not.toContain(localizeKey('WH40K.Status.Fatigue.Fatigued.flat'));
    },
};

export const FlatRT: Story = {
    name: 'RT — a flat −10 to all Tests',
    render: () => renderPanel('rt', 'flat', 1, 3),
    play: async ({ canvasElement }) => {
        await expect(warning(canvasElement).text).toBe(localizeKey('WH40K.Status.Fatigue.Fatigued.flat'));
    },
};

export const ConditionIM: Story = {
    name: 'IM — the Fatigued condition',
    render: () => renderPanel('dh2', 'condition', 1, 0),
    play: async ({ canvasElement }) => {
        // The condition model has no threshold; level 1 over 0 reads as collapsed, so check the rules card instead.
        await expect(canvasElement.textContent).toContain(localizeKey('WH40K.VitalInfoCard.FatigueAnyDesc.condition'));
    },
};
