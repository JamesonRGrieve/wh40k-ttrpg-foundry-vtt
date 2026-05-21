/**
 * Storybook stories for the Black Crusade Gifts of the Gods panel (#180).
 *
 * The panel is a passive readout — gift acquisition / removal happens
 * elsewhere. These stories drive the live {@link resolveGiftForAlignment}
 * resolver over a fixed mini-catalogue so each story shows what the
 * player would see for the same gift set held by an actor of a given
 * alignment. Per "Seeded RNG in stories" in CLAUDE.md, no story uses
 * `Math.random()` — every value is fixed for diff stability.
 *
 * Three stories per alignment, covering the canonical states an operator
 * needs to verify in review (Khorne / Slaanesh / Nurgle / Tzeentch /
 * Unaligned × { single rider-bearing gift, multi-gift merged delta,
 * gifts with no matching rider }).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HB from 'handlebars';
import { renderTemplate as compileAndRender } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import type { ChaosAlignment } from '../../../module/config/game-systems/types';
import { mergeGiftDeltas, resolveGiftForAlignment, type GiftDef } from '../../../module/rules/bc-gifts';
import panelSrc from './bc-gifts-panel.hbs?raw';

initializeStoryHandlebars();

interface RenderedGift {
    id: string;
    name: string;
    baseDescription: string;
    riderDescription: string;
    appliedAlignment: ChaosAlignment;
    subTableLabel: string;
    characteristicDelta: Array<{ key: string; value: number }>;
    traits: string[];
    activeEffects: string[];
}

interface GiftsPanelCtx {
    giftsPanel: {
        currentAlignment: ChaosAlignment;
        gifts: RenderedGift[];
        mergedDelta: Array<{ key: string; value: number }>;
    };
}

const panelTpl = HB.compile(panelSrc);

function renderPanel(ctx: GiftsPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'bc';
    wrapper.appendChild(compileAndRender(panelTpl, ctx));
    return wrapper;
}

/** Convert a Record<string, number> to the ordered array shape the panel iterates. */
function deltaEntries(delta: Record<string, number>): Array<{ key: string; value: number }> {
    return Object.entries(delta)
        .filter(([, value]) => value !== 0)
        .map(([key, value]) => ({ key, value }));
}

/** Catalogue of gift definitions used by the stories (mirrors the shape compendium entries would supply). */
const GIFT_CATALOGUE: Record<string, GiftDef> = {
    bestial_aspect: {
        id: 'bestial_aspect',
        name: 'Bestial Aspect',
        baseDescription: 'The Heretic gains a feral, monstrous mien — beasts cower.',
        baseCharacteristicDelta: { s: 5 },
        riders: [
            { alignment: 'khorne', description: 'Khorne marks the bearer: rage incarnate; +5 WS.', characteristicDelta: { ws: 5 } },
            { alignment: 'slaanesh', description: 'Slaanesh refines the form into terrible beauty; +5 Fel.', characteristicDelta: { fel: 5 } },
            { alignment: 'nurgle', description: 'Nurgle bloats the bearer; +5 T.', characteristicDelta: { t: 5 } },
            { alignment: 'tzeentch', description: 'Tzeentch warps perception; +5 Per.', characteristicDelta: { per: 5 } },
        ],
    },
    additional_limb: {
        id: 'additional_limb',
        name: 'Additional Limb',
        baseDescription: 'A new limb sprouts from the body — roll on the limb sub-table.',
        baseCharacteristicDelta: { ag: 3 },
        riders: [
            { alignment: 'khorne', description: 'A chitinous bone-blade arm; +5 S.', characteristicDelta: { s: 5 } },
            { alignment: 'tzeentch', description: 'A coiling tendril humming with warp-light; +5 WP.', characteristicDelta: { wp: 5 } },
        ],
        subTableId: 'limb',
    },
    daemonic_resilience: {
        id: 'daemonic_resilience',
        name: 'Daemonic Resilience',
        baseDescription: 'The flesh knits itself with unnatural speed.',
        baseCharacteristicDelta: { t: 3 },
        riders: [
            { alignment: 'nurgle', description: "Nurgle's blessing: +5 T, immunity to disease.", characteristicDelta: { t: 5 } },
            { alignment: 'slaanesh', description: 'Slaanesh deadens pain into rapture; +3 WP.', characteristicDelta: { wp: 3 } },
        ],
    },
};

