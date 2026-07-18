/**
 * Storybook stories for the roll/damage modifier-breakdown transparency partial
 * (`partial/modifier-breakdown.hbs`).
 *
 * The partial renders the full target-number derivation for a d100 test:
 * `base (source) ± every modifier (source) = target`. When the provenance-bearing
 * `modifierSources` component list is present each row is hoverable to its source
 * via the shared `wh40k-tooltip` "modifier" type (carrying a parseable
 * `data-wh40k-tooltip-data` payload); otherwise it falls back to the legacy
 * label→value `activeModifiers` map. The ±60 cap row surfaces when the raw
 * modifier total was clamped.
 *
 * These stories exercise the four transparency states:
 *   1. Sourced   — several provenance-bearing components, mixed +/−, each hoverable.
 *   2. Fallback  — legacy `activeModifiers` map, no tooltip provenance.
 *   3. CapFired  — raw total beyond ±60, cap row shown.
 *   4. PerSystem — the same sourced breakdown framed under each of the 7 game
 *                  systems (homologation), the IM frame routed through
 *                  `withSystem(..., 'im')`.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { mockActor } from '../../../stories/mocks';
import { withSystem, type SystemId } from '../../../stories/mocks/extended';
import { renderSheet } from '../../../stories/test-helpers';
import partialSrc from './partial/modifier-breakdown.hbs?raw';

// The 7 homologated game systems (src/module/config/game-systems/types.ts) are
// each framed below: dh2, dh1, rt, bc, ow, dw, im.

/** A provenance-bearing modifier component as built at roll-commit time. */
interface SourcedComponent {
    label: string;
    value: number;
    source: string;
    /** JSON payload the wh40k-tooltip "modifier" handler parses at hover time. */
    tooltipData: string;
}

/** Context the modifier-breakdown partial consumes (see its hash-param header). */
interface BreakdownCtx {
    baseTarget: number;
    modifiedTarget: number;
    activeModifiers: Record<string, number>;
    modifierSources?: SourcedComponent[];
    modifierCapFired?: boolean;
    rawModifierTotal?: number;
    modifierTotal?: number;
    baseLabel?: string;
    targetLabel?: string;
    gameSystem?: SystemId;
}

/**
 * Build a provenance-bearing component. `tooltipData` is the JSON string the
 * runtime tooltip handler parses — stories assert it round-trips through
 * `JSON.parse`, proving the transparency payload is well-formed.
 */
function sourced(label: string, value: number, source: string, detail: Record<string, string | number | boolean> = {}): SourcedComponent {
    return {
        label,
        value,
        source,
        tooltipData: JSON.stringify({ source, label, value, ...detail }),
    };
}

/** Sum a component list, matching how the runtime derives the capped/raw totals. */
function sumValues(components: readonly SourcedComponent[]): number {
    return components.reduce((acc, component) => acc + component.value, 0);
}

/**
 * Render the partial inside a `.wh40k-rpg` frame (Tailwind's `important:
 * '.wh40k-rpg'` scope) so utilities resolve, stamping `data-wh40k-system` when a
 * framing system is supplied so per-system variants can cascade.
 */
function renderBreakdown(ctx: BreakdownCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg', 'sheet');
    if (ctx.gameSystem !== undefined) {
        wrapper.dataset['wh40kSystem'] = ctx.gameSystem;
        wrapper.classList.add('theme-dark');
    }
    wrapper.appendChild(renderSheet(partialSrc, ctx));
    return wrapper;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_TARGET = 42;

/** Mixed +/− provenance-bearing components (aptitude, aim, range, cover, wound). */
const SOURCED_COMPONENTS: SourcedComponent[] = [
    sourced('Aim (Full)', 20, 'action', { action: 'Full Aim' }),
    sourced('Ballistic Skill Aptitude', 10, 'aptitude', { aptitude: 'Ballistic Skill' }),
    sourced('Short Range', 10, 'range', { band: 'short' }),
    sourced('Target in Cover', -20, 'cover', { armour: 4 }),
    sourced('Lightly Wounded', -10, 'condition', { condition: 'lightly-wounded' }),
];

const SOURCED_SUM = sumValues(SOURCED_COMPONENTS); // +10

/** Legacy label→value map, the fallback when no provenance list was committed. */
const LEGACY_MODIFIERS: Record<string, number> = {
    'Aim (Half)': 10,
    'Difficult (-10)': -10,
    'Called Shot': -20,
};

const meta: Meta<BreakdownCtx> = {
    title: 'Chat / Modifier Breakdown (transparency)',
};
export default meta;
type Story = StoryObj<BreakdownCtx>;

// ── 1. Sourced provenance-bearing breakdown ───────────────────────────────────

export const SourcedComponents: Story = {
    name: 'Sourced — provenance-bearing components, mixed +/−',
    args: {
        baseTarget: BASE_TARGET,
        modifiedTarget: BASE_TARGET + SOURCED_SUM,
        modifierSources: SOURCED_COMPONENTS,
        activeModifiers: {},
    },
    render: (args) => renderBreakdown(args),
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        // One hoverable row per sourced component, each tagged as a "modifier" tooltip.
        const rows = canvasElement.querySelectorAll<HTMLElement>('[data-wh40k-tooltip="modifier"]');
        await expect(rows.length).toBe(SOURCED_COMPONENTS.length);

        // Every sourced row carries a parseable provenance payload whose fields
        // round-trip — this is the transparency contract the tooltip handler reads.
        rows.forEach((row, index) => {
            const raw = row.getAttribute('data-wh40k-tooltip-data');
            void expect(raw).toBeTruthy();
            const parsed = JSON.parse(raw ?? '{}') as { source: string; label: string; value: number };
            const expected = SOURCED_COMPONENTS.at(index);
            void expect(expected).toBeDefined();
            void expect(parsed.source).toBe(expected?.source);
            void expect(parsed.value).toBe(expected?.value);
        });

        // Base and final target both render.
        await expect(scope.getByText(String(BASE_TARGET))).toBeTruthy();
        await expect(scope.getByText(String(BASE_TARGET + SOURCED_SUM))).toBeTruthy();

        // Mixed signs are visible: at least one positive (+20) and one negative (-20).
        await expect(scope.getByText('+20')).toBeTruthy();
        await expect(scope.getByText('-20')).toBeTruthy();

        // No cap row on a sub-±60 total.
        await expect(canvasElement.textContent).not.toContain('Modifier cap');
    },
};

