/**
 * Storybook stories for the Black Crusade Gifts of the Gods panel (#180).
 *
 * The context is built the way `CharacterSheet._prepareBcGiftsPanel` builds it
 * — through the real `buildBcGiftsPanel` (and so `resolveGiftForAlignment` /
 * `mergeGiftDeltas` / `pendingGiftRolls`) — over structural fixture Gifts, so a
 * change to those rules shows up here without re-authoring. The panel is
 * rendered through the same `isBC` gate the overview tab uses, so the
 * other-line stories show it is absent off Black Crusade.
 *
 *   - Khorne / Tzeentch — the same Gifts resolved for two alignments.
 *   - Unaligned        — base effects only.
 *   - PendingRoll      — a Gift whose acquisition roll is still to be made.
 *   - Empty            — a BC Heretic with no Gifts.
 *   - OtherLineDh2 / OtherLineDw — the same Gifts on other lines: no panel.
 *
 * Fixtures are structural, not catalogue content (Direction #7); every value
 * is fixed for diff stability.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { mockActor } from '../../../../stories/mocks';
import { withSystem, type SystemId } from '../../../../stories/mocks/extended';
import { localizeKey } from '../../../../stories/mocks/lang-localize';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import { buildBcGiftsPanel, type BcGiftsPanelContext, type GiftPanelItem } from '../../../module/applications/actor/bc-gifts-panel-context';
import type { ChaosAlignment } from '../../../module/config/game-systems/types';
import type { GiftData, GiftRider } from '../../../module/rules/bc-gifts';

initializeStoryHandlebars();

/** The include exactly as `tab-overview.hbs` gates it. */
const GATED_PANEL = '{{#if isBC}}{{> systems/wh40k-rpg/templates/actor/panel/bc-gifts-panel.hbs giftsPanel=giftsPanel}}{{/if}}';

const GRANT_UUID = 'Compendium.wh40k-rpg.story.Item.fixtureTrait01';
/** Story-local stand-in for `uuidNameCache`. */
const GRANT_NAMES: Record<string, string> = { [GRANT_UUID]: 'Fixture Trait' };
const LABELS: Record<string, string> = { strength: 'Strength', toughness: 'Toughness', intelligence: 'Intelligence', awareness: 'Awareness' };

function rider(alignment: GiftRider['alignment'], characteristics: Record<string, number>, grants: string[] = []): GiftRider {
    return { alignment, description: `<p>Rider of the fixture for ${alignment}.</p>`, characteristics, skills: {}, grants, activeEffect: '' };
}

function giftItem(id: string, characteristics: Record<string, number>, gift: Partial<GiftData>, skills: Record<string, number> = {}): GiftPanelItem {
    return {
        id,
        name: `Fixture Gift ${id.toUpperCase()}`,
        img: 'icons/svg/biohazard.svg',
        system: {
            effect: `<p>Base effect of fixture gift <strong>${id}</strong>.</p>`,
            modifiers: { characteristics, skills },
            gift: { grants: [], riders: [], subTable: '', characteristicRolls: [], ...gift },
        },
    };
}

const ALPHA = giftItem(
    'alpha',
    { strength: 3 },
    { riders: [rider('khorne', { strength: 5 }, [GRANT_UUID]), rider('tzeentch', { toughness: 2 })], subTable: 'limb' },
);
const BETA = giftItem('beta', { toughness: 4 }, { grants: [GRANT_UUID] }, { awareness: 10 });
const PENDING = giftItem('gamma', {}, { characteristicRolls: [{ characteristic: 'intelligence', formula: '1d10+5', direction: 'loss' }] });

interface StoryArgs {
    systemId: SystemId;
    isBC: boolean;
    giftsPanel: BcGiftsPanelContext;
}

function storyArgs(systemId: SystemId, alignment: ChaosAlignment, items: GiftPanelItem[]): StoryArgs {
    const actor = withSystem(mockActor({ name: 'Heretic Vane' }), systemId);
    return {
        systemId,
        // The sheet's gate is the active game system; the mock carries it in its type.
        isBC: actor.type.startsWith('bc-'),
        giftsPanel: buildBcGiftsPanel({
            alignment,
            items,
            characteristicLabel: (key) => LABELS[key] ?? key,
            skillLabel: (key) => LABELS[key] ?? key,
            grantName: (uuid) => GRANT_NAMES[uuid] ?? uuid,
        }),
    };
}

