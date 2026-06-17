import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import {
    resolveGravitonBonusDamage,
    resolveHitEffectSaveTarget,
    resolveLanceBonus,
    resolveMaximalEffect,
    resolvePowerFieldParryDestroys,
    resolveScatterRangeBand,
    resolveStunDuration,
    resolveTemplateRadius,
} from '../../src/module/rules/weapon-quality-effects.ts';
import { setWeaponQualityPayloadsForTesting } from '../../src/module/rules/weapon-quality-payloads.ts';
import qualityChatSrc from '../../src/templates/chat/weapon-quality-effect-chat.hbs?raw';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

/**
 * Chat-card story coverage for the bespoke weapon-quality outcomes
 * promoted in #57 (completion). Each story drives the
 * `weapon-quality-effect-chat.hbs` partial through the per-quality
 * pure resolvers (no hand-authored payload shape).
 *
 * The mechanical payloads now live on the weaponQuality compendium docs and are
 * read through the boot index (#303). Foundry is not booted under Storybook, so we
 * seed that index with the same values the rt-core weaponQuality pack carries —
 * the browser-side analogue of the Vitest suite, which reads the real pack
 * `_source` and is the authoritative payload-regression surface.
 *
 * Per-system theming: stories set `gameSystem: 'dh2'` so the card's
 * `data-wh40k-system` anchor activates the `dh2:*` Tailwind variant
 * chain on the border / accent.
 */

initializeStoryHandlebars();

// Seed the #303 boot index with the rt-core weaponQuality pack values the
// index-backed resolvers below read (Scatter range bands, Maximal package,
// Concussive hit-effect save penalty). Pure resolvers (Lance, Graviton, Stun,
// Template radius) do not consult the index.
setWeaponQualityPayloadsForTesting({
    scatter: { type: 'damage', rangeBands: { pointBlank: 3, shortRange: 0, standardRange: -3, longRange: -3, extremeRange: -3 } },
    maximal: { type: 'damage', maximalDamageDice: '1d10', maximalPenetrationBonus: 2, triggersRecharge: true },
    concussive: {
        type: 'hit-effect',
        hitEffect: { requiresSave: 'toughness', failEffect: 'stunned', stunRoundsVariable: true, stunRounds: null, saveTargetPenaltyPerLevel: -10 },
    },
});

interface QualityPayload {
    radius?: number;
    templateShape?: string;
    rangeBand?: string;
    rangeBandDelta?: number;
    saveCharacteristic?: string;
    saveTarget?: number;
    savePenalty?: number;
    failEffectKey?: string;
    stunRounds?: number;
    fatigue?: number;
    bonusDamageDice?: string;
    bonusDamage?: number;
    bonusPenetration?: number;
    triggersRecharge?: boolean;
    appliesOverheats?: boolean;
    powerFieldDestroyed?: boolean;
    radiusUnit?: string;
}

interface WeaponQualityCardContext {
    gameSystem: string;
    qualityKey: string;
    qualityLabelKey: string;
    qualityDescKey: string;
    accentClass: string;
    iconClass: string;
    payload: QualityPayload;
}

function ctx(opts: { qualityKey: string; accentClass: string; iconClass: string; payload: QualityPayload; gameSystem?: string }): WeaponQualityCardContext {
    const labelKey = `WH40K.Quality.${capitalize(String(opts.qualityKey))}.Name`;
    const descKey = `WH40K.Quality.${capitalize(String(opts.qualityKey))}.Description`;
    return {
        gameSystem: opts.gameSystem ?? 'dh2',
        qualityKey: opts.qualityKey,
        qualityLabelKey: labelKey,
        qualityDescKey: descKey,
        accentClass: opts.accentClass,
        iconClass: opts.iconClass,
        payload: opts.payload,
    };
}

function capitalize(s: string): string {
    if (s.length === 0) return s;
    // Power-field → PowerField; razor-sharp → RazorSharp.
    return s
        .split('-')
        .map((part) => (part.length === 0 ? part : part[0].toUpperCase() + part.slice(1)))
        .join('');
}

