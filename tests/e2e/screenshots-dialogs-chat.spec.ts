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
    'TransactionRequestDialog',
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

const SCREENSHOT_DIALOG_CHAT_FLOWS = [
    ...DIALOG_CLASSES.map((c) => `dialog::${c}`),
    ...CHAT_TEMPLATES.map((t) => `chat::${t}`),
] as const;
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
    'TransactionRequestDialog',
]);

const KEBAB_OVERRIDES: Record<string, string> = {
    WH40KCreateActorDialog: 'create-actor-dialog',
};

function kebab(name: string): string {
    if (KEBAB_OVERRIDES[name] !== undefined) return KEBAB_OVERRIDES[name];
    return name
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
        testInfo.setTimeout(180_000);
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
                    async ({ probes }) => {
                        /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side: Foundry globals are runtime-only */
                        const importer = new Function('u', 'return import(u)') as (u: string) => Promise<any>;
                        const out: Array<{ name: string; ok: boolean; elementSelector: string | null; error: string | null }> = [];
                        for (const probe of probes) {
                            let ok = false;
                            let elementSelector: string | null = null;
                            let error: string | null = null;
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
                                        void Cls.open?.();
                                    } catch (err) {
                                        error = String((err as Error)?.message ?? err);
                                    }
                                    await new Promise((r) => setTimeout(r, 200));
                                    const el = document.querySelector('dialog.application');
                                    if (el !== null) {
                                        el.setAttribute('data-screenshot-id', `dialog-${probe.name}`);
                                        elementSelector = `[data-screenshot-id="dialog-${probe.name}"]`;
                                        ok = true;
                                    } else {
                                        ok = error === null;
                                    }
                                } else {
                                    let inst: any;
                                    try {
                                        inst = new Cls({});
                                    } catch {
                                        try {
                                            inst = new Cls();
                                        } catch (err) {
                                            error = String((err as Error)?.message ?? err);
                                        }
                                    }
                                    if (inst !== undefined) {
                                        try {
                                            await inst.render?.({ force: true });
                                        } catch (err) {
                                            error = String((err as Error)?.message ?? err);
                                        }
                                        await new Promise((r) => setTimeout(r, 200));
                                        const el = inst.element instanceof HTMLElement ? inst.element : null;
                                        if (el !== null) {
                                            el.setAttribute('data-screenshot-id', `dialog-${probe.name}`);
                                            elementSelector = `[data-screenshot-id="dialog-${probe.name}"]`;
                                            ok = true;
                                        }
                                    }
                                }
                            } catch (err) {
                                error = String((err as Error)?.message ?? err);
                            }
                            out.push({ name: probe.name, ok, elementSelector, error });
                        }
                        return out;
                        /* eslint-enable @typescript-eslint/no-explicit-any */
                    },
                    { probes: probeManifest },
                );
            } catch (err) {
                failures.push(`dialog probe failed: ${String((err as Error)?.message ?? err)}`);
            }

            for (const r of dialogResults) {
                try {
                    await page.screenshot({ path: `tests/e2e/screenshots/dialog/${r.name}.png`, fullPage: true });
                } catch (err) {
                    failures.push(`screenshot dialog::${r.name}: ${String((err as Error)?.message ?? err)}`);
                }
                recordCoverage('screenshot.dialog-chat.flow', `dialog::${r.name}`);
                // Tear down between renders so windows don't stack.
                await page.evaluate(() => {
                    document.querySelectorAll('dialog.application,[data-screenshot-id^="dialog-"]').forEach((el) => {
                        try {
                            (el as HTMLDialogElement).close?.();
                        } catch {
                            /* ignore */
                        }
                        el.remove();
                    });
                    const g = globalThis as unknown as { ui?: { windows?: Record<string, { close?: () => Promise<unknown> }> } };
                    Object.values(g.ui?.windows ?? {}).forEach((w) => {
                        try {
                            void w?.close?.();
                        } catch {
                            /* ignore */
                        }
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
                    createdId = await page.evaluate(async (template: string) => {
                        const g = globalThis as unknown as {
                            foundry?: { applications?: { handlebars?: { renderTemplate?: (p: string, ctx: object) => Promise<string> } } };
                            ChatMessage?: { create?: (data: object) => Promise<{ id?: string } | null> };
                        };
                        const renderTemplate = g.foundry?.applications?.handlebars?.renderTemplate;
                        if (renderTemplate === undefined || g.ChatMessage?.create === undefined) {
                            throw new Error('Foundry APIs unavailable (renderTemplate/ChatMessage)');
                        }
                        let html = '';
                        try {
                            html = await renderTemplate(`systems/wh40k-rpg/templates/chat/${template}.hbs`, {});
                        } catch (err) {
                            throw new Error(`renderTemplate(${template}): ${String((err as Error)?.message ?? err)}`);
                        }
                        const msg = await g.ChatMessage.create({ content: html.length > 0 ? html : `<div data-chat-empty="${template}"></div>` });
                        return msg?.id ?? null;
                    }, tpl);
                } catch (err) {
                    postError = String((err as Error)?.message ?? err);
                }
                try {
                    await page.screenshot({ path: `tests/e2e/screenshots/chat/${tpl}.png`, fullPage: true });
                } catch (err) {
                    failures.push(`screenshot chat::${tpl}: ${String((err as Error)?.message ?? err)}`);
                }
                recordCoverage('screenshot.dialog-chat.flow', `chat::${tpl}`);
                // Tear the message down so the chat log doesn't grow unbounded.
                if (createdId !== null) {
                    await page.evaluate(async (id: string) => {
                        const g = globalThis as unknown as {
                            game?: { messages?: { get?: (i: string) => { delete?: () => Promise<unknown> } | undefined } };
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
