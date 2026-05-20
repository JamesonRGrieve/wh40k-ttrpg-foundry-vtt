import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import type { BindingStrength } from '../../src/module/rules/daemon-weapon.ts';
import { DAEMONHOST_TIERS } from '../../src/module/rules/daemonhost.ts';
import templateSrc from '../../src/templates/prompt/daemonhost-binding-dialog.hbs?raw';
import { clickAction, renderSheet } from '../test-helpers';

const TIER_ORDER: readonly BindingStrength[] = ['minor', 'lesser', 'normal', 'greater', 'major'] as const;

interface TierCard {
    id: BindingStrength;
    label: string;
    unholyChanges: number;
    reinforcementModifier: number;
    reinforcementModifierLabel: string;
    minimumInfluence: number;
    selected: boolean;
}

interface Args {
    selected: BindingStrength;
    canBind: boolean;
}

function buildTiers(selected: BindingStrength): TierCard[] {
    return TIER_ORDER.map((id) => {
        const t = DAEMONHOST_TIERS[id];
        const mod = t.reinforcementModifier;
        return {
            id,
            label: t.label,
            unholyChanges: t.unholyChanges,
            reinforcementModifier: mod,
            reinforcementModifierLabel: mod > 0 ? `+${mod}` : String(mod),
            minimumInfluence: t.minimumInfluence,
            selected: id === selected,
        };
    });
}

const meta = {
    title: 'Dialogs/DaemonhostBindingDialog',
    render: (args) =>
        renderSheet(templateSrc, {
            tiers: buildTiers(args.selected),
            selected: args.selected,
            canBind: args.canBind,
        }),
    args: {
        selected: 'minor',
        canBind: true,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Minor: Story = {};

export const Greater: Story = {
    args: { selected: 'greater', canBind: true },
};

export const Major: Story = {
    args: { selected: 'major', canBind: true },
};

export const SelectFlow: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // Five tier cards rendered.
        const cards = canvasElement.querySelectorAll('[data-action="selectTier"]');
        expect(cards.length).toBe(5);

        // Bind button is present and reachable.
        expect(canvas.getByText(/Bind/i)).toBeTruthy();

        // Clicking a tier card dispatches the selectTier action.
        clickAction(canvasElement, 'selectTier');
    },
};
