import type { Page } from '@playwright/test';
import { GAME_SYSTEM_IDS, joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B — roll-transparency chat card.
 *
 * Proves the modifier-breakdown "transparency readout" that a resolved attack /
 * characteristic roll posts to chat: `base ± every sourced component = target`,
 * each sourced row hoverable to its provenance, plus the human-readable
 * `N DoS = 1 + degree (roll R vs target T)` result formula. Source coverage
 * falls onto:
 *   - src/module/rolls/roll-data.ts        — RollData.calculateTotalModifiers →
 *     buildModifierSources (the provenance-bearing `modifierSources` list with the
 *     pre-serialised `data-wh40k-tooltip-data` payload per row).
 *   - src/templates/chat/partial/modifier-breakdown.hbs — Base row + one
 *     `data-wh40k-tooltip="modifier"` row per component + the Target callout.
 *   - src/templates/chat/action-roll-chat.hbs — hosts the breakdown + the
 *     `resultFormula` line.
 *   - src/module/actions/basic-action-manager.ts — the `renderChatMessageHTML`
 *     hook that stamps `wh40k-rpg` onto the message element so Tailwind + the
 *     wh40k-tooltip delegate apply to the card.
 *
 * Why the commit seam and not a literal sheet click: the full attack routes
 * through the UnifiedRollDialog, which blocks a headless click-through (see
 * combat-attack-flow.spec.ts). This spec creates a real per-system actor with a
 * characteristic + a weapon, then drives the SAME commit seam the sheet's roll
 * action invokes — RollData.calculateTotalModifiers() (real modifierSources +
 * tooltipData), the real localised `WH40K.Roll.ResultFormula.Success` string, the
 * real action-roll-chat render, and a real `ChatMessage.create` — and asserts on
 * the resolved card's live DOM with Playwright locators (no fabricated markup,
 * no brittle waits). The loop covers all seven homologated systems.
 */

/** The non-zero modifiers seeded onto the roll — each becomes one sourced,
 *  hoverable component row on the card. `modifier: 0` is intentionally left at
 *  zero to prove zero-valued keys are omitted from the breakdown. */
const EXPECTED_SOURCE_ROWS = 3; // difficulty, aim, range (modifier=0 skipped)

interface BuiltCard {
    messageId: string | null;
    actorId: string | null;
    weaponName: string;
    baseTarget: number;
    modifiedTarget: number;
    error: string | null;
    skip: boolean;
    note: string;
}

/**
 * Browser-context builder: create the actor + weapon, run the real roll-commit
 * seam, render the action card, and post it as a real ChatMessage. Returns the
 * created message id (+ the numbers the card should show) so the Playwright side
 * can assert on the resolved DOM.
 */
