import type { Meta, StoryObj } from '@storybook/html-vite';
import type { RerollOption } from '../../src/module/rules/reroll.ts';
import rerollControlsSrc from '../../src/templates/chat/partial/reroll-controls.hbs?raw';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

/**
 * Chat-card story for the shared `reroll-controls.hbs` partial — the per-source
 * re-roll buttons that replaced the single Spend-Fate button. Each `RerollOption`
 * (talent/trait re-rolls + the global Fate variant, collected by
 * `ActionData.rerollOptions`) renders one button; a non-zero modifier shows in
 * the label, and an exhausted windowed use renders disabled. Covers:
 *   1. Fate only — the baseline single global re-roll.
 *   2. Keen Intuition (at-will) + Fate — a talent variant beside the global one.
 *   3. A −10 penalised variant + an exhausted per-encounter variant + Fate.
 */
initializeStoryHandlebars();

interface RerollControlsContext {
    rerollOptions: RerollOption[];
    rollId: string;
}

function renderControls(ctx: RerollControlsContext): HTMLElement {
    // The partial relies on the `.wh40k-rpg` ancestor (added at runtime by the
    // renderChatMessageHTML hook) for its tw- utilities; wrap it for the story.
    const host = renderSheet(`<div class="wh40k-rpg tw-flex tw-flex-wrap tw-gap-1.5 tw-p-2">${rerollControlsSrc}</div>`, ctx);
    return host;
}

const fate: RerollOption = { id: 'fate', kind: 'fate', label: 'Re-roll', modifier: 0, source: 'Fate', disabled: false, frequency: 'at-will' };
const keen: RerollOption = {
    id: 'keen:at-will',
    kind: 'item',
    label: 'Keen Intuition',
    modifier: 0,
    source: 'Keen Intuition',
    disabled: false,
    frequency: 'at-will',
};
const penalised: RerollOption = {
    id: 'gut:at-will',
    kind: 'item',
    label: 'Gut Instinct',
    modifier: -10,
    source: 'Gut Instinct',
    disabled: false,
    frequency: 'at-will',
};
const exhausted: RerollOption = {
    id: 'wind:per-encounter',
    kind: 'item',
    label: 'Second Wind',
    modifier: 0,
    source: 'Second Wind',
    disabled: true,
    frequency: 'per-encounter',
};

const meta: Meta<RerollControlsContext> = {
    id: 'chat-cards-rerollcontrols',
    title: 'ChatCards/RerollControls',
};
export default meta;
type Story = StoryObj<RerollControlsContext>;

export const FateOnly: Story = {
    name: 'Fate only',
    args: { rollId: 'story-roll-1', rerollOptions: [fate] },
    render: (args) => renderControls(args),
};

export const TalentPlusFate: Story = {
    name: 'Keen Intuition + Fate',
    args: { rollId: 'story-roll-2', rerollOptions: [keen, fate] },
    render: (args) => renderControls(args),
};

export const PenalisedAndExhausted: Story = {
    name: 'Penalised (−10) + exhausted per-encounter + Fate',
    args: { rollId: 'story-roll-3', rerollOptions: [penalised, exhausted, fate] },
    render: (args) => renderControls(args),
};
