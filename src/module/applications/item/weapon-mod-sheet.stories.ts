/**
 * Stories for WeaponModSheet (defineSimpleItemSheet variant).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { mockItem } from '../../../../stories/mocks';
import { seedRandom, randomId, type SystemId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../templates/item/item-weapon-mod-sheet.hbs?raw';

initializeStoryHandlebars();
const rng = seedRandom(0xba55d);

/**
 * Render the sheet and stamp `data-wh40k-system="<id>"` on the wrapper so the
 * template's per-system Tailwind variant chains (`bc:tw-text-crimson-light …
 * im:tw-text-failure`) cascade for that game line.
 */
function renderForSystem(ctx: WeaponModCtx, systemId: SystemId): HTMLElement {
    const el = renderSheet(templateSrc, ctx);
    el.dataset['wh40kSystem'] = systemId;
    return el;
}

interface WeaponModCtx {
    item: ReturnType<typeof mockItem>;
    system: ReturnType<typeof mockItem>['system'];
    source: ReturnType<typeof mockItem>['system'];
    /** The `CONFIG.wh40k` slices the selects read: keyed by the schema's choice keys. */
    dh: { availabilities: Record<string, { label: string }>; craftsmanships: Record<string, { label: string }> };
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
}
function makeCtx(overrides: Partial<WeaponModCtx> = {}): WeaponModCtx {
    const id = randomId('weapon-mod', rng);
    const item = mockItem({
        _id: id,
        id,
        name: 'Red-Dot Sight',
        type: 'weaponMod',
        system: {
            category: 'sight',
            weight: 0.5,
            availability: 'scarce',
            modifiers: { toHit: 10 },
            restrictions: '',
            effect: '<p>+10 to hit at short and standard range.</p>',
            description: { value: '<p>A reliable targeting aide.</p>' },
        },
    });
    return {
        item,
        system: item.system,
        source: item.system,
        dh: {
            availabilities: {
                common: { label: 'WH40K.Availability.Common' },
                scarce: { label: 'WH40K.Availability.Scarce' },
                rare: { label: 'WH40K.Availability.Rare' },
            },
            craftsmanships: {
                poor: { label: 'WH40K.Craftsmanship.Poor' },
                common: { label: 'WH40K.Craftsmanship.Common' },
                good: { label: 'WH40K.Craftsmanship.Good' },
            },
        },
        canEdit: true,
        inEditMode: false,
        editable: true,
        ...overrides,
    };
}

const meta: Meta = { title: 'Item Sheets/WeaponModSheet' };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: () => renderSheet(templateSrc, makeCtx()) };

export const EditMode: Story = { render: () => renderSheet(templateSrc, makeCtx({ inEditMode: true })) };

export const RendersName: Story = {
    render: () => renderSheet(templateSrc, makeCtx()),
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        await expect(storyCanvas.getByDisplayValue('Red-Dot Sight')).toBeTruthy();
    },
};

export const RendersWeightField: Story = {
    render: () => renderSheet(templateSrc, makeCtx()),
    play: async ({ canvasElement }) => {
        const field = canvasElement.querySelector<HTMLInputElement>('[name="system.weight"]');
        await expect(field).toBeTruthy();
        await expect(field?.value).toBe('0.5');
    },
};

/** The selects submit the schema's choice keys, never their labels (#612: a label value failed validation and blocked every edit). */
export const SelectsSubmitChoiceKeys: Story = {
    render: () => renderSheet(templateSrc, makeCtx()),
    play: async ({ canvasElement }) => {
        const values = (name: string): string[] =>
            Array.from(canvasElement.querySelectorAll<HTMLOptionElement>(`select[name="${name}"] option`)).map((option) => option.value);
        await expect(values('system.availability')).toEqual(['common', 'scarce', 'rare']);
        await expect(values('system.craftsmanship')).toEqual(['poor', 'common', 'good']);
        await expect(canvasElement.querySelector<HTMLSelectElement>('select[name="system.availability"]')?.value).toBe('scarce');
    },
};

// ── Per-system homologation ───────────────────────────────────────────────────
//
// One story per game line. Each stamps a different `data-wh40k-system` on the
// wrapper so the template's per-system Tailwind variant chains resolve for that
// system, confirming the mod sheet renders across all seven lines.

export const HomologationDH2: Story = {
    render: () => renderForSystem(makeCtx(), 'dh2'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="dh2"]')).toBeTruthy();
        await expect(within(canvasElement).getByDisplayValue('Red-Dot Sight')).toBeTruthy();
    },
};

export const HomologationDH1: Story = {
    render: () => renderForSystem(makeCtx(), 'dh1'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="dh1"]')).toBeTruthy();
    },
};

export const HomologationRT: Story = {
    render: () => renderForSystem(makeCtx(), 'rt'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="rt"]')).toBeTruthy();
    },
};

export const HomologationBC: Story = {
    render: () => renderForSystem(makeCtx(), 'bc'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="bc"]')).toBeTruthy();
    },
};

export const HomologationOW: Story = {
    render: () => renderForSystem(makeCtx(), 'ow'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="ow"]')).toBeTruthy();
    },
};

export const HomologationDW: Story = {
    render: () => renderForSystem(makeCtx(), 'dw'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="dw"]')).toBeTruthy();
    },
};

export const HomologationIM: Story = {
    render: () => renderForSystem(makeCtx(), 'im'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="im"]')).toBeTruthy();
    },
};
