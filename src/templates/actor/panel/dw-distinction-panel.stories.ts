/**
 * Storybook stories for the Deathwatch Distinctions panel (#171).
 *
 * The panel lists a Battle-Brother's owned `specialAbility` items with their
 * category, required Renown rank, Renown reward and XP cost, and the merged
 * grant of every borne Mark of Distinction. The context here is built the way
 * `CharacterSheet._prepareDwDistinctionPanel` builds it — through the real
 * `readSpecialAbility` / `canGainSpecialAbility` / `mergeMarkGrants` — over mock
 * items, so a change to those rules shows up here without re-authoring.
 *
 *   1. Empty          — a DW actor with no special abilities.
 *   2. BattleBrother  — one ability per category on a Distinguished (Renown 45)
 *                       Battle-Brother; the Famed-gated ability is locked.
 *   3. OtherLine      — the same items on a DH2 actor: no Renown, so the gate
 *                       and reward are inert, and the panel composes without
 *                       the `dw:` variants.
 *
 * Every value is fixed for diff stability — no Math.random in this module.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { mockActor } from '../../../../stories/mocks';
import { mockGenericItem, withSystem, type SystemId } from '../../../../stories/mocks/extended';
import { localizeKey } from '../../../../stories/mocks/lang-localize';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import { conferralRefusal, conferralRenown, readDwRenown, readSpecialAbility, type ConferralActor } from '../../../module/actions/dw-distinction-actions.ts';
import { canGainSpecialAbility, type MarkGrantSource, mergeMarkGrants, specialAbilityCategoryLabelKey } from '../../../module/rules/dw-distinction.ts';
import { getRenownRank, renownRankLabelKey } from '../../../module/rules/dw-renown.ts';
import panelSrc from './dw-distinction-panel.hbs?raw';

initializeStoryHandlebars();

const RESISTANCE_FEAR_UUID = 'Compendium.wh40k-rpg.story.Item.resistanceFear01';
/** Story-local stand-in for `uuidNameCache` — the trait a mock Mark grants. */
const TRAIT_NAMES: Record<string, string> = { [RESISTANCE_FEAR_UUID]: 'Resistance (Fear)' };

function specialAbility(id: string, name: string, system: Record<string, string | number | null | object>): ReturnType<typeof mockGenericItem> {
    return mockGenericItem('specialAbility', { _id: id, id, name, system: { renownRequired: null, renownReward: 0, cost: 0, ...system } });
}

const SPECIALITY = specialAbility('spec1', 'Enhance Healing', { category: 'speciality' });
const FAMED_ADVANCED = specialAbility('adv1', 'Command and Control', { category: 'advanced', renownRequired: 'famed' });
const REWARDED_DISTINCTION = specialAbility('dist1', 'Tyrannic War Veteran', { category: 'distinction', cost: 1100, renownReward: 5 });
const MARK = specialAbility('mark1', 'Watcher', {
    category: 'mark',
    cost: 500,
    grant: { trait: RESISTANCE_FEAR_UUID, activeEffect: '' },
    modifiers: { characteristics: { perception: 10 } },
});
const ITEMS = [SPECIALITY, FAMED_ADVANCED, REWARDED_DISTINCTION, MARK];

interface PanelCtx {
    distinctionPanel: {
        abilities: Array<{
            id: string;
            name: string;
            category: string;
            categoryLabel: string;
            renownRequired: string;
            renownReward: number;
            cost: number;
            rankTooLow: boolean;
        }>;
        merged: { characteristicDelta: Array<{ key: string; value: number; displayValue: string }>; traits: string[] };
    };
}

interface StoryArgs {
    systemId: SystemId;
    actor: ConferralActor;
    ctx: PanelCtx;
}

/** A mock character on `systemId` with the given Renown and items, as the conferral rules read it. */
function conferralActor(systemId: SystemId, renown: number): ConferralActor {
    const actor = withSystem(mockActor({ name: 'Brother Varro' }), systemId);
    return { name: actor.name, system: { ...actor.system, gameSystem: systemId, renown } };
}

