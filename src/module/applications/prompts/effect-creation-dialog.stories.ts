import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import templateSrc from '../../../../src/templates/dialogs/effect-creation-dialog.hbs?raw';
import { captureActionClicks, clickAction, renderSheet, submitForm } from '../../../../stories/test-helpers';

/** One `{id, label}` option row, the shape `_prepareContext` hands the three pickers. */
interface PickerOption {
    id: string;
    label: string;
}

interface Args {
    selectedCategory: 'condition' | 'characteristic' | 'skill' | 'combat' | 'custom';
    /** Picker rows, shaped like `conditionPickerRows` (the condition documents). */
    conditions?: { id: string; name: string; img: string; nature: string }[];
    characteristics?: PickerOption[];
    skills?: PickerOption[];
    combatTypes?: PickerOption[];
}

/**
 * The context `EffectCreationDialog._prepareContext` builds: the selected
 * category, the owner line's condition rows, and the characteristic / skill /
 * combat pickers keyed by `id` (the value the form submits).
 */
const meta = {
    title: 'Dialogs/EffectCreationDialog',
    // The live window's root is the form (`tag: 'form'`); the template is its content.
    render: (args) => {
        const form = document.createElement('form');
        form.className = 'wh40k-rpg wh40k-effect-creation-dialog';
        form.append(renderSheet(templateSrc, { ...args }));
        return form;
    },
    args: {
        selectedCategory: 'condition',
        conditions: [
            { id: 'fatigued', name: 'Fatigued', img: 'icons/svg/sleep.svg', nature: 'harmful' },
            { id: 'pinned', name: 'Pinned', img: 'icons/svg/net.svg', nature: 'harmful' },
            { id: 'stunned', name: 'Stunned', img: 'icons/svg/daze.svg', nature: 'harmful' },
        ],
        characteristics: [
            { id: 'weaponSkill', label: 'Weapon Skill' },
            { id: 'ballisticSkill', label: 'Ballistic Skill' },
            { id: 'strength', label: 'Strength' },
        ],
        skills: [
            { id: 'dodge', label: 'Dodge' },
            { id: 'awareness', label: 'Awareness' },
        ],
        combatTypes: [
            { id: 'attack', label: 'Attack Rolls' },
            { id: 'damage', label: 'Damage' },
            { id: 'initiative', label: 'Initiative' },
        ],
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/** The option values a named `<select>` offers, the placeholder excluded. */
function optionValues(canvasElement: HTMLElement, name: string): string[] {
    const options = canvasElement.querySelectorAll<HTMLOptionElement>(`select[name="${name}"] option`);
    return Array.from(options)
        .map((o) => o.value)
        .filter((v) => v !== '');
}

/** The form's submitted `effectType`, captured on submit. */
function captureSubmittedType(canvasElement: HTMLElement): { effectType: string | null } {
    const seen: { effectType: string | null } = { effectType: null };
    canvasElement.querySelector('form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!(event.target instanceof HTMLFormElement)) return;
        const value = new FormData(event.target).get('effectType');
        seen.effectType = typeof value === 'string' ? value : null;
    });
    return seen;
}

/**
 * The condition picker renders one selectable row per catalog condition, with
 * the condition document's image (an image path, not an icon-font class). A row
 * click dispatches `selectCondition` with its id — the handler writes it into
 * the hidden `conditionId` field and submits.
 */
export const ConditionTab: Story = {
    play: async ({ canvasElement }) => {
        const rows = Array.from(canvasElement.querySelectorAll('[data-action="selectCondition"]'));
        await expect(rows.map((row) => row.getAttribute('data-condition-id'))).toEqual(['fatigued', 'pinned', 'stunned']);
        await expect(rows.map((row) => row.querySelector('img')?.getAttribute('src'))).toEqual([
            'icons/svg/sleep.svg',
            'icons/svg/net.svg',
            'icons/svg/daze.svg',
        ]);
        await expect(canvasElement.querySelector('input[name="conditionId"]')).not.toBeNull();
        const clicks = captureActionClicks(canvasElement);
        (rows[1] as HTMLElement | undefined)?.click();
        await expect(clicks).toEqual([{ action: 'selectCondition', dataset: { conditionId: 'pinned' } }]);
    },
};

/** Characteristic: the picker submits the characteristic id, a modifier in steps of 5 and a duration. */
export const CharacteristicTab: Story = {
    args: { selectedCategory: 'characteristic' },
    play: async ({ canvasElement }) => {
        await expect(optionValues(canvasElement, 'characteristic')).toEqual(['weaponSkill', 'ballisticSkill', 'strength']);
        await expect(canvasElement.querySelector('input[name="modifierValue"]')?.getAttribute('step')).toBe('5');
        await expect(canvasElement.querySelector('[data-category="characteristic"]')?.getAttribute('data-active')).toBe('true');
        const submitted = captureSubmittedType(canvasElement);
        submitForm(canvasElement, { 'characteristic': 'strength', 'modifierValue': 10, 'duration.rounds': 3 });
        await expect(submitted.effectType).toBe('characteristic');
        await expect(canvasElement.querySelector<HTMLSelectElement>('select[name="characteristic"]')?.value).toBe('strength');
    },
};

/** Skill: the common-skill picker submits the skill id. */
export const SkillTab: Story = {
    args: { selectedCategory: 'skill' },
    play: async ({ canvasElement }) => {
        await expect(optionValues(canvasElement, 'skill')).toEqual(['dodge', 'awareness']);
        const submitted = captureSubmittedType(canvasElement);
        submitForm(canvasElement, { skill: 'dodge', modifierValue: -10 });
        await expect(submitted.effectType).toBe('skill');
    },
};

/** Combat: the combat-stat picker submits the stat id. */
export const CombatTab: Story = {
    args: { selectedCategory: 'combat' },
    play: async ({ canvasElement }) => {
        await expect(optionValues(canvasElement, 'combatType')).toEqual(['attack', 'damage', 'initiative']);
        const submitted = captureSubmittedType(canvasElement);
        submitForm(canvasElement, { combatType: 'initiative', modifierValue: 5 });
        await expect(submitted.effectType).toBe('combat');
    },
};

/** Custom: a required name and no picker. */
export const CustomTab: Story = {
    args: { selectedCategory: 'custom' },
    play: async ({ canvasElement }) => {
        const name = canvasElement.querySelector<HTMLInputElement>('input[name="customName"]');
        await expect(name?.required).toBe(true);
        await expect(canvasElement.querySelector('select')).toBeNull();
        const submitted = captureSubmittedType(canvasElement);
        submitForm(canvasElement, { customName: 'Sanctified Aura' });
        await expect(submitted.effectType).toBe('custom');
    },
};

/**
 * The five category tabs render with `data-action="selectCategory"` and the
 * matching `data-category`; exactly one is active. The runtime sheet routes the
 * click into Foundry's static-actions resolver.
 */
export const CategoryTabsDispatch: Story = {
    play: async ({ canvasElement }) => {
        // The template is the content of the window's own form: no nested form.
        await expect(canvasElement.querySelectorAll('form').length).toBe(1);
        const tabs = canvasElement.querySelectorAll('[data-action="selectCategory"]');
        await expect(tabs.length).toBe(5);
        const categories = Array.from(tabs).map((b) => b.getAttribute('data-category'));
        await expect(categories).toEqual(['condition', 'characteristic', 'skill', 'combat', 'custom']);
        await expect(Array.from(tabs).filter((b) => b.getAttribute('data-active') === 'true').length).toBe(1);
        const clicks = captureActionClicks(canvasElement);
        clickAction(canvasElement, 'selectCategory');
        await expect(clicks[0]?.dataset['category']).toBe('condition');
    },
};
