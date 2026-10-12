/**
 * Storybook stories for the Deathwatch Distinctions panel (#171).
 * Three stories covering the visual states an operator needs to verify
 * before merge:
 *
 *   1. NoneEarned   — empty actor, both lists show their empty states
 *                     and the merged-effects readout collapses to
 *                     "None / None".
 *   2. SomeEarned   — three Distinctions earned, one of which is also
 *                     a Mark; the other slot from the catalogue is
 *                     locked behind a higher Renown rank. The merged
 *                     readout shows the single Mark's grant.
 *   3. FullStack    — every Distinction earned, every one borne as a
 *                     Mark; the merged readout sums multiple
 *                     characteristic deltas and lists all granted
 *                     traits — the regression surface for
 *                     `mergeMarkGrants`.
 *
 * The catalogue used here is a story-local mock — the real catalogue is
 * compendium content (Direction #7). The pure engine
 * (`mergeMarkGrants`) drives the merged-readout context so any change
 * to the engine's merge semantics shows up here without re-authoring.
 *
 * Per the "Seeded RNG in stories" rule in CLAUDE.md every value is
 * fixed for diff stability — no Math.random in this module.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import { mergeMarkGrants, type MarkGrantSource } from '../../../module/rules/dw-distinction.ts';
import panelSrc from './dw-distinction-panel.hbs?raw';

initializeStoryHandlebars();

interface DistinctionEntryCtx {
    id: string;
    name: string;
    renownReward: number;
    renownRequired: string;
    earned: boolean;
    rankTooLow: boolean;
}

interface MarkEntryCtx {
    id: string;
    name: string;
    description: string;
    borne: boolean;
}

interface MergedCharacteristicCtx {
    key: string;
    value: number;
    displayValue: string;
}

interface DistinctionPanelCtx {
    distinctionPanel: {
        distinctions: DistinctionEntryCtx[];
        marks: MarkEntryCtx[];
        merged: {
            characteristicDelta: MergedCharacteristicCtx[];
            traits: string[];
        };
    };
}

function renderPanel(ctx: DistinctionPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'dw';
    wrapper.appendChild(renderSheet(panelSrc, ctx));
    return wrapper;
}

/**
 * Story-local catalogue of Distinctions + Mark grants. Real content
 * lives in the compendium (Direction #7); this mock is only deep
 * enough to exercise the panel's three rendering branches and the
 * engine's `mergeMarkGrants` math.
 */
interface CatalogueEntry {
    id: string;
    name: string;
    renownReward: number;
    /** Pre-localised label of the required Renown rank. */
    renownRequiredLabel: string;
    /** Whether the actor's current rank clears the gate. */
    canEarnAtCurrentRank: boolean;
    /** If embodied as a Mark, the grant payload + description. */
    mark?: {
        description: string;
        source: MarkGrantSource;
    };
}

const CATALOGUE: ReadonlyArray<CatalogueEntry> = [
    {
        id: 'honoured-of-the-chapter',
        name: 'Honoured of the Chapter',
        renownReward: 5,
        renownRequiredLabel: 'Respected',
        canEarnAtCurrentRank: true,
        mark: {
            description: '+5 Willpower while bearing this Mark.',
            source: { grant: { trait: '', activeEffect: '' }, modifiers: { characteristics: { WP: 5 } } },
        },
    },
    {
        id: 'iron-resolve',
        name: 'Iron Resolve',
        renownReward: 5,
        renownRequiredLabel: 'Respected',
        canEarnAtCurrentRank: true,
        mark: {
            description: '+5 Toughness; gains the Resistance (Fear) trait.',
            source: { grant: { trait: 'Resistance (Fear)', activeEffect: '' }, modifiers: { characteristics: { T: 5 } } },
        },
    },
    {
        id: 'duty-unto-death',
        name: 'Duty Unto Death',
        renownReward: 10,
        renownRequiredLabel: 'Distinguished',
        canEarnAtCurrentRank: true,
    },
    {
        id: 'crux-terminatus',
        name: 'Bearer of the Crux Terminatus',
        renownReward: 15,
        renownRequiredLabel: 'Hero',
        canEarnAtCurrentRank: false,
        mark: {
            description: '+5 WS, gains True Grit.',
            source: { grant: { trait: 'True Grit', activeEffect: '' }, modifiers: { characteristics: { WS: 5 } } },
        },
    },
];

function buildCtx(args: { earnedIds: ReadonlyArray<string>; borneMarkIds: ReadonlyArray<string> }): DistinctionPanelCtx {
    const earned = new Set(args.earnedIds);
    const borne = new Set(args.borneMarkIds);

    const distinctions: DistinctionEntryCtx[] = CATALOGUE.map((entry) => ({
        id: entry.id,
        name: entry.name,
        renownReward: entry.renownReward,
        renownRequired: entry.renownRequiredLabel,
        earned: earned.has(entry.id),
        rankTooLow: !entry.canEarnAtCurrentRank,
    }));

    const marks: MarkEntryCtx[] = CATALOGUE.filter((entry) => entry.mark !== undefined).map((entry) => ({
        id: entry.id,
        name: entry.name,
        description: entry.mark?.description ?? '',
        borne: borne.has(entry.id),
    }));

    const borneMarkObjects: MarkGrantSource[] = CATALOGUE.flatMap((entry) => (entry.mark !== undefined && borne.has(entry.id) ? [entry.mark.source] : []));

    const merged = mergeMarkGrants(borneMarkObjects);
    const characteristicDelta: MergedCharacteristicCtx[] = Object.keys(merged.characteristicDelta)
        .sort()
        .map((key) => {
            const value = merged.characteristicDelta[key] ?? 0;
            return {
                key,
                value,
                displayValue: value >= 0 ? `+${value}` : `${value}`,
            };
        });

    return {
        distinctionPanel: {
            distinctions,
            marks,
            merged: {
                characteristicDelta,
                traits: merged.traits,
            },
        },
    };
}

const meta: Meta<DistinctionPanelCtx> = {
    title: 'Actor/Character/DwDistinctionPanel',
};
export default meta;
type Story = StoryObj<DistinctionPanelCtx>;

export const NoneEarned: Story = {
    name: 'None earned — empty actor, lists collapse to empty state',
    args: buildCtx({ earnedIds: [], borneMarkIds: [] }),
    render: (args) => renderPanel(args),
};

export const SomeEarned: Story = {
    name: 'Some earned — three Distinctions, one Mark borne, one rank-locked',
    args: buildCtx({
        earnedIds: ['honoured-of-the-chapter', 'iron-resolve', 'duty-unto-death'],
        borneMarkIds: ['iron-resolve'],
    }),
    render: (args) => renderPanel(args),
};

export const FullStack: Story = {
    name: 'Full stack — every Distinction earned, every Mark borne',
    args: buildCtx({
        earnedIds: CATALOGUE.map((e) => e.id),
        borneMarkIds: CATALOGUE.filter((e) => e.mark !== undefined).map((e) => e.id),
    }),
    render: (args) => renderPanel(args),
};
