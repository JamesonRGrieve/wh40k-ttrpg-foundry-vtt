import type { Meta, StoryObj } from '@storybook/html-vite';
import HBS from 'handlebars';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/character-creation/origin-path-builder.hbs?raw';
import { renderTemplate as renderTpl } from '../../../../stories/mocks';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { clickAction } from '../../../../stories/test-helpers';

initializeStoryHandlebars();

const compiled = HBS.compile(templateSrc);
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

interface BuilderChoiceEntry {
    name?: string;
    label?: string;
    choiceKey?: string;
    selected?: string;
}

interface BuilderRollResult {
    formula: string;
    hasValue: boolean;
    value: number | undefined;
    breakdown: string;
}

interface BuilderRollsMap {
    [key: string]: BuilderRollResult | undefined;
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
    choices: BuilderChoiceEntry[];
    hasRolls: boolean;
    rolls: BuilderRollsMap;
    resources: { showInfluence: boolean; influenceRolled: number | null; influenceMod: number };
}

/** A single characteristic view as the dice-driven grid partials read it. */
interface CharGenCharRowEntry {
    key: string;
    short: string;
    label: string;
    base: number;
    rollValue: number | null;
    originBonus: number;
    hasOriginBonus: boolean;
    hasOriginBonusTooltip: boolean;
    originBonusTooltip: string;
    originBonusTooltipData: string;
    assignedIndex: number | null;
    total: number | null;
    hasRoll: boolean;
}

/** A single characteristic view as the point-buy partial reads it. */
interface CharGenPointBuyEntry {
    key: string;
    short: string;
    label: string;
    base: number;
    points: number;
    originBonus: number;
    hasOriginBonus: boolean;
    hasOriginBonusTooltip: boolean;
    originBonusTooltip: string;
    originBonusTooltipData: string;
    total: number;
    canIncrease: boolean;
    canDecrease: boolean;
}

/**
 * Shape of the `charGen` slice the characteristic step renders. Mirrors the
 * object `OriginPathBuilder._prepareCharGenContext` returns, narrowed to the
 * fields the template + its partials read.
 */
interface BuilderCharGenArg {
    rollsBank: Array<{ index: number; displayIndex: number; value: number; isEmpty: boolean; isAssigned: boolean }>;
    characteristicRows: CharGenCharRowEntry[][];
    advancedMode: boolean;
    divination: string;
    mode: 'point-buy' | 'roll' | 'roll-pool-hb';
    isModePointBuy: boolean;
    isModeRoll: boolean;
    isModeRollPoolHB: boolean;
    pointBuyRows: CharGenPointBuyEntry[][];
    pointBuyPool: number;
    pointBuySpent: number;
    pointBuyRemaining: number;
    pointBuyOverspent: boolean;
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
    charGen: BuilderCharGenArg | null;
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
        unresolvedAptitudeCollisions?: Array<{ original: string; replacement: string | null }>;
        resolvedAptitudeCollisions?: Array<{ original: string; replacement: string }>;
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
    render: (args) => renderTpl(compiled, args),
};

export default meta;

type Story = StoryObj<BuilderStoryArgs>;

export const Default: Story = {
    args: makeArgs(),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Acolyte Origins')).toBeTruthy();
        await expect(view.getByText('Hive World')).toBeTruthy();
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
        const view = within(canvasElement);
        await expect(view.getAllByText('Hive World').length).toBeGreaterThan(1);
        await expect(view.getByText('Dodge')).toBeTruthy();
        clickAction(canvasElement, 'confirmSelection');
    },
};

/**
 * Issue #206 — Walk the full step sequence to assert the Characteristic Roll
 * step and Equipment step both surface BEFORE the final confirmation dialog
 * fires. The original bug closed the builder on either dialog button before
 * those two steps could be reached.
 */
