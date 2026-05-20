import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../src/templates/prompt/radical-services-dialog.hbs?raw';
import { clickAction, renderSheet } from '../test-helpers';

interface ServiceRow {
    id: string;
    label: string;
    availability: string;
    availabilityLabel: string;
    threatLevel: number;
    threatBadgeClass: string;
    subtletyOnHire: number;
    target: number;
    selected: boolean;
}

interface Args {
    influence: number;
    services: ServiceRow[];
    selectedServiceId: string | null;
}

const THREAT_BADGE: Record<number, string> = {
    1: 'tw-bg-emerald-400',
    2: 'tw-bg-yellow-400',
    3: 'tw-bg-orange-400',
    4: 'tw-bg-red-500',
};

const SAMPLE_ROWS: ServiceRow[] = [
    {
        id: 'bountyHunter',
        label: 'Bounty Hunter',
        availability: 'scarce',
        availabilityLabel: 'Scarce',
        threatLevel: 1,
        threatBadgeClass: THREAT_BADGE[1],
        subtletyOnHire: -1,
        target: 30,
        selected: false,
    },
    {
        id: 'darkOracle',
        label: 'Dark Oracle',
        availability: 'veryRare',
        availabilityLabel: 'Very Rare',
        threatLevel: 3,
        threatBadgeClass: THREAT_BADGE[3],
        subtletyOnHire: -3,
        target: 10,
        selected: false,
    },
    {
        id: 'deathCult',
        label: 'Death Cult',
        availability: 'rare',
        availabilityLabel: 'Rare',
        threatLevel: 2,
        threatBadgeClass: THREAT_BADGE[2],
        subtletyOnHire: -2,
        target: 20,
        selected: false,
    },
    {
        id: 'heretek',
        label: 'Heretek',
        availability: 'veryRare',
        availabilityLabel: 'Very Rare',
        threatLevel: 3,
        threatBadgeClass: THREAT_BADGE[3],
        subtletyOnHire: -3,
        target: 10,
        selected: false,
    },
    {
        id: 'hiveGang',
        label: 'Hive Gang',
        availability: 'common',
        availabilityLabel: 'Common',
        threatLevel: 1,
        threatBadgeClass: THREAT_BADGE[1],
        subtletyOnHire: -1,
        target: 40,
        selected: false,
    },
    {
        id: 'maleficScholar',
        label: 'Malefic Scholar',
        availability: 'extremelyRare',
        availabilityLabel: 'Extremely Rare',
        threatLevel: 4,
        threatBadgeClass: THREAT_BADGE[4],
        subtletyOnHire: -4,
        target: 0,
        selected: false,
    },
    {
        id: 'mutantMercenary',
        label: 'Mutant Mercenary',
        availability: 'rare',
        availabilityLabel: 'Rare',
        threatLevel: 2,
        threatBadgeClass: THREAT_BADGE[2],
        subtletyOnHire: -2,
        target: 20,
        selected: false,
    },
    {
        id: 'roguePsyker',
        label: 'Rogue Psyker',
        availability: 'extremelyRare',
        availabilityLabel: 'Extremely Rare',
        threatLevel: 4,
        threatBadgeClass: THREAT_BADGE[4],
        subtletyOnHire: -4,
        target: 0,
        selected: false,
    },
    {
        id: 'recidivist',
        label: 'Recidivist',
        availability: 'scarce',
        availabilityLabel: 'Scarce',
        threatLevel: 2,
        threatBadgeClass: THREAT_BADGE[2],
        subtletyOnHire: -2,
        target: 30,
        selected: false,
    },
];

const meta = {
    title: 'Dialogs/RadicalServicesDialog',
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
    args: {
        influence: 40,
        services: SAMPLE_ROWS,
        selectedServiceId: null,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const button = canvasElement.querySelector<HTMLButtonElement>('[data-action="attemptRequisition"]');
        expect(button).toBeTruthy();
        expect(button!.disabled).toBe(true);
        const rows = canvasElement.querySelectorAll('[data-action="selectService"]');
        expect(rows.length).toBe(9);
        void canvas;
    },
};

export const ServiceSelected: Story = {
    args: {
        influence: 40,
        services: SAMPLE_ROWS.map((s) => ({ ...s, selected: s.id === 'deathCult' })),
        selectedServiceId: 'deathCult',
    },
    play: async ({ canvasElement }) => {
        const button = canvasElement.querySelector<HTMLButtonElement>('[data-action="attemptRequisition"]');
        expect(button).toBeTruthy();
        expect(button!.disabled).toBe(false);
        clickAction(canvasElement, 'cancel');
    },
};
