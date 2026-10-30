import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { DH2_ITEM_REPAIR_RULES } from '../../src/module/config/game-systems/dh2-config.ts';
import { craftsmanshipRepairModifier } from '../../src/module/rules/item-repair.ts';
import { xenosRepairModifiers } from '../../src/module/rules/xenos-equipment.ts';
import breakdownSrc from '../../src/templates/chat/partial/modifier-breakdown.hbs?raw';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

/**
 * The Tech-Use Repair card's target formula (#444 / #136), with each printed
 * repair rule as its own hoverable provenance row: the craftsmanship
 * modifier (DH2) and, for xenos equipment, the alien-nature penalty
 * plus the +5-per-DoS Forbidden Lore insight (a DH2 supplement). Values
 * come from the same pure resolvers the repair flow calls.
 */
initializeStoryHandlebars();

const rules = DH2_ITEM_REPAIR_RULES;

interface Component {
    key: string;
    label: string;
    value: number;
}

function render(baseTarget: number, components: Component[]): HTMLElement {
    const modifierSources = components
        .filter((c) => c.value !== 0)
        .map((c) => ({ ...c, source: c.label, tooltipData: JSON.stringify({ title: c.label, sources: [{ name: c.label, value: c.value }] }) }));
    const modifierTotal = modifierSources.reduce((sum, c) => sum + c.value, 0);
    const root = document.createElement('div');
    root.className = 'wh40k-rpg';
    root.dataset['wh40kSystem'] = 'dh2';
    root.append(renderSheet(breakdownSrc, { baseTarget, activeModifiers: {}, modifierSources, modifiedTarget: baseTarget + modifierTotal }));
    return root;
}

const meta: Meta = { title: 'Chat Cards/ItemRepairBreakdown' };
export default meta;
type Story = StoryObj;

export const GoodCraftsmanshipRepair: Story = {
    render: () => render(45, [{ key: 'craftsmanship-repair', label: 'Craftsmanship (repair)', value: craftsmanshipRepairModifier(rules, 'good') }]),
    play: async ({ canvasElement }) => {
        const rows = canvasElement.querySelectorAll('[data-wh40k-tooltip="modifier"]');
        await expect(rows).toHaveLength(1);
        await expect(canvasElement.querySelector('[data-wh40k-tooltip="modifier"]')?.textContent).toContain('-20');
        await expect(canvasElement.textContent).toContain('25');
    },
};

export const XenosDeviceRepair: Story = {
    render: () => {
        const xenos = rules.xenos;
        const parts = xenos === null ? { alienNature: 0, loreInsight: 0 } : xenosRepairModifiers(xenos, 3);
        return render(45, [
            { key: 'craftsmanship-repair', label: 'Craftsmanship (repair)', value: craftsmanshipRepairModifier(rules, 'common') },
            { key: 'xenos-repair', label: 'Xenos device: alien nature', value: parts.alienNature },
            { key: 'xenos-lore-insight', label: 'Forbidden Lore insight (+5 per DoS)', value: parts.loreInsight },
        ]);
    },
    play: async ({ canvasElement }) => {
        // Common craftsmanship contributes nothing; −20 alien nature, +15 for 3 lore DoS → 40.
        const rows = Array.from(canvasElement.querySelectorAll('[data-wh40k-tooltip="modifier"]'), (r) => r.textContent.replace(/\s+/gu, ' ').trim());
        await expect(rows).toEqual(['Xenos device: alien nature -20', 'Forbidden Lore insight (+5 per DoS) +15']);
        await expect(canvasElement.textContent).toContain('40');
    },
};
