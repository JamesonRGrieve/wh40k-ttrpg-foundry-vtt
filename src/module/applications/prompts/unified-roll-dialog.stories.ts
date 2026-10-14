import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, userEvent, within } from 'storybook/test';
import contextSrc from '../../../../src/templates/prompt/unified/context-panel.hbs?raw';
import diceSrc from '../../../../src/templates/prompt/unified/dice-input.hbs?raw';
import footerSrc from '../../../../src/templates/prompt/unified/footer.hbs?raw';
import headerSrc from '../../../../src/templates/prompt/unified/header.hbs?raw';
import modifiersSrc from '../../../../src/templates/prompt/unified/modifiers.hbs?raw';
import targetSrc from '../../../../src/templates/prompt/unified/target-display.hbs?raw';
import { renderSheetParts } from '../../../../stories/test-helpers';
import { type AttackOptionWeapon, getAvailableAttackModes } from '../../rules/attack-options.ts';

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

/** One target component as the dialog's shared builder emits it (#489): a hoverable, sourced row. */
function component(key: string, label: string, value: number, source: string): Ctx {
    return { key, label, value, source, tooltipData: JSON.stringify({ title: label, sources: [{ name: source, value }] }) };
}

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
        targetComponents: [component('situational', 'Aim', 10, 'Aim (Half Action)')],
        targetTooltipData: '{"title":"Target","sources":[{"name":"Base","value":38},{"name":"Aim","value":10}]}',
        isForceField: false,
        difficulty: { label: 'Standard', modifier: 0 },
        difficultyPickerOpen: false,
        difficultyPicker: DIFFICULTY_PICKER,
        customMod: 0,
        passiveModifierNoteKey: 'WH40K.PassiveModifiers.AlreadyApplied',
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
        assistanceBonus: 10,
    }),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('SUCCESS')).toBeTruthy();
        await expect(view.getByText(/3 DoS/)).toBeTruthy();
        await expect(view.getByText('+10')).toBeTruthy();
    },
};

/**
 * A once-per-round situational row already used this combat round (#101, Push
 * the Limit): the chip stays visible so the player sees why, but it is disabled,
 * struck through, and its tooltip says it is spent. Other rows stay selectable.
 */
export const OncePerRoundSpent: Story = {
    args: baseContext({
        rollName: 'Operate (Surface) Test',
        hasSituationalModifiers: true,
        situationalModifiers: [
            {
                active: false,
                spent: true,
                toggleKey: 'operate_Push the Limit',
                condition: 'Pushing the limit (once/round; 4+ DoF risks a Motive System critical)',
                icon: 'fa-solid fa-exclamation-triangle',
                source: 'Push the Limit',
                value: 20,
                valueLabel: '+20',
            },
            {
                active: true,
                toggleKey: 'operate_Skilled Rider',
                condition: 'Familiar mount',
                icon: 'fas fa-horse',
                source: 'Skilled Rider',
                value: 10,
                valueLabel: '+10',
            },
        ],
    }),
    play: async ({ canvasElement }) => {
        const spent = canvasElement.querySelector<HTMLButtonElement>('[data-toggle-key="operate_Push the Limit"]');
        await expect(spent?.disabled).toBe(true);
        await expect(spent?.getAttribute('aria-disabled')).toBe('true');
        await expect(spent?.dataset['situationalSpent']).toBe('true');
        await expect(spent?.dataset['tooltip']).toBe('Already used this round');
        const live = canvasElement.querySelector<HTMLButtonElement>('[data-toggle-key="operate_Skilled Rider"]');
        await expect(live?.disabled).toBe(false);
        await expect(live?.getAttribute('aria-pressed')).toBe('true');
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
        await expect(canvasElement.querySelector('[data-wh40k-hook="climb-surface-picker__sheer-indicator"]')).toBeTruthy();
    },
};

