/**
 * Storybook stories for the Critical Damage **side-effects readout** on the
 * assign-damage chat card (`assign-damage-chat.hbs`).
 *
 * The card renders `this.criticalSideEffects` (a `CriticalSideEffectReport`,
 * see `src/module/rules/active-effects.ts`) when `this.hasCriticalSideEffects`
 * is set. This section surfaces the non-condition physical fallout of a
 * Critical Damage result — armour negated, the unarmoured-worsens note, a
 * helmet torn off, a weapon destroyed, an item dropped, and carried munitions
 * cooking off (each with rolled secondary damage, or "GM resolves" when the
 * blast is fixed prose the GM adjudicates by hand).
 *
 * Each story below isolates one row (plus a combined report), and the `play`
 * functions assert that every row renders with its localized
 * `WH40K.CriticalDamage.SideEffects.*` label and the correct munition
 * damage / GM-resolve text. Two homologation stories run the combined report
 * through `withSystem` for DH2 and RT so the per-system card treatment (the
 * `data-wh40k-system` root attribute) is exercised across lines.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { mockActor, type MockActor } from '../../../stories/mocks';
import { withSystem } from '../../../stories/mocks/extended';
import { renderSheet } from '../../../stories/test-helpers';
import cardSrc from './assign-damage-chat.hbs?raw';

// ── Card context shapes (mirror what assign-damage-chat.hbs consumes) ─────────

/** One entry of `criticalSideEffects.munitions` — `DetonatedMunition`. */
interface MunitionCtx {
    name: string;
    /** Rolled secondary-damage total, or null → the card shows "GM resolves". */
    damage: number | null;
    damageType: string | null;
}

/** The `CriticalSideEffectReport` fields the template's `{{#with}}` block reads. */
interface SideEffectsCtx {
    armourNegated: boolean;
    unarmouredWorsens: boolean;
    helmetTornOff: string | null;
    itemDropped: string | null;
    weaponBroken: string | null;
    munitions: MunitionCtx[];
}

/** Minimal actor surface the card's status rows / header read. */
interface CardActor {
    name: string;
    uuid: string;
    system: {
        wounds: { value: number; max: number; critical: number };
        fatigue: { value: number; max: number };
    };
}

interface AssignDamageCardCtx {
    gameSystem: string;
    actor: CardActor;
    hasDamage: boolean;
    hit: { location: string; damageType: string };
    damageTaken: number;
    hasFatigueDamage: boolean;
    hasCriticalDamage: boolean;
    criticalDamageTaken: number;
    criticalEffect: string;
    hasCriticalSideEffects: boolean;
    criticalSideEffects: SideEffectsCtx;
}

// ── Localized strings the play functions assert against (src/lang/en.json) ────

const L = {
    title: 'Critical Side Effects',
    armourNegated: 'Worn armour absorbed the effect — no additional harm.',
    unarmouredWorsens: 'Worn armour reduced the effect — GM adjudicates the lesser (armoured) outcome.',
    helmetTornOff: 'Helmet torn off',
    itemDropped: 'Dropped from hand',
    weaponDestroyed: 'Weapon destroyed — unusable until repaired',
    munitionsTitle: 'Carried munitions detonate!',
} as const;

/** MunitionDamage: "{name}: {damage} {type} damage — GM distributes the blast". */
function munitionDamageText(m: { name: string; damage: number; type: string }): string {
    return `${m.name}: ${m.damage} ${m.type} damage — GM distributes the blast`;
}

/** MunitionGmResolve: "{name} detonates — GM resolves the blast per the effect text". */
function munitionGmResolveText(name: string): string {
    return `${name} detonates — GM resolves the blast per the effect text`;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const EMPTY_SIDE_EFFECTS: SideEffectsCtx = {
    armourNegated: false,
    unarmouredWorsens: false,
    helmetTornOff: null,
    itemDropped: null,
    weaponBroken: null,
    munitions: [],
};

const DEFAULT_ACTOR: CardActor = {
    name: 'Acolyte Vex',
    uuid: 'Actor.acolyte-vex',
    system: {
        wounds: { value: 4, max: 12, critical: 2 },
        fatigue: { value: 1, max: 12 },
    },
};

/** Adapt a per-system `MockActor` to the card's minimal actor surface. */
function actorFromMock(base: MockActor): CardActor {
    return {
        name: base.name,
        uuid: `Actor.${base._id}`,
        system: {
            wounds: { value: base.system.wounds.value, max: base.system.wounds.max, critical: 2 },
            fatigue: { value: base.system.fatigue.value, max: base.system.fatigue.max },
        },
    };
}

/** Build a full card context around a partial side-effects report. */
function cardContext(sideEffects: Partial<SideEffectsCtx>, overrides: Partial<AssignDamageCardCtx> = {}): AssignDamageCardCtx {
    return {
        gameSystem: 'dh2',
        actor: DEFAULT_ACTOR,
        hasDamage: true,
        hit: { location: 'Head', damageType: 'Rending' },
        damageTaken: 9,
        hasFatigueDamage: false,
        hasCriticalDamage: true,
        criticalDamageTaken: 3,
        criticalEffect: 'The blow leaves the target reeling.',
        hasCriticalSideEffects: true,
        criticalSideEffects: { ...EMPTY_SIDE_EFFECTS, ...sideEffects },
        ...overrides,
    };
}

/** Render the card wrapped in a `.wh40k-rpg` ancestor so `tw-*` utilities apply. */
function renderCard(ctx: AssignDamageCardCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = ctx.gameSystem;
    wrapper.appendChild(renderSheet(cardSrc, ctx));
    return wrapper;
}

const meta: Meta<AssignDamageCardCtx> = {
    title: 'Chat / Assign Damage — Critical Side Effects',
};
export default meta;
type Story = StoryObj<AssignDamageCardCtx>;

// ── Single-row stories ────────────────────────────────────────────────────────

export const HelmetTornOff: Story = {
    name: 'Helmet torn off',
    render: () => renderCard(cardContext({ helmetTornOff: 'Mesh Coif' })),
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText(L.title)).toBeTruthy();
        const text = canvasElement.textContent;
        await expect(text).toContain(L.helmetTornOff);
        await expect(text).toContain('Mesh Coif');
    },
};

