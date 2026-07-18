/**
 * Storybook stories for the action-roll chat card (`action-roll-chat.hbs`) —
 * the full roll-transparency surface: the modifier-breakdown partial (base ±
 * every provenance-bearing modifier = target), the roll-vs-target audit row, the
 * degrees-of-success readout, and the hoverable `resultFormula` that shows
 * exactly how the degrees were derived.
 *
 * Stories cover:
 *   1. Success        — sourced modifier breakdown + resultFormula, hit succeeds.
 *   2. Failure        — sourced breakdown, roll over target, DoF + resultFormula.
 *   3. CapFired       — raw modifier total beyond ±60, cap row + breakdown.
 *   4. TargetOnly     — target posted, no dice entered (breakdown only).
 *   5. PerSystem      — the Success card framed under each of the 7 systems,
 *                       the IM frame routed through `withSystem(..., 'im')`.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { mockActor } from '../../../stories/mocks';
import { withSystem, type SystemId } from '../../../stories/mocks/extended';
import { renderSheet } from '../../../stories/test-helpers';
import cardSrc from './action-roll-chat.hbs?raw';

/** A provenance-bearing modifier component (label + signed value + source). */
interface SourcedComponent {
    label: string;
    value: number;
    source: string;
    /** JSON payload the wh40k-tooltip "modifier" handler parses at hover time. */
    tooltipData: string;
}

interface ActionRollData {
    name: string;
    action: string;
    effectString?: string;
    isManualRoll: boolean;
    gameSystem?: SystemId;
    // Modifier-breakdown inputs.
    ignoreModifiers: boolean;
    baseTarget: number;
    modifiedTarget: number;
    activeModifiers: Record<string, number>;
    modifierSources: SourcedComponent[];
    modifierCapFired?: boolean;
    rawModifierTotal?: number;
    modifierTotal?: number;
    // Roll / degrees / result inputs.
    isTargetOnly?: boolean;
    roll?: { total: number };
    success?: boolean;
    dos?: number;
    dof?: number;
    resultFormula?: string;
    hitLocation?: string;
    // Keep the focus on transparency: suppress the action-control button row.
    ignoreControls: boolean;
    usesAmmo?: boolean;
    isOpposed?: boolean;
    ignoreDegrees?: boolean;
    ignoreSuccess?: boolean;
}

interface ActionRollChatCtx {
    id: string;
    label: string;
    rollData: ActionRollData;
    effectOutput: never[];
}

function sourced(label: string, value: number, source: string, detail: Record<string, string | number | boolean> = {}): SourcedComponent {
    return {
        label,
        value,
        source,
        tooltipData: JSON.stringify({ source, label, value, ...detail }),
    };
}

function sumValues(components: readonly SourcedComponent[]): number {
    return components.reduce((acc, component) => acc + component.value, 0);
}

/**
 * Render the card. The template is a block-partial caller of
 * `roll-card-shell.hbs`, which emits `data-wh40k-system` from `rollData.gameSystem`
 * and is scoped by Tailwind's `.wh40k-rpg` important selector, so wrap it in that
 * class the way an ApplicationV2 chat message would.
 */
