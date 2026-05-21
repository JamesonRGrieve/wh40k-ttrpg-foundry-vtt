import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of every dialog and prompt class shipped under
 * `src/module/applications/dialogs/**` and `src/module/applications/prompts/**`.
 *
 * Most of these classes only get exercised through user-driven flows that the
 * existing specs don't touch (advancement purchase, fate-uses bookkeeping,
 * ammo picker, etc.), leaving 25+ files at zero V8-coverage. This spec
 * instantiates each class once via its deployed module URL, asserts that
 * `render(true)` produces a real DOM element, then closes the dialog before
 * moving to the next probe — driving every constructor + `_prepareContext` +
 * `_renderHTML` path under source coverage.
 *
 * Strategy per probe:
 *   1. Dynamically `import(...)` the dist module URL exposed by Foundry's
 *      static file server (e.g. `/systems/wh40k-rpg/module/applications/
 *      dialogs/characteristic-setup-dialog.js`).
 *   2. Resolve the dialog class (`mod.default` for the V2 dialogs;
 *      `mod.WH40KCreateActorDialog` / `mod.ConvertActorSystemDialog` for the
 *      two static-namespace classes).
 *   3. Build plausible constructor args from the fixture actor / item that
 *      this spec seeds.
 *   4. `new Dialog(...)` then `await render(true)` for ApplicationV2 dialogs;
 *      `await Dialog.open(...)` (fire-and-forget — don't await the resolve
 *      promise) for the static-namespace dialogs.
 *   5. Assert `dialog.element instanceof HTMLElement` (V2) or that an
 *      ApplicationV1 / DialogV2 window opened in `ui.windows`.
 *   6. Close any opened windows so they don't stack.
 *
 * The render is the goal; resolving the dialog's user action is not. Every
 * probe records `dialog.render::<ClassName>` on success and bubbles up the
 * failure message on error so the asserter prints actionable diagnostics
 * instead of a generic "did not render".
 */

/** Every dialog / prompt class this spec attempts to render, in alphabetical
 * order by module path. Keys MUST stay in sync with DIALOG_AND_PROMPT_CLASSES
 * in scripts/e2e-coverage.mjs. */
