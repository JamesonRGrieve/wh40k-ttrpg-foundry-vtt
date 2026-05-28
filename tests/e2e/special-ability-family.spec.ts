import type { Page } from '@playwright/test';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage for the "second-class" content item family (issue #221) and
 * the origin-path special-ability commit fix (issue #220):
 *   - src/module/applications/item/freeform-gated-item-sheet.ts (edit gate)
 *   - src/module/applications/item/special-ability-sheet.ts (+ siblings)
 *   - src/module/applications/character-creation/origin-path-builder.ts
 *       (_applyContentItemGrantsFromOrigins)
 *
 * Two flows, plain asserts (no recordCoverage):
 *   (a) A world `specialAbility` item's sheet is read-only when the freeform
 *       setting is OFF and editable when it is ON.
 *   (b) Committing an origin path that grants a specialAbility lands a
 *       `specialAbility` item on the actor.
 *
 * Created world docs and the toggled setting are restored in a finally block.
 */

const SYSTEM_ID = 'wh40k-rpg';
const FREEFORM_KEY = 'freeform-characters';

interface FlowResult {
    name: string;
    ok: boolean;
    detail: string | null;
}

async function probe(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(
            async ({ systemId, freeformKey }): Promise<FlowResult[]> => {
                interface SheetRef {
                    canEdit?: boolean;
                    inEditMode?: boolean;
                }
                interface ItemRef {
                    id?: string;
                    name?: string;
                    type?: string;
                    sheet?: SheetRef;
                    delete?: () => Promise<void>;
                }
                interface ActorItemsColl {
                    size: number;
                    find: (pred: (i: ItemRef) => boolean) => ItemRef | undefined;
                }
                interface ActorRef {
                    id?: string;
                    items?: ActorItemsColl;
                    delete?: () => Promise<void>;
                }
                interface ItemCreateData {
                    type: string;
                    name: string;
                }
                interface ItemCls {
                    create: (data: ItemCreateData) => Promise<ItemRef>;
                }
                interface ActorCls {
                    create: (data: { type: string; name: string }) => Promise<ActorRef>;
                }
                interface SettingsApi {
                    get: (ns: string, key: string) => boolean;
                    set: (ns: string, key: string, value: boolean) => Promise<void>;
                }
                interface OriginSelectionData {
                    system: { grants: { specialAbilities: Array<{ name: string; description: string }> } };
                }
                interface BuilderInstance {
                    selections: Map<string, OriginSelectionData>;
                    _applyContentItemGrantsFromOrigins: () => Promise<void>;
                }
                interface BuilderCtor {
                    new (actor: ActorRef): BuilderInstance;
                }
                interface BuilderModule {
                    default: BuilderCtor;
                }
                interface FoundryGlobal {
                    Item: ItemCls;
                    Actor: ActorCls;
                    game: { settings: SettingsApi };
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
                const g = globalThis as unknown as FoundryGlobal;
                const out: FlowResult[] = [];
                const record = (name: string, ok: boolean, detail: string | null = null): void => {
                    out.push({ name, ok, detail });
                };
                const trash: Array<{ delete?: () => Promise<void> }> = [];
                const settings = g.game.settings;
                const original = settings.get(systemId, freeformKey);

                // (a) — sheet edit gate honours the freeform setting
                try {
                    const ability = await g.Item.create({ type: 'specialAbility', name: 'E2E Unyielding Flesh' });
                    trash.push(ability);

                    await settings.set(systemId, freeformKey, false);
                    const offCanEdit = ability.sheet?.canEdit === true;

                    await settings.set(systemId, freeformKey, true);
                    const onCanEdit = ability.sheet?.canEdit === true;

                    const ok = !offCanEdit && onCanEdit;
                    record('sheet-edit-gate', ok, `freeformOff.canEdit=${String(offCanEdit)} freeformOn.canEdit=${String(onCanEdit)}`);
                } catch (err) {
                    record('sheet-edit-gate', false, String((err as Error).message));
                }

                // (b) — origin-path commit materializes a specialAbility item
                try {
                    const base = `${'/systems/wh40k-rpg'}/module/applications/character-creation`;
                    const mod = (await import(`${base}/origin-path-builder.js`)) as BuilderModule;
                    const actor = await g.Actor.create({ type: 'dh2-character', name: 'E2E Origin Acolyte' });
                    trash.push(actor);

                    const builder = new mod.default(actor);
                    builder.selections.set('homeworld', {
                        system: {
                            grants: {
                                specialAbilities: [{ name: 'E2E Hardened Soul', description: '<p>Immune to fear once per session.</p>' }],
                            },
                        },
                    });
                    await builder._applyContentItemGrantsFromOrigins();

                    const granted = actor.items?.find((i) => i.type === 'specialAbility' && i.name === 'E2E Hardened Soul');
                    record(
                        'origin-grant-materializes',
                        granted != null,
                        granted == null ? 'specialAbility item not found on actor' : `created ${granted.name ?? ''}`,
                    );
                } catch (err) {
                    record('origin-grant-materializes', false, String((err as Error).message));
                }

                // Restore setting + clean up world docs.
                try {
                    await settings.set(systemId, freeformKey, original);
                } catch {
                    /* best-effort */
                }
                for (const doc of trash) {
                    try {
                        // eslint-disable-next-line no-await-in-loop -- best-effort serial cleanup; parallel deletes race on Foundry's collection writes
                        await doc.delete?.();
                    } catch {
                        /* best-effort */
                    }
                }

                return out;
            },
            { systemId: SYSTEM_ID, freeformKey: FREEFORM_KEY },
        );
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('special ability family (Tier B)', () => {
    test('content sheet edit gate + origin-path special-ability commit', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const result = await probe(page);
        const failures: string[] = [];
        for (const r of result.results) {
            if (!r.ok) failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
        }
        const seen = new Set(result.results.map((r) => r.name));
        for (const expected of ['sheet-edit-gate', 'origin-grant-materializes']) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (result.pageErrors.length > 0) {
            failures.push(`page errors: ${result.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `special-ability-family flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
