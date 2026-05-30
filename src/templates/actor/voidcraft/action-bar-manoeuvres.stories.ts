/**
 * Storybook coverage for the RT Voidcraft Manoeuvre Action bar (#185).
 *
 * Renders the partial against a deterministic voidcraft mock and the
 * full RAW Table 8-10 catalogue resolved via
 * `resolveShipManoeuvreCombinedTest`. Per-system stories (`rt`, `dh2`,
 * `im`) flip the wrapper `data-wh40k-system` attribute so the
 * `<system>:tw-*` theme variants fire and homologation regressions
 * surface in visual review.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { mockStarshipActor, resetDefaultRng } from '../../../../stories/mocks/extended';
import { renderSheet, renderSheetParts } from '../../../../stories/test-helpers';
import { rollDifficulties } from '../../../module/rules/difficulties';
import { getShipManoeuvresForSystem, resolveShipManoeuvreCombinedTest } from '../../../module/rules/ship-manoeuvres';
import actionBarSrc from './action-bar-manoeuvres.hbs?raw';

const meta: Meta = {
    title: 'Rules / Voidcraft Manoeuvre Actions (#185)',
};
export default meta;

type Story = StoryObj;

interface TileContext {
    id: string;
    labelKey: string;
    benefitKey: string;
    difficultyLabel: string;
    target: number;
    opposed: boolean;
}

/**
 * Build the partial context for a starship + helmsman combo. Resolves
 * every RAW Table 8-10 entry against the actor's Manoeuvrability and
 * the helmsman's Pilot (Space Craft) skill so each tile shows the live
 * combined-test target.
 */
function buildContext(opts: { pilot: number; helmsman: string }): {
    helmsmanName: string;
    manoeuvres: TileContext[];
} {
    resetDefaultRng();
    const actor = mockStarshipActor();
    const manoeuvrability = actor.system.starship.manoeuvrability;
    const difficulties = rollDifficulties();
    const manoeuvres = getShipManoeuvresForSystem('rt').map((m): TileContext => {
        const result = resolveShipManoeuvreCombinedTest(m.id, {
            pilot: opts.pilot,
            manoeuvrability,
        });
        return {
            id: m.id,
            labelKey: m.labelKey,
            benefitKey: m.benefitKey,
            difficultyLabel: difficulties[String(m.difficulty)] ?? `(${m.difficulty})`,
            target: result.target,
            opposed: result.opposed,
        };
    });
    return { helmsmanName: opts.helmsman, manoeuvres };
}

/** Default render — full RAW catalogue with a competent helmsman. */
export const Default: Story = {
    name: 'Default / Full RAW catalogue',
    render: () => renderSheet(actionBarSrc, buildContext({ pilot: 45, helmsman: 'Helmsmistress Vey' })),
    play: ({ canvasElement }) => {
        const cv = within(canvasElement);
        // The six RAW Manoeuvres render — assert by stable id on the
        // tile element so localized name drift does not break the test.
        for (const id of ['adjust-bearing', 'adjust-speed', 'adjust-speed-and-bearing', 'come-to-new-heading', 'disengage', 'evasive-manoeuvres']) {
            const tile = canvasElement.querySelector(`[data-manoeuvre-id="${id}"]`);
            void expect(tile, `tile missing for ${id}`).not.toBeNull();
        }
        // Disengage is the opposed Manoeuvre — its badge should render.
        void expect(cv.getByText('WH40K.Starship.Manoeuvre.Opposed')).toBeTruthy();
    },
};

/** Empty state — no Manoeuvres available (non-RT system). */
export const Empty: Story = {
    name: 'Empty / No Manoeuvres',
    render: () =>
        renderSheet(actionBarSrc, {
            helmsmanName: '',
            manoeuvres: [],
        }),
    play: ({ canvasElement }) => {
        const cv = within(canvasElement);
        void expect(cv.getByText('WH40K.Starship.Manoeuvre.Empty')).toBeTruthy();
    },
};

/** Per-system homologation: Rogue Trader. */
export const ThemeRT: Story = {
    name: 'Theme / Rogue Trader',
    render: () => {
        const wrapper = renderSheetParts([{ template: actionBarSrc, context: buildContext({ pilot: 50, helmsman: 'Pilot-Officer Korr' }) }], {});
        wrapper.dataset.wh40kSystem = 'rt';
        return wrapper;
    },
};

/**
 * Per-system homologation: Dark Heresy 2e. RT is canonical for starship
 * Manoeuvre Actions but the partial still respects the dh2 theme
 * tokens so a sibling ship surface (if/when authored) inherits the
 * common visual treatment.
 */
export const ThemeDH2: Story = {
    name: 'Theme / Dark Heresy 2e',
    render: () => {
        const wrapper = renderSheetParts([{ template: actionBarSrc, context: buildContext({ pilot: 40, helmsman: 'Scribe-Adjunct Calix' }) }], {});
        wrapper.dataset.wh40kSystem = 'dh2';
        return wrapper;
    },
};

/** Per-system homologation: Imperium Maledictum. */
export const ThemeIM: Story = {
    name: 'Theme / Imperium Maledictum',
    render: () => {
        const wrapper = renderSheetParts([{ template: actionBarSrc, context: buildContext({ pilot: 35, helmsman: 'Bondsman Hreth' }) }], {});
        wrapper.dataset.wh40kSystem = 'im';
        return wrapper;
    },
};

/** Hazard-tier helmsman — negative ship Manoeuvrability composes correctly. */
export const HighDifficulty: Story = {
    name: 'Hazard / Hard tier (Adjust Speed & Bearing)',
    render: () => {
        const ctx = buildContext({ pilot: 30, helmsman: 'Apprentice Toren' });
        // Filter to the Hard-tier entry so the story focuses on the worst case.
        ctx.manoeuvres = ctx.manoeuvres.filter((m) => m.id === 'adjust-speed-and-bearing');
        return renderSheet(actionBarSrc, ctx);
    },
    play: ({ canvasElement }) => {
        const tile = canvasElement.querySelector('[data-manoeuvre-id="adjust-speed-and-bearing"]');
        void expect(tile).not.toBeNull();
    },
};
