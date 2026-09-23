/**
 * Stories for CelestialBodiesDialog (#588) — the GM editor for the campaign's
 * planets/moons and their current weather. Renders the dialog's `.hbs` against
 * the `rows` / `weatherOptions` context `_prepareContext` produces. World data
 * is system-agnostic (a moon's day length is not per-line), so no
 * `data-wh40k-system` ancestor is needed; the `.wh40k-rpg` wrapper resolves the
 * scoped `tw-*` utilities.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import templateSrc from '../../../../src/templates/dialogs/celestial-bodies.hbs?raw';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';

initializeStoryHandlebars();

interface Row {
    index: number;
    key: string;
    name: string;
    rotationHours: string;
    orbitalDays: string;
    axialTilt: string;
    weather: string;
}

interface Args {
    rows: Row[];
    weatherOptions: Array<{ value: string; label: string }>;
}

const WEATHER = ['Clear', 'Haze', 'Overcast', 'Rain', 'Fog', 'Dust', 'Smog', 'Storm', 'Ash'].map((label) => ({ value: label.toLowerCase(), label }));

const ROWS: Row[] = [
    { index: 0, key: 'solenne-majoris', name: 'Solenne Majoris', rotationHours: '26', orbitalDays: '340', axialTilt: '18', weather: 'overcast' },
    { index: 1, key: 'solenne-minoris', name: 'Solenne Minoris', rotationHours: '19', orbitalDays: '340', axialTilt: '5', weather: 'smog' },
];

function render(args: Args): HTMLElement {
    const root = document.createElement('div');
    root.className = 'wh40k-rpg celestial-bodies-dialog';
    root.append(renderSheet(templateSrc, { ...args }));
    return root;
}

const meta = {
    title: 'Dialogs/CelestialBodiesDialog',
    render,
    args: { rows: ROWS, weatherOptions: WEATHER },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        const rows = canvasElement.querySelectorAll('[data-wh40k-hook="cb-row"]');
        await expect(rows.length).toBe(2);
        // Each row round-trips its slug (so a rename keeps scene bindings) and its values.
        const second = [...rows].at(1);
        await expect(second?.querySelector<HTMLInputElement>('[data-field="key"]')?.value).toBe('solenne-minoris');
        await expect(second?.querySelector<HTMLInputElement>('[data-field="rotationHours"]')?.value).toBe('19');
        // The row's current weather is pre-selected.
        await expect(second?.querySelector<HTMLSelectElement>('[data-field="weather"]')?.value).toBe('smog');
        // Per-row remove carries its index; add + save are present.
        await expect(second?.querySelector('[data-action="removeBody"]')?.getAttribute('data-index')).toBe('1');
        await expect(canvasElement.querySelector('[data-action="addBody"]')).not.toBeNull();
        await expect(canvasElement.querySelector('[data-action="save"]')).not.toBeNull();
    },
};

export const Empty: Story = {
    args: { rows: [] },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="cb-empty"]')).not.toBeNull();
        await expect(canvasElement.querySelectorAll('[data-wh40k-hook="cb-row"]').length).toBe(0);
    },
};
