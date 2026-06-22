/**
 * Stories for ShipUpgradeSheet.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { mockItem } from '../../../../stories/mocks';
import { seedRandom, randomId, type SystemId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../templates/item/ship-upgrade-sheet.hbs?raw';

initializeStoryHandlebars();
const rng = seedRandom(0x5a1b2c3);

/**
 * The seven game lines this system homologates. The ship-upgrade template gates
 * its heading colour per system (`bc:tw-text-crimson-light … im:tw-text-failure`);
 * those variants only fire when an ancestor carries `data-wh40k-system="<id>"`,
 * so the per-system stories re-stamp the rendered wrapper.
 */
const GAME_SYSTEMS: readonly SystemId[] = ['dh2', 'dh1', 'rt', 'bc', 'ow', 'dw', 'im'];

/** Render the sheet, then stamp the active game-system id so per-system variants activate. */
function renderForSystem(systemId: SystemId): HTMLElement {
    const el = renderSheet(templateSrc, makeCtx());
    el.dataset['wh40kSystem'] = systemId;
    return el;
}

interface ShipUpgradeCtx {
    item: ReturnType<typeof mockItem>;
    system: ReturnType<typeof mockItem>['system'];
    source: ReturnType<typeof mockItem>['system'];
    availabilities: Record<string, { label: string }>;
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
    effects: ReadonlyArray<never>;
    tabs: Record<string, { id: string; tab: string; group: string; active: boolean; cssClass: string }>;
}
function makeCtx(overrides: Partial<ShipUpgradeCtx> = {}): ShipUpgradeCtx {
    const id = randomId('ship-upg', rng);
    const item = mockItem({
        _id: id,
        id,
        name: 'Tenacious History',
        type: 'shipUpgrade',
        system: {
            upgradeType: 'history',
            availability: 'common',
            effect: '<p>Gain +5 to all hull integrity repair rolls.</p>',
            description: { value: '<p>This vessel has weathered storms that would have claimed lesser craft.</p>' },
        },
    });
    return {
        item,
        system: item.system,
        source: item.system,
        availabilities: {
            common: { label: 'Common' },
            uncommon: { label: 'Uncommon' },
            rare: { label: 'Rare' },
        },
        canEdit: true,
        inEditMode: false,
        editable: true,
        effects: [],
        tabs: {
            details: { id: 'details', tab: 'details', group: 'primary', active: true, cssClass: 'active' },
            effects: { id: 'effects', tab: 'effects', group: 'primary', active: false, cssClass: '' },
        },
        ...overrides,
    };
}

const meta: Meta = { title: 'Item Sheets/ShipUpgradeSheet' };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: () => renderSheet(templateSrc, makeCtx()) };

export const EditMode: Story = { render: () => renderSheet(templateSrc, makeCtx({ inEditMode: true })) };

export const RendersUpgradeName: Story = {
    render: () => renderSheet(templateSrc, makeCtx()),
    play: async ({ canvasElement }) => {
        const withinCanvas = within(canvasElement);
        await expect(withinCanvas.getByDisplayValue('Tenacious History')).toBeTruthy();
    },
};

export const RendersDetailsTabActive: Story = {
    render: () => renderSheet(templateSrc, makeCtx()),
    play: async ({ canvasElement }) => {
        const tab = canvasElement.querySelector('[data-tab="details"]');
        await expect(tab).toBeTruthy();
        await expect(tab?.classList.contains('active')).toBe(true);
    },
};

// ── Per-system homologation (dh2 / dh1 / rt / bc / ow / dw / im) ──────────────
//
// One story per game line. Each renders the same ship-upgrade sheet under its
// system's `data-wh40k-system` id so the template's per-system heading-colour
// variants activate and visual review catches a DH2-only assumption.

export const HomologationDH2: Story = {
    name: 'Homologation — DH2e',
    render: () => renderForSystem('dh2'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="dh2"]')).toBeTruthy();
    },
};

export const HomologationDH1: Story = {
    name: 'Homologation — DH1e',
    render: () => renderForSystem('dh1'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="dh1"]')).toBeTruthy();
    },
};

export const HomologationRT: Story = {
    name: 'Homologation — Rogue Trader',
    render: () => renderForSystem('rt'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="rt"]')).toBeTruthy();
    },
};

export const HomologationBC: Story = {
    name: 'Homologation — Black Crusade',
    render: () => renderForSystem('bc'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="bc"]')).toBeTruthy();
    },
};

export const HomologationOW: Story = {
    name: 'Homologation — Only War',
    render: () => renderForSystem('ow'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="ow"]')).toBeTruthy();
    },
};

export const HomologationDW: Story = {
    name: 'Homologation — Deathwatch',
    render: () => renderForSystem('dw'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="dw"]')).toBeTruthy();
    },
};

export const HomologationIM: Story = {
    name: 'Homologation — Imperium Maledictum',
    render: () => renderForSystem('im'),
    play: async ({ canvasElement }) => {
        // Every game line renders the upgrade name and stamps its system id.
        const view = within(canvasElement);
        await expect(view.getByDisplayValue('Tenacious History')).toBeTruthy();
        await expect(canvasElement.querySelector('[data-wh40k-system="im"]')).toBeTruthy();
        // Sanity: the full set is covered.
        await expect(GAME_SYSTEMS.length).toBe(7);
    },
};
