/**
 * Storybook stories for the SP-budget panel (issue #190).
 *
 * Covers three states the panel must render correctly:
 *   1. CleanBuild     — within budget, every essential slot filled.
 *   2. OverBudget     — every slot filled but SP spent > SP budget.
 *   3. MissingSlot    — within budget but at least one essential slot empty.
 *
 * The Playwright spec `tests/storybook/issue-190-ship-points-budget.spec.ts`
 * navigates each of these stories and asserts the matching status indicators.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import panelSrc from './ship-points-budget-panel.hbs?raw';

initializeStoryHandlebars();

interface BuildValidation {
    spent: number;
    budget: number;
    isOverBudget: boolean;
    missingEssentialSlots: string[];
    isValid: boolean;
}

interface PanelContext {
    buildValidation: BuildValidation;
    essentialSlots: Array<{ id: string; labelKey: string; filled: boolean }>;
}

const ESSENTIAL_SLOTS: Array<{ id: string; labelKey: string }> = [
    { id: 'plasmaDrive', labelKey: 'WH40K.ShipComponent.Type.PlasmaDrive' },
    { id: 'warpDrive', labelKey: 'WH40K.ShipComponent.Type.WarpDrive' },
    { id: 'gellarField', labelKey: 'WH40K.ShipComponent.Type.GellarField' },
    { id: 'voidShields', labelKey: 'WH40K.ShipComponent.Type.VoidShields' },
    { id: 'bridge', labelKey: 'WH40K.ShipComponent.Type.Bridge' },
    { id: 'lifeSupport', labelKey: 'WH40K.ShipComponent.Type.LifeSupport' },
    { id: 'quarters', labelKey: 'WH40K.ShipComponent.Type.Quarters' },
    { id: 'auger', labelKey: 'WH40K.ShipComponent.Type.Auger' },
];

function buildContext(opts: { spent: number; budget: number; missing: Set<string> }): PanelContext {
    const isOverBudget = opts.spent > opts.budget;
    const missingList = ESSENTIAL_SLOTS.map((s) => s.id).filter((id) => opts.missing.has(id));
    const isValid = !isOverBudget && missingList.length === 0;
    return {
        buildValidation: {
            spent: opts.spent,
            budget: opts.budget,
            isOverBudget,
            missingEssentialSlots: missingList,
            isValid,
        },
        essentialSlots: ESSENTIAL_SLOTS.map((slot) => ({
            id: slot.id,
            labelKey: slot.labelKey,
            filled: !opts.missing.has(slot.id),
        })),
    };
}

function renderPanel(ctx: PanelContext): HTMLElement {
    return renderSheet(panelSrc, ctx);
}

const meta: Meta<PanelContext> = {
    title: 'Actor/Starship/ShipPointsBudgetPanel',
};
export default meta;
type Story = StoryObj<PanelContext>;

export const CleanBuild: Story = {
    name: 'Clean build — within budget, every slot filled',
    args: buildContext({ spent: 38, budget: 40, missing: new Set() }),
    render: (args) => renderPanel(args),
};

export const OverBudget: Story = {
    name: 'Over budget — spent exceeds the hull SP budget',
    args: buildContext({ spent: 52, budget: 40, missing: new Set() }),
    render: (args) => renderPanel(args),
};

export const MissingEssentialSlot: Story = {
    name: 'Missing essential slot — Gellar Field + Warp Drive empty',
    args: buildContext({ spent: 30, budget: 40, missing: new Set(['gellarField', 'warpDrive']) }),
    render: (args) => renderPanel(args),
};
