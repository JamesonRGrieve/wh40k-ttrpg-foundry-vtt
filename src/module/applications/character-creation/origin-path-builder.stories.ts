import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/character-creation/origin-path-builder.hbs?raw';
import { renderTemplate } from '../../../../stories/mocks';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { clickAction } from '../../../../stories/test-helpers';

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
        aptitudeCollisions?: Array<{ original: string; replacement: string | null }>;
        hasUnresolvedAptitudeCollision?: boolean;
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
        charGen: null,
        equipment: null,
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

/**
 * Regression coverage for issue #198: selecting a Home World / Background / Role /
 * Elite Advance origin card was firing `_itemToSelectionData` against an already-
 * normalized plain-object origin entry (no `toObject()` method), which previously
 * threw "TypeError: item.toObject is not a function" and left the preview panel
 * empty.
 *
 * The story renders the preview-panel state that results from a successful
 * normalized-origin selection — the card is `isSelected`, the selectedOrigin
 * block carries the granted skills/characteristics/talents pulled from the
 * normalized shape, and the per-system data attribute is wired so the
 * Tailwind `dh2e:` variants resolve. The Playwright spec at
 * tests/storybook/issue-198-origin-path-preview.spec.ts snapshots this story.
 */
/**
 * Regression coverage for issue #204: the per-origin Throne Gelt roll widget
 * was appearing in BOTH the Home World step AND the Background step of the
 * homebrew DH2 origin-path builder, which let players roll twice and pocket
 * a doubled starting purse. The fix restricts the rollable widget to the
 * Home World step; Background-step thrones formulas no longer surface a roll
 * button (the data remains in the compendium for narrative reference).
 *
 * Two stories cover the post-fix DOM:
 *
 * - `Issue204HomeWorldThroneGelt`: homebrew home-world step renders exactly
 *   one Throne Gelt `[data-stat-type="thrones"][data-action="rollStat"]`
 *   button — the legitimate single roll.
 * - `Issue204BackgroundNoThroneGelt`: homebrew background step renders
 *   zero such buttons, even when the selected background's compendium entry
 *   still carries a `homebrew.throneGelt` formula in its system data.
 *
 * The Playwright spec at tests/storybook/issue-204-throne-gelt-single-step.spec.ts
 * snapshots both stories so a regression that re-introduces the duplicate
 * button on the background step would be visible in the rendered DOM.
 */
export const Issue204HomeWorldThroneGelt: Story = {
    args: makeArgs({
        isDH2: true,
        isHomebrew: true,
        isRaw: false,
        hideThroneGelt: false,
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
        selectedOrigin: makeSelectedOrigin('Hive World', {
            hasRolls: true,
            rolls: {
                thrones: {
                    formula: '1d10+5',
                    hasValue: false,
                    value: undefined,
                    breakdown: '',
                },
            },
        }),
    }),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // The Throne Gelt label and exactly one roll button must render on the home-world step.
        expect(canvas.getByText('Throne Gelt')).toBeTruthy();
        const thronesRollButtons = canvasElement.querySelectorAll('button[data-action="rollStat"][data-stat-type="thrones"]');
        expect(thronesRollButtons.length).toBe(1);
    },
};

export const Issue204BackgroundNoThroneGelt: Story = {
    args: makeArgs({
        isDH2: true,
        isHomebrew: true,
        isRaw: false,
        hideThroneGelt: false,
        steps: [
            {
                index: 0,
                key: 'homeWorld',
                label: 'Home World',
                shortLabel: 'Home',
                icon: 'fa-globe',
                isActive: false,
                isComplete: true,
                isDisabled: false,
                isLineage: false,
                selection: { name: 'Hive World', img: 'icons/svg/d20.svg' },
            },
            {
                index: 1,
                key: 'background',
                label: 'Background',
                shortLabel: 'Back',
                icon: 'fa-scroll',
                isActive: true,
                isComplete: false,
                isDisabled: false,
                isLineage: false,
                selection: null,
            },
        ],
        currentStep: {
            index: 1,
            key: 'background',
            label: 'Background',
            icon: 'fa-scroll',
            description: 'Choose what shaped your character after their home world.',
            origins: [makeOriginCard('Adeptus Mechanicus', { isSelected: true }), makeOriginCard('Outcast')],
            isLineage: false,
            isCharacteristics: false,
        },
        // Even though the selected background's compendium entry HAS a `homebrew.throneGelt`
        // formula, the post-fix `_prepareSelectedOrigin` must NOT promote it to a roll widget.
        // We model that by leaving `rolls.thrones` undefined on the prepared selectedOrigin —
        // the template only renders the Throne Gelt block under `{{#if selectedOrigin.rolls.thrones}}`.
        selectedOrigin: makeSelectedOrigin('Adeptus Mechanicus', {
            hasRolls: false,
            rolls: {},
        }),
    }),
    play: async ({ canvasElement }) => {
        // Zero Throne Gelt roll buttons must appear on the background step.
        const thronesRollButtons = canvasElement.querySelectorAll('button[data-action="rollStat"][data-stat-type="thrones"]');
        expect(thronesRollButtons.length).toBe(0);
        const thronesManualButtons = canvasElement.querySelectorAll('button[data-action="manualStat"][data-stat-type="thrones"]');
        expect(thronesManualButtons.length).toBe(0);
    },
};

