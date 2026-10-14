/**
 * Storybook stories for the area-attack resolution card (`area-resolution-chat.hbs`,
 * #599): who the template caught, each creature's avoidance test printed as base ±
 * every provenance row = target and the d100 against it, and the Roll Damage that rolls
 * one hit per creature hit.
 *
 * Stories cover:
 *   1. SprayResults   — one creature hit (untrained wielder, +20 row), one avoided.
 *   2. AllAvoided     — nobody hit, so no Roll Damage.
 *   3. BlastResults   — a hit area: everyone inside hit, no tests.
 *   4. NoDamageBlast  — a no-damage weapon (#601): everyone caught listed, no Roll Damage.
 *   5. PerSystem      — the Spray card framed under each of the six FFG lines.
 *   6. TrainedSprayNoZeroRows   — a +0 test by a trained wielder: no "Difficulty 0" row (#616).
 *   7. HardSprayKeepsDifficulty — a −10 test keeps its difficulty row (#616).
 *
 * Provenance rows come from the resolution path's own `areaAvoidanceComponents`.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { localizeKey } from '../../../stories/mocks/lang-localize';
import { renderSheet } from '../../../stories/test-helpers';
import { type AreaAvoidanceRule, type AvoidanceWielder, areaAvoidanceComponents } from '../../module/rules/area-template.ts';
import cardSrc from './area-resolution-chat.hbs?raw';

type SystemId = 'bc' | 'dh1' | 'dh2' | 'dw' | 'ow' | 'rt';

interface ComponentRow {
    label: string;
    value: number;
    tooltipData: string;
}

interface ResultRow {
    name: string;
    hit: boolean;
    outcomeLabel: string;
    test: { label: string; base: number; roll: number; target: number; components: ComponentRow[] } | null;
}

interface AreaResolutionCtx {
    rollId: string;
    weaponName: string;
    summary: string;
    results: ResultRow[];
    anyHit: boolean;
    /** The weapon deals no damage (#601): who is caught takes its qualities only. */
    noDamage?: boolean;
    gameSystem?: SystemId;
}

function row(label: string, value: number, source: string): ComponentRow {
    return { label, value, tooltipData: JSON.stringify({ source, label, value }) };
}

function avoidance(name: string, base: number, roll: number, components: ComponentRow[]): ResultRow {
    const target = base + components.reduce((sum, c) => sum + c.value, 0);
    const hit = roll > target;
    return { name, hit, outcomeLabel: hit ? 'Hit' : 'Avoided', test: { label: 'Agility test', base, roll, target, components } };
}

const SPRAY_SUMMARY = 'Spray: no attack roll. Targets in the cone test Agility (+0).';
const SPRAY_RULE: AreaAvoidanceRule = { modifier: 0, untrainedBonus: 20, unbracedHeavyBonus: 30 };

/** The provenance rows the resolution path builds for a rule and wielder, labelled from the langpack. */
function componentRows(rule: AreaAvoidanceRule, wielder: AvoidanceWielder): ComponentRow[] {
    return areaAvoidanceComponents(rule, wielder).map((component) => row(localizeKey(component.label), component.value, component.source));
}

const UNTRAINED = componentRows(SPRAY_RULE, { trained: false, heavyUnbraced: false });
const TRAINED = componentRows(SPRAY_RULE, { trained: true, heavyUnbraced: false });

function sprayCtx(results: ResultRow[], gameSystem?: SystemId): AreaResolutionCtx {
    const ctx: AreaResolutionCtx = { rollId: 'roll-spray', weaponName: 'Hand Flamer', summary: SPRAY_SUMMARY, results, anyHit: results.some((r) => r.hit) };
    if (gameSystem !== undefined) ctx.gameSystem = gameSystem;
    return ctx;
}

function renderCard(ctx: AreaResolutionCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    if (ctx.gameSystem !== undefined) {
        wrapper.dataset['wh40kSystem'] = ctx.gameSystem;
        wrapper.classList.add('theme-dark');
    }
    wrapper.appendChild(renderSheet(cardSrc, ctx));
    return wrapper;
}

const meta: Meta<AreaResolutionCtx> = {
    title: 'Chat / Area Attack Resolution',
};
export default meta;
type Story = StoryObj<AreaResolutionCtx>;

export const SprayResults: Story = {
    name: 'Spray — one hit, one avoided, provenance rows',
    args: sprayCtx([avoidance('Cultist', 30, 71, UNTRAINED), avoidance('Hive Ganger', 35, 22, UNTRAINED)]),
    render: (args) => renderCard(args),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-area-statement]')?.textContent.trim()).toBe(SPRAY_SUMMARY);
        const targets = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-area-target]'));
        await expect(targets.map((t) => t.dataset['areaHit'])).toEqual(['true', 'false']);
        await expect(targets.map((t) => t.querySelector('[data-area-outcome]')?.textContent.trim())).toEqual(['Hit', 'Avoided']);
        // Base, every modifier with its provenance, then the d100 against the target.
        await expect(targets[0]?.querySelector('[data-area-base]')?.textContent.trim()).toBe('30');
        await expect(targets[0]?.querySelector('[data-area-roll]')?.textContent).toContain('71 vs 50');
        // The +0 difficulty adds no row (#616); the untrained bonus keeps its provenance.
        const rows = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-wh40k-tooltip="modifier"]'));
        await expect(rows.length).toBe(2);
        const sources = rows.map((r) => (JSON.parse(r.dataset['wh40kTooltipData'] ?? '{}') as { source?: string }).source);
        await expect(sources).toEqual(['weapon-training', 'weapon-training']);
        const damage = canvasElement.querySelector<HTMLButtonElement>('.roll-control__roll-damage');
        await expect(damage?.dataset['rollId']).toBe('roll-spray');
    },
};