export const WeaponDestroyed: Story = {
    name: 'Weapon destroyed',
    render: () => renderCard(cardContext({ weaponBroken: 'Godwyn-Deaz Boltgun' })),
    play: async ({ canvasElement }) => {
        const text = canvasElement.textContent;
        await expect(text).toContain(L.weaponDestroyed);
        await expect(text).toContain('Godwyn-Deaz Boltgun');
    },
};

export const ItemDropped: Story = {
    name: 'Item dropped from hand',
    render: () => renderCard(cardContext({ itemDropped: 'Chainsword' })),
    play: async ({ canvasElement }) => {
        const text = canvasElement.textContent;
        await expect(text).toContain(L.itemDropped);
        await expect(text).toContain('Chainsword');
    },
};

export const ArmourNegated: Story = {
    name: 'Armour negated (no additional harm)',
    render: () => renderCard(cardContext({ armourNegated: true })),
    play: async ({ canvasElement }) => {
        const text = canvasElement.textContent;
        await expect(text).toContain(L.armourNegated);
    },
};

export const UnarmouredWorsens: Story = {
    name: 'Unarmoured-worsens note (GM adjudicates lesser outcome)',
    render: () => renderCard(cardContext({ unarmouredWorsens: true })),
    play: async ({ canvasElement }) => {
        const text = canvasElement.textContent;
        await expect(text).toContain(L.unarmouredWorsens);
    },
};

export const MunitionsDetonating: Story = {
    name: 'Munitions detonate (rolled grenade + GM-resolve ammunition)',
    render: () =>
        renderCard(
            cardContext({
                munitions: [
                    { name: 'Frag Grenade', damage: 12, damageType: 'explosive' },
                    { name: 'Krak Missile', damage: null, damageType: null },
                ],
            }),
        ),
    play: async ({ canvasElement }) => {
        const text = canvasElement.textContent;
        await expect(text).toContain(L.munitionsTitle);
        // Rolled grenade → damage/type line.
        await expect(text).toContain(munitionDamageText({ name: 'Frag Grenade', damage: 12, type: 'explosive' }));
        // Loose ammunition (damage null) → GM-resolve line.
        await expect(text).toContain(munitionGmResolveText('Krak Missile'));
    },
};

export const CombinedReport: Story = {
    name: 'Combined report (every row + munitions)',
    render: () =>
        renderCard(
            cardContext({
                armourNegated: true,
                unarmouredWorsens: true,
                helmetTornOff: 'Mesh Coif',
                weaponBroken: 'Godwyn-Deaz Boltgun',
                itemDropped: 'Chainsword',
                munitions: [
                    { name: 'Frag Grenade', damage: 12, damageType: 'explosive' },
                    { name: 'Krak Missile', damage: null, damageType: null },
                ],
            }),
        ),
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText(L.title)).toBeTruthy();
        const text = canvasElement.textContent;
        // Independent row assertions → run in parallel (no await-in-loop).
        await Promise.all(
            [L.armourNegated, L.unarmouredWorsens, L.helmetTornOff, L.weaponDestroyed, L.itemDropped, L.munitionsTitle].map(async (label) => {
                await expect(text).toContain(label);
            }),
        );
        await expect(text).toContain(munitionDamageText({ name: 'Frag Grenade', damage: 12, type: 'explosive' }));
        await expect(text).toContain(munitionGmResolveText('Krak Missile'));
    },
};

// ── Per-system homologation (combined report through withSystem) ──────────────

export const HomologationDH2: Story = {
    name: 'Homologation / DH2 (withSystem)',
    render: () => {
        const actor = actorFromMock(withSystem(mockActor(), 'dh2'));
        return renderCard(
            cardContext(
                {
                    helmetTornOff: 'Mesh Coif',
                    weaponBroken: 'Godwyn-Deaz Boltgun',
                    munitions: [{ name: 'Frag Grenade', damage: 12, damageType: 'explosive' }],
                },
                { actor, gameSystem: 'dh2' },
            ),
        );
    },
    play: async ({ canvasElement }) => {
        const root = canvasElement.querySelector<HTMLElement>('[data-wh40k-system="dh2"]');
        await expect(root).toBeTruthy();
        const text = canvasElement.textContent;
        await expect(text).toContain(L.helmetTornOff);
        await expect(text).toContain(munitionDamageText({ name: 'Frag Grenade', damage: 12, type: 'explosive' }));
    },
};

export const HomologationRT: Story = {
    name: 'Homologation / Rogue Trader (withSystem)',
    render: () => {
        const actor = actorFromMock(withSystem(mockActor(), 'rt'));
        return renderCard(
            cardContext(
                {
                    itemDropped: 'Chainsword',
                    munitions: [{ name: 'Krak Missile', damage: null, damageType: null }],
                },
                { actor, gameSystem: 'rt' },
            ),
        );
    },
    play: async ({ canvasElement }) => {
        const root = canvasElement.querySelector<HTMLElement>('[data-wh40k-system="rt"]');
        await expect(root).toBeTruthy();
        const text = canvasElement.textContent;
        await expect(text).toContain(L.itemDropped);
        await expect(text).toContain(munitionGmResolveText('Krak Missile'));
    },
};
