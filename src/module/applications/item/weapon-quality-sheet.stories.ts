import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-weapon-quality-sheet.hbs?raw';
import type { SystemId } from '../../../../stories/mocks/extended';
import { renderSheet } from '../../../../stories/test-helpers';

interface QualityItem {
    name: string;
    img: string;
}
interface QualitySystem {
    identifier: string;
    hasLevel: boolean;
    level: number;
    description: { value: string };
    effect: string;
    notes: string;
    source: { book: string; page: string; custom: string };
}
interface QualityArgs {
    item: QualityItem;
    system: QualitySystem;
    [key: string]: QualityItem | QualitySystem;
}

const baseSystem = (): QualitySystem => ({
    identifier: 'tearing',
    hasLevel: false,
    level: 0,
    description: { value: '<p>Roll an extra die for damage and drop the lowest.</p>' },
    effect: 'Roll extra damage die, drop lowest.',
    notes: '',
    source: { book: 'Core', page: '142', custom: '' },
});

const meta = {
    title: 'Item Sheets/WeaponQualitySheet',
    render: (args) => renderSheet(templateSrc, args),
    args: {
        item: { name: 'Tearing', img: 'icons/svg/weapon-quality.svg' },
        system: baseSystem(),
    },
} satisfies Meta<QualityArgs>;
export default meta;

type Story = StoryObj<QualityArgs>;

/**
 * Render the quality sheet and stamp `data-wh40k-system` so the header's
 * per-system border-color variant chain (`<id>:tw-border-*`) cascades —
 * `renderSheet` defaults the attribute to `dh2`, so per-system stories re-stamp
 * it (CLAUDE.md "Adaptation procedure 3a").
 */
function renderQualityForSystem(systemId: SystemId, args: QualityArgs): HTMLElement {
    const el = renderSheet(templateSrc, args);
    el.dataset['wh40kSystem'] = systemId;
    return el;
}

const baseQualityArgs = (): QualityArgs => ({
    item: { name: 'Tearing', img: 'icons/svg/weapon-quality.svg' },
    system: baseSystem(),
});

export const Default: Story = {};

export const Levelled: Story = {
    args: {
        item: { name: 'Proven', img: 'icons/svg/weapon-quality.svg' },
        system: { ...baseSystem(), hasLevel: true, level: 3, identifier: 'proven' },
    },
};

export const RendersIdentifier: Story = {
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByDisplayValue('Tearing')).toBeTruthy();
        await expect(view.getAllByText('tearing').length).toBeGreaterThan(0);
    },
};

// ── Per-system homologation ───────────────────────────────────────────────────
//
// The header border-color carries a seven-system Tailwind variant chain. Re-stamp
// `data-wh40k-system` per game line so all seven palettes render and a "works in
// DH2 but not the other six" regression surfaces in visual review.

export const HomologationDH2: Story = { render: () => renderQualityForSystem('dh2', baseQualityArgs()) };
export const HomologationDH1: Story = { render: () => renderQualityForSystem('dh1', baseQualityArgs()) };
export const HomologationRT: Story = { render: () => renderQualityForSystem('rt', baseQualityArgs()) };
export const HomologationBC: Story = { render: () => renderQualityForSystem('bc', baseQualityArgs()) };
export const HomologationOW: Story = { render: () => renderQualityForSystem('ow', baseQualityArgs()) };
export const HomologationDW: Story = { render: () => renderQualityForSystem('dw', baseQualityArgs()) };
export const HomologationIM: Story = {
    render: () => renderQualityForSystem('im', baseQualityArgs()),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        // The sheet still renders its core fields under the IM palette.
        await expect(view.getByDisplayValue('Tearing')).toBeTruthy();
    },
};