/** Weapon attack with the #250 combatant target dropdown (active combat present). */
export const WeaponTargetDropdown: Story = {
    args: baseContext({
        rollName: 'Ballistic Skill Test',
        rollSubtitle: 'Hand Cannon',
        hasContextPanel: true,
        isWeapon: true,
        isRanged: true,
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

/** The skill-use chips for Tech-Use with Repair chosen (#432/#535). */
const TECH_USE_USES = [
    { id: 'general', label: 'General Test', isSelected: false, needsTarget: false, modifier: 0, modifierLabel: '+0' },
    { id: 'repair', label: 'Repair Item', isSelected: true, needsTarget: false, modifier: 0, modifierLabel: '+0' },
];

/** One item picker as the dialog's `buildSkillUseItemPickers` shapes it. */
function itemPicker(
    key: 'item' | 'weapon',
    label: string,
    hint: string,
    emptyLabel: string,
    options: Array<{ id: string; name: string; isSelected: boolean }>,
): Ctx {
    const inputId = `story-dialog-skillUseItem-${key}`;
    return { key, fieldName: `skillUseItem.${key}`, inputId, hintId: `${inputId}-hint`, label, hint, emptyLabel, isEmpty: options.length === 0, options };
}

/**
 * Tech-Use Repair with the inline item picker (#535): the eligible broken items in a
 * labelled `<select>`, the craftsmanship row already on the target, and the item
 * named in the roll title. The picker is keyboard-reachable and described by its hint.
 */
export const SkillUseItemPicker: Story = {
    args: baseContext({
        rollName: 'Tech-Use: Repair Item (Auspex)',
        finalTarget: 35,
        baseTarget: 45,
        hasSkillUsePicker: true,
        skillUses: TECH_USE_USES,
        skillUseNeedsTarget: false,
        skillUseItemPickers: [
            itemPicker('item', 'Item', 'Pick the broken or jammed item to repair.', 'You have no broken or jammed item to repair.', [
                { id: 'auspex', name: 'Auspex', isSelected: true },
                { id: 'laspistol', name: 'Laspistol (jammed)', isSelected: false },
            ]),
        ],
    }),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        const select = view.getByLabelText<HTMLSelectElement>('Item');
        await expect(select.name).toBe('skillUseItem.item');
        await expect(select.value).toBe('auspex');
        await expect(select.options.length).toBe(2);
        const hint = canvasElement.querySelector(`#${select.getAttribute('aria-describedby') ?? ''}`);
        await expect(hint?.textContent).toBe('Pick the broken or jammed item to repair.');
        select.focus();
        await expect(document.activeElement).toBe(select);
        await userEvent.selectOptions(select, 'laspistol');
        await expect(select.value).toBe('laspistol');
        await expect(view.getByRole('button', { name: /Repair Item/ }).getAttribute('aria-pressed')).toBe('true');
    },
};

/** Chem-Use Coat Weapon needs two picks: the chem and the weapon to coat (#535). */
export const SkillUseCoatWeaponPickers: Story = {
    args: baseContext({
        rollName: 'Chem-Use: Coat Weapon (Bloodfire)',
        hasSkillUsePicker: true,
        skillUses: [
            { id: 'general', label: 'General Test', isSelected: false, needsTarget: false, modifier: 0, modifierLabel: '+0' },
            { id: 'applyChem', label: 'Administer Chem', isSelected: false, needsTarget: true, modifier: 0, modifierLabel: '+0' },
            { id: 'coatWeapon', label: 'Coat Weapon', isSelected: true, needsTarget: false, modifier: 0, modifierLabel: '+0' },
        ],
        skillUseNeedsTarget: false,
        skillUseItemPickers: [
            itemPicker('item', 'Chem', 'Pick the substance to use.', 'You carry no chem with a dose left and a declared effect.', [
                { id: 'bloodfire', name: 'Bloodfire', isSelected: true },
            ]),
            itemPicker('weapon', 'Weapon to coat', 'Pick the weapon to coat with the chem.', 'You carry no weapon to coat.', [
                { id: 'knife', name: 'Mono-knife', isSelected: true },
                { id: 'sword', name: 'Chainsword', isSelected: false },
            ]),
        ],
    }),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByLabelText<HTMLSelectElement>('Chem').value).toBe('bloodfire');
        await expect(view.getByLabelText<HTMLSelectElement>('Weapon to coat').options.length).toBe(2);
    },
};