export const AllAvoided: Story = {
    name: 'Spray — everyone avoided, no Roll Damage',
    args: sprayCtx([avoidance('Cultist', 40, 12, TRAINED)]),
    render: (args) => renderCard(args),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-area-outcome]')?.textContent.trim()).toBe('Avoided');
        await expect(canvasElement.querySelector('.roll-control__roll-damage')).toBeNull();
    },
};

/** A trained wielder against a +0 test: nothing changes the target, so no provenance rows (#616). */
export const TrainedSprayNoZeroRows: Story = {
    name: 'Spray — trained wielder, +0 test: no "Difficulty 0" row',
    args: sprayCtx([avoidance('Mark', 30, 96, TRAINED), avoidance('Flanker', 30, 5, TRAINED)]),
    render: (args) => renderCard(args),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelectorAll('[data-wh40k-tooltip="modifier"]').length).toBe(0);
        await expect(canvasElement.textContent).not.toMatch(/Difficulty\s*0/u);
        // The test's named difficulty stays in the statement heading.
        await expect(canvasElement.querySelector('[data-area-statement]')?.textContent).toContain('(+0)');
        await expect(canvasElement.querySelector('[data-area-roll]')?.textContent).toContain('96 vs 30');
    },
};

/** A harder avoidance test keeps its difficulty row, with its provenance (#616). */
export const HardSprayKeepsDifficulty: Story = {
    name: 'Spray — a −10 test keeps its difficulty row',
    args: sprayCtx([avoidance('Mark', 30, 40, componentRows({ ...SPRAY_RULE, modifier: -10 }, { trained: true, heavyUnbraced: false }))]),
    render: (args) => renderCard(args),
    play: async ({ canvasElement }) => {
        const rows = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-wh40k-tooltip="modifier"]'));
        await expect(rows.map((r) => (JSON.parse(r.dataset['wh40kTooltipData'] ?? '{}') as { source?: string; value?: number }).value)).toEqual([-10]);
        await expect(rows[0]?.textContent).toContain(localizeKey('WH40K.AreaAttack.Avoid.Difficulty'));
        await expect(canvasElement.querySelector('[data-area-roll]')?.textContent).toContain('40 vs 20');
    },
};

export const BlastResults: Story = {
    name: 'Blast (3) — everyone inside hit, no tests',
    args: {
        rollId: 'roll-blast',
        weaponName: 'Frag Grenade',
        summary: 'Blast (3): Everyone in the blast (3 m) takes a hit.',
        results: [
            { name: 'Cultist', hit: true, outcomeLabel: 'Hit', test: null },
            { name: 'Servitor', hit: true, outcomeLabel: 'Hit', test: null },
        ],
        anyHit: true,
    },
    render: (args) => renderCard(args),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelectorAll('[data-area-target][data-area-hit="true"]').length).toBe(2);
        await expect(canvasElement.querySelector('[data-area-roll]')).toBeNull();
        await expect(canvasElement.querySelector('.roll-control__roll-damage')).not.toBeNull();
    },
};

export const NoDamageBlast: Story = {
    name: 'Blast (3) — no-damage weapon, nothing to roll',
    args: {
        rollId: 'roll-stun',
        weaponName: 'Stun Grenade',
        summary: 'Blast (3): Everyone in the blast (3 m) takes a hit.',
        results: [
            { name: 'Cultist', hit: true, outcomeLabel: 'Hit', test: null },
            { name: 'Servitor', hit: true, outcomeLabel: 'Hit', test: null },
        ],
        anyHit: true,
        noDamage: true,
    },
    render: (args) => renderCard(args),
    play: async ({ canvasElement }) => {
        // Everyone caught is still listed: the Concussive quality applies to each.
        await expect(canvasElement.querySelectorAll('[data-area-target][data-area-hit="true"]').length).toBe(2);
        await expect(canvasElement.querySelector('.roll-control__roll-damage')).toBeNull();
        await expect(canvasElement.querySelector('[data-no-damage]')?.textContent).toContain('No Damage');
    },
};

const SYSTEMS: readonly SystemId[] = ['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt'];

export const PerSystem: Story = {
    name: 'Spray results — framed per game line',
    render: () => {
        const root = document.createElement('div');
        for (const system of SYSTEMS) root.appendChild(renderCard(sprayCtx([avoidance('Cultist', 30, 71, UNTRAINED)], system)));
        return root;
    },
    play: async ({ canvasElement }) => {
        for (const system of SYSTEMS) {
            const frame = canvasElement.querySelector(`[data-wh40k-system="${system}"]`);
            // eslint-disable-next-line no-await-in-loop -- one assertion per line, in order
            await expect(frame?.querySelector('[data-area-target]')).not.toBeNull();
        }
    },
};