/** Build the panel context from a current alignment and list of gift ids. */
function buildCtx(currentAlignment: ChaosAlignment, giftIds: ReadonlyArray<keyof typeof GIFT_CATALOGUE>): GiftsPanelCtx {
    const gifts: RenderedGift[] = giftIds.map((id) => {
        const gift = GIFT_CATALOGUE[id];
        const resolved = resolveGiftForAlignment(gift, currentAlignment);
        const matchingRider = gift.riders.find((r) => r.alignment === resolved.appliedAlignment);
        return {
            id: gift.id,
            name: gift.name,
            baseDescription: gift.baseDescription,
            riderDescription: matchingRider?.description ?? '',
            appliedAlignment: resolved.appliedAlignment,
            subTableLabel: gift.subTableId === 'limb' ? 'Additional Limb' : gift.subTableId === 'animal' ? 'Animal' : '',
            characteristicDelta: deltaEntries(resolved.characteristicDelta),
            traits: resolved.traits,
            activeEffects: resolved.activeEffects,
        };
    });
    const merged = mergeGiftDeltas(gifts.map((g) => Object.fromEntries(g.characteristicDelta.map((d) => [d.key, d.value]))));
    return {
        giftsPanel: {
            currentAlignment,
            gifts,
            mergedDelta: deltaEntries(merged),
        },
    };
}

const meta: Meta<GiftsPanelCtx> = {
    title: 'Actor/Character/BcGiftsPanel',
};
export default meta;
type Story = StoryObj<GiftsPanelCtx>;

/* -------------------------------------------- */
/*  Khorne                                      */
/* -------------------------------------------- */

export const KhorneSingle: Story = {
    name: 'Khorne — single gift, Khorne rider active',
    args: buildCtx('khorne', ['bestial_aspect']),
    render: (args) => renderPanel(args),
};

export const KhorneMulti: Story = {
    name: 'Khorne — two gifts, merged delta aggregates',
    args: buildCtx('khorne', ['bestial_aspect', 'additional_limb']),
    render: (args) => renderPanel(args),
};

export const KhorneNoMatch: Story = {
    name: 'Khorne — gift with no Khorne rider falls back to base only',
    args: buildCtx('khorne', ['daemonic_resilience']),
    render: (args) => renderPanel(args),
};

/* -------------------------------------------- */
/*  Slaanesh                                    */
/* -------------------------------------------- */

export const SlaaneshSingle: Story = {
    name: 'Slaanesh — single gift, Slaanesh rider active',
    args: buildCtx('slaanesh', ['bestial_aspect']),
    render: (args) => renderPanel(args),
};

export const SlaaneshMulti: Story = {
    name: 'Slaanesh — two gifts, merged delta aggregates',
    args: buildCtx('slaanesh', ['bestial_aspect', 'daemonic_resilience']),
    render: (args) => renderPanel(args),
};

export const SlaaneshNoMatch: Story = {
    name: 'Slaanesh — gift with no Slaanesh rider falls back to base only',
    args: buildCtx('slaanesh', ['additional_limb']),
    render: (args) => renderPanel(args),
};

/* -------------------------------------------- */
/*  Nurgle                                      */
/* -------------------------------------------- */

export const NurgleSingle: Story = {
    name: 'Nurgle — single gift, Nurgle rider active',
    args: buildCtx('nurgle', ['daemonic_resilience']),
    render: (args) => renderPanel(args),
};

export const NurgleMulti: Story = {
    name: 'Nurgle — two gifts, merged delta aggregates',
    args: buildCtx('nurgle', ['bestial_aspect', 'daemonic_resilience']),
    render: (args) => renderPanel(args),
};

export const NurgleNoMatch: Story = {
    name: 'Nurgle — gift with no Nurgle rider falls back to base only',
    args: buildCtx('nurgle', ['additional_limb']),
    render: (args) => renderPanel(args),
};

/* -------------------------------------------- */
/*  Tzeentch                                    */
/* -------------------------------------------- */

export const TzeentchSingle: Story = {
    name: 'Tzeentch — single gift, Tzeentch rider active',
    args: buildCtx('tzeentch', ['bestial_aspect']),
    render: (args) => renderPanel(args),
};

export const TzeentchMulti: Story = {
    name: 'Tzeentch — two gifts, merged delta aggregates',
    args: buildCtx('tzeentch', ['bestial_aspect', 'additional_limb']),
    render: (args) => renderPanel(args),
};

export const TzeentchNoMatch: Story = {
    name: 'Tzeentch — gift with no Tzeentch rider falls back to base only',
    args: buildCtx('tzeentch', ['daemonic_resilience']),
    render: (args) => renderPanel(args),
};

/* -------------------------------------------- */
/*  Unaligned                                   */
/* -------------------------------------------- */

export const UnalignedSingle: Story = {
    name: 'Unaligned — base effect only, no rider applies',
    args: buildCtx('unaligned', ['bestial_aspect']),
    render: (args) => renderPanel(args),
};

export const UnalignedMulti: Story = {
    name: 'Unaligned — multiple gifts, base deltas merge',
    args: buildCtx('unaligned', ['bestial_aspect', 'additional_limb', 'daemonic_resilience']),
    render: (args) => renderPanel(args),
};

export const UnalignedEmpty: Story = {
    name: 'Unaligned — no gifts held; empty-state notice',
    args: buildCtx('unaligned', []),
    render: (args) => renderPanel(args),
};