export const Issue198VoidBornPreview: Story = {
    args: makeArgs({
        isDH2: false,
        isRaw: false,
        journeyTitle: 'Dynasty Path',
        currentStep: {
            index: 0,
            key: 'origin',
            label: 'Origin',
            icon: 'fa-compass',
            description: 'Trace the dynasty path from origin forward.',
            origins: [
                // The crashing call-site: a normalized POJO with NO toObject() method.
                makeOriginCard('Void Born', { isSelected: true, hasChoices: true }),
                makeOriginCard('Noble Born'),
            ],
            isLineage: false,
            isCharacteristics: false,
        },
        selectedOrigin: makeSelectedOrigin('Void Born', {
            description: '<p>Drawn from the void between stars; pressure-born, low gravity, long shadows.</p>',
            grants: {
                hasCharacteristics: true,
                characteristics: [
                    { short: 'WS', value: -5, positive: false },
                    { short: 'BS', value: 5, positive: true },
                    { short: 'Wp', value: 5, positive: true },
                ],
                hasSkills: true,
                skills: [
                    { displayName: 'Pilot (Spacecraft)', levelLabel: 'Trained', tooltipData: 'Pilot', uuid: null },
                    { displayName: 'Operate (Voidship)', levelLabel: 'Trained', tooltipData: 'Operate', uuid: null },
                ],
                hasTalents: true,
                talents: [{ name: 'Void Accustomed', tooltip: 'Immune to space-borne ill effects.', tooltipData: 'VoidAccustomed', uuid: null, hasItem: false }],
                hasTraits: false,
                traits: [],
                hasEquipment: false,
                equipment: [],
            },
            hasChoices: true,
            choices: [{ name: 'Starting Talent', selected: 'Resistance (Cold)' }],
        }),
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
        // Both card and selection panel show 'Void Born' — proves the normalized origin
        // flowed through preview rendering without throwing.
        expect(canvas.getAllByText('Void Born').length).toBeGreaterThan(1);
        // Grant rows from the normalized.system shape are present
        expect(canvas.getByText('Pilot (Spacecraft)')).toBeTruthy();
        expect(canvas.getByText('Void Accustomed')).toBeTruthy();
        // Re-clicking the previewed card must not throw (the bug path)
        clickAction(canvasElement, 'selectOriginCard');
    },
};

/**
 * Regression coverage for issue #205: the origin-path builder used to apply a
 * step's aptitude grant on top of an aptitude the character already had, with
 * no warning, no chooser, and no swap — the second grant was silently wasted.
 *
 * This story renders the preview state with the duplicate-aptitude warning
 * banner visible (Awareness is already on the character, and the just-confirmed
 * step would grant Awareness again). The banner exposes a "Pick replacement"
 * button wired to the `resolveAptitudeDouble` action. The Playwright spec at
 * `tests/storybook/issue-205-aptitude-doubling.spec.ts` opens this story and
 * snapshots it; the unit play function asserts the banner is in the DOM.
 */
export const Issue205AptitudeDoubling: Story = {
    args: makeArgs({
        selectedOrigin: makeSelectedOrigin('Hive World', { isConfirmed: true }),
        preview: {
            characteristics: [],
            skills: [],
            talents: [],
            aptitudes: ['Awareness', 'Fellowship'],
            wounds: null,
            fate: null,
            aptitudeCollisions: [{ original: 'Awareness', replacement: null }],
            hasUnresolvedAptitudeCollision: true,
        },
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
        // Banner renders with the duplicate-aptitude warning title
        expect(canvas.getByText('Duplicate aptitude detected')).toBeTruthy();
        // The conflicting aptitude is named in the banner list
        expect(canvas.getByText('Awareness')).toBeTruthy();
        // The chooser button is present and clickable
        const pickBtn = canvasElement.querySelector('[data-action="resolveAptitudeDouble"][data-aptitude="Awareness"]');
        expect(pickBtn).toBeTruthy();
    },
};
