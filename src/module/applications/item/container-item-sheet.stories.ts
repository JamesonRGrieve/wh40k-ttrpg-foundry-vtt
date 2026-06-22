/**
 * Stories for ContainerItemSheet — the base for sheets holding nested items.
 * Uses the generic item-sheet template (the fallback used when ContainerItemSheet
 * is instantiated without a subclass override).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Hbs from 'handlebars';
import { expect, within } from 'storybook/test';
import { mockItem } from '../../../../stories/mocks';
import { seedRandom, randomId, type SystemId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../templates/item/item-sheet.hbs?raw';

initializeStoryHandlebars();
const rng = seedRandom(0xc0a1be7);

const itemSheetTpl = Hbs.compile(templateSrc);

/**
 * Render the container sheet under a `.wh40k-rpg` + `data-wh40k-system`
 * ancestor for the given game line. The included header / name-input / tab-strip
 * / description / active-effects partials carry per-system Tailwind variant
 * classes (`bc:tw-* dh1:* dh2:* dw:* ow:* rt:* im:*`) that only fire when an
 * ancestor stamps the system id — the default `renderSheet` wrapper hardcodes
 * `dh2`, so a per-system wrapper exercises the other six lines (CLAUDE.md
 * "Adaptation procedure 3a").
 */
function renderContainerForSystem(ctx: ContainerCtx, systemId: SystemId): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'wh40k-rpg theme-dark sheet';
    wrapper.setAttribute('data-wh40k-system', systemId);
    wrapper.innerHTML = itemSheetTpl(ctx);
    return wrapper;
}

interface ContainerCtx {
    item: ReturnType<typeof mockItem>;
    system: ReturnType<typeof mockItem>['system'];
    isContainer: boolean;
    nestedItems: ReturnType<typeof mockItem>[];
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
    isOwnedByActor: boolean;
    effects: object[];
    tabs: Record<string, { id: string; tab: string; group: string; active: boolean; cssClass: string }>;
}

function makeCtx(overrides: Partial<ContainerCtx> = {}): ContainerCtx {
    const id = randomId('container', rng);
    const nested1 = mockItem({ name: 'Small Knife', type: 'gear' });
    const nested2 = mockItem({ name: 'Lho-sticks', type: 'gear' });
    const item = mockItem({
        _id: id,
        id,
        name: "Rogue Trader's Chest",
        type: 'gear',
        system: { state: { container: true }, description: { value: '<p>A battered iron-bound chest.</p>' } },
    });
    return {
        item,
        system: item.system,
        isContainer: true,
        nestedItems: [nested1, nested2],
        canEdit: true,
        inEditMode: false,
        editable: true,
        isOwnedByActor: false,
        effects: [],
        tabs: {
            description: { id: 'description', tab: 'description', group: 'primary', active: true, cssClass: 'active' },
            effects: { id: 'effects', tab: 'effects', group: 'primary', active: false, cssClass: '' },
        },
        ...overrides,
    };
}

const meta: Meta = { title: 'Item Sheets/ContainerItemSheet' };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: () => renderSheet(templateSrc, makeCtx()) };

export const Empty: Story = {
    render: () => renderSheet(templateSrc, makeCtx({ nestedItems: [] })),
};

export const RendersContainerName: Story = {
    render: () => renderSheet(templateSrc, makeCtx()),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByDisplayValue("Rogue Trader's Chest")).toBeTruthy();
    },
};

export const RendersDescriptionTab: Story = {
    render: () => renderSheet(templateSrc, makeCtx()),
    play: async ({ canvasElement }) => {
        const tab = canvasElement.querySelector('[data-tab="description"]');
        await expect(tab).toBeTruthy();
        await expect(tab?.classList.contains('active')).toBe(true);
    },
};

// ── Per-system homologation: all 7 game lines ────────────────────────────────
//
// The generic item-sheet's included partials (item-header / item-name-input /
// item-tab-strip / description-panel / active-effects-panel) carry per-system
// Tailwind variant classes gated on a `data-wh40k-system` ancestor. One story
// per game line stamps that ancestor so DH2-only theming assumptions surface
// across DH1 / RT / BC / OW / DW / IM (CLAUDE.md homologation rule).

/** Build a per-system story (explicit named exports keep Storybook's static scan happy). */
function perSystemStory(systemId: SystemId): Story {
    return {
        name: `Per-system — ${systemId.toUpperCase()}`,
        render: () => renderContainerForSystem(makeCtx(), systemId),
        play: async ({ canvasElement }) => {
            const view = within(canvasElement);
            await expect(view.getByDisplayValue("Rogue Trader's Chest")).toBeTruthy();
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