/** Nothing eligible: the picker is replaced by a status line saying what is missing (#535). */
export const SkillUseNoEligibleItem: Story = {
    args: baseContext({
        rollName: 'Security: Bypass Lock',
        hasSkillUsePicker: true,
        skillUses: [
            { id: 'general', label: 'General Test', isSelected: false, needsTarget: false, modifier: 0, modifierLabel: '+0' },
            { id: 'bypassLock', label: 'Bypass Lock', isSelected: true, needsTarget: false, modifier: 0, modifierLabel: '+0' },
        ],
        skillUseNeedsTarget: false,
        skillUseItemPickers: [itemPicker('item', 'Item', 'Pick the locked item to open.', 'There is no locked item to open.', [])],
    }),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByRole('status').textContent).toBe('There is no locked item to open.');
        await expect(canvasElement.querySelector('select[name="skillUseItem.item"]')).toBeNull();
    },
};

/** The passive block's rows: [label, value] per locked row. */
function passiveRows(canvasElement: HTMLElement): string[][] {
    return Array.from(canvasElement.querySelectorAll('.fa-lock'), (lock) => {
        const row = lock.parentElement;
        return Array.from(row?.querySelectorAll('span') ?? [], (span) => span.textContent.trim());
    });
}

/**
 * The always-on modifiers behind a skill's base target (#484): Superior Chirurgeon's
 * +20 Medicae is a locked, read-only row — already in the base, never re-added.
 */
export const PassiveSkillModifiers: Story = {
    args: baseContext({
        rollName: 'Medicae Test',
        baseTarget: 60,
        finalTarget: 60,
        situationalMod: 0,
        hasPassiveModifiers: true,
        passiveModifiers: [{ label: 'Superior Chirurgeon', value: 20, valueLabel: '–', type: 'talent' }],
    }),
    play: async ({ canvasElement }) => {
        await expect(passiveRows(canvasElement)).toEqual([['Superior Chirurgeon', '–']]);
        // Read-only: no control carries the row, so nothing can toggle it off or re-add it.
        const lock = canvasElement.querySelector('.fa-lock');
        await expect(lock?.closest('button, [data-action], input')).toBeNull();
        await expect(canvasElement.textContent).toContain('Included in base skill.');
    },
};

/**
 * A weapon attack's passive block (#484): the attack rolls Weapon Skill, so the
 * modifiers baked into WS — a talent and a condition here — are listed beside the
 * attack's own toggleable pills, which stay separate and interactive.
 */
export const PassiveWeaponAttackModifiers: Story = {
    args: baseContext({
        rollName: 'Chainsword Attack',
        rollSubtitle: 'Standard Attack',
        baseTarget: 45,
        finalTarget: 55,
        hasPassiveModifiers: true,
        passiveModifiers: [
            { label: 'Duelling Drill', value: 10, valueLabel: '–', type: 'talent' },
            { label: 'Fatigued', value: -10, valueLabel: '–', type: 'condition' },
        ],
        hasSituationalModifiers: true,
        situationalModifiers: [
            { active: true, toggleKey: 'attack_Aim', condition: 'Aim (Half Action)', icon: 'fas fa-crosshairs', source: 'Aim', value: 10, valueLabel: '+10' },
        ],
    }),
    play: async ({ canvasElement }) => {
        await expect(passiveRows(canvasElement)).toEqual([
            ['Duelling Drill', '–'],
            ['Fatigued', '–'],
        ]);
        const aim = canvasElement.querySelector<HTMLButtonElement>('[data-toggle-key="attack_Aim"]');
        // The attack's own pill stays a live toggle beside the read-only rows.
        await expect(aim?.dataset['action']).toBe('toggleSituational');
        await expect(aim?.disabled).toBe(false);
        await expect(aim?.getAttribute('aria-pressed')).toBe('true');
    },
};

