/**
 * Stories for the stat-grid-section partial and its full-sheet composition
 * inside vital-panel-shell via movement-panel-full. The partial is fully
 * data-driven, so per-system divergence shows up only in the labels (which
 * the consumer resolves through localize / config). The full-sheet
 * composition exercises the visual cascade (panel chrome + grid layout).
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import statGridSrc from '../src/templates/actor/partial/stat-grid-section.hbs?raw';
import movementFullSrc from '../src/templates/actor/panel/movement-panel-full.hbs?raw';
import vitalShellSrc from '../src/templates/actor/partial/vital-panel-shell.hbs?raw';
import { renderSheet, renderSheetParts } from './test-helpers';
import { initializeStoryHandlebars } from './template-support';

initializeStoryHandlebars();

// Register vital-panel-shell so the movement-panel-full block partial resolves
// during isolated story rendering.
import Handlebars from 'handlebars';
Handlebars.registerPartial('systems/wh40k-rpg/templates/actor/partial/vital-panel-shell', vitalShellSrc);
Handlebars.registerPartial('systems/wh40k-rpg/templates/actor/partial/vital-panel-shell.hbs', vitalShellSrc);
Handlebars.registerPartial('systems/wh40k-rpg/templates/actor/partial/stat-grid-section', statGridSrc);
Handlebars.registerPartial('systems/wh40k-rpg/templates/actor/partial/stat-grid-section.hbs', statGridSrc);

interface StatCell {
    label: string;
    value: number | string;
    unit?: string;
    icon?: string;
    action?: string;
    attrs?: string;
    title?: string;
}

interface GridArgs {
    heading?: string;
    headingIcon?: string;
    columns?: number;
    stats: StatCell[];
}

const meta: Meta<GridArgs> = {
    title: 'Partials/Stat Grid Section',
    render: (args) => renderSheet(statGridSrc, args as unknown as Record<string, unknown>),
};

export default meta;

type Story = StoryObj<GridArgs>;

export const Mobility: Story = {
    args: {
        heading: 'Mobility',
        columns: 4,
        stats: [
            { label: 'Half', value: 3, unit: 'm', icon: 'fa-walking', action: 'setMovementMode', attrs: 'data-movement-type="half"' },
            { label: 'Full', value: 6, unit: 'm', icon: 'fa-shoe-prints', action: 'setMovementMode', attrs: 'data-movement-type="full"' },
            { label: 'Charge', value: 9, unit: 'm', icon: 'fa-running', action: 'setMovementMode', attrs: 'data-movement-type="charge"' },
            { label: 'Run', value: 18, unit: 'm', icon: 'fa-wind', action: 'setMovementMode', attrs: 'data-movement-type="run"' },
        ],
    },
};

export const Athletics: Story = {
    args: {
        heading: 'Athletics',
        headingIcon: 'fa-person-hiking',
        columns: 3,
        stats: [
            { label: 'Leap Vertical', value: 1, unit: 'm' },
            { label: 'Leap Horizontal', value: 2, unit: 'm' },
            { label: 'Jump Height', value: 50, unit: 'cm' },
        ],
    },
};

export const CarryingCapacity: Story = {
    args: {
        heading: 'Carrying Capacity',
        headingIcon: 'fa-weight-hanging',
        columns: 3,
        stats: [
            { label: 'Lift', value: 100, unit: 'kg' },
            { label: 'Carry', value: 50, unit: 'kg' },
            { label: 'Push/Drag', value: 250, unit: 'kg' },
        ],
    },
};

/**
 * IM uses the same data-driven partial — labels would be resolved per-system
 * by the consumer (via WH40K.MOVEMENT.* keys and per-system config). The
 * partial's render is byte-identical for byte-identical input, so this story
 * documents that the visual treatment matches DH2 exactly.
 */
export const PerSystemIM: Story = {
    args: {
        heading: 'Mobility (IM)',
        columns: 4,
        stats: [
            { label: 'Half', value: 2, unit: 'm', action: 'setMovementMode', attrs: 'data-movement-type="half"' },
            { label: 'Full', value: 4, unit: 'm', action: 'setMovementMode', attrs: 'data-movement-type="full"' },
            { label: 'Charge', value: 6, unit: 'm', action: 'setMovementMode', attrs: 'data-movement-type="charge"' },
            { label: 'Run', value: 12, unit: 'm', action: 'setMovementMode', attrs: 'data-movement-type="run"' },
        ],
    },
};

export const PerSystemRT: Story = {
    args: {
        heading: 'Mobility (RT)',
        columns: 4,
        stats: [
            { label: 'Half', value: 4, unit: 'm', action: 'setMovementMode', attrs: 'data-movement-type="half"' },
            { label: 'Full', value: 8, unit: 'm', action: 'setMovementMode', attrs: 'data-movement-type="full"' },
            { label: 'Charge', value: 12, unit: 'm', action: 'setMovementMode', attrs: 'data-movement-type="charge"' },
            { label: 'Run', value: 24, unit: 'm', action: 'setMovementMode', attrs: 'data-movement-type="run"' },
        ],
    },
};

/**
 * Composed full-sheet view: movement-panel-full (which now wraps content in
 * vital-panel-shell and emits stat-grid-section for each block) rendered
 * inside the wh40k-rpg sheet root. Surfaces layout regressions where the
 * shell's chrome + the grid's spacing collide.
 */
export const ComposedFullPanel: Story = {
    name: 'Composed: movement-panel-full inside vital-panel-shell',
    render: () =>
        renderSheetParts(
            [
                {
                    template: movementFullSrc,
                    partClass: 'wh40k-status-col tw-flex tw-flex-col tw-gap-4 tw-p-4',
                },
            ],
            {
                actor: { id: 'a1', flags: {} },
                system: {
                    size: 4,
                    movement: {
                        half: 3,
                        full: 6,
                        charge: 9,
                        run: 18,
                        leapVertical: 1,
                        leapHorizontal: 2,
                        jump: 50,
                    },
                    lifting: {
                        lift: 100,
                        carry: 50,
                        push: 250,
                    },
                },
            },
        ),
};
