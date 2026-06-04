/**
 * Storybook stories for the Only War Regimental Drawbacks panel
 * (#160 — hammer.md §"REGIMENTAL DRAWBACKS" line 1150,
 *         §"Comrade Advances / Multiple Comrades" lines 1677, 1713).
 *
 * Three visual states an operator needs to verify:
 *
 *   1. No drawbacks, RAW single Comrade — empty list + bare budget +
 *      "—" roster placeholder. Sanity check of the empty path.
 *   2. Two drawbacks selected, RAW single Comrade — refund badge sums
 *      both refunds, merged penalty surface shows characteristic deltas
 *      plus a forbidden-talent grant, adjusted budget reads
 *      `baseBudget + appliedRefund`.
 *   3. One drawback + explicit Multiple Comrades roster — the roster
 *      readout lists the primary plus two additionals, total count = 3.
 *
 * Every value is fixed for diff stability (no Math.random); refund /
 * penalty / budget arithmetic flows through the canonical rules module
 * so any change to {@link applyDrawbacksToBudget} or
 * {@link mergeDrawbackPenalties} surfaces here first.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import { applyDrawbacksToBudget, mergeDrawbackPenalties, type RegimentDrawback } from '../../../module/rules/ow-regiment-drawback';
import panelSrc from './ow-drawback-panel.hbs?raw';

initializeStoryHandlebars();

interface PenaltyCharEntry {
    key: string;
    value: number;
}

interface DrawbackEntry {
    id: string;
    description: string;
    refund: number;
}

interface DrawbackPanelCtx {
    drawbackPanel: {
        drawbacks: DrawbackEntry[];
        appliedRefund: number;
        baseBudget: number;
        adjustedBudget: number;
        penalty: {
            characteristics: PenaltyCharEntry[];
            skills: string[];
            talents: string[];
            wounds: number;
            logistics: number;
            kitModifier: number;
        };
        hasDrawbacks: boolean;
        hasPenaltyRow: boolean;
        roster: {
            present: boolean;
            primaryId: string;
            additionalIds: string[];
            totalCount: number;
        };
    };
}

interface BuildOpts {
    drawbacks: ReadonlyArray<RegimentDrawback>;
    baseBudget?: number;
    roster: { present: false } | { present: true; primaryId: string; additionalIds: string[] };
}

const BASE_BUDGET = 12;

function buildContext(opts: BuildOpts): DrawbackPanelCtx {
    const baseBudget = opts.baseBudget ?? BASE_BUDGET;
    const { adjustedBudget, appliedRefund } = applyDrawbacksToBudget(baseBudget, opts.drawbacks);
    const merged = mergeDrawbackPenalties(opts.drawbacks);
    const characteristics: PenaltyCharEntry[] = Object.entries(merged.characteristics ?? {}).map(([key, value]) => ({
        key,
        value,
    }));
    const skills = [...(merged.skills ?? [])];
    const talents = [...(merged.talents ?? [])];
    const wounds = merged.wounds ?? 0;
    const logistics = merged.logistics ?? 0;
    const kitModifier = merged.kitModifier ?? 0;
    const hasPenaltyRow = characteristics.length > 0 || skills.length > 0 || talents.length > 0 || wounds !== 0 || logistics !== 0 || kitModifier !== 0;

    const drawbackEntries: DrawbackEntry[] = opts.drawbacks.map((d) => ({
        id: d.id,
        description: d.description,
        refund: d.refund,
    }));

    const roster = opts.roster.present
        ? {
              present: true,
              primaryId: opts.roster.primaryId,
              additionalIds: [...opts.roster.additionalIds],
              totalCount: 1 + opts.roster.additionalIds.length,
          }
        : { present: false, primaryId: '', additionalIds: [], totalCount: 1 };

    return {
        drawbackPanel: {
            drawbacks: drawbackEntries,
            appliedRefund,
            baseBudget,
            adjustedBudget,
            penalty: {
                characteristics,
                skills,
                talents,
                wounds,
                logistics,
                kitModifier,
            },
            hasDrawbacks: drawbackEntries.length > 0,
            hasPenaltyRow,
            roster,
        },
    };
}

function renderPanel(ctx: DrawbackPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'ow';
    wrapper.appendChild(renderSheet(panelSrc, ctx));
    return wrapper;
}

const meta: Meta<DrawbackPanelCtx> = {
    title: 'Actor/Character/OwDrawbackPanel',
};
export default meta;
type Story = StoryObj<DrawbackPanelCtx>;

/* -------------------------------------------- */
/*  Story 1 — empty path                          */
/* -------------------------------------------- */

export const NoDrawbacksRawSingleComrade: Story = {
    name: 'No drawbacks, RAW single Comrade — empty list',
    args: buildContext({ drawbacks: [], roster: { present: false } }),
    render: (args) => renderPanel(args),
};

/* -------------------------------------------- */
/*  Story 2 — two drawbacks, merged penalty       */
/* -------------------------------------------- */

const drawbacksA: ReadonlyArray<RegimentDrawback> = [
    {
        id: 'demolitions-paranoia',
        description: 'Demolitions Paranoia — superiors fear the squad will mishandle explosives.',
        refund: 3,
        penalty: {
            characteristics: { intelligence: -3 },
            talents: ['Forbidden: Demolitions'],
        },
    },
    {
        id: 'short-rations',
        description: 'Short Rations — supply lines are sparse; the squad survives on emergency kit.',
        refund: 2,
        penalty: {
            characteristics: { toughness: -2 },
            logistics: -1,
        },
    },
];

export const TwoDrawbacksWithMergedPenalty: Story = {
    name: 'Two drawbacks — refund + merged penalty + adjusted budget',
    args: buildContext({ drawbacks: drawbacksA, roster: { present: false } }),
    render: (args) => renderPanel(args),
};

/* -------------------------------------------- */
/*  Story 3 — drawback + explicit multi-comrade roster */
/* -------------------------------------------- */

const drawbacksB: ReadonlyArray<RegimentDrawback> = [
    {
        id: 'penal-detail',
        description: 'Penal Detail — the squad is drawn from punishment companies.',
        refund: 4,
        penalty: {
            characteristics: { fellowship: -3 },
            skills: ['Forbidden: Charm'],
            wounds: -1,
        },
    },
];

export const DrawbackPlusMultiComradeRoster: Story = {
    name: 'Drawback + Multiple Comrades roster — primary + two additionals',
    args: buildContext({
        drawbacks: drawbacksB,
        roster: { present: true, primaryId: 'guardsman-vellis', additionalIds: ['guardsman-arkos', 'guardsman-jadek'] },
    }),
    render: (args) => renderPanel(args),
};