function renderCard(ctx: ActionRollChatCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    if (ctx.rollData.gameSystem !== undefined) {
        wrapper.dataset['wh40kSystem'] = ctx.rollData.gameSystem;
        wrapper.classList.add('theme-dark');
    }
    wrapper.appendChild(renderSheet(cardSrc, ctx));
    return wrapper;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_TARGET = 42;

const SOURCED_COMPONENTS: SourcedComponent[] = [
    sourced('Aim (Full)', 20, 'action', { action: 'Full Aim' }),
    sourced('Ballistic Skill Aptitude', 10, 'aptitude', { aptitude: 'Ballistic Skill' }),
    sourced('Short Range', 10, 'range', { band: 'short' }),
    sourced('Target in Cover', -20, 'cover', { armour: 4 }),
    sourced('Lightly Wounded', -10, 'condition', { condition: 'lightly-wounded' }),
];

const SOURCED_SUM = sumValues(SOURCED_COMPONENTS); // +10
const MODIFIED_TARGET = BASE_TARGET + SOURCED_SUM; // 52

function successRollData(overrides: Partial<ActionRollData> = {}): ActionRollData {
    return {
        name: 'Sanctioned Autogun',
        action: 'Standard Attack',
        effectString: '1d10+3 I; Pen 0',
        isManualRoll: false,
        ignoreModifiers: false,
        baseTarget: BASE_TARGET,
        modifiedTarget: MODIFIED_TARGET,
        activeModifiers: {},
        modifierSources: SOURCED_COMPONENTS,
        isTargetOnly: false,
        roll: { total: 31 },
        success: true,
        dos: 3,
        resultFormula: `Target ${MODIFIED_TARGET} − Roll 31 = 21 → 1 + 2 (tens) = 3 DoS`,
        hitLocation: 'Body',
        ignoreControls: true,
        ...overrides,
    };
}

const meta: Meta<ActionRollChatCtx> = {
    title: 'Chat / Action Roll Card (transparency)',
};
export default meta;
type Story = StoryObj<ActionRollChatCtx>;

// ── 1. Success ────────────────────────────────────────────────────────────────

export const Success: Story = {
    name: 'Success — sourced breakdown, resultFormula, hit',
    args: {
        id: 'roll-success',
        label: 'Ballistic Skill Test',
        rollData: successRollData(),
        effectOutput: [],
    },
    render: (args) => renderCard(args),
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);

        // Every sourced modifier renders as a hoverable "modifier" tooltip row
        // with a parseable provenance payload.
        const rows = canvasElement.querySelectorAll<HTMLElement>('[data-wh40k-tooltip="modifier"]');
        await expect(rows.length).toBe(SOURCED_COMPONENTS.length);
        rows.forEach((row, index) => {
            const raw = row.getAttribute('data-wh40k-tooltip-data');
            void expect(raw).toBeTruthy();
            const parsed = JSON.parse(raw ?? '{}') as { source: string; value: number };
            const expected = SOURCED_COMPONENTS.at(index);
            void expect(parsed.source).toBe(expected?.source);
            void expect(parsed.value).toBe(expected?.value);
        });

        // Base + final target render on the breakdown.
        await expect(scope.getByText(String(BASE_TARGET))).toBeTruthy();
        await expect(scope.getByText(String(MODIFIED_TARGET))).toBeTruthy();

        // The roll-vs-target audit row ties the d100 to the target.
        await expect(canvasElement.textContent).toContain('Roll vs Target');
        await expect(canvasElement.textContent).toContain('31');

        // Degrees of success + the hoverable result formula both render.
        await expect(canvasElement.textContent).toContain('Degrees of Success');
        const formula = canvasElement.querySelector<HTMLElement>('[data-tooltip]');
        await expect(canvasElement.textContent).toContain('3 DoS');
        await expect(formula).not.toBeNull();
    },
};

// ── 2. Failure ────────────────────────────────────────────────────────────────

export const Failure: Story = {
    name: 'Failure — sourced breakdown, roll over target, DoF',
    args: {
        id: 'roll-failure',
        label: 'Ballistic Skill Test',
        rollData: successRollData({
            roll: { total: 78 },
            success: false,
            dos: 0,
            dof: 3,
            resultFormula: `Roll 78 − Target ${MODIFIED_TARGET} = 26 → 1 + 2 (tens) = 3 DoF`,
        }),
        effectOutput: [],
    },
    render: (args) => renderCard(args),
    play: async ({ canvasElement }) => {
        // Breakdown provenance still present on a failed roll.
        const rows = canvasElement.querySelectorAll('[data-wh40k-tooltip="modifier"]');
        await expect(rows.length).toBe(SOURCED_COMPONENTS.length);
        // Degrees of failure + result formula render.
        await expect(canvasElement.textContent).toContain('Degrees of Failure');
        await expect(canvasElement.textContent).toContain('3 DoF');
        // The audit row shows the failing roll against the target.
        await expect(canvasElement.textContent).toContain('78');
    },
};

// ── 3. ±60 cap fired ──────────────────────────────────────────────────────────

const CAP_COMPONENTS: SourcedComponent[] = [
    sourced('Aim (Full)', 20, 'action', { action: 'Full Aim' }),
    sourced('Point Blank', 30, 'range', { band: 'point-blank' }),
    sourced('Ganging Up (×3)', 30, 'assist', { allies: 3 }),
    sourced('The Drop', 30, 'situational', { surprise: true }),
];

