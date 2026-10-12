/**
 * Overview Active Effects panel — the actor's effect chips plus the
 * "Create Effect" control, which the character sheet's `createEffect` action
 * answers by opening the effect-creation dialog (condition / characteristic /
 * skill / combat / custom) rather than dropping a blank effect on the actor.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import type { SystemId } from '../../../../stories/mocks/extended';
import { clickAction, renderSheet } from '../../../../stories/test-helpers';
import panelSrc from './overview-active-effects-panel.hbs?raw';

interface EffectChip {
    id: string;
    name: string;
    icon: string;
    disabled: boolean;
}

interface PanelCtx {
    effects: EffectChip[];
    gameSystem: SystemId;
}

const meta: Meta<PanelCtx> = { title: 'Actor / Panels / Overview Active Effects' };
export default meta;
type Story = StoryObj<PanelCtx>;

function renderPanel(ctx: PanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = ctx.gameSystem;
    wrapper.appendChild(renderSheet(panelSrc, ctx));
    return wrapper;
}

const EFFECTS: EffectChip[] = [
    { id: 'e1', name: 'Stunned', icon: 'icons/svg/daze.svg', disabled: false },
    { id: 'e2', name: 'Blessed +10', icon: 'icons/svg/upgrade.svg', disabled: true },
];

/** The create control dispatches `createEffect`, the action that opens the dialog. */
function assertCreateControl(canvasElement: HTMLElement): void {
    let fired = 0;
    canvasElement.addEventListener('click', (event) => {
        if (event.target instanceof Element && event.target.closest('[data-action="createEffect"]') !== null) fired += 1;
    });
    clickAction(canvasElement, 'createEffect');
    void expect(fired).toBe(1);
}

export const WithEffects: Story = {
    name: 'With effects — chips plus the create control',
    args: { effects: EFFECTS, gameSystem: 'dh2' },
    render: (args) => renderPanel(args),
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('Stunned')).toBeTruthy();
        await expect(canvasElement.querySelectorAll('[data-action="toggleEffect"]').length).toBe(EFFECTS.length);
        await expect(scope.getByText('Create Effect')).toBeTruthy();
        assertCreateControl(canvasElement);
    },
};

export const Empty: Story = {
    name: 'Empty — the create control is still reachable',
    args: { effects: [], gameSystem: 'dh2' },
    render: (args) => renderPanel(args),
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('No active effects')).toBeTruthy();
        assertCreateControl(canvasElement);
    },
};

const SYSTEMS: SystemId[] = ['dh2', 'dh1', 'rt', 'bc', 'ow', 'dw', 'im'];

export const PerSystem: Story = {
    name: 'Per system — the same panel under each line',
    render: () => {
        const root = document.createElement('div');
        for (const gameSystem of SYSTEMS) root.appendChild(renderPanel({ effects: EFFECTS, gameSystem }));
        return root;
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelectorAll('[data-action="createEffect"]').length).toBe(SYSTEMS.length);
    },
};