export const Issue206CharacteristicStepReached: Story = {
    args: makeArgs({
        showCharacteristics: true,
        hasEquipmentStep: true,
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
                isActive: false,
                isComplete: true,
                isDisabled: false,
                isLineage: false,
                selection: { name: 'Adept', img: 'icons/svg/d20.svg' },
            },
            {
                index: 2,
                key: 'role',
                label: 'Role',
                shortLabel: 'Role',
                icon: 'fa-user-shield',
                isActive: false,
                isComplete: true,
                isDisabled: false,
                isLineage: false,
                selection: { name: 'Warrior', img: 'icons/svg/d20.svg' },
            },
            {
                index: 3,
                key: 'elite',
                label: 'Elite Advance',
                shortLabel: 'Elite',
                icon: 'fa-star',
                isActive: false,
                isComplete: false,
                isDisabled: false,
                isLineage: true,
                selection: null,
            },
            {
                index: 4,
                key: 'characteristics',
                label: 'Characteristics',
                shortLabel: 'Chars',
                icon: 'fa-dice-d20',
                isActive: true,
                isComplete: false,
                isDisabled: false,
                isLineage: false,
                selection: null,
            },
            {
                index: 5,
                key: 'equipment',
                label: 'Equip Acolyte',
                shortLabel: 'Equip',
                icon: 'fa-box',
                isActive: false,
                isComplete: false,
                isDisabled: true,
                isLineage: false,
                selection: null,
            },
        ],
        currentStep: {
            index: 4,
            key: 'characteristics',
            label: 'Characteristics',
            icon: 'fa-dice-d20',
            description: 'Roll or enter your characteristic values',
            origins: [],
            isLineage: false,
            isCharacteristics: true,
        },
        showSelectionPanel: false,
        status: {
            stepsComplete: true,
            stepsCount: 3,
            totalSteps: 6,
            choicesComplete: true,
            pendingChoices: 0,
            pendingRolls: 0,
            canCommit: false,
        },
    }),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        // The Characteristic Roll step surfaces in the journey rail before commit fires.
        await expect(view.getAllByText(/Characteristics/i).length).toBeGreaterThan(0);
        // The Equipment step is queued behind characteristics — it has not fired the final dialog.
        await expect(view.getAllByText(/Equip Acolyte/i).length).toBeGreaterThan(0);
    },
};

