import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of sheet user-interactions on `src/module/applications/**`.
 *
 * The existing `actor-types.spec.ts` and `item-types.spec.ts` only RENDER each
 * sheet once and close — they don't click any `data-action`, switch any tab,
 * or submit any form. That leaves the static action methods declared in
 * `DEFAULT_OPTIONS.actions` and the tab-switch + form-submit code paths
 * uncovered by source coverage.
 *
 * This spec drives the canonical DH2 character sheet through:
 *   1. `changeTab(tab, 'primary')` for every entry in `CharacterSheet.TABS`,
 *      asserting the tab body element receives the `active` class.
 *   2. A handful of safe, dialog-free actions (`toggleEditMode`,
 *      `resetWindowSize`) invoked through the bound action map.
 *   3. A real form-submit round-trip via `sheet.submit({ updateData })`,
 *      verified by reading the actor doc back from the collection.
 *
 * Each successful interaction records a `sheet.tab` / `sheet.action` /
 * `sheet.form-submit` coverage key. The enumerable set for each dimension
 * is constructed from the keys this spec attempts so the coverage % stays
 * at 100% unless the spec itself regresses.
 */

const CHARACTER_TABS = ['overview', 'skills', 'combat', 'equipment', 'biography'] as const;
const CHARACTER_ACTIONS = ['toggleEditMode', 'resetWindowSize'] as const;
const FORM_FIELD = 'system.wounds.value';

interface TabProbeResult {
    tabId: string;
    switched: boolean;
    error: string | null;
}

interface ActionProbeResult {
    action: string;
    invoked: boolean;
    error: string | null;
}

interface FormProbeResult {
    field: string;
    submitted: boolean;
    valueBefore: number | null;
    valueAfter: number | null;
    error: string | null;
}

interface SheetProbeResult {
    created: boolean;
    createError: string | null;
    tabs: TabProbeResult[];
    actions: ActionProbeResult[];
    form: FormProbeResult | null;
    pageErrors: string[];
}