/**
 * Push the Limit available (#101): its row is a live, toggleable pill carrying the
 * once-per-round and critical-risk note as its tooltip, until it is used this round.
 */
export const OncePerRoundAvailable: Story = {
    args: baseContext({
        rollName: 'Operate (Surface) Test',
        hasSituationalModifiers: true,
        situationalModifiers: [
            {
                active: false,
                toggleKey: 'operate_Push the Limit',
                condition: 'Pushing the limit (once/round; 4+ DoF risks a Motive System critical)',
                icon: 'fa-solid fa-exclamation-triangle',
                source: 'Push the Limit',
                value: 20,
                valueLabel: '+20',
            },
        ],
    }),
    play: async ({ canvasElement }) => {
        const push = canvasElement.querySelector<HTMLButtonElement>('[data-toggle-key="operate_Push the Limit"]');
        await expect(push?.disabled).toBe(false);
        await expect(push?.getAttribute('aria-pressed')).toBe('false');
        await expect(push?.dataset['situationalSpent']).toBeUndefined();
        await expect(push?.dataset['tooltip']).toContain('4+ DoF');
    },
};

/* ------------------------------------------------------------------ */
/*  Target breakdown — every component a hoverable row (#489)          */
/* ------------------------------------------------------------------ */

/** The rows the breakdown line shows, as `label value` text, in order. */
function breakdownRows(root: HTMLElement): string[] {
    return Array.from(root.querySelectorAll<HTMLElement>('[data-wh40k-hook="target-component"]'), (row) => row.textContent.replace(/\s+/g, ' ').trim());
}

/** Assert every breakdown row is hoverable to its own source through the shared modifier tooltip. */
async function expectHoverableRows(root: HTMLElement): Promise<void> {
    const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-wh40k-hook="target-component"]'));
    const described = rows.map((row) => {
        const payload = JSON.parse(row.dataset['wh40kTooltipData'] ?? '{}') as { sources?: Array<{ value?: number }> };
        return { type: row.dataset['wh40kTooltip'], value: payload.sources?.[0]?.value, tooltip: row.dataset['tooltip'] ?? '' };
    });
    await expect(described.every((row) => row.type === 'modifier' && row.value !== undefined && row.tooltip !== '')).toBe(true);
    // Hovering a row reaches the row itself, where Foundry's tooltip manager reads its data-tooltip.
    const first = rows.at(0);
    if (first !== undefined) {
        let hovered = false;
        first.addEventListener('pointerover', () => {
            hovered = true;
        });
        await userEvent.hover(first);
        await expect(hovered).toBe(true);
    }
}

/**
 * A Parry (#489): the parrying weapon's Defensive quality and an `onParry` hook
 * are collector rows. The target read 45 over "Base 30" with neither shown; now
 * each is a row and the rows sum to the target.
 */
export const ParryBreakdown: Story = {
    args: baseContext({
        rollName: 'Parry',
        rollSubtitle: 'Evasion',
        baseTarget: 30,
        finalTarget: 45,
        targetComponents: [component('parrying-weapon-defensive', 'Defensive (Mono-sword)', 15, 'Mono-sword')],
    }),
    render: (args: Ctx) => renderSheetParts(PARTS, args, { systemId: 'dh2' }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="target-base"]')?.textContent).toContain('30');
        await expect(breakdownRows(canvasElement)).toEqual(['Defensive (Mono-sword) +15']);
        await expect(canvasElement.querySelector('.urd-target__number')?.textContent).toContain('45');
        await expectHoverableRows(canvasElement);
    },
};