function buildCtx(items: ReadonlyArray<ReturnType<typeof mockGenericItem>>, renown: number): PanelCtx {
    const actorRenownRank = getRenownRank(renown);
    const marks: MarkGrantSource[] = [];
    const abilities: PanelCtx['distinctionPanel']['abilities'] = [];
    for (const item of items) {
        const ability = readSpecialAbility(item);
        if (ability === null) continue;
        if (ability.category === 'mark') marks.push(ability.markGrant);
        abilities.push({
            id: item.id,
            name: item.name,
            category: ability.category,
            categoryLabel: localizeKey(specialAbilityCategoryLabelKey(ability.category)),
            renownRequired: ability.renownRequired === null ? '' : localizeKey(renownRankLabelKey(ability.renownRequired)),
            renownReward: ability.renownReward,
            cost: ability.cost,
            rankTooLow: !canGainSpecialAbility({ ability, actorRenownRank }).allowed,
        });
    }
    const merged = mergeMarkGrants(marks);
    return {
        distinctionPanel: {
            abilities,
            merged: {
                characteristicDelta: Object.entries(merged.characteristicDelta).map(([key, value]) => ({ key, value, displayValue: `+${value}` })),
                traits: merged.traits.map((uuid) => TRAIT_NAMES[uuid] ?? uuid),
            },
        },
    };
}

function renderPanel(args: StoryArgs): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = args.systemId;
    wrapper.appendChild(renderSheet(panelSrc, args.ctx));
    return wrapper;
}

const meta: Meta<StoryArgs> = {
    title: 'Actor/Character/DwDistinctionPanel',
    render: (args) => renderPanel(args),
};
export default meta;
type Story = StoryObj<StoryArgs>;

export const Empty: Story = {
    name: 'Empty — no special abilities',
    args: { systemId: 'dw', actor: conferralActor('dw', 45), ctx: buildCtx([], 45) },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelectorAll('[data-wh40k-hook="dw-distinction-entry"]').length).toBe(0);
        await expect(canvasElement.textContent).toContain(localizeKey('WH40K.DW.Distinction.List.Empty'));
    },
};

export const BattleBrother: Story = {
    name: 'Battle-Brother — one ability per category, one rank-locked',
    args: { systemId: 'dw', actor: conferralActor('dw', 45), ctx: buildCtx(ITEMS, 45) },
    play: async ({ canvasElement, args }) => {
        const rows = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-wh40k-hook="dw-distinction-entry"]'));
        await expect(rows.map((row) => row.dataset['category'])).toEqual(['speciality', 'advanced', 'distinction', 'mark']);
        await expect(rows.every((row) => row.dataset['action'] === 'itemEdit')).toBe(true);
        await expect(canvasElement.querySelectorAll('[data-wh40k-hook="dw-distinction-locked"]').length).toBe(1);
        await expect(canvasElement.querySelector('[data-item-id="adv1"]')?.getAttribute('data-rank-too-low')).toBe('true');
        await expect(canvasElement.querySelector('[data-wh40k-hook="dw-distinction-cost"]')?.textContent).toContain('1100');
        await expect(canvasElement.querySelector('[data-wh40k-hook="dw-distinction-merged-char"]')?.textContent).toContain('perception +10');
        await expect(canvasElement.querySelector('[data-wh40k-hook="dw-distinction-merged-trait"]')?.textContent).toContain('Resistance (Fear)');

        // The gate the drop handler applies: Distinguished cannot take the Famed ability,
        // and conferring the rewarded Distinction pays its Renown.
        await expect(conferralRefusal(args.actor, FAMED_ADVANCED)).toEqual({ requiredRank: 'famed', currentRank: 'distinguished' });
        await expect(conferralRenown(args.actor, REWARDED_DISTINCTION)).toBe(50);
    },
};

export const OtherLine: Story = {
    name: 'Other line (DH2) — no Renown, gate and reward inert',
    args: { systemId: 'dh2', actor: conferralActor('dh2', 45), ctx: buildCtx(ITEMS, 45) },
    play: async ({ canvasElement, args }) => {
        await expect(readDwRenown(args.actor)).toBeNull();
        await expect(ITEMS.map((item) => conferralRefusal(args.actor, item))).toEqual([null, null, null, null]);
        await expect(ITEMS.map((item) => conferralRenown(args.actor, item))).toEqual([null, null, null, null]);
        await expect(canvasElement.querySelectorAll('[data-wh40k-hook="dw-distinction-entry"]').length).toBe(4);
    },
};
