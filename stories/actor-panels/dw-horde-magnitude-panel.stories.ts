/**
 * Storybook stories for the DW Horde Magnitude panel (#166 — core.md
 * p. 359 TABLE 13-1). The panel surfaces the four RAW derived values
 * the HordeTemplate mixin populates from `bonusDamageDiceForMagnitude`
 * and `toHitBonusForMagnitude`:
 *
 *   1. Tier descriptor + size keyword (Massive / Immense / …).
 *   2. To-hit bonus against the horde (+30 / +40 / +50 / +60).
 *   3. Bonus damage dice the horde adds to its own attacks (capped +2d10).
 *   4. Magnitude bar with break-threshold marker (25% line).
 *
 * Stories cover every tier from TABLE 13-1 plus the broken-threshold
 * state for visual review. The companion e2e spec
 * (`tests/e2e/dw-horde-magnitude.spec.ts`) instantiates the live NPC
 * sheet on a DW horde actor and snaps the rendered panel.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HandlebarsLib from 'handlebars';
import { getHordeTier, bonusDamageDiceForMagnitude, toHitBonusForMagnitude } from '../../src/module/rules/dw-horde-magnitude';
import { renderTemplate as renderMockTemplate } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';

initializeStoryHandlebars();

interface HordePanelArgs {
    actorName: string;
    gameSystem: string;
    magnitudeCurrent: number;
    magnitudeMax: number;
    traits: ReadonlyArray<string>;
}

interface HordePanelContext {
    actorName: string;
    gameSystem: string;
    magnitudeCurrent: number;
    magnitudeMax: number;
    magnitudePercent: number;
    bonusDamageDice: number;
    toHitBonus: number;
    sizeKeyword: string;
    tierDescriptor: string;
    breakState: 'safe' | 'will-test' | 'penalised' | 'auto-break';
    traits: ReadonlyArray<string>;
}

/**
 * Small inline panel template — story-only, intentionally not
 * registered as a runtime partial. The production sheet renders the
 * same fields directly via `tab-npc.hbs` against the actor's prepared
 * horde state.
 */
const PANEL_TEMPLATE = `
<section class="tw-rounded-md tw-border tw-border-[var(--wh40k-card-border)] tw-bg-[var(--wh40k-card-bg)] tw-p-3 tw-font-ui" data-wh40k-system="{{gameSystem}}">
    <header class="tw-flex tw-items-baseline tw-justify-between tw-mb-2">
        <h3 class="tw-font-display tw-text-base tw-text-gold dw:tw-text-accent-combat tw-uppercase tw-tracking-wide tw-m-0">{{actorName}}</h3>
        <span class="tw-text-xs tw-uppercase tw-tracking-widest tw-text-[var(--wh40k-card-muted)]">{{tierDescriptor}} · {{sizeKeyword}}</span>
    </header>
    <div class="tw-grid tw-grid-cols-3 tw-gap-2 tw-text-sm">
        <div class="tw-rounded tw-bg-[var(--wh40k-panel-bg-translucent)] tw-px-2 tw-py-1">
            <div class="tw-text-[0.65rem] tw-uppercase tw-tracking-wider tw-text-[var(--wh40k-card-muted)]">Magnitude</div>
            <div class="tw-text-xl tw-font-bold">{{magnitudeCurrent}} <span class="tw-text-xs tw-text-[var(--wh40k-card-muted)]">/ {{magnitudeMax}}</span></div>
        </div>
        <div class="tw-rounded tw-bg-[var(--wh40k-panel-bg-translucent)] tw-px-2 tw-py-1">
            <div class="tw-text-[0.65rem] tw-uppercase tw-tracking-wider tw-text-[var(--wh40k-card-muted)]">To Hit</div>
            <div class="tw-text-xl tw-font-bold">+{{toHitBonus}}</div>
        </div>
        <div class="tw-rounded tw-bg-[var(--wh40k-panel-bg-translucent)] tw-px-2 tw-py-1">
            <div class="tw-text-[0.65rem] tw-uppercase tw-tracking-wider tw-text-[var(--wh40k-card-muted)]">Bonus Dmg</div>
            <div class="tw-text-xl tw-font-bold">+{{bonusDamageDice}}d10</div>
        </div>
    </div>
    <div class="tw-h-2 tw-mt-3 tw-bg-[var(--wh40k-panel-bg-translucent)] tw-rounded tw-overflow-hidden">
        <div class="tw-h-full {{#if (eq breakState "auto-break")}}tw-bg-[var(--wh40k-wounds-secondary)]{{else if (eq breakState "penalised")}}tw-bg-[var(--wh40k-warning-primary)]{{else if (eq breakState "will-test")}}tw-bg-[var(--wh40k-card-gold)]{{else}}tw-bg-[var(--wh40k-accent-overlay)]{{/if}}" style="width:{{magnitudePercent}}%"></div>
    </div>
    {{#if traits.length}}
    <ul class="tw-flex tw-flex-wrap tw-gap-1 tw-mt-2 tw-list-none tw-p-0">
        {{#each traits}}<li class="tw-text-[0.65rem] tw-uppercase tw-tracking-wider tw-px-2 tw-py-0.5 tw-rounded tw-bg-[var(--wh40k-panel-bg-translucent)] tw-text-[var(--wh40k-card-muted)]">{{this}}</li>{{/each}}
    </ul>
    {{/if}}
</section>
`;

