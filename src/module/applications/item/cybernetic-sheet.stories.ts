/**
 * Stories for CyberneticSheet (defineSimpleItemSheet variant).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Hbs from 'handlebars';
import { expect, within } from 'storybook/test';
import { mockItem } from '../../../../stories/mocks';
import { seedRandom, randomId, type SystemId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../templates/item/item-cybernetic-sheet.hbs?raw';

initializeStoryHandlebars();
const rng = seedRandom(0xc7b3a1c);

const cyberneticTpl = Hbs.compile(templateSrc);

/**
 * Render the cybernetic sheet under a `.wh40k-rpg` + `data-wh40k-system`
 * ancestor for the given game line. The included tab-strip / description /
 * active-effects partials carry per-system Tailwind variant classes that only
 * fire when an ancestor stamps the system id — the default `renderSheet`
 * wrapper hardcodes `dh2`, so a per-system wrapper exercises the other six
 * lines (CLAUDE.md "Adaptation procedure 3a").
 */
function renderCyberneticForSystem(ctx: CyberneticCtx, systemId: SystemId): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'wh40k-rpg theme-dark sheet';
    wrapper.setAttribute('data-wh40k-system', systemId);
    wrapper.innerHTML = cyberneticTpl(ctx);
    return wrapper;
}

interface CyberneticCtx {
    item: ReturnType<typeof mockItem>;
    system: ReturnType<typeof mockItem>['system'];
    source: ReturnType<typeof mockItem>['system'];
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
    effects: ReadonlyArray<never>;
    tabs: Record<string, { id: string; tab: string; group: string; active: boolean; cssClass: string }>;
}
function makeCtx(overrides: Partial<CyberneticCtx> = {}): CyberneticCtx {
    const id = randomId('cybernetic', rng);
    const item = mockItem({
        _id: id,
        id,
        name: 'Mechadendrite (Basic)',
        type: 'cybernetic',
        img: 'icons/equipment/hand/gauntlet-armored-blue.webp',
        system: {
            type: 'mechadendrite',
            typeLabel: 'Mechadendrite',
            locations: [],
            locationsLabel: 'Back',
            craftsmanship: 'common',
            craftsmanshipLabel: 'Common Craftsmanship',
            corruption: 0,
            availability: 'scarce',
            weight: 2,
            installationDifficulty: 0,
            installationRequirements: '',
            removalConsequences: '',
            effect: '<p>A flexible tool-limb extending from the spine.</p>',
            modifiers: [],
            description: { value: '<p>A standard Mechanicus augmetic limb.</p>' },
        },
    });
    return {
        item,
        system: item.system,
        source: item.system,
        canEdit: true,
        inEditMode: false,
        editable: true,
        effects: [],
        tabs: {
            properties: { id: 'properties', tab: 'properties', group: 'primary', active: true, cssClass: 'active' },
            installation: { id: 'installation', tab: 'installation', group: 'primary', active: false, cssClass: '' },
            modifiers: { id: 'modifiers', tab: 'modifiers', group: 'primary', active: false, cssClass: '' },
            description: { id: 'description', tab: 'description', group: 'primary', active: false, cssClass: '' },
            effects: { id: 'effects', tab: 'effects', group: 'primary', active: false, cssClass: '' },
        },
        ...overrides,
    };
}

const meta: Meta = { title: 'Item Sheets/CyberneticSheet' };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: () => renderSheet(templateSrc, makeCtx()) };

export const EditMode: Story = { render: () => renderSheet(templateSrc, makeCtx({ inEditMode: true })) };

export const RendersCyberneticName: Story = {
    render: () => renderSheet(templateSrc, makeCtx()),
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        await expect(storyCanvas.getByDisplayValue('Mechadendrite (Basic)')).toBeTruthy();
    },
};

export const RendersTypeLabel: Story = {
    render: () => renderSheet(templateSrc, makeCtx()),
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        await expect(storyCanvas.getByText('Mechadendrite')).toBeTruthy();
    },
};

// ── Per-system homologation: all 7 game lines ────────────────────────────────
//
// The cybernetic sheet's included tab-strip / description / active-effects
// partials carry per-system Tailwind variant classes gated on a
// `data-wh40k-system` ancestor. One story per game line stamps that ancestor so
// DH2-only theming assumptions surface across DH1 / RT / BC / OW / DW / IM
// (CLAUDE.md homologation rule).

/** Build a per-system story (explicit named exports keep Storybook's static scan happy). */
function perSystemStory(systemId: SystemId): Story {
    return {
        name: `Per-system — ${systemId.toUpperCase()}`,
        render: () => renderCyberneticForSystem(makeCtx(), systemId),
        play: async ({ canvasElement }) => {
            const storyCanvas = within(canvasElement);
            await expect(storyCanvas.getByDisplayValue('Mechadendrite (Basic)')).toBeTruthy();
            const root = canvasElement.querySelector(`[data-wh40k-system="${systemId}"]`);
            await expect(root).toBeTruthy();
        },
    };
}

export const PerSystemDh2: Story = perSystemStory('dh2');
export const PerSystemDh1: Story = perSystemStory('dh1');
export const PerSystemRt: Story = perSystemStory('rt');
export const PerSystemBc: Story = perSystemStory('bc');
export const PerSystemOw: Story = perSystemStory('ow');
export const PerSystemDw: Story = perSystemStory('dw');
export const PerSystemIm: Story = perSystemStory('im');