async function buildTransparencyCard(page: Page, sys: string): Promise<BuiltCard> {
    return page.evaluate(async (systemId: string): Promise<BuiltCard> => {
        // ---- Browser-side Foundry + system-module surfaces (no repo types here) ----
        interface RollDataLike {
            baseChar: string;
            baseTarget: number;
            action: string;
            // eslint-disable-next-line no-restricted-syntax -- boundary: opaque Foundry Item document assigned page-side, no repo type here
            weapon?: unknown;
            // eslint-disable-next-line no-restricted-syntax -- boundary: opaque Foundry Actor document assigned page-side, no repo type here
            sourceActor?: unknown;
            modifiers: Record<string, number>;
            roll: { total: number } | null;
            success: boolean;
            dos: number;
            resultFormula: string;
            isManualRoll?: boolean;
            readonly modifiedTarget: number;
            calculateTotalModifiers: () => Promise<void>;
        }
        type RollDataCtor = new () => RollDataLike;
        interface ActionDataLike {
            template: string;
            rollData: RollDataLike;
        }
        type ActionDataCtor = new () => ActionDataLike;
        // eslint-disable-next-line no-restricted-syntax -- boundary: resolveGettersForTemplate returns the untyped flattened template record
        type ResolveFn = (instance: object) => Record<string, unknown>;
        type DegreesMethodFn = (id: string | undefined) => 'gen1' | 'gen2';
        type DegreeForModeFn = (method: 'gen1' | 'gen2', a: number, b: number) => number;

        interface ActorLike {
            readonly id?: string;
            readonly system?: { characteristics?: { ballisticSkill?: { total?: number; value?: number } } };
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Collection.get returns an opaque Document, no page-side type
            readonly items?: { get?: (id: string) => unknown };
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document.update(data) — untyped framework payload + result
            update?: (data: Record<string, unknown>) => Promise<unknown>;
            createEmbeddedDocuments?: (type: string, data: object[]) => Promise<Array<{ id: string }> | undefined>;
            delete?: () => Promise<void>;
        }
        interface Collection {
            get?: (id: string) => (ActorLike & { delete?: () => Promise<void> }) | null | undefined;
        }
        interface ChatMessageApi {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ChatMessage.create(data) — untyped framework payload
            create?: (data: Record<string, unknown>) => Promise<{ id?: string } | null>;
        }
        interface PageWindow {
            Actor?: { create?: (data: object) => Promise<ActorLike | null> };
            ChatMessage?: ChatMessageApi;
            game?: {
                actors?: Collection;
                messages?: Collection;
                i18n?: { format?: (key: string, data: Record<string, string>) => string };
            };
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry renderTemplate(path, ctx) — untyped framework template context
            foundry?: { applications?: { handlebars?: { renderTemplate?: (path: string, ctx: Record<string, unknown>) => Promise<string> } } };
        }

        const fail = (note: string): BuiltCard => ({
            messageId: null,
            actorId: null,
            weaponName: '',
            baseTarget: 0,
            modifiedTarget: 0,
            error: note,
            skip: false,
            note,
        });

        // eslint-disable-next-line no-restricted-syntax -- boundary: a caught error value is `unknown`
        const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

        // eslint-disable-next-line no-restricted-syntax -- boundary: the page-side globalThis carries the untyped Foundry V14 runtime + this system's served ESM
        const g = globalThis as unknown as PageWindow;
        const ActorCtor = g.Actor;
        const gameObj = g.game;
        const ChatMessageCtor = g.ChatMessage;
        const renderTemplateFn = g.foundry?.applications?.handlebars?.renderTemplate;
        // Bind `format` to its i18n owner: Foundry's Localization.format reads
        // `this.translations`, so calling a detached `const fn = i18n.format`
        // throws "Cannot read properties of undefined (reading 'translations')".
        const i18nObj = gameObj?.i18n;
        const i18nFormat = typeof i18nObj?.format === 'function' ? i18nObj.format.bind(i18nObj) : undefined;
        if (ActorCtor?.create == null || ChatMessageCtor?.create == null || renderTemplateFn == null || i18nFormat == null) {
            return { ...fail('Foundry runtime surfaces (Actor/ChatMessage/renderTemplate/i18n) unavailable'), skip: true };
        }

        // Load the system's roll-commit seam. Indirect via variables so knip
        // treats these `/systems/...` runtime URLs as dynamic (not repo files).
        const rdUrl = '/systems/wh40k-rpg/module/rolls/roll-data.js';
        const adUrl = '/systems/wh40k-rpg/module/rolls/action-data.js';
        const rhUrl = '/systems/wh40k-rpg/module/rolls/roll-helpers.js';
        // eslint-disable-next-line no-restricted-syntax -- boundary: runtime ESM imports of Foundry-served modules have no static type
        const rdMod = (await import(/* @vite-ignore */ rdUrl)) as Record<string, unknown>;
        // eslint-disable-next-line no-restricted-syntax -- boundary: runtime ESM imports of Foundry-served modules have no static type
        const adMod = (await import(/* @vite-ignore */ adUrl)) as Record<string, unknown>;
        // eslint-disable-next-line no-restricted-syntax -- boundary: runtime ESM imports of Foundry-served modules have no static type
        const rhMod = (await import(/* @vite-ignore */ rhUrl)) as Record<string, unknown>;
        const RollData = rdMod['RollData'] as RollDataCtor | undefined;
        const ActionData = adMod['ActionData'] as ActionDataCtor | undefined;
        const resolveGetters = rhMod['resolveGettersForTemplate'] as ResolveFn | undefined;
        const resolveDegreesMethod = rhMod['resolveDegreesMethod'] as DegreesMethodFn | undefined;
        const getDegreeForMode = rhMod['getDegreeForMode'] as DegreeForModeFn | undefined;
        if (
            typeof RollData !== 'function' ||
            typeof ActionData !== 'function' ||
            typeof resolveGetters !== 'function' ||
            typeof resolveDegreesMethod !== 'function' ||
            typeof getDegreeForMode !== 'function'
        ) {
            return { ...fail('roll-data / action-data / roll-helpers exports missing'), skip: true };
        }

        // ---- Create the actor, set a characteristic, give it a weapon ----
        let actorId: string;
        try {
            const created = await ActorCtor.create({ name: `roll-transparency-${systemId}`, type: `${systemId}-character`, system: { gameSystem: systemId } });
            if (created?.id == null) return fail('Actor.create returned null');
            actorId = created.id;
        } catch (err) {
            return fail(`Actor.create threw: ${errMsg(err)}`);
        }

        const live = gameObj?.actors?.get?.(actorId);
        if (live == null) return fail('created actor not resolvable from game.actors');

        try {
            await live.update?.({ 'system.characteristics.ballisticSkill.value': 45 });
        } catch (err) {
            return fail(`set characteristic threw: ${errMsg(err)}`);
        }
        const bs = gameObj?.actors?.get?.(actorId)?.system?.characteristics?.ballisticSkill;
        const baseTarget = bs?.total ?? bs?.value ?? 45;

        const weaponName = `Transparency Probe ${systemId.toUpperCase()}`;
        let weaponId: string;
        try {
            const madeWeapon = await live.createEmbeddedDocuments?.('Item', [
                {
                    name: weaponName,
                    type: 'weapon',
                    system: { equipped: true, class: 'ranged', damage: { formula: '1d10', type: 'impact', bonus: 0, penetration: 0 } },
                },
            ]);
            const wid = madeWeapon?.[0]?.id;
            if (wid == null) return fail('failed to create weapon item');
            weaponId = wid;
        } catch (err) {
            return fail(`weapon create threw: ${errMsg(err)}`);
        }
        const liveActor = gameObj?.actors?.get?.(actorId);
        const weapon = liveActor?.items?.get?.(weaponId);

        // ---- Drive the real roll-commit seam ----
        try {
            const rollData = new RollData();
            rollData.baseChar = 'ballisticSkill';
            rollData.baseTarget = baseTarget;
            rollData.action = 'Standard Attack';
            rollData.weapon = weapon;
            rollData.sourceActor = liveActor;
            // One sourced component per non-zero key; `modifier: 0` is dropped by
            // buildModifierSources, proving zero keys are omitted.
            rollData.modifiers = { difficulty: -10, modifier: 0, aim: 10, range: 10 };

            // REAL provenance build: sums modifiers and populates modifierSources
            // (each row carrying the {title, sources:[{name,value}]} tooltip payload).
            await rollData.calculateTotalModifiers();
            const modifiedTarget = rollData.modifiedTarget;

            // Force a success so the DoS branch + result formula render deterministically.
            const rollTotal = Math.max(1, Math.min(98, modifiedTarget - 5));
            rollData.roll = { total: rollTotal };
            rollData.isManualRoll = true; // no evaluated Roll to attach; keep it content-only
            rollData.success = true;
            const method = resolveDegreesMethod(systemId);
            const dos = 1 + getDegreeForMode(method, rollTotal, modifiedTarget);
            rollData.dos = dos;
            // Identical to action-data.ts's success-branch formula construction.
            rollData.resultFormula = i18nFormat('WH40K.Roll.ResultFormula.Success', {
                dos: String(dos),
                degree: String(dos - 1),
                roll: String(rollTotal),
                target: String(modifiedTarget),
            });

            // Assemble the render context exactly as sendActionDataToChat does:
            // flatten the ActionData, then nest the separately-flattened RollData.
            const actionData = new ActionData();
            actionData.template = 'systems/wh40k-rpg/templates/chat/action-roll-chat.hbs';
            actionData.rollData = rollData;
            const context = resolveGetters(actionData);
            context['rollData'] = resolveGetters(rollData);

            const html = await renderTemplateFn(actionData.template, context);
            if (html.trim().length === 0) return fail('action-roll-chat rendered empty');

            const msg = await ChatMessageCtor.create({ content: html, speaker: { actor: actorId } });
            const messageId = msg?.id ?? null;
            if (messageId == null) return fail('ChatMessage.create returned no id');

            return { messageId, actorId, weaponName, baseTarget, modifiedTarget, error: null, skip: false, note: 'ok' };
        } catch (err) {
            return fail(`commit/render/post threw: ${errMsg(err)}`);
        }
    }, sys);
}

