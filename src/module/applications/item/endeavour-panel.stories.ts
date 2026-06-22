/**
 * Stories for the Endeavour panel partial (`endeavour-panel.hbs`).
 *
 * Three states cover the panel's full surface:
 *   - Empty: no Endeavour items embedded; the placeholder line shows.
 *   - InProgress: one Endeavour with two of four objectives complete (50%).
 *   - Completed: one Endeavour at 100% — the "Grant Reward" button shows.
 *
 * The panel is normally rendered against a fully-prepared CharacterSheet
 * context (which exposes a top-level `endeavours` array). For stories we
 * pass that array directly so the partial works without a full sheet.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { randomId, seedRandom, type SystemId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../templates/actor/panel/endeavour-panel.hbs?raw';

initializeStoryHandlebars();
const rng = seedRandom(0xe7de8a04);

interface EndeavourObjectiveLike {
    name: string;
    description: string;
    complete: boolean;
    ap: number;
}

interface EndeavourLike {
    id: string;
    name: string;
    type: 'endeavour';
    system: {
        apEarned: number;
        apRequired: number;
        objectives: EndeavourObjectiveLike[];
        reward: { profitFactor: number; narrative: string };
        isComplete: boolean;
        pctComplete: number;
    };
}

function makeEndeavour(overrides: Omit<Partial<EndeavourLike>, 'system'> & { system?: Partial<EndeavourLike['system']> } = {}): EndeavourLike {
    const id = overrides.id ?? randomId('endeavour', rng);
    const { system: sysOverrideRaw = {} } = overrides;
    const sysOverride: Partial<EndeavourLike['system']> = sysOverrideRaw;
    const objectives: EndeavourObjectiveLike[] = sysOverride.objectives ?? [];
    const apEarned: number = sysOverride.apEarned ?? objectives.filter((o) => o.complete).reduce((sum, o) => sum + o.ap, 0);
    const apRequired: number = sysOverride.apRequired ?? objectives.reduce((sum, o) => sum + o.ap, 0);
    const isComplete: boolean = sysOverride.isComplete ?? (apRequired > 0 && apEarned >= apRequired);
    const pctComplete: number = sysOverride.pctComplete ?? (apRequired > 0 ? Math.round((apEarned / apRequired) * 100) : 0);
    return {
        id,
        name: overrides.name ?? 'Recover the Lathe Records',
        type: 'endeavour',
        system: {
            apEarned,
            apRequired,
            objectives,
            reward: sysOverride.reward ?? { profitFactor: 2, narrative: '' },
            isComplete,
            pctComplete: Math.max(0, Math.min(100, pctComplete)),
        },
    };
}

function makeCtx(endeavours: EndeavourLike[], actorId = 'mock-actor'): { endeavours: EndeavourLike[]; actor: { id: string }; system: Record<string, never> } {
    return {
        endeavours,
        actor: { id: actorId },
        // Mock minimal hash for any helpers that reach into actor.system
        system: {},
    };
}

const meta: Meta = { title: 'Actor Panels/EndeavourPanel' };
export default meta;

type Story = StoryObj;

/** No embedded endeavour items — placeholder line renders. */
export const Empty: Story = {
    render: () => renderSheet(templateSrc, makeCtx([])),
};

/** One Endeavour mid-flight: two of four objectives complete, 50%. */
export const InProgress: Story = {
    render: () =>
        renderSheet(
            templateSrc,
            makeCtx([
                makeEndeavour({
                    name: 'Recover the Lathe Records',
                    system: {
                        objectives: [
                            { name: 'Establish a foothold on Solenne Minoris', description: 'Acquire a hab', complete: true, ap: 1 },
                            { name: 'Bribe the harbourmaster', description: '', complete: true, ap: 1 },
                            { name: 'Infiltrate the archive', description: '', complete: false, ap: 1 },
                            { name: 'Escape with the cipher', description: '', complete: false, ap: 1 },
                        ],
                        reward: { profitFactor: 3, narrative: 'Acolyte favour with the Mechanicus contact at Outpost 7.' },
                    },
                }),
            ]),
        ),
};

/** One Endeavour fully complete — the "Grant Reward" header button appears. */
export const Completed: Story = {
    render: () =>
        renderSheet(
            templateSrc,
            makeCtx([
                makeEndeavour({
                    name: 'Cleanse the Sump Cell',
                    system: {
                        objectives: [
                            { name: 'Identify the heretic broker', description: '', complete: true, ap: 2 },
                            { name: 'Burn the safehouse', description: '', complete: true, ap: 2 },
                            { name: 'Recover the dataslate', description: '', complete: true, ap: 1 },
                        ],
                        reward: { profitFactor: 4, narrative: 'Inquisitorial Patronage: one personal favour redeemable within the warband.' },
                    },
                }),
            ]),
        ),
};

// ── Per-system homologation (all 7 game lines) ──────────────────────────────
//
// The Endeavour tracker is a Rogue Trader Dynasty feature; its card border,
// progress fill, and flag accents carry `rt:tw-*` variants that only fire under
// a `data-wh40k-system="rt"` ancestor. `renderSheet`'s wrapper defaults to
// `dh2`, so the RT tints never activate in the stories above. Rendering the
// same in-progress endeavour under each of the seven game-line ancestors
// surfaces that RT-vs-base divergence and confirms the panel still composes
// cleanly everywhere the system is loaded into a shared-actor surface.

/** A single deterministic in-progress endeavour reused across every system. */
const homologationEndeavour = makeEndeavour({
    name: 'Recover the Lathe Records',
    system: {
        objectives: [
            { name: 'Establish a foothold on Solenne Minoris', description: 'Acquire a hab', complete: true, ap: 1 },
            { name: 'Bribe the harbourmaster', description: '', complete: true, ap: 1 },
            { name: 'Infiltrate the archive', description: '', complete: false, ap: 1 },
            { name: 'Escape with the cipher', description: '', complete: false, ap: 1 },
        ],
        reward: { profitFactor: 3, narrative: 'Acolyte favour with the Mechanicus contact at Outpost 7.' },
    },
});

/** Render the endeavour panel under a specific game-line theme ancestor. */
function renderPanelForSystem(systemId: SystemId): HTMLElement {
    const el = renderSheet(templateSrc, makeCtx([homologationEndeavour]));
    el.dataset['wh40kSystem'] = systemId;
    return el;
}

/** Build a per-system homologation story for one game line. */
function systemStory(systemId: SystemId): Story {
    return {
        render: () => renderPanelForSystem(systemId),
        play: ({ canvasElement }) => {
            // The card renders under every system ancestor, and the rt: variants
            // only activate when systemId === 'rt'.
            const root = canvasElement.querySelector<HTMLElement>('[data-wh40k-system]');
            if (root?.dataset['wh40kSystem'] !== systemId) {
                throw new Error(`endeavour-panel: expected data-wh40k-system="${systemId}"`);
            }
            const card = canvasElement.querySelector('[data-testid="endeavour-card"]');
            if (!card) throw new Error('endeavour-panel: expected an endeavour card to render');
        },
    };
}

export const HomologationDH2: Story = systemStory('dh2');
export const HomologationDH1: Story = systemStory('dh1');
export const HomologationRT: Story = systemStory('rt');
export const HomologationBC: Story = systemStory('bc');
export const HomologationOW: Story = systemStory('ow');
export const HomologationDW: Story = systemStory('dw');
export const HomologationIM: Story = systemStory('im');
