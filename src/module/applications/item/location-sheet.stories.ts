import type { Meta, StoryObj } from '@storybook/html-vite';
import Hbs from 'handlebars';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-location-sheet.hbs?raw';
import type { SystemId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';

initializeStoryHandlebars();

const locationTpl = Hbs.compile(templateSrc);

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

// ── Per-system homologation: all 7 game lines ────────────────────────────────
//
// The location sheet's included item-name-input / item-tab-strip partials carry
// per-system Tailwind variant classes gated on a `data-wh40k-system` ancestor.
// The default `renderSheet` wrapper hardcodes `dh2`; these stories stamp the
// other six lines so DH2-only theming assumptions surface (CLAUDE.md
// homologation rule + "Adaptation procedure 3a").

/**
 * Render the location sheet under a `.wh40k-rpg` + `data-wh40k-system` ancestor
 * for the given game line.
 */
function renderLocationForSystem(args: Args, systemId: SystemId): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'wh40k-rpg theme-dark sheet';
    wrapper.setAttribute('data-wh40k-system', systemId);
    wrapper.innerHTML = locationTpl(args);
    return wrapper;
}

/** Build a per-system story (explicit named exports keep Storybook's static scan happy). */
function perSystemStory(systemId: SystemId): Story {
    return {
        name: `Per-system — ${systemId.toUpperCase()}`,
        render: (args) => renderLocationForSystem(args, systemId),
        play: async ({ canvasElement }) => {
            const view = within(canvasElement);
            await expect(view.getByDisplayValue('Hive Desoleum')).toBeTruthy();
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
