/**
 * Black Crusade NPCs opened from a compendium (#628, #629).
 *
 * Every BC NPC sheet crashed with "advances is not iterable": NPCSheet inherited
 * the character's per-system panel table and built the BC Alignment panel, which
 * tallies a ledger only the character DataModel has. NPCSheet now declares its
 * own panels (the DW vehicle panel only), so a BC NPC's context carries no BC
 * Overview panel. These stories compose the whole locked NPC sheet — sidebar
 * header, tab strip and NPC tab — the way a compendium viewer sees it.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { mockNpcSheetContext, type SheetContextLike } from '../../../../stories/mocks/sheet-contexts';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { lockSheetControls, renderSheetParts } from '../../../../stories/test-helpers';
import npcTabSrc from '../../../templates/actor/npc/tab-npc.hbs?raw';
import headerSrc from '../../../templates/actor/player/header-dh.hbs?raw';
import tabsSrc from '../../../templates/actor/player/tabs.hbs?raw';

initializeStoryHandlebars();

/** The BC Overview panels' roots; none may appear on an NPC sheet. */
const BC_OVERVIEW_PANEL_SELECTOR = [
    '.wh40k-bc-alignment-panel',
    '[data-action="recheckBcAlignment"]',
    '.wh40k-bc-psychic-panel',
    '.wh40k-bc-ritual-panel',
    '.wh40k-bc-gifts-panel',
    '.wh40k-bc-supplements-panel',
    '.wh40k-bc-daemon-prince-panel',
].join(', ');

/** A locked BC compendium NPC: a GM viewing an entry they cannot edit. */
function compendiumBcNpc(name: string): SheetContextLike {
    return mockNpcSheetContext({
        systemId: 'bc',
        actorOverrides: { name },
        contextOverrides: { editable: false, inEditMode: false },
    });
}

/** Render the composed NPC sheet and lock it the way Foundry locks a compendium document. */
function renderLockedNpcSheet(ctx: SheetContextLike): HTMLElement {
    const el = renderSheetParts(
        [
            { template: headerSrc, partClass: 'wh40k-sidebar tw-flex tw-min-h-full tw-flex-col tw-bg-[var(--color-bg-secondary,#252525)]' },
            { template: tabsSrc, partClass: 'wh40k-sidebar' },
            { template: npcTabSrc, partClass: 'wh40k-body tw-min-w-0 tw-p-2' },
        ],
        ctx,
        { systemId: 'bc' },
    );
    lockSheetControls(el);
    return el;
}

const meta: Meta<SheetContextLike> = {
    title: 'Actor/NPCSheet/Locked Compendium',
    render: (args) => renderLockedNpcSheet(args),
};
export default meta;
type Story = StoryObj<SheetContextLike>;

/** The sheet renders, with the NPC tab and no BC Overview panel. */
async function expectBcNpcSheet(canvasElement: HTMLElement, name: string): Promise<void> {
    const view = within(canvasElement);
    await expect(view.getByDisplayValue(name)).toBeVisible();
    await expect(view.getByText('GM Tools')).toBeVisible();
    await expect(canvasElement.querySelector(BC_OVERVIEW_PANEL_SELECTOR)).toBeNull();
    // Locked: the name field cannot be edited.
    await expect(view.getByDisplayValue(name)).toBeDisabled();
}

export const AsphodelKrootWarrior: Story = {
    name: 'BC bestiary — Asphodel Kroot Warrior',
    args: compendiumBcNpc('Asphodel Kroot Warrior'),
    play: async ({ canvasElement }) => expectBcNpcSheet(canvasElement, 'Asphodel Kroot Warrior'),
};

export const ChaosSpaceMarine: Story = {
    name: 'BC core — Chaos Space Marine',
    args: compendiumBcNpc('Chaos Space Marine'),
    play: async ({ canvasElement }) => expectBcNpcSheet(canvasElement, 'Chaos Space Marine'),
};