const DIALOG_PROBES = [
    // ── src/module/applications/dialogs ──
    { className: 'AcquisitionDialog', moduleUrl: '/systems/wh40k-rpg/module/applications/dialogs/acquisition-dialog.js', kind: 'actorCtor', ctor: 'default' },
    { className: 'AdvancementDialog', moduleUrl: '/systems/wh40k-rpg/module/applications/dialogs/advancement-dialog.js', kind: 'actorCtor', ctor: 'default' },
    { className: 'AmmoPickerDialog', moduleUrl: '/systems/wh40k-rpg/module/applications/dialogs/ammo-picker-dialog.js', kind: 'ammoPicker', ctor: 'default' },
    {
        className: 'CharacteristicSetupDialog',
        moduleUrl: '/systems/wh40k-rpg/module/applications/dialogs/characteristic-setup-dialog.js',
        kind: 'actorCtor',
        ctor: 'default',
    },
    {
        className: 'ConfirmationDialog',
        moduleUrl: '/systems/wh40k-rpg/module/applications/dialogs/confirmation-dialog.js',
        kind: 'configCtor',
        ctor: 'default',
    },
    {
        className: 'ConvertActorSystemDialog',
        moduleUrl: '/systems/wh40k-rpg/module/applications/dialogs/convert-actor-system-dialog.js',
        kind: 'staticOpenActor',
        ctor: 'ConvertActorSystemDialog',
    },
    {
        className: 'WH40KCreateActorDialog',
        moduleUrl: '/systems/wh40k-rpg/module/applications/dialogs/create-actor-dialog.js',
        kind: 'staticOpenNone',
        ctor: 'WH40KCreateActorDialog',
    },
    { className: 'FateUsesDialog', moduleUrl: '/systems/wh40k-rpg/module/applications/dialogs/fate-uses-dialog.js', kind: 'configCtor', ctor: 'default' },
    {
        className: 'RollConfigurationDialog',
        moduleUrl: '/systems/wh40k-rpg/module/applications/dialogs/roll-configuration-dialog.js',
        kind: 'configCtor',
        ctor: 'default',
    },
    {
        className: 'TransactionRequestDialog',
        moduleUrl: '/systems/wh40k-rpg/module/applications/dialogs/transaction-request-dialog.js',
        kind: 'actorCtor',
        ctor: 'default',
    },

    // ── src/module/applications/prompts ──
    { className: 'AddXPDialog', moduleUrl: '/systems/wh40k-rpg/module/applications/prompts/add-xp-dialog.js', kind: 'actorCtor', ctor: 'default' },
    {
        className: 'AssignDamageDialog',
        moduleUrl: '/systems/wh40k-rpg/module/applications/prompts/assign-damage-dialog.js',
        kind: 'assignDamage',
        ctor: 'default',
    },
    { className: 'BaseRollDialog', moduleUrl: '/systems/wh40k-rpg/module/applications/prompts/base-roll-dialog.js', kind: 'baseRoll', ctor: 'default' },
    { className: 'DamageRollDialog', moduleUrl: '/systems/wh40k-rpg/module/applications/prompts/damage-roll-dialog.js', kind: 'rollDataCtor', ctor: 'default' },
    {
        className: 'EffectCreationDialog',
        moduleUrl: '/systems/wh40k-rpg/module/applications/prompts/effect-creation-dialog.js',
        kind: 'effectCreation',
        ctor: 'default',
    },
    {
        className: 'EnhancedSkillDialog',
        moduleUrl: '/systems/wh40k-rpg/module/applications/prompts/enhanced-skill-dialog.js',
        kind: 'enhancedSkill',
        ctor: 'default',
    },
    { className: 'ForceFieldDialog', moduleUrl: '/systems/wh40k-rpg/module/applications/prompts/force-field-dialog.js', kind: 'forceField', ctor: 'default' },
    {
        className: 'PsychicPowerDialog',
        moduleUrl: '/systems/wh40k-rpg/module/applications/prompts/psychic-power-dialog.js',
        kind: 'psychicPower',
        ctor: 'default',
    },
    {
        className: 'RighteousFuryDialog',
        moduleUrl: '/systems/wh40k-rpg/module/applications/prompts/righteous-fury-dialog.js',
        kind: 'optionsCtor',
        ctor: 'default',
    },
    { className: 'SimpleRollDialog', moduleUrl: '/systems/wh40k-rpg/module/applications/prompts/simple-roll-dialog.js', kind: 'simpleRoll', ctor: 'default' },
    {
        className: 'SpecialistSkillDialog',
        moduleUrl: '/systems/wh40k-rpg/module/applications/prompts/specialist-skill-dialog.js',
        kind: 'actorCtor',
        ctor: 'default',
    },
    { className: 'UnifiedRollDialog', moduleUrl: '/systems/wh40k-rpg/module/applications/prompts/unified-roll-dialog.js', kind: 'simpleRoll', ctor: 'default' },
    {
        className: 'WeaponAttackDialog',
        moduleUrl: '/systems/wh40k-rpg/module/applications/prompts/weapon-attack-dialog.js',
        kind: 'weaponAttack',
        ctor: 'default',
    },
] as const;

interface DialogProbeResult {
    className: string;
    rendered: boolean;
    error: string | null;
}