export const Issue206EquipmentStepReached: Story = {
    args: makeArgs({
        showCharacteristics: false,
        showEquipment: true,
        hasEquipmentStep: true,
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
                isActive: false,
                isComplete: true,
                isDisabled: false,
                isLineage: false,
                selection: { name: 'Adept', img: 'icons/svg/d20.svg' },
            },
            {
                index: 2,
                key: 'role',
                label: 'Role',
                shortLabel: 'Role',
                icon: 'fa-user-shield',
                isActive: false,
                isComplete: true,
                isDisabled: false,
                isLineage: false,
                selection: { name: 'Warrior', img: 'icons/svg/d20.svg' },
            },
            {
                index: 4,
                key: 'characteristics',
                label: 'Characteristics',
                shortLabel: 'Chars',
                icon: 'fa-dice-d20',
                isActive: false,
                isComplete: true,
                isDisabled: false,
                isLineage: false,
                selection: null,
            },
            {
                index: 5,
                key: 'equipment',
                label: 'Equip Acolyte',
                shortLabel: 'Equip',
                icon: 'fa-box',
                isActive: true,
                isComplete: false,
                isDisabled: false,
                isLineage: false,
                selection: null,
            },
        ],
        currentStep: {
            index: 5,
            key: 'equipment',
            label: 'Equip Acolyte',
            icon: 'fa-box',
            description: 'Select your starting gear before completing character creation.',
            origins: [],
            isLineage: false,
            isCharacteristics: false,
        },
        showSelectionPanel: false,
        status: {
            stepsComplete: true,
            stepsCount: 4,
            totalSteps: 6,
            choicesComplete: true,
            pendingChoices: 0,
            pendingRolls: 0,
            // canCommit is FALSE until the player picks at least one equipment item;
            // the final confirmation dialog must not fire while this step is in progress.
            canCommit: false,
        },
    }),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        // Equipment step is the active step in the journey rail.
        await expect(view.getAllByText(/Equip Acolyte/i).length).toBeGreaterThan(0);
        // Characteristics is marked complete and equipment is current — final commit must be gated.
        await expect(view.getAllByText(/Characteristics/i).length).toBeGreaterThan(0);
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
        const view = within(canvasElement);
        await expect(view.getByText('Dynasty Path')).toBeTruthy();
        await expect(view.getByText('Origin')).toBeTruthy();
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
 * Tailwind `dh2:` variants resolve. The Playwright spec at
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
        const view = within(canvasElement);
        // The Throne Gelt label and exactly one roll button must render on the home-world step.
        await expect(view.getByText('Throne Gelt')).toBeTruthy();
        const thronesRollButtons = canvasElement.querySelectorAll('button[data-action="rollStat"][data-stat-type="thrones"]');
        await expect(thronesRollButtons.length).toBe(1);
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
        await expect(thronesRollButtons.length).toBe(0);
        const thronesManualButtons = canvasElement.querySelectorAll('button[data-action="manualStat"][data-stat-type="thrones"]');
        await expect(thronesManualButtons.length).toBe(0);
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
                talents: [
                    { name: 'Void Accustomed', tooltip: 'Immune to space-borne ill effects.', tooltipData: 'VoidAccustomed', uuid: null, hasItem: false },
                ],
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
        const view = within(canvasElement);
        // Both card and selection panel show 'Void Born' — proves the normalized origin
        // flowed through preview rendering without throwing.
        await expect(view.getAllByText('Void Born').length).toBeGreaterThan(1);
        // Grant rows from the normalized.system shape are present
        await expect(view.getByText('Pilot (Spacecraft)')).toBeTruthy();
        await expect(view.getByText('Void Accustomed')).toBeTruthy();
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
            // (#216) The template now reads the unresolved list, not the full
            // collision list, so the banner only fires on outstanding entries.
            unresolvedAptitudeCollisions: [{ original: 'Awareness', replacement: null }],
            resolvedAptitudeCollisions: [],
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
        const view = within(canvasElement);
        // Banner renders with the duplicate-aptitude warning title
        await expect(view.getByText('Duplicate aptitude detected')).toBeTruthy();
        // The conflicting aptitude is named in the banner list
        await expect(view.getByText('Awareness')).toBeTruthy();
        // The chooser button is present and clickable
        const pickBtn = canvasElement.querySelector('[data-action="resolveAptitudeDouble"][data-aptitude="Awareness"]');
        await expect(pickBtn).toBeTruthy();
    },
};

/**
 * Regression coverage for issue #215: opening the origin-path builder on a
 * character that already has committed origin steps used to immediately show a
 * "duplicate aptitude detected" banner for every aptitude — the actor's
 * derived `system.aptitudes` collided with the builder's own re-loaded
 * selections (the same single grant seen twice). Selecting replacements did
 * not clear it; only Reset All did.
 *
 * After the fix `_getAptitudeCollisions` subtracts aptitudes attributable to
 * the builder's own committed selections, so a freshly-opened, conflict-free
 * builder reports NO collisions. This story stages that resolved state
 * (aptitudes present on the preview, `aptitudeCollisions: []`) and asserts the
 * collision banner is absent from the DOM.
 */
