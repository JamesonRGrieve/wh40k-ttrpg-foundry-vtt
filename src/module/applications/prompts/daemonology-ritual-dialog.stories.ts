/**
 * Daemonology ritual dialog (DH2): the Exorcism (#83)
 * and Summoning (#80) forms the Daemonology panel opens. Context
 * mirrors `DaemonologyRitualDialog._prepareContext`; the exorcism modifier rows come
 * from the real `EXORCISM_MODIFIERS` table, and the play functions read the
 * rendered form back through the real `parseExorcismForm` /
 * `parseSummoningForm`, so the form's field names and the parsers cannot drift.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/daemonology-ritual-dialog.hbs?raw';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import { parseExorcismForm, parseSummoningForm } from '../../actions/daemonology-actions.ts';
import { EXORCISM_MODIFIER_ORDER, EXORCISM_MODIFIERS } from '../../rules/exorcism.ts';

initializeStoryHandlebars();

interface Args {
    mode: 'exorcism' | 'summoning';
    targetName: string | null;
    selfExorcism: boolean;
    possessedCorruptionBonus: number;
    daemonWillpower: number;
}

function render(args: Args): HTMLElement {
    const form = document.createElement('form');
    form.classList.add('wh40k-rpg');
    form.dataset['wh40kSystem'] = 'dh2';
    form.appendChild(
        renderSheet(templateSrc, {
            isExorcism: args.mode === 'exorcism',
            performLabelKey: args.mode === 'exorcism' ? 'WH40K.Daemonology.Exorcism.Perform' : 'WH40K.Daemonology.Summoning.Perform',
            actorName: 'Interrogator Vael',
            loreTotal: 52,
            willpowerTotal: 48,
            fatigueValue: 1,
            fatigueMax: 4,
            targetName: args.targetName,
            modifiers: EXORCISM_MODIFIER_ORDER.map((id) => {
                const value = EXORCISM_MODIFIERS[id].modifier;
                return {
                    id,
                    labelKey: EXORCISM_MODIFIERS[id].labelKey,
                    signed: value > 0 ? `+${value}` : String(value),
                    checked: args.selfExorcism && id === 'SELF_EXORCISM',
                };
            }),
            daemonWillpowerBonus: 0,
            possessedCorruptionBonus: args.possessedCorruptionBonus,
            daemonWillpower: args.daemonWillpower,
        }),
    );
    return form;
}

function setValue(form: HTMLFormElement, name: string, value: string): void {
    const input = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (input !== null) input.value = value;
}

const meta = {
    title: 'Dialogs/DaemonologyRitualDialog',
    render,
    args: { mode: 'exorcism', targetName: 'Brother Ostrava', selfExorcism: false, possessedCorruptionBonus: 3, daemonWillpower: 0 },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;

export const ExorcismHostTargeted: Story = {
    play: async ({ canvasElement }) => {
        const form = canvasElement.querySelector('form');
        await expect(form).not.toBeNull();
        if (form === null) return;
        // Every exorcism modifier row renders once.
        await expect(form.querySelectorAll('input[name="modifiers"]').length).toBe(EXORCISM_MODIFIER_ORDER.length);
        await expect(canvasElement.querySelector('[data-wh40k-hook="daemonology-target"]')?.textContent).toContain('Brother Ostrava');

        // Tick sacred ground, fill the threshold and a GM row; the real parser reads it back.
        form.querySelector<HTMLInputElement>('input[name="modifiers"][value="SACRED_GROUND"]')?.click();
        setValue(form, 'daemonWillpowerBonus', '6');
        setValue(form, 'circumstanceLabel', 'Holy relic');
        setValue(form, 'circumstanceValue', '10');
        await expect(parseExorcismForm(new FormData(form))).toEqual({
            modifiers: ['SACRED_GROUND'],
            daemonWillpowerBonus: 6,
            possessedCorruptionBonus: 3,
            circumstanceLabel: 'Holy relic',
            circumstanceValue: 10,
        });
        await expect(form.querySelector('[data-action="perform"]')).not.toBeNull();
    },
};

export const ExorcismNoHost: Story = {
    args: { targetName: null, possessedCorruptionBonus: 0 },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="daemonology-target"] .tw-italic')).not.toBeNull();
    },
};

export const SelfExorcism: Story = {
    args: { targetName: 'Interrogator Vael', selfExorcism: true },
    play: async ({ canvasElement }) => {
        const selfRow = canvasElement.querySelector<HTMLInputElement>('input[name="modifiers"][value="SELF_EXORCISM"]');
        await expect(selfRow?.checked).toBe(true);
    },
};

export const Summoning: Story = {
    args: { mode: 'summoning', targetName: 'Ka’zhar the Unbidden', daemonWillpower: 47 },
    play: async ({ canvasElement }) => {
        const form = canvasElement.querySelector('form');
        await expect(form).not.toBeNull();
        if (form === null) return;
        // The Exorcism table is not offered on a summoning.
        await expect(form.querySelectorAll('input[name="modifiers"]').length).toBe(0);
        form.querySelector<HTMLInputElement>('input[name="hasTrueName"]')?.click();
        setValue(form, 'loreCircumstanceLabel', 'Summoning power');
        setValue(form, 'loreCircumstanceValue', '30');
        await expect(parseSummoningForm(new FormData(form))).toEqual({
            hasTrueName: true,
            servesPatron: false,
            daemonWillpower: 47,
            daemonWillpowerBonus: 4,
            loreCircumstanceLabel: 'Summoning power',
            loreCircumstanceValue: 30,
            masteryCircumstanceLabel: '',
            masteryCircumstanceValue: 0,
        });
    },
};

export const SummoningNoDaemon: Story = {
    args: { mode: 'summoning', targetName: null, daemonWillpower: 0 },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="daemonology-target"] .tw-italic')).not.toBeNull();
    },
};
