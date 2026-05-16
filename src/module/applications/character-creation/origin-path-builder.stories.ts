import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/character-creation/origin-path-builder.hbs?raw';
import { renderTemplate } from '../../../../stories/mocks';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';
import { clickAction } from '../../../../stories/test-helpers';
import { initializeStoryHandlebars } from '../../../../stories/template-support';

initializeStoryHandlebars();

const compiled = Handlebars.compile(templateSrc);
const rng = seedRandom(0x0b1c2d3e);

interface OriginCard {
    id: string;
    uuid: string;
    name: string;
    img: string;
    shortDescription: string;
    isSelected: boolean;
    isDisabled: boolean;
    isValidNext: boolean;
    isAdvanced: boolean;
    xpCost: number;
    hasChoices: boolean;
    badges: boolean;
}

interface SelectedOriginGrants {
    hasCharacteristics: boolean;
    characteristics: Array<{ short: string; value: number; positive: boolean }>;
    hasSkills: boolean;
    skills: Array<{ displayName: string; levelLabel: string; tooltipData: string; uuid: string | null }>;
    hasTalents: boolean;
    talents: Array<{ name: string; tooltip: string; tooltipData: string; uuid: string | null; hasItem: boolean }>;
    hasTraits: boolean;
    traits: Array<{ name: string; level: string | null; tooltip: string; uuid: string | null; hasItem: boolean }>;
    hasEquipment: boolean;
    equipment: Array<{ name: string }>;
}

interface SelectedOriginState {
    img: string;
    name: string;
    description: string;
    requirementsText: string;
    isConfirmed: boolean;
    grants: SelectedOriginGrants;
    hasChoices: boolean;
    choices: Array<Record<string, unknown>>;
    hasRolls: boolean;
    rolls: Record<string, unknown>;
    resources: { showInfluence: boolean; influenceRolled: number | null; influenceMod: number };
}

interface BuilderStoryArgs {
    guidedMode: boolean;
    isForward: boolean;
    isBackward: boolean;
    hasDirectionToggle: boolean;
    showLineage: boolean;
    showCharacteristics: boolean;
    showEquipment: boolean;
    hasEquipmentStep: boolean;
    isDH2: boolean;
    isHomebrew: boolean;
    isRaw: boolean;
    hideThroneGelt: boolean;
    journeyTitle: string;
    hasOptionalStep: boolean;
    optionalStepLabel: string;
    optionalStepDesc: string;
    optionalStepIcon: string;
    steps: Array<{
        index: number;
        key: string;
        label: string;
        shortLabel: string;
        icon: string;
        isActive: boolean;
        isComplete: boolean;
        isDisabled: boolean;
        isLineage: boolean;
        selection: { name: string; img: string } | null;
    }>;
    currentStep: {
        index: number;
        key: string;
        label: string;
        icon: string;
        description: string;
        origins: OriginCard[];
        isLineage: boolean;
        isCharacteristics: boolean;
    };
    charGen: null;
    equipment: null;
    selectedOrigin: SelectedOriginState | null;
    showSelectionPanel: boolean;
    hasLineageSelection: boolean;
    lineageSelection: null;
    preview: {
        characteristics: Array<{ short: string; value: number; fromChoice: boolean }>;
        skills: Array<{ name: string; tooltipData: string; uuid: string | null; fromChoice: boolean }>;
        talents: Array<{ name: string; tooltipData: string; uuid: string | null; fromChoice: boolean }>;
        aptitudes: string[];
        wounds: string | null;
        fate: string | null;
    };
    status: {
        stepsComplete: boolean;
        stepsCount: number;
        totalSteps: number;
        choicesComplete: boolean;
        pendingChoices: number;
        pendingRolls: number;
        canCommit: boolean;
    };
}

function makeOriginCard(name: string, overrides: Partial<OriginCard> = {}): OriginCard {
    const id = randomId('origin', rng);
    return {
        id,
        uuid: `Compendium.wh40k-rpg.origin-paths.${id}`,
        name,
        img: 'icons/svg/d20.svg',
        shortDescription: `${name} short description`,
        isSelected: false,
        isDisabled: false,
        isValidNext: true,
        isAdvanced: false,
        xpCost: 0,
        hasChoices: false,
        badges: true,
        ...overrides,
    };
}

function makeSelectedOrigin(name: string, overrides: Partial<SelectedOriginState> = {}): SelectedOriginState {
    return {
        img: 'icons/svg/d20.svg',
        name,
        description: '<p>Born into the endless press of humanity and steel.</p>',
        requirementsText: '',
        isConfirmed: false,
        grants: {
            hasCharacteristics: true,
            characteristics: [{ short: 'Ag', value: 5, positive: true }],
            hasSkills: true,
            skills: [{ displayName: 'Dodge', levelLabel: 'Trained', tooltipData: 'Dodge', uuid: null }],
            hasTalents: false,
            talents: [],
            hasTraits: false,
            traits: [],
            hasEquipment: false,
            equipment: [],
        },
        hasChoices: false,
        choices: [],
        hasRolls: false,
        rolls: {},
        resources: { showInfluence: false, influenceRolled: null, influenceMod: 0 },
        ...overrides,
    };
}