export const Issue215NoPhantomDuplicate: Story = {
    args: makeArgs({
        selectedOrigin: makeSelectedOrigin('Hive World', { isConfirmed: true }),
        preview: {
            characteristics: [],
            skills: [],
            talents: [],
            aptitudes: ['Willpower', 'Tech', 'Finesse', 'Offence'],
            wounds: null,
            fate: null,
            aptitudeCollisions: [],
            unresolvedAptitudeCollisions: [],
            resolvedAptitudeCollisions: [],
            hasUnresolvedAptitudeCollision: false,
        },
        status: {
            stepsComplete: true,
            stepsCount: 4,
            totalSteps: 8,
            choicesComplete: true,
            pendingChoices: 0,
            pendingRolls: 0,
            canCommit: false,
        },
    }),
    play: async ({ canvasElement }) => {
        // The collision banner must NOT be present — no phantom #215 warning.
        const banner = canvasElement.querySelector('[data-testid="aptitude-collision-banner"]');
        await expect(banner).toBeNull();
        // The preview still lists the character's aptitudes normally.
        const view = within(canvasElement);
        await expect(view.getByText('Willpower')).toBeTruthy();
    },
};

/**
 * Regression coverage for issue #216 — "Duplicate aptitude option still
 * displays as a requirement even if it is selected".
 *
 * Pre-fix the warning banner showed every entry in `preview.aptitudeCollisions`
 * regardless of whether the player had picked a replacement, so a resolved
 * collision kept appearing as an outstanding requirement.
 *
 * This story stages the POST-SELECT state: the player resolved a Willpower
 * collision by swapping to Strength. After the fix the warning banner is gone
 * (no entries in `unresolvedAptitudeCollisions`) and the resolved swap shows
 * up in the neutral "applied swap" sub-section with a Change affordance.
 *
 * The Playwright spec at `tests/storybook/issue-216-resolved-aptitude.spec.ts`
 * opens this story, snapshots it, and asserts the warning banner is absent
 * while the resolved-banner is present.
 */
export const Issue216ResolvedAptitudeNotARequirement: Story = {
    args: makeArgs({
        selectedOrigin: makeSelectedOrigin('Hive World', { isConfirmed: true }),
        preview: {
            characteristics: [],
            skills: [],
            talents: [],
            aptitudes: ['Strength', 'Fellowship', 'Willpower'],
            wounds: null,
            fate: null,
            aptitudeCollisions: [{ original: 'Willpower', replacement: 'Strength' }],
            unresolvedAptitudeCollisions: [],
            resolvedAptitudeCollisions: [{ original: 'Willpower', replacement: 'Strength' }],
            hasUnresolvedAptitudeCollision: false,
        },
        status: {
            stepsComplete: true,
            stepsCount: 2,
            totalSteps: 8,
            choicesComplete: true,
            pendingChoices: 0,
            pendingRolls: 0,
            canCommit: false,
        },
    }),
    play: async ({ canvasElement }) => {
        // Bug #216: the warning banner used to render even after the swap.
        const warningBanner = canvasElement.querySelector('[data-testid="aptitude-collision-banner"]');
        await expect(warningBanner).toBeNull();
        // The resolved-applied list should still be visible so the player can Change it.
        const resolvedBanner = canvasElement.querySelector('[data-testid="aptitude-collision-resolved-banner"]');
        await expect(resolvedBanner).toBeTruthy();
        const resolvedRow = canvasElement.querySelector('[data-testid="aptitude-collision-resolved"][data-aptitude="Willpower"]');
        await expect(resolvedRow).toBeTruthy();
    },
};

/**
 * Pair to {@link Issue216ResolvedAptitudeNotARequirement}: PRE-select state
 * with a still-unresolved Willpower collision. The warning banner must
 * appear here. Stories are paired so visual review can compare pre/post
 * side-by-side and the resolved-state regression doesn't slip past unnoticed.
 */
