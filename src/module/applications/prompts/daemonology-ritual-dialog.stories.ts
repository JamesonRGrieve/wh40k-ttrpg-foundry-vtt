/**
 * Daemonology ritual dialog (#83 — DH2 Enemies Beyond p. 71): the Exorcism
 * form the Daemonology panel opens. Context mirrors
 * `DaemonologyRitualDialog._prepareContext`; the Table 2–21 rows come from the
 * real `EXORCISM_MODIFIERS` table, and the play function reads the rendered
 * form back through the real `parseExorcismForm`, so the form's field names and
 * the parser cannot drift apart.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/daemonology-ritual-dialog.hbs?raw';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import { parseExorcismForm } from '../../actions/daemonology-actions.ts';
import { EXORCISM_MODIFIER_ORDER, EXORCISM_MODIFIERS } from '../../rules/exorcism.ts';

initializeStoryHandlebars();

interface Args {
    hostName: string | null;
    selfExorcism: boolean;
    possessedCorruptionBonus: number;
}

function render(args: Args): HTMLElement {
    const form = document.createElement('form');
    form.classList.add('wh40k-rpg');
    form.dataset['wh40kSystem'] = 'dh2';
    form.appendChild(
        renderSheet(templateSrc, {
            actorName: 'Interrogator Vael',
            loreTotal: 52,
            willpowerTotal: 48,
            fatigueValue: 1,
            fatigueMax: 4,
            hostName: args.hostName,
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
        }),
    );
    return form;
}

const meta = {
    title: 'Dialogs/DaemonologyRitualDialog',
    render,
    args: { hostName: 'Brother Ostrava', selfExorcism: false, possessedCorruptionBonus: 3 },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;

export const HostTargeted: Story = {
    play: async ({ canvasElement }) => {
        const form = canvasElement.querySelector('form');
        await expect(form).not.toBeNull();
        if (form === null) return;
        // Every Table 2–21 row renders once.
        await expect(form.querySelectorAll('input[name="modifiers"]').length).toBe(EXORCISM_MODIFIER_ORDER.length);
        await expect(canvasElement.querySelector('[data-wh40k-hook="daemonology-host"]')?.textContent).toContain('Brother Ostrava');

        // Tick sacred ground, fill the threshold and a GM row; the real parser reads it back.
        const sacred = form.querySelector<HTMLInputElement>('input[name="modifiers"][value="SACRED_GROUND"]');
        sacred?.click();
        const wpb = form.querySelector<HTMLInputElement>('input[name="daemonWillpowerBonus"]');
        if (wpb !== null) wpb.value = '6';
        const label = form.querySelector<HTMLInputElement>('input[name="circumstanceLabel"]');
        if (label !== null) label.value = 'Holy relic';
        const value = form.querySelector<HTMLInputElement>('input[name="circumstanceValue"]');
        if (value !== null) value.value = '10';
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

export const NoHost: Story = {
    args: { hostName: null, possessedCorruptionBonus: 0 },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="daemonology-host"] .tw-italic')).not.toBeNull();
    },
};

export const SelfExorcism: Story = {
    args: { hostName: 'Interrogator Vael', selfExorcism: true },
    play: async ({ canvasElement }) => {
        const selfRow = canvasElement.querySelector<HTMLInputElement>('input[name="modifiers"][value="SELF_EXORCISM"]');
        await expect(selfRow?.checked).toBe(true);
    },
};