function renderPanel(args: StoryArgs): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = args.systemId;
    wrapper.appendChild(renderSheet(GATED_PANEL, { isBC: args.isBC, giftsPanel: args.giftsPanel }));
    return wrapper;
}

function entries(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>('[data-wh40k-hook="bc-gift-entry"]'));
}

function mergedDeltas(root: HTMLElement): Array<[string | undefined, string | undefined]> {
    return Array.from(root.querySelectorAll<HTMLElement>('[data-wh40k-hook="bc-gifts-merged-delta"]')).map((m) => [
        m.dataset['deltaKey'],
        m.dataset['deltaValue'],
    ]);
}

const meta: Meta<StoryArgs> = {
    title: 'Actor/Character/BcGiftsPanel',
    render: (args) => renderPanel(args),
};
export default meta;
type Story = StoryObj<StoryArgs>;

export const Khorne: Story = {
    name: 'Khorne — rider applied, grants and sub-table shown',
    args: storyArgs('bc', 'khorne', [ALPHA, BETA]),
    play: async ({ canvasElement }) => {
        const rows = entries(canvasElement);
        await expect(rows.map((row) => row.dataset['appliedAlignment'])).toEqual(['khorne', 'unaligned']);
        await expect(rows[0]?.querySelector('[data-rider-alignment="khorne"]')?.textContent).toContain('Rider of the fixture for khorne');
        await expect(rows[0]?.querySelector('[data-wh40k-hook="bc-gift-subtable"]')?.textContent).toContain(localizeKey('WH40K.BC.Gifts.SubTable.Limb'));
        await expect(rows[0]?.querySelector('[data-gift-grants]')?.textContent).toContain('Fixture Trait');
        await expect(rows[0]?.querySelector('[data-wh40k-hook="bc-gift-delta"]')?.getAttribute('data-delta-value')).toBe('8');
        await expect(rows[1]?.querySelector('[data-skill-delta-key="awareness"]')?.getAttribute('data-delta-value')).toBe('10');
        await expect(mergedDeltas(canvasElement)).toEqual([
            ['strength', '8'],
            ['toughness', '4'],
        ]);
    },
};

export const Tzeentch: Story = {
    name: 'Tzeentch — the same Gifts resolve to the Tzeentch rider',
    args: storyArgs('bc', 'tzeentch', [ALPHA, BETA]),
    play: async ({ canvasElement }) => {
        await expect(entries(canvasElement)[0]?.dataset['appliedAlignment']).toBe('tzeentch');
        await expect(mergedDeltas(canvasElement)).toEqual([
            ['strength', '3'],
            ['toughness', '6'],
        ]);
    },
};

export const Unaligned: Story = {
    name: 'Unaligned — base effects only',
    args: storyArgs('bc', 'unaligned', [ALPHA, BETA]),
    play: async ({ canvasElement }) => {
        await expect(entries(canvasElement).every((row) => row.dataset['appliedAlignment'] === 'unaligned')).toBe(true);
        await expect(canvasElement.querySelector('[data-rider-alignment]')).toBeNull();
    },
};

export const PendingRoll: Story = {
    name: 'Pending acquisition roll — a roll button per unrolled characteristic',
    args: storyArgs('bc', 'unaligned', [PENDING]),
    play: async ({ canvasElement }) => {
        const buttonEl = canvasElement.querySelector<HTMLElement>('[data-action="bcRollGiftCharacteristic"]');
        await expect(buttonEl?.dataset['itemId']).toBe('gamma');
        await expect(buttonEl?.dataset['characteristic']).toBe('intelligence');
        await expect(buttonEl?.textContent).toContain('1d10+5');
    },
};

export const Empty: Story = {
    name: 'Empty — a Heretic with no Gifts',
    args: storyArgs('bc', 'unaligned', []),
    play: async ({ canvasElement }) => {
        await expect(entries(canvasElement).length).toBe(0);
        await expect(canvasElement.textContent).toContain(localizeKey('WH40K.BC.Gifts.None'));
    },
};

export const OtherLineDh2: Story = {
    name: 'Other line (DH2) — the panel is not rendered',
    args: storyArgs('dh2', 'unaligned', [ALPHA, BETA]),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.wh40k-bc-gifts-panel')).toBeNull();
    },
};

export const OtherLineDw: Story = {
    name: 'Other line (DW) — the panel is not rendered',
    args: storyArgs('dw', 'unaligned', [ALPHA, BETA]),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.wh40k-bc-gifts-panel')).toBeNull();
    },
};