const tpl = HandlebarsLib.compile(PANEL_TEMPLATE);

function buildContext(args: HordePanelArgs): HordePanelContext {
    const tier = getHordeTier(args.magnitudeCurrent);
    const pct = args.magnitudeMax > 0 ? Math.round((args.magnitudeCurrent / args.magnitudeMax) * 100) : 0;
    const startingRatio = args.magnitudeMax > 0 ? args.magnitudeCurrent / args.magnitudeMax : 0;
    const breakState: HordePanelContext['breakState'] =
        startingRatio < 0.25 ? 'auto-break' : startingRatio < 0.5 ? 'penalised' : startingRatio < 0.75 ? 'will-test' : 'safe';
    return {
        actorName: args.actorName,
        gameSystem: args.gameSystem,
        magnitudeCurrent: args.magnitudeCurrent,
        magnitudeMax: args.magnitudeMax,
        magnitudePercent: pct,
        bonusDamageDice: bonusDamageDiceForMagnitude(args.magnitudeCurrent),
        toHitBonus: toHitBonusForMagnitude(args.magnitudeCurrent),
        sizeKeyword: tier.sizeKeyword,
        tierDescriptor: tier.descriptor,
        breakState,
        traits: args.traits,
    };
}

function renderPanel(args: HordePanelArgs): HTMLElement {
    return renderMockTemplate(tpl, buildContext(args));
}

const meta: Meta<HordePanelArgs> = {
    title: 'Actor/Panels/DwHordeMagnitudePanel (#166)',
    render: (args) => renderPanel(args),
    args: {
        actorName: 'Tyranid Hormagaunt Horde',
        gameSystem: 'dw',
        magnitudeCurrent: 30,
        magnitudeMax: 30,
        traits: ['Fearless', 'Overwhelming'],
    },
};
export default meta;

type Story = StoryObj<HordePanelArgs>;

export const Mob: Story = {
    name: 'Mob — Magnitude 30 / Massive / +30',
};

export const Throng: Story = {
    name: 'Throng — Magnitude 60 / Immense / +40',
    args: {
        actorName: 'Chaos Heretic Throng',
        magnitudeCurrent: 60,
        magnitudeMax: 60,
        traits: ['Blood Soaked Tide', 'Frenzy'],
    },
};

export const MassedAssault: Story = {
    name: 'Massed Assault — Magnitude 90 / Monumental / +50',
    args: {
        actorName: 'Ork Boyz Massed Assault',
        magnitudeCurrent: 90,
        magnitudeMax: 90,
        traits: ['Brutal Charge'],
    },
};

export const SerriedTide: Story = {
    name: 'Serried Tide — Magnitude 120 / Titanic / +60',
    args: {
        actorName: 'Tyranid Hormagaunt Tide',
        magnitudeCurrent: 120,
        magnitudeMax: 120,
        traits: ['Fearless'],
    },
};

export const Wounded: Story = {
    name: 'Wounded — Magnitude 14 of 30 (test at -10)',
    args: {
        magnitudeCurrent: 14,
        magnitudeMax: 30,
    },
};

export const NearBroken: Story = {
    name: 'Near Broken — Magnitude 6 of 30 (auto-break)',
    args: {
        magnitudeCurrent: 6,
        magnitudeMax: 30,
    },
};
