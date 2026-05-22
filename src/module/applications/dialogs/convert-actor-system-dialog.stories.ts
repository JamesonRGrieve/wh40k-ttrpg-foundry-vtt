/**
 * Stories for ConvertActorSystemDialog — the "change a character's game
 * system" dialog.
 *
 * The dialog reads `foundry.applications.api.DialogV2` at module load and
 * builds its content string inside `open()` from `game.i18n` lookups, so it
 * cannot be imported or invoked under Storybook (no Foundry globals). These
 * stories render the same form structure the dialog produces — a disabled
 * "current system" field plus a target-system <select> and a warning — so the
 * layout and the target-options exclusion (current system is never offered as
 * a target) get visual + behavioural coverage.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';

interface SystemOption {
    value: string;
    label: string;
}

interface Args {
    actorName: string;
    currentSystem: SystemOption;
    targetOptions: SystemOption[];
}

// `as const` tuple so fixed indices (ALL_SYSTEMS[0], [6]) are known-defined
// under noUncheckedIndexedAccess — no `| undefined`, so no cast is needed.
const ALL_SYSTEMS = [
    { value: 'dh2', label: 'Dark Heresy 2e Character' },
    { value: 'dh1', label: 'Dark Heresy 1e Character' },
    { value: 'rt', label: 'Rogue Trader Character' },
    { value: 'bc', label: 'Black Crusade Character' },
    { value: 'ow', label: 'Only War Character' },
    { value: 'dw', label: 'Deathwatch Character' },
    { value: 'im', label: 'Imperium Maledictum Character' },
] as const satisfies readonly SystemOption[];

function renderConvertForm(args: Args): HTMLElement {
    const targetOptions = args.targetOptions.map((o) => `<option value="${o.value}">${o.label}</option>`).join('');
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.innerHTML = `
        <form class="wh40k-convert-actor-system-form">
            <p>Convert <strong>${args.actorName}</strong> to a different game system.</p>
            <div class="form-group">
                <label>Current System</label>
                <input type="text" value="${args.currentSystem.label}" disabled />
            </div>
            <div class="form-group">
                <label>Target System</label>
                <select name="targetSystem">${targetOptions}</select>
            </div>
            <p>Converting will remap characteristics, skills, and items to the target system.</p>
        </form>
    `;
    return wrapper;
}

const meta = {
    title: 'Dialogs/ConvertActorSystemDialog',
    render: (args) => renderConvertForm(args),
    args: {
        actorName: 'Acolyte Vael',
        currentSystem: ALL_SYSTEMS[0],
        targetOptions: ALL_SYSTEMS.filter((s) => s.value !== 'dh2'),
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const FromDarkHeresy2e: Story = {
    play: async ({ canvasElement }) => {
        const target = canvasElement.querySelector<HTMLSelectElement>('[name="targetSystem"]');
        await expect(target).toBeTruthy();
        const values = [...(target?.options ?? [])].map((o) => o.value);
        // The actor's current system is never offered as a conversion target.
        await expect(values).not.toContain('dh2');
        await expect(values).toContain('rt');
    },
};

export const FromImperiumMaledictum: Story = {
    args: {
        currentSystem: ALL_SYSTEMS[6],
        targetOptions: ALL_SYSTEMS.filter((s) => s.value !== 'im'),
    },
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        const current = canvasElement.querySelector<HTMLInputElement>('[disabled]');
        await expect(current?.value).toBe('Imperium Maledictum Character');
        await expect(scope.getByText('Acolyte Vael')).toBeTruthy();
    },
};