const meta: Meta = {
    title: 'Chat/Weapon Quality (#57 completion)',
};
export default meta;

type Story = StoryObj;

export const SprayTemplate: Story = {
    name: 'Spray — cone template + Agility avoidance',
    render: () =>
        renderSheet(
            qualityChatSrc,
            ctx({
                qualityKey: 'spray',
                accentClass: 'tw-text-orange-300',
                iconClass: 'fa-fan',
                payload: {
                    templateShape: 'cone',
                    saveCharacteristic: 'agility',
                    saveTarget: 35,
                    failEffectKey: 'WH40K.Quality.FailEffect.hit',
                },
            }),
        ),
    play: async ({ canvasElement }) => {
        const card = canvasElement.querySelector('.wh40k-quality-card');
        await expect(card).toBeTruthy();
        await expect(card?.getAttribute('data-quality-key')).toBe('spray');
        await expect(canvasElement.querySelector('[data-row="template-shape"]')).toBeTruthy();
        await expect(canvasElement.querySelector('[data-row="save"]')).toBeTruthy();
    },
};

export const FlameBurning: Story = {
    name: 'Flame — Agility test or Burning',
    render: () => {
        const target = resolveHitEffectSaveTarget({ characteristicTotal: 35, key: 'flame', level: 0 });
        return renderSheet(
            qualityChatSrc,
            ctx({
                qualityKey: 'flame',
                accentClass: 'tw-text-red-400',
                iconClass: 'fa-fire',
                payload: {
                    saveCharacteristic: 'agility',
                    saveTarget: target,
                    failEffectKey: 'WH40K.Quality.FailEffect.burning',
                },
            }),
        );
    },
    play: async ({ canvasElement }) => {
        const fail = canvasElement.querySelector('[data-row="fail-effect"]');
        await expect(fail).toBeTruthy();
    },
};

export const GravitonKnockdown: Story = {
    name: 'Graviton — Strength test or Prone (+armour as damage)',
    render: () =>
        renderSheet(
            qualityChatSrc,
            ctx({
                qualityKey: 'graviton',
                accentClass: 'tw-text-violet-300',
                iconClass: 'fa-arrow-down',
                payload: {
                    saveCharacteristic: 'strength',
                    saveTarget: 40,
                    bonusDamage: resolveGravitonBonusDamage(5),
                    failEffectKey: 'WH40K.Quality.FailEffect.prone',
                },
            }),
        ),
};

export const LancePenByDoS: Story = {
    name: 'Lance — Pen × DoS (4 base × 3 DoS → +8 delta)',
    render: () =>
        renderSheet(
            qualityChatSrc,
            ctx({
                qualityKey: 'lance',
                accentClass: 'tw-text-sky-300',
                iconClass: 'fa-bolt-lightning',
                payload: {
                    bonusPenetration: resolveLanceBonus(4, 3),
                },
            }),
        ),
    play: async ({ canvasElement }) => {
        const row = canvasElement.querySelector('[data-row="bonus-pen"]');
        await expect(row?.textContent).toContain('+8');
    },
};

export const MaximalRecharge: Story = {
    name: 'Maximal — recharge / overheat package',
    render: () => {
        const r = resolveMaximalEffect();
        return renderSheet(
            qualityChatSrc,
            ctx({
                qualityKey: 'maximal',
                accentClass: 'tw-text-amber-300',
                iconClass: 'fa-explosion',
                payload: {
                    bonusDamageDice: r.bonusDamageDice,
                    bonusPenetration: r.bonusPenetration,
                    appliesOverheats: r.appliesOverheats,
                    triggersRecharge: r.triggersRecharge,
                },
            }),
        );
    },
};