// ── 2. Legacy activeModifiers fallback ────────────────────────────────────────

export const LegacyFallback: Story = {
    name: 'Fallback — legacy activeModifiers map, no provenance',
    args: {
        baseTarget: BASE_TARGET,
        modifiedTarget: BASE_TARGET + Object.values(LEGACY_MODIFIERS).reduce((a, b) => a + b, 0),
        modifierSources: [],
        activeModifiers: LEGACY_MODIFIERS,
    },
    render: (args) => renderBreakdown(args),
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        // The fallback branch renders one row per key BUT carries no tooltip provenance.
        const tooltipRows = canvasElement.querySelectorAll('[data-wh40k-tooltip="modifier"]');
        await expect(tooltipRows.length).toBe(0);

        // Each legacy label + its signed value renders (independent rows → parallel).
        await Promise.all(
            Object.entries(LEGACY_MODIFIERS).flatMap(([label, value]) => {
                const signed = value > 0 ? `+${value}` : String(value);
                return [expect(scope.getByText(label)).toBeTruthy(), expect(scope.getByText(signed)).toBeTruthy()];
            }),
        );
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
    name: 'Cap fired — raw modifier total beyond ±60, clamped',
    args: (() => {
        const raw = sumValues(CAP_COMPONENTS); // +110
        const capped = 60;
        return {
            baseTarget: BASE_TARGET,
            modifiedTarget: BASE_TARGET + capped,
            modifierSources: CAP_COMPONENTS,
            activeModifiers: {},
            modifierCapFired: true,
            rawModifierTotal: raw,
            modifierTotal: capped,
        };
    })(),
    render: (args) => renderBreakdown(args),
    play: async ({ canvasElement }) => {
        // The cap row shows only when modifierCapFired is set.
        await expect(canvasElement.textContent).toContain('Modifier cap');
        // The raw → capped value renders (localized "{raw} → {capped}").
        await expect(canvasElement.textContent).toContain('110');
        await expect(canvasElement.textContent).toContain('60');
        // The clamped final target still renders.
        const scope = within(canvasElement);
        await expect(scope.getByText(String(BASE_TARGET + 60))).toBeTruthy();
    },
};

// ── 4. Per-system homologation frames ─────────────────────────────────────────
//
// The partial itself emits no per-system attribute (it colours through the
// `themeClassFor 'accent'` helper), so homologation is proven by framing the
// same sourced breakdown under each of the 7 `data-wh40k-system` roots and
// asserting the transparency rows render identically regardless of line. The IM
// frame is routed through `withSystem(mockActor(), 'im')` so the actor-side
// system helper is exercised alongside the card framing.

function perSystemFrame(systemId: SystemId): Story {
    return {
        name: `Per-system frame — ${systemId.toUpperCase()}`,
        args: {
            baseTarget: BASE_TARGET,
            modifiedTarget: BASE_TARGET + SOURCED_SUM,
            modifierSources: SOURCED_COMPONENTS,
            activeModifiers: {},
            gameSystem: systemId,
        },
        render: (args) => renderBreakdown(args),
        play: async ({ canvasElement }) => {
            const root = canvasElement.querySelector<HTMLElement>(`[data-wh40k-system="${systemId}"]`);
            await expect(root).not.toBeNull();
            // Sourced rows and their provenance survive under every system frame.
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
 * shared `withSystem` helper, exercising the actor-side homologation path
 * (`im-character` type) together with the card frame.
 */
export const SystemFrameIM: Story = {
    name: 'Per-system frame — IM (via withSystem)',
    args: (() => {
        const imActor = withSystem(mockActor(), 'im');
        // The helper stamps the system-namespaced actor type; the card frames on it.
        const systemId: SystemId = imActor.type.split('-')[0] as SystemId;
        return {
            baseTarget: BASE_TARGET,
            modifiedTarget: BASE_TARGET + SOURCED_SUM,
            modifierSources: SOURCED_COMPONENTS,
            activeModifiers: {},
            gameSystem: systemId,
        };
    })(),
    render: (args) => renderBreakdown(args),
    play: async ({ canvasElement }) => {
        const root = canvasElement.querySelector<HTMLElement>('[data-wh40k-system="im"]');
        await expect(root).not.toBeNull();
        const rows = canvasElement.querySelectorAll('[data-wh40k-tooltip="modifier"]');
        await expect(rows.length).toBe(SOURCED_COMPONENTS.length);
    },
};
