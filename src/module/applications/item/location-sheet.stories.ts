import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-location-sheet.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';

interface LocationSampleCharacter {
    name: string;
    description: string;
}

interface LocationItem {
    name: string;
    img: string;
    system: {
        locationType: string;
        locationTypeLabel: string;
        locationTypeIcon: string;
        parentLocation: string;
        sector: string;
        region: string;
        coordinates: string;
        controllingFaction: string;
        population: string;
        tags: string[];
        homeWorldRules: string[];
        specialRules: string;
        sampleCharacters: LocationSampleCharacter[];
        description: { value: string };
        source: { book: string; page: string; url: string };
    };
}

interface Args {
    item: LocationItem;
    locationTypes: Record<string, string>;
    source: { source: { book: string; page: string; url: string } };
}

const meta = {
    title: 'Item Sheets/LocationSheet',
    render: (args) => renderSheet(templateSrc, args),
    args: {
        locationTypes: { planet: 'Planet', moon: 'Moon', sector: 'Sector', site: 'Site' },
        source: { source: { book: 'Core Rulebook', page: '24', url: '' } },
        item: {
            name: 'Hive Desoleum',
            img: 'icons/svg/city.svg',
            system: {
                locationType: 'planet',
                locationTypeLabel: 'Planet',
                locationTypeIcon: 'fa-globe',
                parentLocation: '',
                sector: 'Calixis',
                region: 'Josian Reach',
                coordinates: '',
                controllingFaction: 'Adeptus Administratum',
                population: 'Billions',
                tags: ['hive-world', 'industrial'],
                homeWorldRules: ['Characteristic Modifiers: +10 Fel, +5 Int, +5 Per', 'Fate Threshold: 2'],
                specialRules: '',
                sampleCharacters: [{ name: 'Hive Noble', description: 'A member of the ruling elite.' }],
                description: { value: '<p>A sprawling hive world.</p>' },
                source: { book: 'Core Rulebook', page: '24', url: '' },
            },
        },
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByDisplayValue('Hive Desoleum')).toBeTruthy();
    },
};