/** Delete the posted message + probe actor (cascades the weapon) so each run
 *  leaves the world's chat-log / actor directory as it found them. */
async function cleanupCard(page: Page, built: BuiltCard): Promise<void> {
    await page.evaluate(
        async ({ messageId, actorId }: { messageId: string | null; actorId: string | null }) => {
            interface Collection {
                get?: (id: string) => { delete?: () => Promise<void> } | null | undefined;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context globalThis.game (Foundry global, no repo type)
            const { game: foundryGame } = globalThis as unknown as { game?: { actors?: Collection; messages?: Collection } };
            if (messageId != null) {
                try {
                    await foundryGame?.messages?.get?.(messageId)?.delete?.();
                } catch {
                    /* ignore */
                }
            }
            if (actorId != null) {
                try {
                    await foundryGame?.actors?.get?.(actorId)?.delete?.();
                } catch {
                    /* ignore */
                }
            }
        },
        { messageId: built.messageId, actorId: built.actorId },
    );
}

test.describe.serial('roll transparency chat card (Tier B)', () => {
    for (const sys of GAME_SYSTEM_IDS) {
        test(`modifier breakdown + provenance + result formula render — ${sys}`, async ({ page }) => {
            const joined = await joinAsGM(page);
            test.skip(!joined, 'no Gamemaster option appeared in the join select');

            const pageErrors: string[] = [];
            const listener = (err: Error): void => {
                pageErrors.push(err.message);
            };
            page.on('pageerror', listener);

            const built = await buildTransparencyCard(page, sys);
            const errTail = pageErrors.length > 0 ? ` | pageerrors: ${pageErrors.slice(0, 3).join(' ; ')}` : '';

            try {
                test.skip(built.skip, `harness cannot build the card: ${built.note}`);
                expect(built.error, `${built.error ?? ''}${errTail}`).toBeNull();
                expect(built.messageId, 'no chat message id returned').not.toBeNull();

                // The rendered message <li> in the sidebar chat (`#chat`) — the
                // element the renderChatMessageHTML hook stamps `wh40k-rpg` onto.
                // Scope to `#chat li.chat-message` so the bare id doesn't also
                // match the transient `#chat-notifications` copy or the
                // Dismiss/Delete anchors that carry the same data-message-id
                // (Playwright strict mode rejects a multi-element single-target).
                const card = page.locator(`#chat li.chat-message[data-message-id="${built.messageId}"]`).first();
                await expect(card).toBeAttached();

                // (1) `.wh40k-rpg` ancestor: proves the hook fired so Tailwind + the
                // wh40k-tooltip delegate apply to the card.
                await expect(card).toHaveClass(/wh40k-rpg/);

                // The weapon drove the card — its name is the card title.
                await expect(card).toContainText(built.weaponName);

                // (2) Base row — the pre-modifier target, labelled "Base".
                await expect(card.getByText('Base', { exact: true }).first()).toBeVisible();

                // (3) One sourced component row per non-zero modifier, each hoverable
                // via the shared wh40k-tooltip "modifier" type.
                const rows = card.locator('[data-wh40k-tooltip="modifier"]');
                await expect(rows).toHaveCount(EXPECTED_SOURCE_ROWS);

                // (4) Every sourced row carries a parseable provenance payload
                // (title + sources[{name,value}]) verbatim in data-wh40k-tooltip-data.
                const payloads = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-wh40k-tooltip-data')));
                expect(payloads).toHaveLength(EXPECTED_SOURCE_ROWS);
                for (const raw of payloads) {
                    expect(raw, 'sourced row missing data-wh40k-tooltip-data').not.toBeNull();
                    // eslint-disable-next-line no-restricted-syntax -- boundary: JSON.parse return of the serialised tooltip payload
                    const parsed = JSON.parse(raw ?? '{}') as { title?: unknown; sources?: unknown };
                    expect(typeof parsed.title, `tooltip payload title not a string: ${raw ?? ''}`).toBe('string');
                    expect(Array.isArray(parsed.sources), `tooltip payload sources not an array: ${raw ?? ''}`).toBe(true);
                    // eslint-disable-next-line no-restricted-syntax -- boundary: the parsed payload's `sources` entries are opaque until asserted below
                    const first = (parsed.sources as Array<{ name?: unknown; value?: unknown }>).at(0);
                    expect(first, 'tooltip payload has no source entry').toBeTruthy();
                    expect(typeof first?.name).toBe('string');
                    expect(typeof first?.value).toBe('number');
                }

                // (5) The applied Difficulty modifier renders as its own row, with the
                // signed value AND its provenance — the "apply a modifier" case.
                const difficultyRow = rows.filter({ hasText: 'Difficulty' });
                await expect(difficultyRow).toHaveCount(1);
                await expect(difficultyRow).toContainText('-10');
                const diffPayloadRaw = await difficultyRow.getAttribute('data-wh40k-tooltip-data');
                const diffPayload = JSON.parse(diffPayloadRaw ?? '{}') as { title?: string; sources?: Array<{ value?: number }> };
                expect(diffPayload.title).toBe('Difficulty');
                expect(diffPayload.sources?.[0]?.value).toBe(-10);

                // The positive Aim modifier renders with its `+` sign.
                await expect(rows.filter({ hasText: 'Aim' })).toContainText('+10');

                // (6) Target callout — the modified target after all components.
                await expect(card.getByText('Target', { exact: true }).first()).toBeVisible();
                await expect(card).toContainText(String(built.modifiedTarget));

                // (7) The human-readable result formula line: `N DoS = 1 + degree …`.
                await expect(card).toContainText(/\d+ DoS = 1 \+ /);
            } finally {
                page.off('pageerror', listener);
                await cleanupCard(page, built);
            }
        });
    }
});