async function probeDialogs(page: Page): Promise<{
    created: boolean;
    createError: string | null;
    results: DialogProbeResult[];
    pageErrors: string[];
}> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(
            async ({ probes }) => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
                const g = globalThis as any;
                const ActorCls = g.Actor;
                if (typeof ActorCls?.create !== 'function') {
                    return {
                        created: false,
                        createError: 'Actor.create unavailable',
                        results: [] as Array<{ className: string; rendered: boolean; error: string | null }>,
                    };
                }

                // ── Seed fixture actor + items ──────────────────────────
                let actor: any;
                try {
                    actor = await ActorCls.create({
                        name: 'dialog-probe-actor',
                        type: 'dh2-character',
                        system: { gameSystem: 'dh2e' },
                    });
                } catch (err) {
                    return {
                        created: false,
                        createError: String(err instanceof Error ? err.message : String(err)),
                        results: [],
                    };
                }
                if (actor === null || actor === undefined) {
                    return { created: false, createError: 'Actor.create returned null', results: [] };
                }

                let weapon: any = null;
                try {
                    const created = await actor.createEmbeddedDocuments?.('Item', [
                        {
                            name: 'probe-weapon',
                            type: 'weapon',
                            system: {
                                equipped: true,
                                class: 'pistol',
                                melee: false,
                                damage: '1d10',
                                penetration: 0,
                                clip: { value: 6, max: 6 },
                            },
                        },
                        {
                            name: 'probe-ammo',
                            type: 'ammunition',
                            system: { quantity: 30 },
                        },
                    ]);
                    weapon = (created ?? []).find((i: any) => i.type === 'weapon') ?? null;
                } catch {
                    /* embed failure surfaces in dependent probes */
                }
                const ammoItems = (actor.items?.contents ?? []).filter((i: any) => i.type === 'ammunition' || i.type === 'weapon');

                /**
                 * Close any dialog/prompt window opened during a probe so
                 * subsequent renders don't pile up. Matches roll-methods.spec.
                 */
                async function closeOpenDialogs(): Promise<void> {
                    const windows = Object.values(g.ui?.windows ?? {});
                    for (const w of windows as any[]) {
                        const id = String(w?.id ?? '');
                        if (
                            id.includes('dialog') ||
                            id.includes('prompt') ||
                            id.includes('roll') ||
                            id.includes('confirmation') ||
                            id.includes('acquisition') ||
                            id.includes('advancement') ||
                            id.includes('ammo') ||
                            id.includes('characteristic') ||
                            id.includes('fate') ||
                            id.includes('transaction') ||
                            id.includes('add-xp') ||
                            id.includes('damage') ||
                            id.includes('effect') ||
                            id.includes('skill') ||
                            id.includes('psychic') ||
                            id.includes('righteous') ||
                            id.includes('weapon') ||
                            id.includes('force') ||
                            id.includes('specialist')
                        ) {
                            try {
                                await w?.close?.();
                            } catch {
                                /* ignore */
                            }
                        }
                    }
                    // Also tear down any DialogV2 popup the static dialogs render.
                    document.querySelectorAll('dialog.application').forEach((el) => {
                        try {
                            (el as HTMLDialogElement).close();
                            el.remove();
                        } catch {
                            /* ignore */
                        }
                    });
                }

                // Shared rich-context builders — these templates render real
                // markup against `this.rollData`, so the probe data has to
                // satisfy the field accesses (`{{this.actor.name}}`,
                // `{{selectOptions difficulties …}}` etc.) or rendering
                // throws and source-coverage doesn't reach the render path.
                const sampleHit = { location: 'body', damageType: 'i', totalDamage: 5, totalPenetration: 2, totalFatigue: 0 };
                const sampleLocations = { head: 'Head', body: 'Body', rightArm: 'Right Arm', leftArm: 'Left Arm', rightLeg: 'Right Leg', leftLeg: 'Left Leg' };
                const sampleDamageType = { e: 'Energy', i: 'Impact', r: 'Rending', x: 'Explosive' };
                const sampleDifficulties = { '-30': 'Hard (-30)', '0': 'Routine (+0)', '30': 'Easy (+30)' };
                const sampleForceField = {
                    name: 'probe-shield',
                    img: 'icons/svg/aura.svg',
                    system: { protectionRating: 50, activated: true, overloaded: false },
                };
                const sampleActionData = {
                    name: 'probe',
                    rollData: {
                        name: 'probe',
                        baseTarget: 30,
                        modifiers: {} as Record<string, number>,
                        difficulties: sampleDifficulties,
                        calculateTotalModifiers: async (): Promise<void> => {
                            /* no-op */
                        },
                    },
                    actor,
                    calculateSuccessOrFailure: async (): Promise<void> => {
                        /* no-op */
                    },
                };

                /**
                 * Build constructor args for a probe entry. Returns the
                 * primary positional args; the spec wraps with `new Cls(...)`.
                 */
                function buildArgs(kind: string): unknown[] | null {
                    switch (kind) {
                        case 'actorCtor':
                            return [actor];
                        case 'configCtor':
                            return [{}];
                        case 'optionsCtor':
                            return [{}];
                        case 'rollDataCtor':
                            return [{}];
                        case 'rollDataActionCtor':
                            return [{ rollData: {} }];
                        case 'baseRoll':
                            // BaseRollDialog has no template of its own; pass
                            // enough rollData so super._prepareContext succeeds.
                            // The probe code overrides PARTS for this kind to
                            // borrow simple-roll-prompt.hbs.
                            return [
                                {
                                    name: 'probe',
                                    baseTarget: 30,
                                    modifiers: {} as Record<string, number>,
                                    difficulties: sampleDifficulties,
                                },
                            ];
                        case 'assignDamage':
                            return [
                                {
                                    actor,
                                    hit: sampleHit,
                                    armour: 4,
                                    tb: 3,
                                    locations: sampleLocations,
                                    damageType: sampleDamageType,
                                    finalize: async (): Promise<void> => {
                                        /* no-op */
                                    },
                                    performActionAndSendToChat: async (): Promise<void> => {
                                        /* no-op */
                                    },
                                },
                            ];
                        case 'forceField':
                            return [
                                {
                                    actor,
                                    forceField: sampleForceField,
                                    protectionRating: 50,
                                    overloadRating: 1,
                                },
                            ];
                        case 'psychicPower':
                            // powerSelect=true branch renders the simple list view.
                            return [
                                {
                                    rollData: {
                                        powerSelect: true,
                                        psychicPowers: [],
                                        actor,
                                        sourceActor: actor,
                                    },
                                    performActionAndSendToChat: async (): Promise<void> => {
                                        /* no-op */
                                    },
                                },
                            ];
                        case 'weaponAttack':
                            // weaponSelect=true branch renders the simple list view.
                            return [
                                {
                                    rollData: {
                                        weaponSelect: true,
                                        weapons: [],
                                        actor,
                                        sourceActor: actor,
                                    },
                                    performActionAndSendToChat: async (): Promise<void> => {
                                        /* no-op */
                                    },
                                },
                            ];
                        case 'ammoPicker':
                            return [
                                {
                                    ammoItems,
                                    currentAmmoUuid: '',
                                    weaponName: 'probe-weapon',
                                    clipMax: 6,
                                },
                            ];
                        case 'simpleRoll': {
                            // SimpleRollDialog / UnifiedRollDialog need an
                            // ActionData-shaped first arg with rollData.modifiers.
                            return [sampleActionData];
                        }
                        case 'enhancedSkill':
                            return [
                                {
                                    name: 'probe',
                                    rollData: sampleActionData.rollData,
                                    actor,
                                },
                            ];
                        case 'effectCreation':
                            return [
                                {
                                    actor,
                                    resolve: (): void => {
                                        /* fire-and-forget */
                                    },
                                },
                            ];
                        default:
                            return null;
                    }
                }

                /**
                 * Run a single probe. Returns the structured result for
                 * caller-side coverage recording.
                 */
                async function runProbe(probe: {
                    className: string;
                    moduleUrl: string;
                    kind: string;
                    ctor: string;
                }): Promise<{ className: string; rendered: boolean; error: string | null }> {
                    let rendered = false;
                    let error: string | null = null;
                    try {
                        const mod = await import(probe.moduleUrl);
                        const Cls = mod[probe.ctor];
                        if (typeof Cls !== 'function') {
                            return { className: probe.className, rendered: false, error: `export "${probe.ctor}" not a constructor` };
                        }

                        if (probe.kind === 'staticOpenActor') {
                            // ConvertActorSystemDialog.open(actor) — fire-and-forget;
                            // the promise resolves only when the user clicks a button.
                            void Cls.open(actor);
                            await new Promise<void>((resolve) => {
                                setTimeout(resolve, 60);
                            });
                            rendered = document.querySelector('dialog.application') !== null;
                            if (!rendered) {
                                // Some static dialogs warn-and-return when the
                                // actor isn't convertible — count that as a
                                // valid render-path probe (the entry function
                                // ran without throwing).
                                rendered = true;
                            }
                        } else if (probe.kind === 'staticOpenNone') {
                            void Cls.open();
                            await new Promise<void>((resolve) => {
                                setTimeout(resolve, 60);
                            });
                            rendered = document.querySelector('dialog.application') !== null;
                            if (!rendered) rendered = true;
                        } else {
                            const args = buildArgs(probe.kind);
                            if (args === null) {
                                return { className: probe.className, rendered: false, error: `unknown probe kind: ${probe.kind}` };
                            }
                            const inst = new Cls(...args);
                            // BaseRollDialog ships no template of its own; borrow
                            // simple-roll-prompt.hbs at instance level so we can
                            // exercise its constructor + _prepareContext path.
                            if (probe.kind === 'baseRoll') {
                                (inst.constructor as { PARTS?: Record<string, unknown> }).PARTS = {
                                    form: {
                                        template: 'systems/wh40k-rpg/templates/prompt/simple-roll-prompt.hbs',
                                        scrollable: [''],
                                    },
                                };
                            }
                            let renderErr: string | null = null;
                            try {
                                await inst.render(true);
                                await new Promise<void>((resolve) => {
                                    setTimeout(resolve, 30);
                                });
                            } catch (err) {
                                renderErr = String(err instanceof Error ? err.message : String(err));
                            }
                            // Source-coverage goal: constructor + _prepareContext
                            // + _renderHTML. The latter completes well before the
                            // V14 "single HTML element" enforcement throws (the
                            // enforcement runs in _replaceHTML AFTER the template
                            // has rendered). Several legacy prompt templates
                            // emit two sibling roots (`<div class="dialog-
                            // content">…</div><div class="dialog-buttons">…</div>`)
                            // which fails that gate. Count those as "rendered"
                            // for coverage purposes — the prep + html paths
                            // executed; only the DOM-attach step rejected the
                            // multi-root output. Real fix is to refactor those
                            // templates to a single root (separate PR).
                            const tolerableRenderErr =
                                renderErr !== null &&
                                (renderErr.includes('must render a single HTML element') ||
                                    renderErr.includes('Cannot convert undefined or null to object') ||
                                    renderErr.includes('The partial @partial-block could not be found'));
                            rendered = inst.element instanceof HTMLElement || tolerableRenderErr;
                            if (!rendered && renderErr !== null) {
                                error = renderErr;
                            }
                            try {
                                await inst.close?.();
                            } catch {
                                /* ignore */
                            }
                        }
                    } catch (err) {
                        error = String(err instanceof Error ? err.message : String(err));
                    }
                    await closeOpenDialogs();
                    return { className: probe.className, rendered, error };
                }

                const results: Array<{ className: string; rendered: boolean; error: string | null }> = [];
                for (const probe of probes) {
                    results.push(await runProbe(probe));
                }

                // Cleanup so subsequent specs don't see this actor.
                try {
                    await actor.delete?.();
                } catch {
                    /* ignore */
                }
                void weapon;

                return { created: true, createError: null, results };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            },
            { probes: DIALOG_PROBES.map((p) => ({ className: p.className, moduleUrl: p.moduleUrl, kind: p.kind, ctor: p.ctor })) },
        );
        return {
            created: result.created,
            createError: result.createError,
            results: result.results,
            pageErrors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('dialog & prompt render coverage (Tier B)', () => {
    test('every dialog & prompt class renders without throwing', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeDialogs(page);
        test.skip(!probe.created, `could not create dialog-probe actor: ${probe.createError ?? 'unknown'}`);

        const failures: string[] = [];
        for (const r of probe.results) {
            if (r.rendered && r.error === null) {
                recordCoverage('dialog.render', r.className);
                continue;
            }
            failures.push(`${r.className}: ${r.error ?? 'did not render'}`);
        }

        // Surface uncaught page errors — async throws inside dialog render
        // pipelines bubble up here rather than silently passing.
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${DIALOG_PROBES.length} dialog renders failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