function makeArgs(overrides: Partial<BuilderStoryArgs> = {}): BuilderStoryArgs {
    const hiveWorld = makeOriginCard('Hive World');
    const feralWorld = makeOriginCard('Feral World', { isValidNext: false });
    const selectedOrigin = makeSelectedOrigin('Hive World');

    return {
        guidedMode: true,
        isForward: true,
        isBackward: false,
        hasDirectionToggle: false,
        showLineage: false,
        showCharacteristics: false,
        showEquipment: false,
        hasEquipmentStep: false,
        isDH2: true,
        isHomebrew: false,
        isRaw: true,
        hideThroneGelt: true,
        journeyTitle: 'Acolyte Origins',
        hasOptionalStep: true,
        optionalStepLabel: 'Lineage',
        optionalStepDesc: 'Optional lineage step',
        optionalStepIcon: 'fa-crown',
        steps: [
            {
                index: 0,
                key: 'homeWorld',
                label: 'Home World',
                shortLabel: 'Home',
                icon: 'fa-globe',
                isActive: true,
                isComplete: false,
                isDisabled: false,
                isLineage: false,
                selection: null,
            },
            {
                index: 1,
                key: 'background',
                label: 'Background',
                shortLabel: 'Back',
                icon: 'fa-scroll',
                isActive: false,
                isComplete: false,
                isDisabled: false,
                isLineage: false,
                selection: null,
            },
        ],
        currentStep: {
            index: 0,
            key: 'homeWorld',
            label: 'Home World',
            icon: 'fa-globe',
            description: 'Choose the world that forged your character.',
            origins: [hiveWorld, feralWorld],
            isLineage: false,
            isCharacteristics: false,
        },
        charGen: null,
        equipment: null,
        selectedOrigin: null,
        showSelectionPanel: true,
        hasLineageSelection: false,
        lineageSelection: null,
        preview: {
            characteristics: [{ short: 'Ag', value: 5, fromChoice: false }],
            skills: [{ name: 'Dodge', tooltipData: 'Dodge', uuid: null, fromChoice: false }],
            talents: [],
            aptitudes: ['Agility'],
            wounds: null,
            fate: null,
        },
        status: {
            stepsComplete: false,
            stepsCount: 0,
            totalSteps: 8,
            choicesComplete: true,
            pendingChoices: 0,
            pendingRolls: 0,
            canCommit: false,
        },
        ...overrides,
        currentStep: {
            index: 0,
            key: 'homeWorld',
            label: 'Home World',
            icon: 'fa-globe',
            description: 'Choose the world that forged your character.',
            origins: [hiveWorld, feralWorld],
            isLineage: false,
            isCharacteristics: false,
            ...overrides.currentStep,
        },
        selectedOrigin: overrides.selectedOrigin ?? null,
    };
}

const meta: Meta<BuilderStoryArgs> = {
    title: 'Character Creation/OriginPathBuilder',
    render: (args) => renderTemplate(compiled, args as unknown as Record<string, unknown>),
};

export default meta;

type Story = StoryObj<BuilderStoryArgs>;

export const Default: Story = {
    args: makeArgs(),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByText('Acolyte Origins')).toBeTruthy();
        expect(canvas.getByText('Hive World')).toBeTruthy();
        clickAction(canvasElement, 'selectOriginCard');
    },
};

export const PreviewPanel: Story = {
    args: makeArgs({
        currentStep: {
            index: 0,
            key: 'homeWorld',
            label: 'Home World',
            icon: 'fa-globe',
            description: 'Choose the world that forged your character.',
            origins: [makeOriginCard('Hive World', { isSelected: true }), makeOriginCard('Feral World', { isValidNext: false })],
            isLineage: false,
            isCharacteristics: false,
        },
        selectedOrigin: makeSelectedOrigin('Hive World'),
        status: {
            stepsComplete: false,
            stepsCount: 1,
            totalSteps: 8,
            choicesComplete: true,
            pendingChoices: 0,
            pendingRolls: 0,
            canCommit: false,
        },
    }),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getAllByText('Hive World').length).toBeGreaterThan(1);
        expect(canvas.getByText('Dodge')).toBeTruthy();
        clickAction(canvasElement, 'confirmSelection');
    },
};

export const RogueTraderDirection: Story = {
    args: makeArgs({
        isDH2: false,
        isRaw: false,
        hasDirectionToggle: true,
        isForward: false,
        isBackward: true,
        journeyTitle: 'Dynasty Path',
        currentStep: {
            index: 0,
            key: 'origin',
            label: 'Origin',
            icon: 'fa-compass',
            description: 'Trace the dynasty path from career backward.',
            origins: [makeOriginCard('Noble Born'), makeOriginCard('Void Born', { isAdvanced: true, xpCost: 200, hasChoices: true })],
            isLineage: false,
            isCharacteristics: false,
        },
    }),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByText('Dynasty Path')).toBeTruthy();
        expect(canvas.getByText('Origin')).toBeTruthy();
    },
};
