import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import contextSrc from '../../../../src/templates/prompt/unified/context-panel.hbs?raw';
import diceSrc from '../../../../src/templates/prompt/unified/dice-input.hbs?raw';
import footerSrc from '../../../../src/templates/prompt/unified/footer.hbs?raw';
import headerSrc from '../../../../src/templates/prompt/unified/header.hbs?raw';
import modifiersSrc from '../../../../src/templates/prompt/unified/modifiers.hbs?raw';
import targetSrc from '../../../../src/templates/prompt/unified/target-display.hbs?raw';
import { renderSheetParts } from '../../../../stories/test-helpers';

/**
 * UnifiedRollDialog is the single dialog for every roll type (skill, weapon,
 * psychic, force field). It concatenates six `static PARTS`: header →
 * target-display → context-panel → modifiers → dice-input → footer. These
 * stories compose the same six parts via `renderSheetParts` so the composed
 * cascade is exercised, covering the pristine state, a resolved manual roll,
 * and the athletics climb-surface context sub-panel.
 *
 * The weapon / psychic / force-field context sub-panels have their own
 * dedicated stories; here the context panel stays collapsed or uses the
 * self-contained athletics branch so no sub-panel partial context is needed.
 */

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars render context is an open bag, matching renderSheetParts' Context type
type Ctx = Record<string, unknown>;

const PARTS = [
    { template: headerSrc },
    { template: targetSrc },
    { template: contextSrc },
    { template: modifiersSrc },
    { template: diceSrc },
    { template: footerSrc },
];

const DIFFICULTY_PICKER = [
    { index: 0, label: 'Easy', modifier: 30, isCurrent: false },
    { index: 1, label: 'Routine', modifier: 10, isCurrent: false },
    { index: 2, label: 'Standard', modifier: 0, isCurrent: true },
    { index: 3, label: 'Hard', modifier: -10, isCurrent: false },
];

function baseContext(overrides: Ctx = {}): Ctx {
    return {
        // header
        actorName: 'Interrogator Vane',
        rollName: 'Ballistic Skill Test',
        rollSubtitle: 'Standard Difficulty',
        // target-display
        finalTarget: 48,
        baseTarget: 38,
        targetColorClass: 'tw-text-gold-raw',
        targetBreakdownTooltip: 'Base 38 | Standard +0 | Aim +10',
        isForceField: false,
        difficulty: { label: 'Standard', modifier: 0 },
        difficultyPickerOpen: false,
        difficultyPicker: DIFFICULTY_PICKER,
        difficultyMod: 0,
        situationalMod: 10,
        customMod: 0,
        // context-panel — collapsed by default
        hasContextPanel: false,
        isWeapon: false,
        isPsychic: false,
        hasSkillPanel: false,
        isAthletics: false,
        contextExpanded: false,
        // modifiers
        hasSkillVariants: false,
        hasSituationalModifiers: false,
        assistantCount: 0,
        canDecrementAssistant: false,
        canIncrementAssistant: true,
        assistanceBonus: 0,
        extended: false,
        extendedThreshold: 3,
        showCustomModifier: false,
        tryAgainPenalty: 0,
        // dice-input
        isTwoDice: true,
        manualRollTens: null,
        manualRollUnits: null,
        hasManualRoll: false,
        singleRollValue: null,
        rollResult: null,
        ...overrides,
    };
}

const meta = {
    title: 'Prompts/UnifiedRollDialog',
    render: (args: Ctx) => renderSheetParts(PARTS, args),
    args: baseContext(),
} satisfies Meta<Ctx>;
export default meta;

type Story = StoryObj<Ctx>;

/** Pristine characteristic test: hero target, no manual roll, collapsed context. */
export const CharacteristicTest: Story = {
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Ballistic Skill Test')).toBeTruthy();
        await expect(canvasElement.querySelector('.urd-target__number')?.textContent).toContain('48');
        await expect(canvasElement.querySelector('[data-action="systemRoll"]')).toBeTruthy();
    },
};

/** A resolved manual roll: success feedback + situational pills + assistance bonus. */
export const ManualSuccess: Story = {
    args: baseContext({
        manualRollTens: 2,
        manualRollUnits: 4,
        manualRollTotal: 24,
        hasManualRoll: true,
        rollResult: { success: true, dos: 3, dof: 0 },
        hasSituationalModifiers: true,
        situationalModifiers: [
            { active: true, toggleKey: 'aim-half', condition: 'Aim (Half Action)', icon: 'fas fa-crosshairs', source: 'Aim', value: 10, valueLabel: '+10' },
            { active: false, toggleKey: 'darkness', condition: 'Fighting in darkness', icon: 'fas fa-moon', source: 'Darkness', value: -20, valueLabel: '-20' },
        ],
        assistantCount: 1,
        canDecrementAssistant: true,
        assistanceBonus: 10,
    }),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('SUCCESS')).toBeTruthy();
        await expect(view.getByText(/3 DoS/)).toBeTruthy();
        await expect(view.getByText('+10')).toBeTruthy();
    },
};

/** Athletics roll with the self-contained climb-surface context sub-panel expanded. */
export const AthleticsClimb: Story = {
    args: baseContext({
        rollName: 'Athletics (Climb)',
        hasContextPanel: true,
        isAthletics: true,
        contextExpanded: true,
        climbSurface: 'sheer',
        climbSurfaceOptions: [
            { value: 'normal', label: 'Normal Surface', isCurrent: false },
            { value: 'sheer', label: 'Sheer Surface', isCurrent: true },
        ],
    }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('select[name="climbSurface"]')).toBeTruthy();
        await expect(canvasElement.querySelector('.wh40k-climb-surface-picker__sheer-indicator')).toBeTruthy();
    },
};

/** Weapon attack with the #250 combatant target dropdown (active combat present). */
export const WeaponTargetDropdown: Story = {
    args: baseContext({
        rollName: 'Ballistic Skill Test',
        rollSubtitle: 'Hand Cannon',
        hasContextPanel: true,
        isWeapon: true,
        contextExpanded: true,
        weapon: { name: 'Hand Cannon', img: 'icons/svg/item-bag.svg', isRanged: true },
        hasCombat: true,
        hasTarget: true,
        targetName: 'Cultist Alpha',
        combatants: [
            { id: 'c1', name: 'Cultist Alpha', isSelected: true },
            { id: 'c2', name: 'Cultist Beta', isSelected: false },
            { id: 'c3', name: 'Hybrid Aberrant', isSelected: false },
        ],
        attackModes: [],
        aimOptions: [],
        rangeBrackets: [],
        sizeOptions: [],
        combatSituationals: [],
    }),
    play: async ({ canvasElement }) => {
        const select = canvasElement.querySelector<HTMLSelectElement>('select[name="targetCombatantId"]');
        await expect(select).toBeTruthy();
        const options = canvasElement.querySelectorAll('select[name="targetCombatantId"] option');
        await expect(options.length).toBe(4);
        await expect(select?.value).toBe('c1');
    },
};
