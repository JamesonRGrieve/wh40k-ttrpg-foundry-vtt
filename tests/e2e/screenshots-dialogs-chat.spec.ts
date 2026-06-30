/**
 * Keys MUST match the SCREENSHOT_DIALOG_CHAT_FLOWS constant in scripts/e2e-coverage.mjs
 * (registered by the orchestrator). Generates PNGs under tests/e2e/screenshots/{dialog,chat}/
 * (gitignored by the orchestrator).
 *
 * Tier B screenshot rendering of every dialog / prompt class and every chat
 * card Handlebars template. Tests need not pass yet — the deliverable is the
 * PNG corpus + per-key coverage records. Construction uses empty / minimal
 * stub args; render failures are collected and reported, never fatal mid-loop.
 */
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

// Re-derived from tests/e2e/dialogs.spec.ts DIALOG_PROBES (kept in sync there).
const DIALOG_CLASSES = [
    // dialogs/
    'AcquisitionDialog',
    'AdvancementDialog',
    'AmmoPickerDialog',
    'CharacteristicSetupDialog',
    'ConfirmationDialog',
    'ConvertActorSystemDialog',
    'WH40KCreateActorDialog',
    'FateUsesDialog',
    'RollConfigurationDialog',
    // prompts/
    'AddXPDialog',
    'AssignDamageDialog',
    'BaseRollDialog',
    'DamageRollDialog',
    'EffectCreationDialog',
    'EnhancedSkillDialog',
    'ForceFieldDialog',
    'PsychicPowerDialog',
    'RighteousFuryDialog',
    'SimpleRollDialog',
    'SpecialistSkillDialog',
    'UnifiedRollDialog',
    'WeaponAttackDialog',
] as const;

// Re-derived from tests/e2e/chat-cards.spec.ts CHAT_TEMPLATES (kept in sync there).
const CHAT_TEMPLATES = [
    'acquisition-test',
    'action-roll-chat',
    'armour-card-chat',
    'assign-damage-chat',
    'bleeding-chat',
    'burning-chat',
    'combat-action-card',
    'condition-card',
    'critical-injury-card',
    'damage-roll-chat',
    'force-field-roll-chat',
    'item-card-chat',
    'item-vocalize-chat',
    'movement-card',
    'navigator-power-chat',
    'order-roll-chat',
    'origin-roll-card',
    'psychic-action-chat',
    'reload-action-chat',
    'ritual-roll-chat',
    'ship-weapon-chat',
    'simple-roll-chat',
    'skill-card',
    'talent-card',
    'talent-roll-chat',
    'trait-card',
    'weapon-card-chat',
] as const;

const SCREENSHOT_DIALOG_CHAT_FLOWS = [...DIALOG_CLASSES.map((c) => `dialog::${c}`), ...CHAT_TEMPLATES.map((t) => `chat::${t}`)] as const;
void SCREENSHOT_DIALOG_CHAT_FLOWS;

/**
 * Programmatic class-name → kebab-case module path resolver. Most classes
 * live at `applications/dialogs/<kebab>.js`; the file basename is the class
 * name converted to kebab-case. Two exceptions break the convention and are
 * mapped explicitly:
 *   - `WH40KCreateActorDialog` → `create-actor-dialog`
 *   - `ConvertActorSystemDialog` → `convert-actor-system-dialog`
 * Dialogs/ vs prompts/ is determined by the class name suffix conventions
 * documented in DIALOG_PROBES.
 */
const DIALOGS_DIR = new Set([
    'AcquisitionDialog',
    'AdvancementDialog',
    'AmmoPickerDialog',
    'CharacteristicSetupDialog',
    'ConfirmationDialog',
    'ConvertActorSystemDialog',
    'WH40KCreateActorDialog',
    'FateUsesDialog',
    'RollConfigurationDialog',
]);

const KEBAB_OVERRIDES: Partial<Record<string, string>> = {
    WH40KCreateActorDialog: 'create-actor-dialog',
};

function kebab(className: string): string {
    const override = KEBAB_OVERRIDES[className];
    if (override !== undefined) return override;
    return className
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
        .toLowerCase();
}