export const CapFired: Story = {
    name: 'Cap fired — raw modifier total beyond ±60',
    args: {
        id: 'roll-cap',
        label: 'Weapon Skill Test',
        rollData: successRollData({
            name: 'Chainsword',
            modifierSources: CAP_COMPONENTS,
            modifiedTarget: BASE_TARGET + 60,
            modifierCapFired: true,
            rawModifierTotal: sumValues(CAP_COMPONENTS), // +110
            modifierTotal: 60,
            roll: { total: 44 },
            resultFormula: `Target ${BASE_TARGET + 60} − Roll 44 = 58 → 1 + 5 (tens) = 6 DoS`,
            dos: 6,
        }),
        effectOutput: [],
    },
    render: (args) => renderCard(args),
    play: async ({ canvasElement }) => {
        // The cap row surfaces with the raw → capped transparency values.
        await expect(canvasElement.textContent).toContain('Modifier cap');
        await expect(canvasElement.textContent).toContain('110');
        await expect(canvasElement.textContent).toContain('60');
        // The clamped target drives the audit + result rows.
        const scope = within(canvasElement);
        await expect(scope.getByText(String(BASE_TARGET + 60))).toBeTruthy();
    },
};

// ── 4. Target-only (no dice entered yet) ──────────────────────────────────────

export const TargetOnly: Story = {
    name: 'Target only — breakdown posted, awaiting physical roll',
    args: {
        id: 'roll-target-only',
        label: 'Ballistic Skill Test',
        rollData: successRollData({
            isTargetOnly: true,
            roll: undefined,
            success: undefined,
            dos: undefined,
            resultFormula: undefined,
            hitLocation: undefined,
        }),
        effectOutput: [],
    },
    render: (args) => renderCard(args),
    play: async ({ canvasElement }) => {
        // The full sourced breakdown renders even before dice are entered.
        const rows = canvasElement.querySelectorAll('[data-wh40k-tooltip="modifier"]');
        await expect(rows.length).toBe(SOURCED_COMPONENTS.length);
        // The target-only affordance shows; no degrees/audit rows yet.
        await expect(canvasElement.textContent).toContain('awaiting physical dice roll');
        await expect(canvasElement.textContent).not.toContain('Roll vs Target');
        await expect(canvasElement.textContent).not.toContain('Degrees of');
    },
};

// ── 5. Per-system homologation frames ─────────────────────────────────────────
//
// `roll-card-shell.hbs` emits `data-wh40k-system` from `rollData.gameSystem`, so
// the same Success payload is framed under each of the 7 lines (dh2, dh1, rt, bc,
// ow, dw, im) to keep the shared shell + breakdown under visual review. The IM
// frame is routed through `withSystem(mockActor(), 'im')` so the actor-side
// system helper is exercised alongside the card frame.

function perSystemFrame(systemId: SystemId): Story {
    return {
        name: `Per-system frame — ${systemId.toUpperCase()}`,
        args: {
            id: `roll-${systemId}`,
            label: 'Ballistic Skill Test',
            rollData: successRollData({ gameSystem: systemId }),
            effectOutput: [],
        },
        render: (args) => renderCard(args),
        play: async ({ canvasElement }) => {
            // The shell surfaces the active system on its frame so variants cascade.
            const framed = canvasElement.querySelectorAll(`[data-wh40k-system="${systemId}"]`);
            await expect(framed.length).toBeGreaterThan(0);
            // The transparency breakdown renders identically under every line.
            const rows = canvasElement.querySelectorAll('[data-wh40k-tooltip="modifier"]');
            await expect(rows.length).toBe(SOURCED_COMPONENTS.length);
        },
    };
}

export const SystemFrameDH2 = perSystemFrame('dh2');
export const SystemFrameDH1 = perSystemFrame('dh1');
export const SystemFrameRT = perSystemFrame('rt');
export const SystemFrameBC = perSystemFrame('bc');
export const SystemFrameOW = perSystemFrame('ow');
export const SystemFrameDW = perSystemFrame('dw');

/**
 * IM frame — derives the framing system id from an IM actor built through the
 * shared `withSystem` helper (`im-character` type), exercising the actor-side
 * homologation path together with the card frame.
 */
export const SystemFrameIM: Story = {
    name: 'Per-system frame — IM (via withSystem)',
    args: (() => {
        const imActor = withSystem(mockActor(), 'im');
        const systemId: SystemId = imActor.type.split('-')[0] as SystemId;
        return {
            id: 'roll-im',
            label: 'Ballistic Skill Test',
            rollData: successRollData({ gameSystem: systemId }),
            effectOutput: [],
        };
    })(),
    render: (args) => renderCard(args),
    play: async ({ canvasElement }) => {
        const framed = canvasElement.querySelectorAll('[data-wh40k-system="im"]');
        await expect(framed.length).toBeGreaterThan(0);
        const rows = canvasElement.querySelectorAll('[data-wh40k-tooltip="modifier"]');
        await expect(rows.length).toBe(SOURCED_COMPONENTS.length);
    },
};
