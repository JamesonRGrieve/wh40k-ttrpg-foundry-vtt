import type { Meta, StoryObj } from '@storybook/html-vite';
import HandlebarsLib from 'handlebars';
import { expect, within } from 'storybook/test';
import { resolveSancticManifestation, type SancticManifestInput } from '../../src/module/rules/sanctic-daemonology.ts';
import sancticChatSrc from '../../src/templates/chat/sanctic-daemonology-chat.hbs?raw';
import { renderTemplate as renderStoryTemplate } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';

/**
 * Sanctic Daemonology manifestation chat card (#130 — beyond.md
 * L1813–2090). Verifies the holy-discipline card renders the
 * always-zero corruption contrast and the Phenomena / Soul-Binding /
 * Emperor's-Anathema mitigation states the `resolveSancticManifestation`
 * resolver produces.
 */
initializeStoryHandlebars();

const sancticTemplate = HandlebarsLib.compile(sancticChatSrc);

const MODE_KEYS: Record<SancticManifestInput['mode'], string> = {
    fettered: 'WH40K.SancticDaemonology.Mode.Fettered',
    unfettered: 'WH40K.SancticDaemonology.Mode.Unfettered',
    push: 'WH40K.SancticDaemonology.Mode.Push',
};

function cardContext(input: SancticManifestInput): Record<string, unknown> {
    const r = resolveSancticManifestation(input);
    return {
        gameSystem: 'dh2e',
        powerName: r.power.name,
        modeKey: MODE_KEYS[input.mode],
        effectivePR: r.effectivePR,
        focusModifier: r.focusModifier >= 0 ? `+${r.focusModifier}` : `${r.focusModifier}`,
        phenomenaFires: r.phenomenaFires,
        phenomenaModifier: r.phenomenaModifier,
        canSoulBindIgnore: r.canSoulBindIgnore,
        canFateNegate: r.canFateNegate,
    };
}

const meta: Meta = {
    title: 'Chat/Sanctic Daemonology (#130)',
};

export default meta;

type Story = StoryObj;

export const UnfetteredNoPhenomena: Story = {
    name: 'Unfettered Banishment — no corruption, no phenomena',
    render: () => renderStoryTemplate(sancticTemplate, cardContext({ powerId: 'banishment', mode: 'unfettered', basePR: 4, success: true })),
    play: async ({ canvasElement }) => {
        const withinCanvas = within(canvasElement);
        await expect(withinCanvas.getByText(/Banishment/i)).toBeTruthy();
        // Per-system + outside-sheet cascade anchors must be present.
        const root = canvasElement.querySelector('.wh40k-sd-card');
        await expect(root?.classList.contains('wh40k-rpg')).toBe(true);
        await expect(root?.getAttribute('data-wh40k-system')).toBe('dh2e');
    },
};

export const FetteredHolocaust: Story = {
    name: 'Fettered Holocaust — half PR, +10 focus',
    render: () => renderStoryTemplate(sancticTemplate, cardContext({ powerId: 'holocaust', mode: 'fettered', basePR: 5, success: true })),
};

export const PushPhenomena: Story = {
    name: 'Pushed Cleansing Flame — Phenomena fires (no corruption)',
    render: () => renderStoryTemplate(sancticTemplate, cardContext({ powerId: 'cleansing-flame', mode: 'push', basePR: 4, pushLevel: 2, success: true })),
    play: async ({ canvasElement }) => {
        // Phenomena block renders on a pushed success.
        await expect(canvasElement.querySelector('.tw-text-red-300')).toBeTruthy();
    },
};

export const PushWithSoulBinding: Story = {
    name: 'Pushed Sanctuary — Soul Binding (#86) can ignore',
    render: () =>
        renderStoryTemplate(
            sancticTemplate,
            cardContext({
                powerId: 'sanctuary',
                mode: 'push',
                basePR: 6,
                pushLevel: 1,
                success: true,
                mitigation: { soulBinding: true },
            }),
        ),
};

export const PushWithEmperorsAnathema: Story = {
    name: "Pushed Sanctuary — Emperor's Anathema (#131) can Fate-negate",
    render: () =>
        renderStoryTemplate(
            sancticTemplate,
            cardContext({
                powerId: 'sanctuary',
                mode: 'push',
                basePR: 6,
                pushLevel: 1,
                success: true,
                mitigation: { emperorsAnathema: true },
            }),
        ),
};
