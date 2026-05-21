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
import HandlebarsLib from 'handlebars';
import { renderTemplate as renderStoryTemplate } from '../../../../stories/mocks';
import { randomId, seedRandom } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import templateSrc from '../../../templates/actor/panel/endeavour-panel.hbs?raw';

initializeStoryHandlebars();
const compiled = HandlebarsLib.compile(templateSrc);
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

function makeEndeavour(overrides: Partial<EndeavourLike> & { system?: Partial<EndeavourLike['system']> } = {}): EndeavourLike {
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
    render: () => renderStoryTemplate(compiled, makeCtx([])),
};

/** One Endeavour mid-flight: two of four objectives complete, 50%. */
export const InProgress: Story = {
    render: () =>
        renderStoryTemplate(
            compiled,
            makeCtx([
                makeEndeavour({
                    name: 'Recover the Lathe Records',
                    // @ts-expect-error -- TS narrowing on literal-typed objectives doesn't match Partial<system> exactly; the runtime shape is correct
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
        renderStoryTemplate(
            compiled,
            makeCtx([
                makeEndeavour({
                    name: 'Cleanse the Sump Cell',
                    // @ts-expect-error -- TS narrowing on literal-typed objectives doesn't match Partial<system> exactly; the runtime shape is correct
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