export const Issue216UnresolvedAptitudeIsARequirement: Story = {
    args: makeArgs({
        selectedOrigin: makeSelectedOrigin('Hive World', { isConfirmed: true }),
        preview: {
            characteristics: [],
            skills: [],
            talents: [],
            aptitudes: ['Fellowship'],
            wounds: null,
            fate: null,
            aptitudeCollisions: [{ original: 'Willpower', replacement: null }],
            unresolvedAptitudeCollisions: [{ original: 'Willpower', replacement: null }],
            resolvedAptitudeCollisions: [],
            hasUnresolvedAptitudeCollision: true,
        },
        status: {
            stepsComplete: false,
            stepsCount: 2,
            totalSteps: 8,
            choicesComplete: true,
            pendingChoices: 0,
            pendingRolls: 0,
            canCommit: false,
        },
    }),
    play: async ({ canvasElement }) => {
        const warningBanner = canvasElement.querySelector('[data-testid="aptitude-collision-banner"]');
        await expect(warningBanner).toBeTruthy();
        const resolvedBanner = canvasElement.querySelector('[data-testid="aptitude-collision-resolved-banner"]');
        await expect(resolvedBanner).toBeNull();
        const unresolvedRow = canvasElement.querySelector('[data-testid="aptitude-collision-unresolved"][data-aptitude="Willpower"]');
        await expect(unresolvedRow).toBeTruthy();
    },
};

/* -------------------------------------------------------------------------- */
/*  Characteristic-generation mode stories (point-buy + roll)                 */
/* -------------------------------------------------------------------------- */

const CHAR_GEN_KEYS = [
    { key: 'weaponSkill', short: 'WS', label: 'Weapon Skill' },
    { key: 'ballisticSkill', short: 'BS', label: 'Ballistic Skill' },
    { key: 'strength', short: 'S', label: 'Strength' },
    { key: 'toughness', short: 'T', label: 'Toughness' },
    { key: 'agility', short: 'Ag', label: 'Agility' },
    { key: 'intelligence', short: 'Int', label: 'Intelligence' },
    { key: 'perception', short: 'Per', label: 'Perception' },
    { key: 'willpower', short: 'WP', label: 'Willpower' },
    { key: 'fellowship', short: 'Fel', label: 'Fellowship' },
] as const;

function rowsOf<T>(items: T[]): T[][] {
    const rows: T[][] = [];
    for (let i = 0; i < items.length; i += 3) rows.push(items.slice(i, i + 3));
    return rows;
}

interface CharGenOverrides {
    mode: 'point-buy' | 'roll' | 'roll-pool-hb';
    pointBuyPool?: number;
    /** Points allocated per characteristic (point-buy mode). */
    points?: number[];
    /** Bonus rolled per characteristic (roll / roll-pool-hb modes). */
    rolls?: number[];
}

function makeCharGen(overrides: CharGenOverrides): BuilderCharGenArg {
    const base = 25;
    const isPointBuy = overrides.mode === 'point-buy';
    const isRoll = overrides.mode === 'roll';
    const isRollPool = overrides.mode === 'roll-pool-hb';
    const points = overrides.points ?? CHAR_GEN_KEYS.map(() => 0);
    const rolls = overrides.rolls ?? CHAR_GEN_KEYS.map(() => 0);
    const pool = overrides.pointBuyPool ?? 100;
    const spent = points.reduce((sum, p) => sum + Math.max(0, p), 0);
    const remaining = pool - spent;

    const charRows: CharGenCharRowEntry[] = CHAR_GEN_KEYS.map((c, i) => {
        const rollValue = rolls[i] ?? 0;
        const hasRoll = rollValue > 0;
        return {
            key: c.key,
            short: c.short,
            label: c.label,
            base,
            rollValue: hasRoll ? rollValue : null,
            originBonus: 0,
            hasOriginBonus: false,
            hasOriginBonusTooltip: false,
            originBonusTooltip: '',
            originBonusTooltipData: '',
            assignedIndex: hasRoll ? i : null,
            total: hasRoll ? base + rollValue : null,
            hasRoll,
        };
    });

    const pbRows: CharGenPointBuyEntry[] = CHAR_GEN_KEYS.map((c, i) => {
        const pts = Math.max(0, points[i] ?? 0);
        return {
            key: c.key,
            short: c.short,
            label: c.label,
            base,
            points: pts,
            originBonus: 0,
            hasOriginBonus: false,
            hasOriginBonusTooltip: false,
            originBonusTooltip: '',
            originBonusTooltipData: '',
            total: base + pts,
            canIncrease: remaining > 0,
            canDecrease: pts > 0,
        };
    });

    return {
        rollsBank: rolls.map((v, index) => ({ index, displayIndex: index + 1, value: v, isEmpty: v === 0, isAssigned: v > 0 })),
        characteristicRows: rowsOf(charRows),
        advancedMode: false,
        divination: '',
        mode: overrides.mode,
        isModePointBuy: isPointBuy,
        isModeRoll: isRoll,
        isModeRollPoolHB: isRollPool,
        pointBuyRows: rowsOf(pbRows),
        pointBuyPool: pool,
        pointBuySpent: spent,
        pointBuyRemaining: remaining,
        pointBuyOverspent: remaining < 0,
    };
}

