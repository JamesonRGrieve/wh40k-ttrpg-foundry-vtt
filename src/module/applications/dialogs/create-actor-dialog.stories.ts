/**
 * Stories for WH40KCreateActorDialog — the cascading Create Actor dialog.
 *
 * The dialog builds its content as an HTML string inside `open()` (gated on
 * Foundry's DialogV2 + Actor.create globals, which aren't available under
 * Storybook). These stories therefore render the same form markup the dialog
 * produces, driven by the dialog's own exported maps (the single source of
 * truth for system / kind options), and assert the cascading-availability
 * logic that filters kinds per system.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { ACTOR_KIND_LABELS, ACTOR_SYSTEM_AVAILABILITY, ACTOR_SYSTEM_LABELS } from './create-actor-dialog.ts';

interface Args {
    initialSystem: string;
}

function buildKindOptions(systemId: string, selectedKind: string): string {
    const allowed = ACTOR_SYSTEM_AVAILABILITY[systemId] ?? [];
    return Object.keys(ACTOR_KIND_LABELS)
        .filter((k) => allowed.includes(k))
        .map((k) => `<option value="${k}" ${k === selectedKind ? 'selected' : ''}>${ACTOR_KIND_LABELS[k]}</option>`)
        .join('');
}

function renderCreateActorForm(initialSystem: string): HTMLElement {
    const allowed = ACTOR_SYSTEM_AVAILABILITY[initialSystem] ?? [];
    const initialKind = allowed[0] ?? 'character';
    const systemOptions = Object.keys(ACTOR_SYSTEM_LABELS)
        .map((k) => `<option value="${k}" ${k === initialSystem ? 'selected' : ''}>${ACTOR_SYSTEM_LABELS[k]}</option>`)
        .join('');

    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.innerHTML = `
        <form class="wh40k-create-actor-form" style="display:flex;flex-direction:column;gap:8px;">
            <div class="form-group">
                <label>Game System</label>
                <select name="system" style="width:100%;">${systemOptions}</select>
            </div>
            <div class="form-group">
                <label>Kind</label>
                <select name="kind" style="width:100%;">${buildKindOptions(initialSystem, initialKind)}</select>
            </div>
            <div class="form-group">
                <label>Name</label>
                <input type="text" name="name" placeholder="Unnamed Actor" style="width:100%;" />
            </div>
        </form>
    `;
    return wrapper;
}

const meta = {
    title: 'Dialogs/CreateActorDialog',
    render: (args) => renderCreateActorForm(args.initialSystem),
    args: { initialSystem: 'dh2' },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const DarkHeresy2e: Story = {
    play: async ({ canvasElement }) => {
        const kind = canvasElement.querySelector<HTMLSelectElement>('[name="kind"]');
        await expect(kind).toBeTruthy();
        // DH2 has no Starship kind.
        const values = [...(kind?.options ?? [])].map((o) => o.value);
        await expect(values).not.toContain('starship');
        await expect(values).toContain('character');
    },
};

export const RogueTrader: Story = {
    name: 'Rogue Trader (offers Starship)',
    args: { initialSystem: 'rt' },
    play: async ({ canvasElement }) => {
        const kind = canvasElement.querySelector<HTMLSelectElement>('[name="kind"]');
        const values = [...(kind?.options ?? [])].map((o) => o.value);
        // RT is the only system that can create a Starship actor.
        await expect(values).toContain('starship');
    },
};

export const SystemLabelsPresent: Story = {
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('Dark Heresy 2e')).toBeTruthy();
        await expect(scope.getByText('Imperium Maledictum')).toBeTruthy();
    },
};
