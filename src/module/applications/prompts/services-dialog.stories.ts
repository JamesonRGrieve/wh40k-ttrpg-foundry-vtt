import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import chatSrc from '../../../../src/templates/chat/services-chat.hbs?raw';
import templateSrc from '../../../../src/templates/prompt/services-dialog.hbs?raw';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';

/**
 * Storybook stories for ServicesDialog and its chat card.
 *
 * The dialog lists the actor's line's services at render time; stories don't run
 * the compendium stack, so a fixture of the rows `_prepareContext` builds is
 * rendered directly: a service with hire data, one without (no threat badge, no
 * Subtlety cost), and one whose availability gives no rollable target.
 */

initializeStoryHandlebars();

interface ServiceRow {
    uuid: string;
    label: string;
    availabilityLabel: string;
    threatLevel: number;
    threatBadgeClass: string;
    subtlety: number;
    target: number | null;
    selected: boolean;
}

interface Args {
    influence: number;
    services: ServiceRow[];
    selectedServiceUuid: string | null;
}

const ROWS: ServiceRow[] = [
    {
        uuid: 'Compendium.wh40k-rpg.dh2-services.Item.a',
        label: 'Fixture Service A',
        availabilityLabel: 'Scarce',
        threatLevel: 2,
        threatBadgeClass: 'tw-bg-yellow-400',
        subtlety: -2,
        target: 30,
        selected: false,
    },
    {
        uuid: 'Compendium.wh40k-rpg.dh2-services.Item.b',
        label: 'Fixture Service B',
        availabilityLabel: 'Common',
        threatLevel: 0,
        threatBadgeClass: 'tw-bg-emerald-400',
        subtlety: 0,
        target: 50,
        selected: false,
    },
    {
        uuid: 'Compendium.wh40k-rpg.dh2-services.Item.c',
        label: 'Fixture Service C',
        availabilityLabel: '',
        threatLevel: 4,
        threatBadgeClass: 'tw-bg-red-500',
        subtlety: -4,
        target: null,
        selected: false,
    },
];

const meta = {
    title: 'Dialogs/ServicesDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: { influence: 40, services: ROWS, selectedServiceUuid: null },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        const rows = canvasElement.querySelectorAll('[data-action="selectService"]');
        await expect(rows).toHaveLength(3);
        await expect(canvasElement.querySelector<HTMLButtonElement>('[data-action="attemptRequisition"]')?.disabled).toBe(true);
        // A service without hire data shows no threat badge and no Subtlety cost.
        const plain = canvasElement.querySelector('[data-service-uuid$=".b"]');
        await expect(plain?.querySelector('span.tw-rounded')).toBeNull();
        // A service with no rollable target shows a dash.
        await expect(canvasElement.querySelector('[data-service-uuid$=".c"]')?.textContent).toContain('—');
    },
};

export const ServiceSelected: Story = {
    args: { selectedServiceUuid: 'Compendium.wh40k-rpg.dh2-services.Item.a', services: ROWS.map((row, index) => ({ ...row, selected: index === 0 })) },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector<HTMLButtonElement>('[data-action="attemptRequisition"]')?.disabled).toBe(false);
        await expect(canvasElement.querySelector('[data-service-uuid$=".a"]')?.className).toContain('tw-bg-[rgba(201,162,39,0.18)]');
    },
};

export const EmptyLine: Story = {
    args: { services: [] },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-testid="services-empty"]')).toBeTruthy();
    },
};

/** The chat card for a successful hire, printing the target formula with provenance. */
export const ChatCardSuccess: Story = {
    render: () =>
        renderSheet(chatSrc, {
            _gameSystemId: 'dh2',
            service: { uuid: 'x', label: 'Fixture Service A', availabilityLabel: 'Scarce', threatLevel: 2 },
            requisition: {
                baseTarget: 40,
                modifierSources: [{ label: 'Availability (Scarce)', value: -10, tooltipData: '{"title":"Availability (Scarce)","sources":[]}' }],
                target: 30,
                roll: 12,
                success: true,
                dos: 1,
                dof: 0,
            },
            subtletyDelta: -2,
        }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.textContent).toContain('Fixture Service A');
        await expect(canvasElement.querySelectorAll('[data-breakdown-label]').length).toBeGreaterThanOrEqual(3);
        await expect(canvasElement.querySelector('[data-testid="services-subtlety"]')?.textContent).toContain('-2');
    },
};