export const PowerFieldParryDestroy: Story = {
    name: 'Power Field — parry destroys ordinary weapon',
    render: () => {
        const pf = { system: { special: new Set(['power-field']) } } as Parameters<typeof resolvePowerFieldParryDestroys>[0];
        const ord = { system: { special: new Set<string>() } } as Parameters<typeof resolvePowerFieldParryDestroys>[1];
        const destroyed = resolvePowerFieldParryDestroys(pf, ord);
        return renderSheet(
            qualityChatSrc,
            ctx({
                qualityKey: 'power-field',
                accentClass: 'tw-text-cyan-300',
                iconClass: 'fa-shield-halved',
                payload: { powerFieldDestroyed: destroyed },
            }),
        );
    },
    play: async ({ canvasElement }) => {
        const banner = canvasElement.querySelector('[data-row="parry-destroyed"]');
        await expect(banner).toBeTruthy();
    },
};

export const ScatterPointBlank: Story = {
    name: 'Scatter — Point Blank (+3 damage)',
    render: () =>
        renderSheet(
            qualityChatSrc,
            ctx({
                qualityKey: 'scatter',
                accentClass: 'tw-text-amber-200',
                iconClass: 'fa-burst',
                payload: {
                    rangeBand: 'Point Blank',
                    rangeBandDelta: resolveScatterRangeBand('Point Blank'),
                },
            }),
        ),
};

export const ScatterLongRange: Story = {
    name: 'Scatter — Long Range (−3 damage)',
    render: () =>
        renderSheet(
            qualityChatSrc,
            ctx({
                qualityKey: 'scatter',
                accentClass: 'tw-text-amber-200',
                iconClass: 'fa-burst',
                payload: {
                    rangeBand: 'Long Range',
                    rangeBandDelta: resolveScatterRangeBand('Long Range'),
                },
            }),
        ),
    play: async ({ canvasElement }) => {
        const row = canvasElement.querySelector('[data-row="range-band"]');
        await expect(row?.textContent).toContain('-3');
    },
};

export const ShockingStun: Story = {
    name: 'Shocking — Toughness or 1-round Stun + Fatigue',
    render: () =>
        renderSheet(
            qualityChatSrc,
            ctx({
                qualityKey: 'shocking',
                accentClass: 'tw-text-yellow-300',
                iconClass: 'fa-bolt',
                payload: {
                    saveCharacteristic: 'toughness',
                    saveTarget: 40,
                    stunRounds: resolveStunDuration({ dof: 3, key: 'shocking' }),
                    fatigue: 1,
                    failEffectKey: 'WH40K.Quality.FailEffect.stunned',
                },
            }),
        ),
    play: async ({ canvasElement }) => {
        const stun = canvasElement.querySelector('[data-row="stun-rounds"]');
        await expect(stun?.textContent).toMatch(/2/); // ceil(3/2) = 2
        await expect(canvasElement.querySelector('[data-row="fatigue"]')?.textContent).toContain('+1');
    },
};

export const BlastRadius: Story = {
    name: 'Blast (5) — 5m sphere',
    render: () =>
        renderSheet(
            qualityChatSrc,
            ctx({
                qualityKey: 'blast',
                accentClass: 'tw-text-orange-400',
                iconClass: 'fa-bomb',
                payload: { radius: resolveTemplateRadius(5), templateShape: 'sphere' },
            }),
        ),
};

export const PerSystemImperiumMaledictum: Story = {
    name: 'Per-system homologation check — IM Concussive variant',
    render: () =>
        renderSheet(
            qualityChatSrc,
            ctx({
                qualityKey: 'concussive',
                accentClass: 'tw-text-red-300',
                iconClass: 'fa-hammer',
                gameSystem: 'im',
                payload: {
                    saveCharacteristic: 'toughness',
                    saveTarget: resolveHitEffectSaveTarget({ characteristicTotal: 40, key: 'concussive', level: 3 }),
                    savePenalty: -30,
                    stunRounds: 2,
                    failEffectKey: 'WH40K.Quality.FailEffect.stunned',
                },
            }),
        ),
    play: async ({ canvasElement }) => {
        const card = canvasElement.querySelector('[data-wh40k-system="im"]');
        await expect(card).toBeTruthy();
    },
};
