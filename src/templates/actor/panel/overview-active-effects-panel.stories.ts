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
import { buildEffectView, type EffectView, type EffectViewSource } from '../../../module/helpers/effects';
import panelSrc from './overview-active-effects-panel.hbs?raw';

type EffectChip = EffectView<EffectViewSource>;

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

/** An ActiveEffect as the sheet reads it, mapped through the sheet's own view builder. */
function chip(id: string, name: string, img: string, disabled: boolean): EffectChip {
    return buildEffectView({ id, name, img, disabled, sourceName: '', remainingLabel: null, isExpiring: false }, []);
}

const EFFECTS: EffectChip[] = [chip('e1', 'Stunned', 'icons/svg/daze.svg', false), chip('e2', 'Blessed +10', 'icons/svg/upgrade.svg', true)];

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
        // Every chip carries its effect's name and icon (the Combat tab's chips had neither).
        const chips = [...canvasElement.querySelectorAll<HTMLElement>('div[data-effect-id]')];
        await expect(chips.map((c) => c.querySelector('span')?.textContent)).toEqual(['Stunned', 'Blessed +10']);
        await expect(chips.map((c) => c.querySelector('img')?.getAttribute('src'))).toEqual(['icons/svg/daze.svg', 'icons/svg/upgrade.svg']);
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

/** A name wider than the whole panel, which alone may be cut short. */
const OVERLONG_NAME = 'Litany of the Unbroken Aegis of Saint Drusus the Unyielding Warden';

/**
 * Chip names show whole when the row has room ("Quarantine World" was cut at a fixed
 * 80 px with the row empty); only a name wider than the panel is ellipsised, inside it,
 * and keeps its toggle and delete controls.
 */
export const LongNamesShowWhole: Story = {
    args: {
        effects: [chip('e1', 'Quarantine World', 'icons/svg/aura.svg', false), chip('e2', OVERLONG_NAME, 'icons/svg/upgrade.svg', false)],
        gameSystem: 'dh2',
    },
    render: (args) => {
        const el = renderPanel(args);
        el.style.width = '360px';
        return el;
    },
    play: async ({ canvasElement }) => {
        const names = [...canvasElement.querySelectorAll<HTMLElement>('[data-wh40k-hook="effect-chip-name"]')];
        const whole = names.at(0);
        const overlong = names.at(1);
        await expect(whole?.textContent).toBe('Quarantine World');
        await expect((whole?.scrollWidth ?? 0) <= (whole?.clientWidth ?? 0)).toBe(true);
        await expect((overlong?.scrollWidth ?? 0) > (overlong?.clientWidth ?? 0)).toBe(true);
        const panelRight = canvasElement.getBoundingClientRect().left + 360;
        const chipEl = overlong?.closest<HTMLElement>('[data-effect-id]');
        await expect((chipEl?.getBoundingClientRect().right ?? Infinity) <= panelRight).toBe(true);
        await expect(chipEl?.querySelectorAll('[data-action="toggleEffect"], [data-action="deleteEffect"]').length).toBe(2);
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
