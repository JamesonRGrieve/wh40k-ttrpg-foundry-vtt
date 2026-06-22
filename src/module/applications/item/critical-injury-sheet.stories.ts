import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-critical-injury-sheet.hbs?raw';
import type { SystemId } from '../../../../stories/mocks/extended';
import { renderSheet } from '../../../../stories/test-helpers';

interface CritArgs {
    item: {
        name: string;
        img: string;
        system: {
            damageType: string;
            damageTypeIcon: string;
            damageTypeLabel: string;
            bodyPartIcon: string;
            bodyPartLabel: string;
            severity: number;
            severityClass: string;
            isPermanent: boolean;
            permanent: boolean;
            currentEffect: string;
            availableSeverities: number[];
            effects: Record<string, { text: string; permanent: boolean }>;
            notes: string;
        };
    };
    system: { description: { value: string }; source?: { book: string; page: string; custom: string } };
    source: { source: { book: string; page: string; custom: string } };
    inEditMode: boolean;
    editable: boolean;
}

const baseSystem = (): CritArgs['item']['system'] => ({
    damageType: 'energy',
    damageTypeIcon: 'fa-bolt',
    damageTypeLabel: 'Energy',
    bodyPartIcon: 'fa-hand',
    bodyPartLabel: 'Right Arm',
    severity: 4,
    severityClass: 'severe',
    isPermanent: false,
    permanent: false,
    currentEffect: '<p>Arm useless until treated.</p>',
    availableSeverities: [1, 2, 3, 4],
    effects: {
        '1': { text: 'Stunned 1 round.', permanent: false },
        '2': { text: 'Wound bleeds.', permanent: false },
        '3': { text: 'Limb crippled.', permanent: false },
        '4': { text: 'Limb useless.', permanent: false },
    },
    notes: 'Apply medicae within 1 round.',
});

const meta = {
    title: 'Item Sheets/CriticalInjurySheet',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        item: { name: 'Cauterised Arm', img: 'icons/svg/wound.svg', system: baseSystem() },
        system: { description: { value: '<p>An ugly burn that mangles the arm.</p>' } },
        source: { source: { book: 'Core', page: '254', custom: '' } },
        inEditMode: false,
        editable: true,
    },
} satisfies Meta<CritArgs>;
export default meta;

type Story = StoryObj<CritArgs>;

export const Display: Story = {};

export const Permanent: Story = {
    args: {
        item: {
            name: 'Severed Hand',
            img: 'icons/svg/wound.svg',
            system: { ...baseSystem(), isPermanent: true, permanent: true, severity: 8, severityClass: 'critical' },
        },
        system: { description: { value: '<p>The hand is gone.</p>' } },
        source: { source: { book: 'Core', page: '255', custom: '' } },
        inEditMode: false,
        editable: true,
    },
};

export const RendersHeader: Story = {
    play: async ({ canvasElement }) => {
        const withinCanvas = within(canvasElement);
        await expect(withinCanvas.getByDisplayValue('Cauterised Arm')).toBeTruthy();
        await expect(withinCanvas.getByText(/Severity 4/)).toBeTruthy();
    },
};

// ── Per-system homologation (all 7 game lines) ──────────────────────────────
//
// The severity-icon and effect-label rows carry per-system tints
// (`bc:tw-text-crimson-light`, `dh2:tw-text-gold-raw`, `rt:tw-text-gold`,
// `im:tw-text-failure`, …). Those variants only fire under a
// `data-wh40k-system="<id>"` ancestor — `renderSheet`'s wrapper defaults to
// `dh2`, so stamping each id surfaces the others. One story per game line.

/** Render the critical-injury sheet under a specific game-line theme ancestor. */
function renderCritForSystem(args: CritArgs, systemId: SystemId): HTMLElement {
    const el = renderSheet(templateSrc, { ...args });
    el.dataset['wh40kSystem'] = systemId;
    return el;
}

/** Build a per-system homologation story for one game line. */
function systemStory(systemId: SystemId): Story {
    return {
        render: (args) => renderCritForSystem(args, systemId),
        play: async ({ canvasElement }) => {
            const withinCanvas = within(canvasElement);
            await expect(withinCanvas.getByDisplayValue('Cauterised Arm')).toBeTruthy();
            const root = canvasElement.querySelector<HTMLElement>('[data-wh40k-system]');
            await expect(root?.dataset['wh40kSystem']).toBe(systemId);
        },
    };
}

export const HomologationDH2: Story = systemStory('dh2');
export const HomologationDH1: Story = systemStory('dh1');
export const HomologationRT: Story = systemStory('rt');
export const HomologationBC: Story = systemStory('bc');
export const HomologationOW: Story = systemStory('ow');
export const HomologationDW: Story = systemStory('dw');
export const HomologationIM: Story = systemStory('im');