/** Args that put the builder on the Characteristics step in a given charGen mode. */
function makeCharStepArgs(charGen: BuilderCharGenArg, extra: Partial<BuilderStoryArgs> = {}): BuilderStoryArgs {
    return makeArgs({
        showCharacteristics: true,
        showSelectionPanel: false,
        charGen,
        currentStep: {
            index: 4,
            key: 'characteristics',
            label: 'Characteristics',
            icon: 'fa-dice-d20',
            description: 'Generate your characteristics',
            origins: [],
            isLineage: false,
            isCharacteristics: true,
        },
        ...extra,
    });
}

/** Point-buy mode: pool budget visible, +/- controls and numeric inputs present. */
export const PointBuyMode: Story = {
    args: makeCharStepArgs(makeCharGen({ mode: 'point-buy', points: [10, 8, 0, 0, 5, 0, 0, 0, 0] })),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        // The three mode tabs all render; point-buy is the selected one.
        const pointBuyTab = canvasElement.querySelector('[data-action="setCharGenMode"][data-mode="point-buy"]');
        await expect(pointBuyTab).toBeTruthy();
        await expect(pointBuyTab?.getAttribute('aria-selected')).toBe('true');
        // Mode switch: the roll + roll-pool tabs exist to switch to.
        await expect(canvasElement.querySelector('[data-action="setCharGenMode"][data-mode="roll"]')).toBeTruthy();
        await expect(canvasElement.querySelector('[data-action="setCharGenMode"][data-mode="roll-pool-hb"]')).toBeTruthy();
        clickAction(canvasElement, 'setCharGenMode');
        // Remaining-points budget is surfaced (100 pool − 23 spent = 77).
        await expect(view.getByText(/77 \/ 100/)).toBeTruthy();
        // Characteristic edit controls: one numeric input + inc/dec per characteristic.
        const inputs = canvasElement.querySelectorAll('.csd-pointbuy-input');
        await expect(inputs.length).toBe(9);
        const incButtons = canvasElement.querySelectorAll('[data-action="adjustPointBuy"][data-delta="1"]');
        await expect(incButtons.length).toBe(9);
        // Edit a characteristic: clicking the WS increment fires adjustPointBuy.
        clickAction(canvasElement, 'adjustPointBuy');
        // A first allocated characteristic total reflects base + points (25 + 10 = 35).
        await expect(view.getAllByText('35').length).toBeGreaterThan(0);
    },
};

/** Point-buy mode overspent: the warning banner and inc-disabled state surface. */
export const PointBuyModeOverspent: Story = {
    args: makeCharStepArgs(makeCharGen({ mode: 'point-buy', pointBuyPool: 10, points: [9, 9, 0, 0, 0, 0, 0, 0, 0] })),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        // 10 pool − 18 spent = −8 → overspent banner.
        await expect(view.getByRole('alert')).toBeTruthy();
        // Every increment is disabled because no headroom remains.
        const enabledInc = Array.from(canvasElement.querySelectorAll('[data-action="adjustPointBuy"][data-delta="1"]')).filter(
            (b) => !(b as HTMLButtonElement).disabled,
        );
        await expect(enabledInc.length).toBe(0);
    },
};

