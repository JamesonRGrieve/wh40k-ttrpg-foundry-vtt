/**
 * Keys MUST match the SCREENSHOT_DIALOG_CHAT_FLOWS constant in scripts/e2e-coverage.mjs
 * (registered by the orchestrator). Generates PNGs under tests/e2e/screenshots/{dialog,chat}/
 * (gitignored by the orchestrator).
 *
 * Tier B screenshot rendering of every dialog / prompt class and every chat
 * card Handlebars template — the corpus the UI coherence audit inspects.
 *
 * Each dialog is opened, captured as ITS OWN window element, and closed before
 * the next opens. (The earlier shape opened every dialog first and screenshotted
 * afterwards: the first capture showed all of them stacked and every later one
 * an empty canvas, so the corpus could not be audited.) Chat cards are posted
 * into an expanded chat log and captured as the rendered `.chat-message`.
 * Render failures are collected and reported, never fatal mid-loop.
 */
import type { Page } from '@playwright/test';
import { type ContrastViolation, scanContrast, writeContrastReport } from './lib/contrast';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

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
    'SpecialistSkillDialog',
    'UnifiedRollDialog',
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

/**
 * Opened only mid-roll-pipeline: their `rollData` carries populated modifier
 * maps + selectWeapon/finalize callbacks produced by the roll initiation flow,
 * which a standalone probe cannot synthesise. There is no faithful bare
 * snapshot, so they are skipped from render + assertion.
 */
const REQUIRES_LIVE_ROLL_CONTEXT = new Set<string>(['AssignDamageDialog']);

/** Dialogs opened through a static `open(...)` rather than `new Cls(...)`. */
const STATIC_OPEN_DIALOGS = new Set<string>(['ConvertActorSystemDialog', 'WH40KCreateActorDialog']);

interface SeedIds {
    dh2: string | null;
    rt: string | null;
}

interface DialogOpenResult {
    elementSelector: string | null;
    error: string | null;
}

/** Create the minimal real actors context-requiring dialogs read. */
async function createSeeds(page: Page): Promise<SeedIds> {
    return page.evaluate(async (): Promise<SeedIds> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-side Foundry `Actor.create` is runtime-only with no shipped type in this Playwright context
        const ActorCtor = (globalThis as unknown as { Actor?: { create?: (d: object) => Promise<{ id?: string } | null> } }).Actor;
        const make = async (type: string): Promise<string | null> => {
            try {
                return (await ActorCtor?.create?.({ name: `probe-dialog-${type}`, type }))?.id ?? null;
            } catch {
                return null;
            }
        };
        return { dh2: await make('dh2-character'), rt: await make('rt-character') };
    });
}

async function deleteSeeds(page: Page, seeds: SeedIds): Promise<void> {
    await page.evaluate(async (ids: SeedIds): Promise<void> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-side Foundry `game.actors` is runtime-only with no shipped type in this Playwright context
        const g = globalThis as unknown as { game?: { actors?: { get?: (id: string) => { delete?: () => Promise<void> } | undefined } } };
        for (const id of [ids.dh2, ids.rt]) {
            if (id === null) continue;
            try {
                await g.game?.actors?.get?.(id)?.delete?.();
            } catch {
                /* best-effort */
            }
        }
    }, seeds);
}

