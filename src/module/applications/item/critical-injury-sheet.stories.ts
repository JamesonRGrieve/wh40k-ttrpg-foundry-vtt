import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../../src/templates/item/item-critical-injury-sheet.hbs?raw';

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
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
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
        const canvas = within(canvasElement);
        expect(canvas.getByDisplayValue('Cauterised Arm')).toBeTruthy();
        expect(canvas.getByText(/Severity 4/)).toBeTruthy();
    },
};
