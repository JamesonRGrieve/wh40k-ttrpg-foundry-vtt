/**
 * Stories for WeaponSheet.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { mockWeaponSheetContext } from '../../../../stories/mocks';
import type { SystemId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../templates/item/item-weapon-sheet.hbs?raw';

initializeStoryHandlebars();

interface Args {
    overrides?: Parameters<typeof mockWeaponSheetContext>[0];
}

/**
 * Render the weapon sheet (body expanded so the per-system mod/effect count
 * badges render) and stamp the active game-system id. The weapon template gates
 * those badges per game line (`bc:tw-bg-crimson-light … im:tw-bg-failure`), and
 * those variants only fire under a `data-wh40k-system="<id>"` ancestor.
 */
function renderForSystem(systemId: SystemId): HTMLElement {
    const el = renderSheet(templateSrc, mockWeaponSheetContext({ bodyCollapsed: false }));
    el.dataset['wh40kSystem'] = systemId;
    return el;
}

const meta = {
    title: 'Item Sheets/WeaponSheet',
    render: (args: Args) => renderSheet(templateSrc, mockWeaponSheetContext(args.overrides)),
    args: {},
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const BodyExpanded: Story = {
    args: {
        overrides: { bodyCollapsed: false },
    },
};

export const EditMode: Story = {
    args: {
        overrides: { inEditMode: true, bodyCollapsed: false },
    },
};

export const NoAmmoLoaded: Story = {
    args: {
        overrides: {
            hasLoadedAmmo: false,
            loadedAmmoData: { modifiers: { damage: 0, penetration: 0 }, addedQualities: [] },
        },
    },
};

export const RendersWeaponName: Story = {
    play: async ({ canvasElement }) => {
        const withinCanvas = within(canvasElement);
        await expect(withinCanvas.getByDisplayValue('Godwyn-Deaz Boltgun')).toBeTruthy();
    },
};

export const ActivatablePowered: Story = {
    args: {
        overrides: { system: { activation: { activatable: true }, state: { activated: true } } },
    },
    play: async ({ canvasElement }) => {
        const btn = canvasElement.querySelector('[data-action="toggleActivation"]');
        await expect(btn).toBeTruthy();
        await expect(btn?.textContent).toContain('Powered');
    },
};

export const ActivatableDeactivated: Story = {
    args: {
        overrides: { system: { activation: { activatable: true }, state: { activated: false } } },
    },
    play: async ({ canvasElement }) => {
        const btn = canvasElement.querySelector('[data-action="toggleActivation"]');
        await expect(btn).toBeTruthy();
        await expect(btn?.textContent).toContain('Deactivated');
    },
};

export const NotActivatableHasNoToggle: Story = {
    play: async ({ canvasElement }) => {
        // The default mock weapon is not activatable → no powered/deactivated toggle.
        await expect(canvasElement.querySelector('[data-action="toggleActivation"]')).toBeNull();
    },
};

export const WithFiringModes: Story = {
    args: {
        overrides: {
            system: {
                modes: [
                    { label: 'Focused', damage: '', damageBonus: null, penetration: null, range: null, addedQualities: [], removedQualities: [] },
                    {
                        label: 'Broad',
                        damage: '2d10',
                        damageBonus: 4,
                        penetration: 11,
                        range: 10,
                        addedQualities: ['scatter'],
                        removedQualities: ['overheats'],
                    },
                ],
                activeMode: 1,
            },
        },
    },
    play: async ({ canvasElement }) => {
        const select = canvasElement.querySelector<HTMLSelectElement>('select[name="system.activeMode"]');
        await expect(select).toBeTruthy();
        const options = select?.querySelectorAll('option') ?? [];
        await expect(options.length).toBe(2);
        await expect(options[0]?.textContent).toContain('Focused');
        await expect(options[1]?.textContent).toContain('Broad');
        // activeMode = 1 → the Broad option is pre-selected.
        await expect((options[1] as HTMLOptionElement | undefined)?.selected).toBe(true);
    },
};

export const NoFiringModeSelectorWhenSingleProfile: Story = {
    play: async ({ canvasElement }) => {
        // A weapon with no authored modes shows no firing-mode selector (single profile).
        await expect(canvasElement.querySelector('select[name="system.activeMode"]')).toBeNull();
    },
};

export const RendersToggleBodyAction: Story = {
    play: async ({ canvasElement }) => {
        const btn = canvasElement.querySelector('[data-action="toggleBody"]');
        await expect(btn).toBeTruthy();
        // Dispatch click — verifies event wires without Foundry runtime
        btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    },
};

// ── Per-system homologation (dh2 / dh1 / rt / bc / ow / dw / im) ──────────────
//
// One story per game line — the weapon sheet is rendered under each system's
// `data-wh40k-system` id so the template's per-system count-badge variants
// activate and visual review catches a DH2-only assumption.

export const HomologationDH2: Story = {
    render: () => renderForSystem('dh2'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="dh2"]')).toBeTruthy();
    },
};

export const HomologationDH1: Story = {
    render: () => renderForSystem('dh1'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="dh1"]')).toBeTruthy();
    },
};

export const HomologationRT: Story = {
    render: () => renderForSystem('rt'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="rt"]')).toBeTruthy();
    },
};

export const HomologationBC: Story = {
    render: () => renderForSystem('bc'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="bc"]')).toBeTruthy();
    },
};

export const HomologationOW: Story = {
    render: () => renderForSystem('ow'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="ow"]')).toBeTruthy();
    },
};

export const HomologationDW: Story = {
    render: () => renderForSystem('dw'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="dw"]')).toBeTruthy();
    },
};

export const HomologationIM: Story = {
    render: () => renderForSystem('im'),
    play: async ({ canvasElement }) => {
        // Weapon name still renders under the IM identity, and the id is stamped.
        const withinCanvas = within(canvasElement);
        await expect(withinCanvas.getByDisplayValue('Godwyn-Deaz Boltgun')).toBeTruthy();
        await expect(canvasElement.querySelector('[data-wh40k-system="im"]')).toBeTruthy();
    },
};