/** A BS attack in a zero-gravity, storm-lashed scene (#604): both environment rows show. */
export const EnvironmentBreakdown: Story = {
    args: baseContext({
        rollName: 'Ballistic Skill Test',
        rollSubtitle: 'Autogun',
        baseTarget: 50,
        finalTarget: 10,
        targetComponents: [
            component('zero-gravity', 'Zero gravity', -20, 'Scene environment'),
            component('harsh-conditions', 'Harsh conditions', -20, 'Scene environment'),
        ],
    }),
    render: (args: Ctx) => renderSheetParts(PARTS, args, { systemId: 'ow' }),
    play: async ({ canvasElement }) => {
        await expect(breakdownRows(canvasElement)).toEqual(['Zero gravity -20', 'Harsh conditions -20']);
        await expectHoverableRows(canvasElement);
    },
};

/** Fitting a weapon modification (#136): the Availability row is shown, not folded away. */
export const FitAvailabilityBreakdown: Story = {
    args: baseContext({
        rollName: 'Trade (Armourer): fit Red-Dot Laser Sight',
        rollSubtitle: 'Skill',
        baseTarget: 41,
        finalTarget: 31,
        targetComponents: [component('modification-availability', 'Modification Availability', -10, 'Modification Availability')],
    }),
    render: (args: Ctx) => renderSheetParts(PARTS, args, { systemId: 'dh1' }),
    play: async ({ canvasElement }) => {
        await expect(breakdownRows(canvasElement)).toEqual(['Modification Availability -10']);
        await expectHoverableRows(canvasElement);
    },
};

/** Past the ±60 cap the breakdown says so, as the card does. */
export const CappedBreakdown: Story = {
    args: baseContext({
        baseTarget: 40,
        finalTarget: 100,
        targetComponents: [
            component('aim', 'Aim', 20, 'Aim'),
            component('range', 'Range', 30, 'Point Blank'),
            component('combat-action', 'Combat Action', 30, 'All Out Attack'),
        ],
        targetCapFired: true,
        targetRawModifierTotal: 80,
        targetModifierTotal: 60,
    }),
    render: (args: Ctx) => renderSheetParts(PARTS, args, { systemId: 'rt' }),
    play: async ({ canvasElement }) => {
        await expect(breakdownRows(canvasElement)).toHaveLength(3);
        await expect(canvasElement.querySelector('[data-wh40k-hook="target-cap"]')?.textContent).toContain('80');
    },
};

/* ------------------------------------------------------------------ */
/*  Burst to-hit bonus per line (#607)                                 */
/* ------------------------------------------------------------------ */

/** The weapon panel for an autogun (RoF S/3/10), its mode cards built by the real per-line resolver. */
function burstPanel(line: string): Ctx {
    const weapon: AttackOptionWeapon = { isRanged: true, system: { attack: { rateOfFire: { semi: 3, full: 10 } } } };
    return baseContext({
        rollName: 'Ballistic Skill Test',
        rollSubtitle: 'Autogun',
        hasContextPanel: true,
        isWeapon: true,
        isRanged: true,
        contextExpanded: true,
        weapon: { name: 'Autogun', img: 'icons/svg/item-bag.svg', isRanged: true },
        attackModes: getAvailableAttackModes(weapon, line).map((mode) => ({
            ...mode,
            isSelected: mode.key === 'semiAuto',
            modifierLabel: mode.modifier >= 0 ? `+${mode.modifier}` : `${mode.modifier}`,
        })),
        aimOptions: [],
        rangeBrackets: [],
        sizeOptions: [],
        combatSituationals: [],
    });
}

/** The modifier label on a mode card. */
function modeLabel(root: HTMLElement, key: string): string {
    const card = root.querySelector<HTMLElement>(`[data-action="selectAttackMode"][data-mode-key="${key}"]`);
    return card?.lastElementChild?.textContent.trim() ?? '';
}