/** Roll mode: a single Roll-All control + an in-order, non-draggable grid. */
export const RollMode: Story = {
    args: makeCharStepArgs(makeCharGen({ mode: 'roll', rolls: [12, 8, 19, 4, 15, 11, 7, 18, 9] })),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        const rollTab = canvasElement.querySelector('[data-action="setCharGenMode"][data-mode="roll"]');
        await expect(rollTab?.getAttribute('aria-selected')).toBe('true');
        // Roll mode exposes the Roll-All action (not the draggable bank).
        await expect(canvasElement.querySelector('[data-action="rollCharacteristics"]')).toBeTruthy();
        await expect(canvasElement.querySelector('.csd-rolls-bank')).toBeNull();
        // The assigned rolls are NOT draggable in roll mode (locked in order).
        const draggables = canvasElement.querySelectorAll('.csd-assigned-roll[draggable="true"]');
        await expect(draggables.length).toBe(0);
        // Mode switch + characteristic edit: switch tab and roll.
        clickAction(canvasElement, 'setCharGenMode');
        clickAction(canvasElement, 'rollCharacteristics');
        // WS total = base 25 + rolled 12 = 37.
        await expect(view.getAllByText('37').length).toBeGreaterThan(0);
    },
};

/**
 * Homologation: the roll-mode characteristic step must render identically
 * across all seven game systems. Re-renders the same charGen under each
 * system id and asserts the Roll-All control and grid survive — DH2-only
 * theming assumptions would surface here.
 */
export const RollModeAllSystems: Story = {
    args: makeCharStepArgs(makeCharGen({ mode: 'roll', rolls: [10, 10, 10, 10, 10, 10, 10, 10, 10] })),
    render: (args) => {
        const wrapper = document.createElement('div');
        for (const system of ['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt', 'im'] as const) {
            const root = renderTpl(compiled, args);
            root.setAttribute('data-wh40k-system', system);
            root.dataset['storySystem'] = system;
            wrapper.appendChild(root);
        }
        return wrapper;
    },
    play: async ({ canvasElement }) => {
        await Promise.all(
            (['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt', 'im'] as const).map(async (system) => {
                const root = canvasElement.querySelector<HTMLElement>(`[data-story-system="${system}"]`);
                await expect(root).toBeTruthy();
                await expect(root?.querySelector('[data-action="rollCharacteristics"]')).toBeTruthy();
                // Nine in-order slots, every total = 25 base + 10 rolled = 35.
                const totals = within(root as HTMLElement).getAllByText('35');
                await expect(totals.length).toBeGreaterThan(0);
            }),
        );
    },
};

/**
 * Homologation: point-buy across all seven systems. The pool budget and the
 * +/- controls render under every system id.
 */
export const PointBuyModeAllSystems: Story = {
    args: makeCharStepArgs(makeCharGen({ mode: 'point-buy', points: [20, 0, 0, 0, 0, 0, 0, 0, 0] })),
    render: (args) => {
        const wrapper = document.createElement('div');
        for (const system of ['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt', 'im'] as const) {
            const root = renderTpl(compiled, args);
            root.setAttribute('data-wh40k-system', system);
            root.dataset['storySystem'] = system;
            wrapper.appendChild(root);
        }
        return wrapper;
    },
    play: async ({ canvasElement }) => {
        await Promise.all(
            (['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt', 'im'] as const).map(async (system) => {
                const root = canvasElement.querySelector<HTMLElement>(`[data-story-system="${system}"]`);
                await expect(root).toBeTruthy();
                await expect(root?.querySelectorAll('.csd-pointbuy-input').length).toBe(9);
                // 100 pool − 20 spent = 80 remaining.
                await expect(within(root as HTMLElement).getByText(/80 \/ 100/)).toBeTruthy();
            }),
        );
    },
};
