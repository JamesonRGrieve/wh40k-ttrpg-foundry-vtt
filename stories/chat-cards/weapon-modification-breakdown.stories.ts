import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { DH2_ACQUISITION_LADDER, DH2_WEAPON_MODIFICATION_RULES } from '../../src/module/config/game-systems/dh2-config.ts';
import { modificationAvailabilityModifier } from '../../src/module/rules/weapon-modification.ts';
import { xenosRepairModifiers } from '../../src/module/rules/xenos-equipment.ts';
import breakdownSrc from '../../src/templates/chat/partial/modifier-breakdown.hbs?raw';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

/**
 * The Trade (Armourer) fitting card's target formula (#136, DH2):
 * the modification's Availability as its own hoverable provenance row and, on a
 * xenos weapon, the alien-nature penalty plus the +5-per-DoS Forbidden Lore
 * insight (a DH2 supplement). Values come from the same pure resolvers the
 * fitting flow calls.
 */
initializeStoryHandlebars();

const rules = DH2_WEAPON_MODIFICATION_RULES;

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

function availability(rating: string): number {
    return modificationAvailabilityModifier(rules, DH2_ACQUISITION_LADDER, rating) ?? 0;
}

const meta: Meta = { title: 'Chat Cards/WeaponModificationBreakdown' };
export default meta;
type Story = StoryObj;

export const RareModificationFitting: Story = {
    render: () => render(50, [{ key: 'modification-availability', label: 'Modification Availability', value: availability('rare') }]),
    play: async ({ canvasElement }) => {
        const rows = Array.from(canvasElement.querySelectorAll('[data-wh40k-tooltip="modifier"]'), (r) => r.textContent.replace(/\s+/gu, ' ').trim());
        await expect(rows).toEqual(['Modification Availability -20']);
        await expect(canvasElement.textContent).toContain('30');
    },
};

export const XenosWeaponFitting: Story = {
    render: () => {
        const xenos = rules.xenos;
        const parts = xenos === null ? { alienNature: 0, loreInsight: 0 } : xenosRepairModifiers(xenos, 2);
        return render(50, [
            { key: 'modification-availability', label: 'Modification Availability', value: availability('scarce') },
            { key: 'xenos-repair', label: 'Xenos device: alien nature', value: parts.alienNature },
            { key: 'xenos-lore-insight', label: 'Forbidden Lore insight (+5 per DoS)', value: parts.loreInsight },
        ]);
    },
    play: async ({ canvasElement }) => {
        // Scarce −10, alien nature −20, 2 lore DoS +10 → 30.
        const rows = Array.from(canvasElement.querySelectorAll('[data-wh40k-tooltip="modifier"]'), (r) => r.textContent.replace(/\s+/gu, ' ').trim());
        await expect(rows).toEqual(['Modification Availability -10', 'Xenos device: alien nature -20', 'Forbidden Lore insight (+5 per DoS) +10']);
        await expect(canvasElement.textContent).toContain('30');
    },
};