/** Open ONE dialog and tag its window element for capture. */
async function openDialog(page: Page, name: string, url: string, seeds: SeedIds): Promise<DialogOpenResult> {
    return page.evaluate(
        async ({ probeName, probeUrl, seedIds, staticOpen }): Promise<DialogOpenResult> => {
            interface DialogInstance {
                render?: (opts: { force: boolean }) => Promise<void>;
                element?: HTMLElement;
            }
            type DialogConstructor = (new (arg?: object) => DialogInstance) & { open?: (arg?: object) => Promise<void> };
            interface DialogModule {
                default?: DialogConstructor;
                [name: string]: DialogConstructor | undefined;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-side Foundry `game.actors` is runtime-only with no shipped type in this Playwright context
            const g = globalThis as unknown as { game?: { actors?: { get?: (id: string) => object | undefined } } };
            const actorFor = (id: string | null): object | undefined => (id === null ? undefined : g.game?.actors?.get?.(id));
            const dh2Actor = actorFor(seedIds.dh2);
            const rtActor = actorFor(seedIds.rt);
            const seedArgs: Partial<Record<string, object>> = {
                AmmoPickerDialog: { ammoItems: [], weaponName: 'Probe Weapon', clipMax: 10 },
            };
            if (dh2Actor !== undefined) {
                seedArgs['AdvancementDialog'] = dh2Actor;
                seedArgs['CharacteristicSetupDialog'] = dh2Actor;
                seedArgs['AddXPDialog'] = dh2Actor;
                seedArgs['SpecialistSkillDialog'] = dh2Actor;
            }
            if (rtActor !== undefined) seedArgs['AcquisitionDialog'] = rtActor;

            const tag = (el: Element): string => {
                el.setAttribute('data-screenshot-id', `dialog-${probeName}`);
                return `[data-screenshot-id="dialog-${probeName}"]`;
            };
            const settle = async (): Promise<void> => {
                await globalThis.wh40kE2E.settle(200);
            };
            try {
                // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func -- browser-side: Playwright evaluate context requires Function constructor to perform dynamic import; static import() is hoisted and cannot be used here
                const importer = new Function('u', 'return import(u)') as (u: string) => Promise<DialogModule>;
                const mod = await importer(probeUrl);
                const Cls = mod.default ?? mod[probeName];
                if (typeof Cls !== 'function') return { elementSelector: null, error: `no constructor at ${probeUrl}` };

                if (staticOpen) {
                    // open() resolves only when the dialog closes, so it is not awaited;
                    // ConvertActorSystemDialog.open(actor) reads `actor.type`.
                    const openArg = probeName === 'ConvertActorSystemDialog' ? dh2Actor : undefined;
                    const opened = openArg !== undefined ? Cls.open?.(openArg) : Cls.open?.();
                    if (opened !== undefined) void opened.catch(() => undefined);
                    await settle();
                    const windowEl = document.querySelector('dialog.application[open], dialog.application');
                    return windowEl !== null
                        ? { elementSelector: tag(windowEl), error: null }
                        : { elementSelector: null, error: 'static open() rendered no window' };
                }

                const seedArg = seedArgs[probeName];
                let inst: DialogInstance;
                try {
                    inst = seedArg !== undefined ? new Cls(seedArg) : new Cls({});
                } catch {
                    inst = new Cls();
                }
                await inst.render?.({ force: true });
                await settle();
                const el = inst.element instanceof HTMLElement ? inst.element : null;
                return el !== null ? { elementSelector: tag(el), error: null } : { elementSelector: null, error: 'render produced no element' };
            } catch (err) {
                return { elementSelector: null, error: err instanceof Error ? err.message : String(err) };
            }
        },
        { probeName: name, probeUrl: url, seedIds: seeds, staticOpen: STATIC_OPEN_DIALOGS.has(name) },
    );
}

/**
 * Close every open window properly (so Foundry cancels deferred position/render
 * callbacks instead of firing them on detached elements), then force-remove any
 * leftover dialog DOM.
 */
async function closeAllWindows(page: Page): Promise<void> {
    await clearScreenOverlays(page);
    await page.evaluate(() => {
        document.querySelectorAll('dialog.application,[data-screenshot-id^="dialog-"]').forEach((el) => {
            try {
                (el as HTMLDialogElement).close();
            } catch {
                /* ignore */
            }
            el.remove();
        });
    });
}

/** Expand the sidebar on the Chat tab so posted cards render visibly. */
async function showChatLog(page: Page): Promise<void> {
    await page.evaluate(() => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-side Foundry `ui.sidebar` is runtime-only with no shipped type in this Playwright context
        const g = globalThis as unknown as { ui?: { sidebar?: { expand?: () => void; changeTab?: (tab: string, group: string) => void } } };
        g.ui?.sidebar?.expand?.();
        g.ui?.sidebar?.changeTab?.('chat', 'primary');
    });
}

test.describe.serial('screenshot corpus: dialogs + chat cards (Tier B)', () => {
    test('snapshot every dialog class and every chat-card template', async ({ page }, testInfo) => {
        // ~45 element captures run serially against a live Foundry world.
        testInfo.setTimeout(scaledMs(420_000));
        await joinOrSkip(page);

        const failures: string[] = [];

        // ─── DIALOGS ────────────────────────────────────────────────
        const seeds = await createSeeds(page);
        const contrast: Record<string, ContrastViolation[]> = {};
        for (const name of DIALOG_CLASSES) {
            recordCoverage('screenshot.dialog-chat.flow', `dialog::${name}`);
            if (REQUIRES_LIVE_ROLL_CONTEXT.has(name)) continue;
            await closeAllWindows(page);
            const opened = await openDialog(page, name, moduleUrlFor(name), seeds);
            if (opened.elementSelector === null) {
                failures.push(`dialog::${name}: ${opened.error ?? 'did not render'}`);
                continue;
            }
            try {
                await page
                    .locator(opened.elementSelector)
                    .first()
                    .screenshot({ path: `tests/e2e/screenshots/dialog/${name}.png` });
                contrast[name] = await scanContrast(page, opened.elementSelector);
            } catch (err) {
                failures.push(`screenshot dialog::${name}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        writeContrastReport('tests/e2e/screenshots/dialog/contrast-report.json', contrast);
        await closeAllWindows(page);
        await deleteSeeds(page, seeds);

        // ─── CHAT TEMPLATES ─────────────────────────────────────────
        await showChatLog(page);
        for (const tpl of CHAT_TEMPLATES) {
            recordCoverage('screenshot.dialog-chat.flow', `chat::${tpl}`);
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
                    const html = await renderTemplateFn(`systems/wh40k-rpg/templates/chat/${template}.hbs`, {});
                    const msg = await g.ChatMessage.create({ content: html.length > 0 ? html : `<div data-chat-empty="${template}"></div>` });
                    return msg?.id ?? null;
                }, tpl);
            } catch (err) {
                failures.push(`chat::${tpl}: ${err instanceof Error ? err.message : String(err)}`);
                continue;
            }
            if (createdId === null) {
                failures.push(`chat::${tpl}: ChatMessage.create returned no message`);
                continue;
            }
            const card = page.locator(`#chat .chat-message[data-message-id="${createdId}"], .chat-log .chat-message[data-message-id="${createdId}"]`).first();
            try {
                await card.scrollIntoViewIfNeeded();
                await card.screenshot({ path: `tests/e2e/screenshots/chat/${tpl}.png` });
            } catch (err) {
                failures.push(`screenshot chat::${tpl}: ${err instanceof Error ? err.message : String(err)}`);
            }
            // Tear the message down so the chat log doesn't grow unbounded.
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
        // Collect-then-assert: surface every failure at once for diagnosis.
        expect(failures, `${failures.length} screenshot probe(s) failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