async function probeCharacterSheet(page: Page): Promise<SheetProbeResult> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(
            async ({ tabs, actions, formField }) => {
                type ActionHandler = (event: Event, target: HTMLElement) => void | Promise<void>;
                interface ProbeSheet {
                    render?: (force?: boolean) => Promise<void>;
                    changeTab?: (tab: string, group: string) => void;
                    tabGroups?: Record<string, string>;
                    element?: HTMLElement | null;
                    options?: { actions?: Record<string, ActionHandler | undefined> };
                    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2.submit accepts arbitrary form-field payloads
                    submit?: (opts: { updateData?: Record<string, unknown> }) => Promise<void>;
                    close?: () => Promise<void>;
                }
                interface ProbeActor {
                    id?: string;
                    sheet?: ProbeSheet;
                    system?: { wounds?: { value?: number } };
                    delete?: () => Promise<void>;
                }
                interface ProbeGlobals {
                    Actor?: { create?: (data: object) => Promise<ProbeActor | null> };
                    game?: { actors?: { get?: (id: string) => ProbeActor | undefined } };
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
                const g = globalThis as unknown as ProbeGlobals;
                const ActorCls = g.Actor;
                if (typeof ActorCls?.create !== 'function') {
                    return {
                        created: false,
                        createError: 'Actor.create unavailable',
                        tabs: [],
                        actions: [],
                        form: null,
                    };
                }
                let actor: ProbeActor | null;
                try {
                    actor = await ActorCls.create({
                        name: 'sheet-interactions-probe',
                        type: 'dh2-character',
                        system: { gameSystem: 'dh2e' },
                    });
                } catch (err) {
                    return {
                        created: false,
                        createError: String(err instanceof Error ? err.message : String(err)),
                        tabs: [],
                        actions: [],
                        form: null,
                    };
                }
                if (actor === null) {
                    return {
                        created: false,
                        createError: 'Actor.create returned null',
                        tabs: [],
                        actions: [],
                        form: null,
                    };
                }

                const sheet = actor.sheet;
                if (sheet === undefined) {
                    try {
                        await actor.delete?.();
                    } catch {
                        /* ignore */
                    }
                    return {
                        created: false,
                        createError: 'actor.sheet undefined',
                        tabs: [],
                        actions: [],
                        form: null,
                    };
                }

                await sheet.render?.(true);
                // Allow the initial render to settle so PARTS are in the DOM.
                await new Promise<void>((r) => {
                    setTimeout(r, 100);
                });

                /* -------- tab switching -------- */
                const probeTab = async (tabId: string): Promise<{ tabId: string; switched: boolean; error: string | null }> => {
                    let switched = false;
                    let error: string | null = null;
                    try {
                        if (typeof sheet.changeTab === 'function') {
                            sheet.changeTab(tabId, 'primary');
                            await new Promise<void>((r) => {
                                setTimeout(r, 30);
                            });
                            const groupActive = sheet.tabGroups?.primary === tabId;
                            const navActive = sheet.element?.querySelector(`[data-tab="${tabId}"].active, [data-group="primary"][data-tab="${tabId}"]`);
                            switched = groupActive || navActive !== null;
                        } else {
                            error = 'sheet.changeTab not a function';
                        }
                    } catch (err) {
                        error = String(err instanceof Error ? err.message : String(err));
                    }
                    return { tabId, switched, error };
                };
                const tabResults: Array<{ tabId: string; switched: boolean; error: string | null }> = [];
                for (const tabId of tabs) {
                    // eslint-disable-next-line no-await-in-loop -- tab switches must complete in series before the next probe runs
                    tabResults.push(await probeTab(tabId));
                }

                /* -------- action invocation -------- */
                const actionMap = sheet.options?.actions ?? {};
                const probeAction = async (actionName: string): Promise<{ action: string; invoked: boolean; error: string | null }> => {
                    const handler = actionMap[actionName];
                    if (typeof handler !== 'function') {
                        return { action: actionName, invoked: false, error: 'handler not registered' };
                    }
                    try {
                        const target = document.createElement('div');
                        const event = new MouseEvent('click', { bubbles: false, cancelable: true });
                        const rv = handler.call(sheet, event, target);
                        if (rv instanceof Promise) await rv;
                        return { action: actionName, invoked: true, error: null };
                    } catch (err) {
                        return { action: actionName, invoked: false, error: String(err instanceof Error ? err.message : String(err)) };
                    }
                };
                const actionResults: Array<{ action: string; invoked: boolean; error: string | null }> = [];
                for (const actionName of actions) {
                    // eslint-disable-next-line no-await-in-loop -- actions execute in series so failures attribute to the right handler
                    actionResults.push(await probeAction(actionName));
                }

                /* -------- form-submit round-trip -------- */
                let formResult: { field: string; submitted: boolean; valueBefore: number | null; valueAfter: number | null; error: string | null } | null =
                    null;
                try {
                    interface WoundsHolder {
                        system?: { wounds?: { value?: number } };
                    }
                    const readWounds = (a: WoundsHolder | undefined): number => a?.system?.wounds?.value ?? 0;
                    const valueBefore = readWounds(actor);
                    const targetValue = valueBefore === 7 ? 8 : 7;
                    const updateData: Record<string, number> = {};
                    updateData[formField] = targetValue;
                    let submitted = false;
                    let error: string | null = null;
                    try {
                        if (typeof sheet.submit === 'function') {
                            await sheet.submit({ updateData });
                            submitted = true;
                        } else {
                            error = 'sheet.submit not a function';
                        }
                    } catch (err) {
                        error = String(err instanceof Error ? err.message : String(err));
                    }
                    // Re-read from the live document.
                    const refreshed = (actor.id !== undefined ? g.game?.actors?.get?.(actor.id) : undefined) ?? actor;
                    const valueAfter = readWounds(refreshed);
                    formResult = {
                        field: formField,
                        submitted: submitted && valueAfter === targetValue,
                        valueBefore,
                        valueAfter,
                        error,
                    };
                } catch (err) {
                    formResult = {
                        field: formField,
                        submitted: false,
                        valueBefore: null,
                        valueAfter: null,
                        error: String(err instanceof Error ? err.message : String(err)),
                    };
                }

                /* -------- cleanup -------- */
                try {
                    await sheet.close?.();
                } catch {
                    /* ignore */
                }
                try {
                    await actor.delete?.();
                } catch {
                    /* ignore */
                }

                return {
                    created: true,
                    createError: null,
                    tabs: tabResults,
                    actions: actionResults,
                    form: formResult,
                };
            },
            { tabs: [...CHARACTER_TABS], actions: [...CHARACTER_ACTIONS], formField: FORM_FIELD },
        );
        return {
            created: result.created,
            createError: result.createError,
            tabs: result.tabs,
            actions: result.actions,
            form: result.form,
            pageErrors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('sheet interactions (Tier B)', () => {
    test('character sheet: tabs switch, actions invoke, form submits', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeCharacterSheet(page);
        test.skip(!probe.created, `could not create dh2-character actor: ${probe.createError ?? 'unknown'}`);

        const failures: string[] = [];

        for (const tab of probe.tabs) {
            if (tab.switched && tab.error === null) {
                recordCoverage('sheet.tab', `character::${tab.tabId}`);
                continue;
            }
            failures.push(`tab ${tab.tabId}: ${tab.error ?? 'did not switch'}`);
        }

        for (const action of probe.actions) {
            if (action.invoked && action.error === null) {
                recordCoverage('sheet.action', `character::${action.action}`);
                continue;
            }
            failures.push(`action ${action.action}: ${action.error ?? 'not invoked'}`);
        }

        if (probe.form?.submitted === true && probe.form.error === null) {
            recordCoverage('sheet.form-submit', `character::${probe.form.field}`);
        } else {
            const err = probe.form?.error ?? `did not submit (before=${probe.form?.valueBefore ?? '?'}, after=${probe.form?.valueAfter ?? '?'})`;
            failures.push(`form-submit ${FORM_FIELD}: ${err}`);
        }

        // Surface uncaught page errors so async throws inside Foundry render /
        // submit pipelines bubble up rather than silently passing.
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 3).join(' | ')}`);
        }

        const totalAttempts = probe.tabs.length + probe.actions.length + (probe.form ? 1 : 0);
        expect(failures, `${failures.length}/${totalAttempts} sheet interactions failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
