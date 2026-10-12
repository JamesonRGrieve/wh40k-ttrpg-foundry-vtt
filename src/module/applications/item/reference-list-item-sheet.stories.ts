/**
 * Stories for the UUID-reference list that ReferenceListItemSheet edits (#597):
 * the `reference-list.hbs` partial in each state. The full sheets that embed it
 * (mutation Gift panel, special-ability Distinction panel) have their own
 * stories; these pin the partial's contract — remove-button addressing, the
 * drop-zone data attributes `_onDrop` reads, and the read-only empty state.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, userEvent } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/partial/reference-list.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';
import { buildReferenceList, type ReferenceListContext } from './reference-list-edits.ts';

interface ReferenceListArgs {
    ref: ReferenceListContext;
    inEditMode: boolean;
}

const names: Record<string, string> = {
    'Compendium.wh40k-rpg.bc-traits.Item.frenzy': 'Frenzy',
    'Compendium.wh40k-rpg.bc-traits.Item.fear': 'Fear (2)',
};

type StoredReference = { mode: 'list'; stored: string[] } | { mode: 'single'; stored: string };

const refArgs = (inEditMode: boolean, reference: StoredReference): ReferenceListArgs => ({
    inEditMode,
    ref: buildReferenceList({
        ...reference,
        path: reference.mode === 'list' ? 'system.gift.grants' : 'system.grant.trait',
        accept: reference.mode === 'list' ? 'trait,talent' : 'trait',
        resolveName: (uuid) => names[uuid] ?? uuid,
        emptyKey: 'WH40K.ItemSheet.Gift.NoGrants',
        dropKey: 'WH40K.ItemSheet.Gift.DropGrant',
    }),
});

const populated = ['Compendium.wh40k-rpg.bc-traits.Item.frenzy', 'Compendium.wh40k-rpg.bc-traits.Item.fear'];

const meta = {
    title: 'Item Sheets/Partials/ReferenceList',
    render: (args) => renderSheet(templateSrc, args),
    args: refArgs(false, { mode: 'list', stored: populated }),
} satisfies Meta<ReferenceListArgs>;
export default meta;

type Story = StoryObj<ReferenceListArgs>;

/** Read-only list: names render as openable links; no remove buttons, no drop zone. */
export const ListReadOnly: Story = {
    args: refArgs(false, { mode: 'list', stored: populated }),
    play: async ({ canvasElement }) => {
        const views = canvasElement.querySelectorAll<HTMLElement>('[data-action="viewReference"]');
        await expect(Array.from(views).map((v) => v.dataset['uuid'])).toEqual(populated);
        await expect(canvasElement.textContent).toContain('Fear (2)');
        await expect(canvasElement.querySelector('[data-action="removeEntry"]')).toBeNull();
        await expect(canvasElement.querySelector('[data-drop-zone="reference"]')).toBeNull();
    },
};

/** Read-only, nothing referenced: the empty message shows. */
export const ListEmptyReadOnly: Story = {
    args: refArgs(false, { mode: 'list', stored: [] }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.textContent).toContain('Grants nothing');
    },
};

/** Edit mode, empty: no empty message, only the drop zone. */
export const ListEmptyEditMode: Story = {
    args: refArgs(true, { mode: 'list', stored: [] }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.textContent).not.toContain('Grants nothing');
        await expect(canvasElement.textContent).toContain('Drop a trait or talent here');
    },
};

/** Edit mode list: each remove button carries the list path and its index; the drop zone carries path, mode and accept list. */
export const ListEditMode: Story = {
    args: refArgs(true, { mode: 'list', stored: populated }),
    play: async ({ canvasElement }) => {
        const removes = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-action="removeEntry"]'));
        await expect(removes.map((b) => b.dataset['index'])).toEqual(['0', '1']);
        await expect(removes.every((b) => b.dataset['path'] === 'system.gift.grants')).toBe(true);
        const zone = canvasElement.querySelector<HTMLElement>('[data-drop-zone="reference"]');
        await expect(zone?.dataset).toMatchObject({ referencePath: 'system.gift.grants', referenceMode: 'list', referenceAccept: 'trait,talent' });

        // Remove buttons are real, focusable buttons with an accessible name.
        await expect(removes.map((button) => [button.tagName, button.getAttribute('aria-label')])).toEqual([
            ['BUTTON', 'Remove'],
            ['BUTTON', 'Remove'],
        ]);
        const first = removes.at(0);
        await expect(first).toBeDefined();
        first?.focus();
        await expect(document.activeElement).toBe(first);
        await userEvent.keyboard('{Tab}');
        // Tab moves from the first remove button to the next focusable control: the second reference link.
        await expect(document.activeElement?.getAttribute('data-uuid')).toBe('Compendium.wh40k-rpg.bc-traits.Item.fear');
    },
};

/** Edit mode single reference: the clear button has no index, so the sheet clears the value instead of splicing a list. */
export const SingleEditMode: Story = {
    args: refArgs(true, { mode: 'single', stored: 'Compendium.wh40k-rpg.bc-traits.Item.frenzy' }),
    play: async ({ canvasElement }) => {
        const clear = canvasElement.querySelector<HTMLElement>('[data-action="removeEntry"]');
        await expect(clear?.dataset['path']).toBe('system.grant.trait');
        await expect(clear?.dataset['index']).toBeUndefined();
        await expect(canvasElement.querySelector<HTMLElement>('[data-drop-zone="reference"]')?.dataset['referenceMode']).toBe('single');
    },
};