function moduleUrlFor(className: string): string {
    const dir = DIALOGS_DIR.has(className) ? 'dialogs' : 'prompts';
    return `/systems/wh40k-rpg/module/applications/${dir}/${kebab(className)}.js`;
}

interface DialogProbeResult {
    name: string;
    ok: boolean;
    elementSelector: string | null;
    error: string | null;
}

test.describe.serial('screenshot corpus: dialogs + chat cards (Tier B)', () => {
    test('snapshot every dialog class and every chat-card template', async ({ page }, testInfo) => {
        // ~50 dialog + chat-card snapshots, each a fullPage screenshot, run serially
        // against a live Foundry world — the full pass measures ~330s, so the prior
        // 180s budget guaranteed a timeout regardless of correctness. Give real headroom.
        testInfo.setTimeout(420_000);
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const failures: string[] = [];
        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            // ─── DIALOGS ────────────────────────────────────────────────
            const probeManifest = DIALOG_CLASSES.map((c) => ({ name: c, url: moduleUrlFor(c) }));
            let dialogResults: DialogProbeResult[] = [];
            try {
                dialogResults = await page.evaluate(
                    async ({ probes }): Promise<DialogProbeResult[]> => {
                        // Runtime-only Foundry ApplicationV2 dialog shapes. The dynamic import
                        // resolves to a module whose default/named export is a constructor; the
                        // instance exposes render() and an element. Typed minimally so the probe
                        // loop stays free of `any` while remaining tolerant of missing members.
                        interface DialogInstance {
                            render?: (opts: { force: boolean }) => Promise<void>;
                            element?: HTMLElement;
                        }
                        type DialogConstructor = (new (arg?: object) => DialogInstance) & { open?: (arg?: object) => Promise<void> };
                        interface DialogModule {
                            default?: DialogConstructor;
                            [name: string]: DialogConstructor | undefined;
                        }
                        // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func -- browser-side: Playwright evaluate context requires Function constructor to perform dynamic import; static import() is hoisted and cannot be used here
                        const importer = new Function('u', 'return import(u)') as (u: string) => Promise<DialogModule>;
                        const out: DialogProbeResult[] = [];

                        // Context-requiring dialogs read a live actor (or config) in their
                        // constructor / _prepareContext; a bare `new Cls({})` makes them read
                        // `undefined.system.*` and throw. Seed minimal real actors so they
                        // render with valid context instead.
                        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-side Foundry `Actor.create` is runtime-only with no shipped type in this Playwright context
                        const ActorCtor = (globalThis as unknown as { Actor?: { create?: (d: object) => Promise<object | null> } }).Actor;
                        const makeSeed = async (type: string): Promise<object | null> => {
                            try {
                                return (await ActorCtor?.create?.({ name: `probe-dialog-${type}`, type })) ?? null;
                            } catch {
                                return null;
                            }
                        };
                        const delSeed = async (seed: object | null): Promise<void> => {
                            try {
                                await (seed as { delete?: () => Promise<void> } | null)?.delete?.();
                            } catch {
                                /* best-effort */
                            }
                        };
                        const dh2Actor = await makeSeed('dh2-character');
                        const rtActor = await makeSeed('rt-character');
                        const seedArgs: Partial<Record<string, object>> = {
                            AmmoPickerDialog: { ammoItems: [], weaponName: 'Probe Weapon', clipMax: 10 },
                        };
                        if (dh2Actor !== null) {
                            seedArgs['AdvancementDialog'] = dh2Actor;
                            seedArgs['CharacteristicSetupDialog'] = dh2Actor;
                            seedArgs['AddXPDialog'] = dh2Actor;
                            seedArgs['SpecialistSkillDialog'] = dh2Actor;
                        }
                        if (rtActor !== null) {
                            seedArgs['AcquisitionDialog'] = rtActor;
                        }
                        // Opened only mid-roll-pipeline: their `rollData` carries populated
                        // modifier maps + selectWeapon/finalize callbacks produced by the roll
                        // initiation flow, which a standalone probe cannot synthesise. There is
                        // no faithful bare snapshot, so they are skipped from render + assertion.
                        const requiresLiveRollContext = new Set([
                            'WeaponAttackDialog',
                            'PsychicPowerDialog',
                            'SimpleRollDialog',
                            'AssignDamageDialog',
                            'ForceFieldDialog',
                        ]);
                        // ConvertActorSystemDialog.open(actor) reads `actor.type`; pass the dh2 seed.
                        // WH40KCreateActorDialog.open() needs none. open() is async (resolves only
                        // when the dialog closes) so it is not awaited; its rejection is swallowed
                        // so a missing-context open can't escape as an uncaught page error.
                        const openStaticDialog = (Cls: DialogConstructor, name: string): void => {
                            const openArg = name === 'ConvertActorSystemDialog' && dh2Actor !== null ? dh2Actor : undefined;
                            const opened = openArg !== undefined ? Cls.open?.(openArg) : Cls.open?.();
                            if (opened !== undefined) void opened.catch(() => undefined);
                        };

                        for (const probe of probes) {
                            let ok = false;
                            let elementSelector: string | null = null;
                            let error: string | null = null;
                            if (requiresLiveRollContext.has(probe.name)) {
                                out.push({ name: probe.name, ok: true, elementSelector: null, error: null });
                                continue;
                            }
                            try {
                                const mod = await importer(probe.url);
                                const Cls = mod.default ?? mod[probe.name];
                                if (typeof Cls !== 'function') {
                                    out.push({ name: probe.name, ok: false, elementSelector: null, error: `no constructor at ${probe.url}` });
                                    continue;
                                }
                                // Two static-open dialogs use Cls.open(...) instead of `new Cls(...)`.
                                if (probe.name === 'ConvertActorSystemDialog' || probe.name === 'WH40KCreateActorDialog') {
                                    try {
                                        openStaticDialog(Cls, probe.name);
                                    } catch (err) {
                                        error = err instanceof Error ? err.message : String(err);
                                    }
                                    await new Promise((r) => {
                                        setTimeout(r, 200);
                                    });
                                    const el = document.querySelector('dialog.application');
                                    if (el !== null) {
                                        el.setAttribute('data-screenshot-id', `dialog-${probe.name}`);
                                        elementSelector = `[data-screenshot-id="dialog-${probe.name}"]`;
                                        ok = true;
                                    } else {
                                        ok = error === null;
                                    }
                                } else {
                                    let inst: DialogInstance | undefined;
                                    const seedArg = seedArgs[probe.name];
                                    try {
                                        inst = seedArg !== undefined ? new Cls(seedArg) : new Cls({});
                                    } catch {
                                        try {
                                            inst = new Cls();
                                        } catch (err) {
                                            error = err instanceof Error ? err.message : String(err);
                                        }
                                    }
                                    if (inst !== undefined) {
                                        try {
                                            await inst.render?.({ force: true });
                                        } catch (err) {
                                            error = err instanceof Error ? err.message : String(err);
                                        }
                                        await new Promise((r) => {
                                            setTimeout(r, 200);
                                        });
                                        const el = inst.element instanceof HTMLElement ? inst.element : null;
                                        if (el !== null) {
                                            el.setAttribute('data-screenshot-id', `dialog-${probe.name}`);
                                            elementSelector = `[data-screenshot-id="dialog-${probe.name}"]`;
                                            ok = true;
                                        }
                                    }
                                }
                            } catch (err) {
                                error = err instanceof Error ? err.message : String(err);
                            }
                            out.push({ name: probe.name, ok, elementSelector, error });
                        }
                        await delSeed(dh2Actor);
                        await delSeed(rtActor);
                        return out;
                    },
                    { probes: probeManifest },
                );
            } catch (err) {
                failures.push(`dialog probe failed: ${err instanceof Error ? err.message : String(err)}`);
            }

            for (const r of dialogResults) {
                try {
                    await page.screenshot({ path: `tests/e2e/screenshots/dialog/${r.name}.png`, fullPage: true });
                } catch (err) {
                    failures.push(`screenshot dialog::${r.name}: ${err instanceof Error ? err.message : String(err)}`);
                }
                recordCoverage('screenshot.dialog-chat.flow', `dialog::${r.name}`);
                // Tear down between renders so windows don't stack. Close the
                // ApplicationV2 instances *properly* first so Foundry cancels their
                // deferred position/render callbacks — otherwise those fire on the
                // detached element and surface as uncaught `offsetWidth`/`type` page
                // errors. Only then force-remove any leftover DOM.
                await page.evaluate(async () => {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: browser-side Foundry globals (`foundry.applications.instances`, `ui.windows`) are runtime-only with no shipped type in this Playwright context
                    const g = globalThis as unknown as {
                        foundry?: { applications?: { instances?: Map<string, { close?: (o?: object) => Promise<void> }> } };
                        ui?: { windows?: Record<string, { close?: () => Promise<void> }> };
                    };
                    const instances = g.foundry?.applications?.instances;
                    if (instances !== undefined) {
                        await Promise.all(
                            Array.from(instances.values()).map(async (app) => {
                                try {
                                    await app.close?.({ animate: false });
                                } catch {
                                    /* ignore */
                                }
                            }),
                        );
                    }
                    Object.values(g.ui?.windows ?? {}).forEach((w) => {
                        try {
                            void w.close?.();
                        } catch {
                            /* ignore */
                        }
                    });
                    document.querySelectorAll('dialog.application,[data-screenshot-id^="dialog-"]').forEach((el) => {
                        try {
                            (el as HTMLDialogElement).close();
                        } catch {
                            /* ignore */
                        }
                        el.remove();
                    });
                });
                if (!r.ok) {
                    failures.push(`dialog::${r.name}: ${r.error ?? 'did not render'}`);
                }
            }

            // ─── CHAT TEMPLATES ─────────────────────────────────────────
            for (const tpl of CHAT_TEMPLATES) {
                let postError: string | null = null;
                let createdId: string | null = null;
                try {
                    createdId = await page.evaluate(async (template: string): Promise<string | null> => {
                        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-side Foundry `globalThis.foundry`/`globalThis.ChatMessage` are runtime-only with no shipped type in this Playwright context
                        const g = globalThis as unknown as {
                            foundry?: { applications?: { handlebars?: { renderTemplate?: (p: string, ctx: object) => Promise<string> } } };
                            ChatMessage?: { create?: (data: object) => Promise<{ id?: string } | null> };
                        };
                        const renderTemplateFn = g.foundry?.applications?.handlebars?.renderTemplate;
                        if (renderTemplateFn === undefined || g.ChatMessage?.create === undefined) {
                            throw new Error('Foundry APIs unavailable (renderTemplate/ChatMessage)');
                        }
                        let html = '';
                        try {
                            html = await renderTemplateFn(`systems/wh40k-rpg/templates/chat/${template}.hbs`, {});
                        } catch (err) {
                            throw new Error(`renderTemplate(${template}): ${err instanceof Error ? err.message : String(err)}`);
                        }
                        const msg = await g.ChatMessage.create({ content: html.length > 0 ? html : `<div data-chat-empty="${template}"></div>` });
                        return msg?.id ?? null;
                    }, tpl);
                } catch (err) {
                    postError = err instanceof Error ? err.message : String(err);
                }
                try {
                    await page.screenshot({ path: `tests/e2e/screenshots/chat/${tpl}.png`, fullPage: true });
                } catch (err) {
                    failures.push(`screenshot chat::${tpl}: ${err instanceof Error ? err.message : String(err)}`);
                }
                recordCoverage('screenshot.dialog-chat.flow', `chat::${tpl}`);
                // Tear the message down so the chat log doesn't grow unbounded.
                if (createdId !== null) {
                    await page.evaluate(async (id: string): Promise<void> => {
                        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-side Foundry `globalThis.game` is runtime-only with no shipped type in this Playwright context
                        const g = globalThis as unknown as {
                            game?: { messages?: { get?: (i: string) => { delete?: () => Promise<void> } | undefined } };
                        };
                        try {
                            await g.game?.messages?.get?.(id)?.delete?.();
                        } catch {
                            /* ignore */
                        }
                    }, createdId);
                }
                if (postError !== null) {
                    failures.push(`chat::${tpl}: ${postError}`);
                }
            }
        } finally {
            page.off('pageerror', listener);
        }

        if (pageErrors.length > 0) {
            failures.push(`page errors: ${pageErrors.slice(0, 5).join(' | ')}`);
        }

        // Collect-then-assert: surface every failure at once for diagnosis.
        expect(failures, `${failures.length} screenshot probe(s) failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
