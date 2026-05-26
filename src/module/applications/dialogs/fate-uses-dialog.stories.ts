/**
 * Stories for FateUsesDialog — a read-only reference popup listing the
 * canonical Fate Point uses. Renders the dialog's `.hbs` against the prepared
 * `uses` / `bonusAttributes` context, and a per-system variant so the
 * `<id>:tw-*` accent variants on the burn marker are exercised.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/dialogs/fate-uses.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';

interface FateUse {
    label: string;
    description: string;
    icon?: string;
    burn?: boolean;
}

interface BonusAttribute {
    name: string;
    summary: string;
}

interface Args {
    gameSystem: string;
    uses: FateUse[];
    bonusAttributes: BonusAttribute[];
}

const USES: FateUse[] = [
    { label: 'WH40K.FateUses.Reroll', description: 'Reroll a single failed test.', icon: 'fa-dice' },
    { label: 'WH40K.FateUses.AddDegree', description: 'Add a degree of success to a passed test.', icon: 'fa-plus' },
    { label: 'WH40K.FateUses.Initiative', description: 'Act first in a round regardless of Initiative.', icon: 'fa-bolt' },
    { label: 'WH40K.FateUses.Survive', description: 'Burn a Fate Point to survive otherwise-lethal damage.', icon: 'fa-skull', burn: true },
];

const meta = {
    title: 'Dialogs/FateUsesDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        gameSystem: 'dh2',
        uses: USES,
        bonusAttributes: [{ name: 'Recovery', summary: 'Regain spent Fate at the start of each session.' }],
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('Reroll a single failed test.')).toBeTruthy();
        await expect(scope.getByText('Burn a Fate Point to survive otherwise-lethal damage.')).toBeTruthy();
    },
};

export const NoBonusAttributes: Story = {
    args: { bonusAttributes: [] },
};

export const ImperiumMaledictumVariant: Story = {
    name: 'Per-system — Imperium Maledictum',
    args: { gameSystem: 'im' },
};
