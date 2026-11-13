import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of the Black Crusade Chaos Space Marine race (#727): its
 * characteristic base of 30, its 500 starting XP, and the talents and traits it
 * grants (OriginPathBuilder#_applyItemGrantsFromOrigins, #_characteristicBase,
 * #_resetExperienceAndAdvancements).
 *
 * The race document is read from the private BC compendium, set as the
 * builder's race selection, and committed through the builder's own appliers.
 * Before #727 the CSM got no talents (their grants had no UUID), no traits
 * (trait grants were never created) and a human's base and XP.
 *
 * Each flow records under `bc-csm-origin.flow`. Keys MUST match
 * BC_CSM_ORIGIN_FLOWS in scripts/e2e-coverage.mjs.
 */

const BC_CSM_ORIGIN_FLOWS = ['csm-talents-granted', 'csm-traits-granted', 'csm-starting-xp', 'csm-characteristic-base', 'sidebar-shows-race'] as const;
type FlowName = (typeof BC_CSM_ORIGIN_FLOWS)[number];

const CSM_UUID = 'Compendium.wh40k-rpg.bc-core-origins-races.Item.fd8c1b616bc5983c';
const BUILDER_URL = '/systems/wh40k-rpg/module/applications/character-creation/origin-path-builder.js';

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

interface ProbeState {
    results: FlowResult[];
    actorId: string | null;
    sheetId: string | null;
}

interface OwnedItemLike {
    name: string;
    type: string;
    /** Talent and trait both declare `specialization` (blank default) and the trait `level`. */
    system: { specialization: string; level: number };
}

interface ActorLike {
    id: string;
    items: { contents: OwnedItemLike[] };
    system: { experience: { total: number } };
    sheet: { id: string; rendered: boolean; render: (options: { force: boolean }) => Promise<void> };
    createEmbeddedDocuments: (type: 'Item', data: object[]) => Promise<object[]>;
}

interface BuilderLike {
    selections: Map<string, { system: object }>;
    _applyItemGrantsFromOrigins: () => Promise<void>;
    _resetExperienceAndAdvancements: () => Promise<void>;
    _characteristicBase: () => number;
}

async function probeChaosSpaceMarine(page: Page): Promise<ProbeState> {
    return page.evaluate(
        async ({ csmUuid, builderUrl }): Promise<ProbeState> => {
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                Actor: { create: (data: object) => Promise<ActorLike | null> };
                fromUuid: (uuid: string) => Promise<{ toObject: () => { name: string; system: object } } | null>;
                game: { settings: { get: (ns: string, key: string) => number } };
            };
            const { waitFor, scaledMs: scale } = globalThis.wh40kE2E;
            const state: ProbeState = { results: out, actorId: null, sheetId: null };
            try {
                const race = await g.fromUuid(csmUuid);
                const actor = await g.Actor.create({ name: 'e2e-727-chaos-space-marine', type: 'bc-character' });
                if (race === null || actor === null) {
                    record('csm-talents-granted', false, `race ${race === null ? 'missing' : 'found'}, actor ${actor === null ? 'not created' : 'created'}`);
                    return state;
                }
                state.actorId = actor.id;
                const mod = (await import(/* @vite-ignore */ builderUrl)) as { default: new (a: ActorLike) => BuilderLike };
                const builder = new mod.default(actor);
                builder.selections.set('race', { system: race.toObject().system });

                await builder._applyItemGrantsFromOrigins();
                const items = actor.items.contents;
                const has = (type: string, name: string, spec = '', level?: number): boolean =>
                    items.some(
                        (i) =>
                            i.type === type &&
                            i.name.toLowerCase().startsWith(name.toLowerCase()) &&
                            i.system.specialization === spec &&
                            (level === undefined || i.system.level === level),
                    );
                const talents = items.filter((i) => i.type === 'talent').map((i) => `${i.name}[${i.system.specialization}]`);
                const talentsOk = has('talent', 'Ambidextrous') && has('talent', 'Heightened Senses', 'Hearing') && has('talent', 'Heightened Senses', 'Sight');
                record('csm-talents-granted', talentsOk, talentsOk ? null : `talents on the actor: ${talents.join(', ')}`);

                const traits = items.filter((i) => i.type === 'trait').map((i) => `${i.name}[${i.system.specialization}:${i.system.level}]`);
                const traitsOk =
                    has('trait', 'Amphibious') &&
                    has('trait', 'Unnatural Characteristic', 'Strength', 4) &&
                    has('trait', 'Unnatural Characteristic', 'Toughness', 4);
                record('csm-traits-granted', traitsOk, traitsOk ? null : `traits on the actor: ${traits.join(', ')}`);

                await builder._resetExperienceAndAdvancements();
                const xp = actor.system.experience.total;
                record('csm-starting-xp', xp === 500, xp === 500 ? null : `experience.total is ${xp}`);

                const offset = Number(g.game.settings.get('wh40k-rpg', 'characteristic-offset')) || 0;
                const base = builder._characteristicBase();
                record('csm-characteristic-base', base === 30 + offset, base === 30 + offset ? null : `base ${base}, offset ${offset}`);

                // #728: the committed race item is what the sidebar's Race row names.
                const raceData = race.toObject();
                await actor.createEmbeddedDocuments('Item', [raceData]);
                await actor.sheet.render({ force: true });
                await waitFor(() => actor.sheet.rendered, 'BC character sheet render', scale(10_000));
                state.sheetId = actor.sheet.id;
                const raceRow = document.getElementById(actor.sheet.id)?.querySelector<HTMLInputElement>('input[name="system.originPath.race"]');
                const shown = raceRow?.value ?? null;
                record(
                    'sidebar-shows-race',
                    shown === raceData.name,
                    shown === raceData.name ? null : `the Race row reads ${shown === null ? 'nothing (no row)' : `"${shown}"`}`,
                );
            } catch (err) {
                record('csm-talents-granted', false, err instanceof Error ? err.message : String(err));
            }
            return state;
        },
        { csmUuid: CSM_UUID, builderUrl: BUILDER_URL },
    );
}

async function cleanupProbe(page: Page, actorId: string | null): Promise<void> {
    if (actorId === null) return;
    await page.evaluate(async (id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game: { actors: { get: (i: string) => { delete: () => Promise<void> } | undefined } } };
        await g.game.actors
            .get(id)
            ?.delete()
            .catch(() => undefined);
    }, actorId);
}

test.describe.serial('the BC Chaos Space Marine race (Tier B, #727)', () => {
    test.setTimeout(scaledMs(180_000));
    test('a Chaos Space Marine gets its talents, traits, 500 XP and a base of 30', async ({ page }) => {
        await joinOrSkip(page);

        let state: ProbeState = { results: [], actorId: null, sheetId: null };
        try {
            state = await probeChaosSpaceMarine(page);
            if (state.sheetId !== null) {
                await snap(page, 'bc-chaos-space-marine-granted', { selector: `#${state.sheetId}`, closeWindows: true, keepWindow: state.sheetId });
            }
        } finally {
            await cleanupProbe(page, state.actorId);
        }

        const fired = new Map(state.results.map((r) => [r.name, r]));
        const failures: string[] = [];
        for (const flow of BC_CSM_ORIGIN_FLOWS) {
            const result = fired.get(flow);
            if (result?.ok === true) recordCoverage('bc-csm-origin.flow', flow);
            else failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