/** The action-cost badge on a mode card (icon, label, cost, modifier). */
function modeCost(root: HTMLElement, key: string): string {
    const card = root.querySelector<HTMLElement>(`[data-action="selectAttackMode"][data-mode-key="${key}"]`);
    return card?.children.item(2)?.textContent.trim() ?? '';
}

/** DH1 core p. 191 / p. 190: Semi-Auto Burst +10, Full Auto Burst +20, both Full Actions (DW and RT print the same). */
export const Dh1BurstModes: Story = {
    args: burstPanel('dh1'),
    render: (args: Ctx) => renderSheetParts(PARTS, args, { systemId: 'dh1' }),
    play: async ({ canvasElement }) => {
        await expect(modeLabel(canvasElement, 'semiAuto')).toBe('+10');
        await expect(modeLabel(canvasElement, 'fullAuto')).toBe('+20');
        await expect(modeLabel(canvasElement, 'standard')).toBe('+0');
        await expect(modeCost(canvasElement, 'semiAuto')).toBe('Full');
        await expect(modeCost(canvasElement, 'fullAuto')).toBe('Full');
        await expect(modeCost(canvasElement, 'standard')).toBe('Half');
    },
};

/** DH2 (BC and OW print the same): Semi-Auto Burst +0, Full Auto Burst −10. */
export const Dh2BurstModes: Story = {
    args: burstPanel('dh2'),
    render: (args: Ctx) => renderSheetParts(PARTS, args, { systemId: 'dh2' }),
    play: async ({ canvasElement }) => {
        await expect(modeLabel(canvasElement, 'semiAuto')).toBe('+0');
        await expect(modeLabel(canvasElement, 'fullAuto')).toBe('-10');
        await expect(modeCost(canvasElement, 'semiAuto')).toBe('Half');
        await expect(modeCost(canvasElement, 'fullAuto')).toBe('Half');
    },
};

/* ------------------------------------------------------------------ */
/*  Passive-effects note names the base kind (#525)                    */
/* ------------------------------------------------------------------ */

const PASSIVE_ROWS = [{ label: 'Weapon Training (Las)', value: 10, valueLabel: '–', type: 'talent' }];

/** A weapon attack rolls a characteristic, so its passive note says "characteristic". */
export const PassiveNoteWeaponAttack: Story = {
    args: baseContext({
        rollName: 'Ballistic Skill Test',
        hasPassiveModifiers: true,
        passiveModifiers: PASSIVE_ROWS,
        passiveModifierNoteKey: 'WH40K.PassiveModifiers.AlreadyAppliedCharacteristic',
    }),
    render: (args: Ctx) => renderSheetParts(PARTS, args, { systemId: 'dw' }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="passive-modifier-note"]')?.textContent).toBe('Included in base characteristic.');
    },
};

/** A skill test keeps "Included in base skill." */
export const PassiveNoteSkillTest: Story = {
    args: baseContext({
        rollName: 'Medicae Test',
        hasPassiveModifiers: true,
        passiveModifiers: [{ label: 'Superior Chirurgeon', value: 20, valueLabel: '–', type: 'talent' }],
    }),
    render: (args: Ctx) => renderSheetParts(PARTS, args, { systemId: 'bc' }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="passive-modifier-note"]')?.textContent).toBe('Included in base skill.');
    },
};

/* ------------------------------------------------------------------ */
/*  Manual-roll preview prints the line's own degrees (#335)           */
/* ------------------------------------------------------------------ */

/** DH1 (Gen 1): 01 vs 75 previews 7 DoS — the dialog passes the printed count. */
export const Dh1ManualDegrees: Story = {
    args: baseContext({
        finalTarget: 75,
        manualRollTens: 0,
        manualRollUnits: 1,
        manualRollTotal: 1,
        hasManualRoll: true,
        rollResult: { success: true, dos: 7, dof: 0 },
    }),
    render: (args: Ctx) => renderSheetParts(PARTS, args, { systemId: 'dh1' }),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText(/7 DoS/)).toBeTruthy();
    },
};
