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
import { renderSheet } from '../../../../stories/test-helpers';
import type { ChaosAlignment } from '../../../module/config/game-systems/types';
import { mergeGiftDeltas, resolveGiftForAlignment, type GiftAlignment, type GiftDef, type GiftRider } from '../../../module/rules/bc-gifts';
import panelSrc from './bc-gifts-panel.hbs?raw';

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

function renderPanel(ctx: GiftsPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'bc';
    wrapper.appendChild(renderSheet(panelSrc, ctx));
    return wrapper;
}

/** Convert a Record<string, number> to the ordered array shape the panel iterates. */
function deltaEntries(delta: Record<string, number>): Array<{ key: string; value: number }> {
    return Object.entries(delta)
        .filter(([, value]) => value !== 0)
        .map(([key, value]) => ({ key, value }));
}

/** A rider fixture; unset channels default to empty, as the DataModel does. */
function rider(alignment: GiftAlignment, description: string, characteristics: Record<string, number>): GiftRider {
    return { alignment, description, characteristics, skills: {}, grants: [], activeEffect: '' };
}

/** A structural gift fixture (not catalogue content — that lives in the compendium). */
function gift(id: string, baseCharacteristics: Record<string, number>, riders: GiftRider[], subTable: GiftDef['subTable'] = ''): GiftDef {
    return {
        id,
        name: `Fixture Gift ${id.toUpperCase()}`,
        baseDescription: `Base effect of fixture gift ${id}.`,
        baseCharacteristics,
        baseSkills: {},
        baseGrants: [],
        riders,
        subTable,
    };
}

/** Fixture catalogue used by the stories. */
const GIFT_CATALOGUE = {
    alpha: gift('alpha', { strength: 5 }, [
        rider('khorne', 'Khorne rider of fixture alpha.', { weaponSkill: 5 }),
        rider('slaanesh', 'Slaanesh rider of fixture alpha.', { fellowship: 5 }),
        rider('nurgle', 'Nurgle rider of fixture alpha.', { toughness: 5 }),
        rider('tzeentch', 'Tzeentch rider of fixture alpha.', { perception: 5 }),
    ]),
    beta: gift(
        'beta',
        { agility: 3 },
        [rider('khorne', 'Khorne rider of fixture beta.', { strength: 5 }), rider('tzeentch', 'Tzeentch rider of fixture beta.', { willpower: 5 })],
        'limb',
    ),
    gamma: gift('gamma', { toughness: 3 }, [
        rider('nurgle', 'Nurgle rider of fixture gamma.', { toughness: 5 }),
        rider('slaanesh', 'Slaanesh rider of fixture gamma.', { willpower: 3 }),
    ]),
} satisfies Record<string, GiftDef>;

/** Build the panel context from a current alignment and list of gift ids. */
function buildCtx(currentAlignment: ChaosAlignment, giftIds: ReadonlyArray<keyof typeof GIFT_CATALOGUE>): GiftsPanelCtx {
    const gifts: RenderedGift[] = giftIds.map((id) => {
        const def = GIFT_CATALOGUE[id];
        const resolved = resolveGiftForAlignment(def, currentAlignment);
        return {
            id: def.id,
            name: def.name,
            baseDescription: def.baseDescription,
            riderDescription: resolved.riderDescription,
            appliedAlignment: resolved.appliedAlignment,
            subTableLabel: def.subTable === 'limb' ? 'Additional Limb' : def.subTable === 'animal' ? 'Animal' : '',
            characteristicDelta: deltaEntries(resolved.characteristicDelta),
            traits: resolved.grants,
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
    args: buildCtx('khorne', ['alpha']),
    render: (args) => renderPanel(args),
};

export const KhorneMulti: Story = {
    name: 'Khorne — two gifts, merged delta aggregates',
    args: buildCtx('khorne', ['alpha', 'beta']),
    render: (args) => renderPanel(args),
};

export const KhorneNoMatch: Story = {
    name: 'Khorne — gift with no Khorne rider falls back to base only',
    args: buildCtx('khorne', ['gamma']),
    render: (args) => renderPanel(args),
};

/* -------------------------------------------- */
/*  Slaanesh                                    */
/* -------------------------------------------- */

export const SlaaneshSingle: Story = {
    name: 'Slaanesh — single gift, Slaanesh rider active',
    args: buildCtx('slaanesh', ['alpha']),
    render: (args) => renderPanel(args),
};

export const SlaaneshMulti: Story = {
    name: 'Slaanesh — two gifts, merged delta aggregates',
    args: buildCtx('slaanesh', ['alpha', 'gamma']),
    render: (args) => renderPanel(args),
};

export const SlaaneshNoMatch: Story = {
    name: 'Slaanesh — gift with no Slaanesh rider falls back to base only',
    args: buildCtx('slaanesh', ['beta']),
    render: (args) => renderPanel(args),
};

/* -------------------------------------------- */
/*  Nurgle                                      */
/* -------------------------------------------- */

export const NurgleSingle: Story = {
    name: 'Nurgle — single gift, Nurgle rider active',
    args: buildCtx('nurgle', ['gamma']),
    render: (args) => renderPanel(args),
};

export const NurgleMulti: Story = {
    name: 'Nurgle — two gifts, merged delta aggregates',
    args: buildCtx('nurgle', ['alpha', 'gamma']),
    render: (args) => renderPanel(args),
};

export const NurgleNoMatch: Story = {
    name: 'Nurgle — gift with no Nurgle rider falls back to base only',
    args: buildCtx('nurgle', ['beta']),
    render: (args) => renderPanel(args),
};

/* -------------------------------------------- */
/*  Tzeentch                                    */
/* -------------------------------------------- */

export const TzeentchSingle: Story = {
    name: 'Tzeentch — single gift, Tzeentch rider active',
    args: buildCtx('tzeentch', ['alpha']),
    render: (args) => renderPanel(args),
};

export const TzeentchMulti: Story = {
    name: 'Tzeentch — two gifts, merged delta aggregates',
    args: buildCtx('tzeentch', ['alpha', 'beta']),
    render: (args) => renderPanel(args),
};

export const TzeentchNoMatch: Story = {
    name: 'Tzeentch — gift with no Tzeentch rider falls back to base only',
    args: buildCtx('tzeentch', ['gamma']),
    render: (args) => renderPanel(args),
};

/* -------------------------------------------- */
/*  Unaligned                                   */
/* -------------------------------------------- */

export const UnalignedSingle: Story = {
    name: 'Unaligned — base effect only, no rider applies',
    args: buildCtx('unaligned', ['alpha']),
    render: (args) => renderPanel(args),
};

export const UnalignedMulti: Story = {
    name: 'Unaligned — multiple gifts, base deltas merge',
    args: buildCtx('unaligned', ['alpha', 'beta', 'gamma']),
    render: (args) => renderPanel(args),
};

export const UnalignedEmpty: Story = {
    name: 'Unaligned — no gifts held; empty-state notice',
    args: buildCtx('unaligned', []),
    render: (args) => renderPanel(args),
};
