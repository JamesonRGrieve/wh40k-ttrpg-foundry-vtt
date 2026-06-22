/**
 * Stories for InventoryGeneratorDialog — the GM popup that stocks an NPC /
 * vendor / armoury from the compendium. Covers the Generate tab, the Browse
 * tab, the staging list, the empty-pool state, and a per-system (Imperium
 * Maledictum) variant so the `<id>:tw-*` theme variants are exercised.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/dialogs/inventory-generator-dialog.hbs?raw';
import { seedRandom, randomId, type SystemId } from '../../../../stories/mocks/extended';
import { clickAction, renderSheet } from '../../../../stories/test-helpers';

const rng = seedRandom(0x1_9e_70);

interface Row {
    uuid: string;
    name: string;
    type: string;
    img: string;
    availability: string;
}

interface Args {
    gameSystem: string;
    actorName: string;
    poolEmpty: boolean;
    onGenerateTab: boolean;
    onBrowseTab: boolean;
    profile: string;
    profiles: string[];
    count: number;
    browseSearch: string;
    browseRows: Row[];
    browseTruncated: boolean;
    staged: Row[];
    stagedCount: number;
}

function row(name: string, type: string, availability: string): Row {
    return { uuid: `Compendium.wh40k-rpg.demo.Item.${randomId('inv', rng)}`, name, type, img: 'icons/svg/item-bag.svg', availability };
}

const STAGED: Row[] = [row('Lasgun', 'weapon', 'common'), row('Flak Armour', 'armour', 'average'), row('Stimm', 'gear', 'scarce')];

const meta = {
    title: 'Dialogs/InventoryGeneratorDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        gameSystem: 'dh2',
        actorName: 'Hive Quartermaster',
        poolEmpty: false,
        onGenerateTab: true,
        onBrowseTab: false,
        profile: '',
        profiles: ['hive-market', 'imperial-armoury', 'xenos-contraband'],
        count: 6,
        browseSearch: '',
        browseRows: [],
        browseTruncated: false,
        staged: STAGED,
        stagedCount: STAGED.length,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Generate: Story = {
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText(/Stock Hive Quartermaster/)).toBeTruthy();
        await expect(scope.getByText('Lasgun')).toBeTruthy();
        // Action handles must exist for the real dialog to wire them up.
        clickAction(canvasElement, 'generate');
        clickAction(canvasElement, 'reroll');
        clickAction(canvasElement, 'apply');
    },
};

export const Browse: Story = {
    args: {
        onGenerateTab: false,
        onBrowseTab: true,
        browseRows: [row('Bolt Pistol', 'weapon', 'rare'), row('Carapace Armour', 'armour', 'scarce'), row('Medikit', 'gear', 'common')],
        browseTruncated: true,
    },
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('Bolt Pistol')).toBeTruthy();
        clickAction(canvasElement, 'stage');
        clickAction(canvasElement, 'unstage');
    },
};

export const EmptyStaging: Story = {
    args: { staged: [], stagedCount: 0 },
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText(/Nothing staged yet/)).toBeTruthy();
    },
};

export const PoolEmpty: Story = {
    args: { poolEmpty: true },
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText(/No compendium items are available/)).toBeTruthy();
    },
};

export const ImperiumMaledictumVariant: Story = {
    name: 'Per-system — Imperium Maledictum',
    args: { gameSystem: 'im', actorName: 'Maledictum Fixer' },
};

// ── Per-system homologation ───────────────────────────────────────────────────
//
// The dialog root carries `data-wh40k-system="{{gameSystem}}"`, gating the
// `<id>:tw-text-*` / `<id>:tw-border-*` variants on the title and the active
// tab indicator. The IM variant above is kept verbatim; these cover the other
// six lines so the seven palettes all stay under visual review (CLAUDE.md
// "Per-system homologation in stories"). Only `gameSystem` (and a flavoured
// quartermaster name) differs per line — the staged pool is reused unchanged.

const SYSTEM_QUARTERMASTER: Record<SystemId, string> = {
    dh2: 'Hive Quartermaster',
    dh1: 'Calixis Provisioner',
    rt: 'Voidship Seneschal',
    bc: 'Warband Reaver',
    ow: 'Regimental Quartermaster',
    dw: 'Fortress Armourer',
    im: 'Maledictum Fixer',
};

function perSystemStory(systemId: SystemId): Story {
    return {
        name: `Per-system — ${systemId.toUpperCase()}`,
        args: { gameSystem: systemId, actorName: SYSTEM_QUARTERMASTER[systemId] },
        play: async ({ canvasElement }) => {
            // The dialog root must surface the active system so the variants cascade.
            const root = canvasElement.querySelector<HTMLElement>(`[data-wh40k-system="${systemId}"]`);
            await expect(root).not.toBeNull();
        },
    };
}

// IM is the existing `ImperiumMaledictumVariant`; these add the other six lines.
export const SystemDH2 = perSystemStory('dh2');
export const SystemDH1 = perSystemStory('dh1');
export const SystemRT = perSystemStory('rt');
export const SystemBC = perSystemStory('bc');
export const SystemOW = perSystemStory('ow');
export const SystemDW = perSystemStory('dw');
