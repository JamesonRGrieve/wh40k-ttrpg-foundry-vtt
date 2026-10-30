import type { Page } from '@playwright/test';

/**
 * An in-page harness for Tier B specs that drive REAL attacks on a live canvas:
 * a scene with actors' tokens placed in canvas pixels, an attack opened through the
 * targeted action manager and rolled through the unified roll dialog's own
 * `_systemRoll` with seeded dice, and chat-card buttons clicked in the rendered log.
 *
 * Installed per page by {@link installAttackHarness}; the spec then calls
 * `globalThis.wh40kAttack.*` inside `page.evaluate`.
 */

/**
 * A LEAN owned weapon stub: the compendium join key plus the per-actor state the
 * actor stores. `rounds` is the loaded magazine: the join keeps the stored clip
 * (instance state) even at 0, so a stub that stores none reads as empty.
 */
export function leanWeapon(name: string, compendiumUuid: string, rounds: number): object {
    return { name, type: 'weapon', _stats: { compendiumSource: compendiumUuid }, system: { clip: { value: rounds } } };
}

/** One token the harness places, keyed so the spec can refer to it. */
export interface HarnessTokenSpec {
    key: string;
    name: string;
    /** Actor type, e.g. `dh2-character`. */
    type: string;
    /** Token top-left in canvas pixels. */
    x: number;
    y: number;
    /** Token elevation in metres (0 when omitted). Set at creation: a later elevation change is a Token move. */
    elevation?: number;
    /** Embedded items created with the actor (lean compendium stubs or full data). */
    items?: object[];
    /** Actor system data overrides. */
    system?: object;
    /** Actor flags (e.g. the authored-build marker that skips the origin-path prompt). */
    flags?: object;
}

/** What {@link HarnessApi.setup} placed. */
export interface HarnessScene {
    sceneId: string;
    /** Token id per spec key. */
    tokens: Record<string, string>;
    /** Actor id per spec key. */
    actors: Record<string, string>;
}

/** The outcome of one rolled attack. */
export interface HarnessAttack {
    /** Chat messages the attack posted, oldest first. */
    messageIds: string[];
    /** The stored ActionData id (the card's roll id), or null when none was stored. */
    actionId: string | null;
    /** The notifications raised while the attack ran (why an attack posted nothing, when it did not). */
    notices: string[];
}

interface HarnessApi {
    /** Create the actors and a scene holding their tokens, view it and wait for the tokens to draw. */
    setup: (spec: { width: number; height: number; tokens: HarnessTokenSpec[] }) => Promise<HarnessScene>;
    /**
     * Attack with `weaponName` from the `firer` token at the `target` token (or none),
     * rolling the dialog with Foundry's dice fed `faces` in order (each `[face, faces]`;
     * later draws roll the middle face). Returns the posted messages. A psychic power
     * named `weaponName` is cast the same way, through the psychic cast path.
     */
    attack: (args: {
        firer: string;
        target: string | null;
        weaponName: string;
        faces: Array<[number, number]>;
        /** Roll-data choices the dialog would otherwise make (the action, a burst's hit allocation). */
        choices?: { action?: string; hitAllocation?: 'original' | 'spread' };
    }) => Promise<HarnessAttack>;
    /** Click `buttonSelector` inside a rendered chat card, rolling `faces` as above; returns the messages it posted. */
    clickInMessage: (args: { messageId: string; buttonSelector: string; faces: Array<[number, number]>; expectMessages: number }) => Promise<string[]>;
    /**
     * Click a control that opens the Roll Test dialog (an evasion's Dodge / Parry), then
     * roll that dialog with `faces` as above; returns the messages the roll posted.
     */
    clickAndRoll: (args: { messageId: string; buttonSelector: string; faces: Array<[number, number]> }) => Promise<string[]>;
    /** Delete everything {@link setup} and the attacks created, and restore the settings it changed. */
    teardown: () => Promise<void>;
}

declare global {
    /** The attack harness, installed per page by {@link installAttackHarness}. */
    // eslint-disable-next-line no-var -- a global installed at runtime must be declared with `var` to land on globalThis
    var wh40kAttack: HarnessApi;
}

/** Install `globalThis.wh40kAttack` on the current page (call after joining). */
export async function installAttackHarness(page: Page): Promise<void> {
    await page.evaluate(() => {
        interface DocLike {
            id: string;
            name: string;
            type?: string;
            delete: () => Promise<object | undefined>;
        }
        interface ActorLike extends DocLike {
            items: { contents: DocLike[] };
            getTokenDocument: (d: object) => Promise<{ toObject: () => object }>;
        }
        interface TokenLike {
            id: string;
            actor: ActorLike | null;
        }
        interface SceneLike extends DocLike {
            view: () => Promise<void>;
            createEmbeddedDocuments: (type: string, data: object[]) => Promise<DocLike[]>;
        }
        interface DialogLike {
            rendered: boolean;
            actionData?: {
                rollData?: { weapons?: DocLike[]; weapon?: DocLike | null; psychicPowers?: DocLike[]; power?: DocLike | null; update?: () => Promise<void> };
            };
            _systemRoll: () => Promise<void>;
            close: () => Promise<void>;
        }
        interface Globals {
            game: {
                paused: boolean;
                togglePause: (p: boolean) => void;
                messages: { contents: DocLike[]; get: (id: string) => DocLike | undefined };
                scenes: { get: (id: string) => DocLike | undefined };
                actors: { get: (id: string) => DocLike | undefined };
                settings: { get: (ns: string, key: string) => boolean; set: (ns: string, key: string, v: boolean) => Promise<boolean> };
            };
            CONFIG: { Dice: { randomUniform: () => number } };
            Actor: { create: (d: object) => Promise<ActorLike | null> };
            Scene: { create: (d: object) => Promise<SceneLike> };
            canvas: { ready: boolean; tokens?: { placeables: TokenLike[]; get: (id: string) => TokenLike | undefined } };
            foundry: { applications: { instances: Map<string, object> } };
            ui: { notifications: { notify: (message: string, type?: string, options?: object) => object } };
        }
        interface TargetedModule {
            DHTargetedActionManager: {
                performWeaponAttack: (source: TokenLike, target: TokenLike | null, weapon: DocLike) => void;
                performPsychicCast: (source: TokenLike, target: TokenLike | null, power: DocLike) => void;
            };
        }
        interface BasicModule {
            DHBasicActionManager: { storedRolls: Record<string, object> };
        }
        interface DialogModule {
            default: abstract new (...a: never[]) => object;
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types inside page.evaluate
        const g = globalThis as unknown as Globals;
        const helpers = globalThis.wh40kE2E;
        const moduleRoot = '/systems/wh40k-rpg/module';
        const created: { sceneIds: string[]; actorIds: string[]; messagesBefore: Set<string>; restore: Array<() => Promise<boolean>> } = {
            sceneIds: [],
            actorIds: [],
            messagesBefore: new Set(g.game.messages.contents.map((m) => m.id)),
            restore: [],
        };

        /** Feed Foundry's dice the given faces in order (`1 - (face - 0.5) / faces` maps back to `face`). */
        const withFaces = async <T>(faces: Array<[number, number]>, run: () => Promise<T>): Promise<T> => {
            const dice = g.CONFIG.Dice;
            const original = dice.randomUniform;
            const queue = faces.map(([face, count]) => 1 - (face - 0.5) / count);
            dice.randomUniform = (): number => queue.shift() ?? 0.5;
            try {
                return await run();
            } finally {
                dice.randomUniform = original;
            }
        };
        const newMessagesSince = (before: ReadonlySet<string>): string[] => g.game.messages.contents.map((m) => m.id).filter((id) => !before.has(id));

        const setOff = async (key: string): Promise<void> => {
            const was = g.game.settings.get('wh40k-rpg', key);
            if (!was) return;
            await g.game.settings.set('wh40k-rpg', key, false);
            created.restore.push(async () => g.game.settings.set('wh40k-rpg', key, was));
        };

        globalThis.wh40kAttack = {
            setup: async (spec) => {
                // Attacks outside an encounter are refused by default (#251); the specs attack on a bare scene.
                await setOff('require-combat-to-attack');
                const actors = new Map<string, ActorLike>();
                for (const t of spec.tokens) {
                    // eslint-disable-next-line no-await-in-loop -- sequential by design: each actor is created before its token
                    const actor = await helpers.withTimeout(
                        g.Actor.create({
                            name: t.name,
                            type: t.type,
                            items: t.items ?? [],
                            ...(t.system === undefined ? {} : { system: t.system }),
                            ...(t.flags === undefined ? {} : { flags: t.flags }),
                        }),
                        `create ${t.name}`,
                    );
                    if (actor === null) throw new Error(`could not create ${t.name}`);
                    created.actorIds.push(actor.id);
                    actors.set(t.key, actor);
                }
                const scene = await g.Scene.create({ name: 'attack harness', width: spec.width, height: spec.height, padding: 0 });
                created.sceneIds.push(scene.id);
                const tokenData = await Promise.all(
                    spec.tokens.map(async (t) => {
                        const actor = actors.get(t.key);
                        if (actor === undefined) throw new Error(`no actor for ${t.key}`);
                        return { ...(await actor.getTokenDocument({ x: t.x, y: t.y, elevation: t.elevation ?? 0 })).toObject(), name: t.name };
                    }),
                );
                const placed = await scene.createEmbeddedDocuments('Token', tokenData);
                await scene.view();
                if (g.game.paused) g.game.togglePause(false);
                const tokens: Record<string, string> = {};
                // By name, not position: the created documents do not come back in input order
                // (the first area run aimed its Blast at the flanker). Token names are unique per spec.
                for (const t of spec.tokens) tokens[t.key] = placed.find((doc) => doc.name === t.name)?.id ?? '';
                await helpers.waitFor(
                    () => g.canvas.ready && Object.values(tokens).every((id) => g.canvas.tokens?.get(id)?.actor != null),
                    'harness tokens drawn',
                    helpers.scaledMs(20_000),
                );
                return { sceneId: scene.id, tokens, actors: Object.fromEntries([...actors].map(([k, a]) => [k, a.id])) };
            },

            attack: async ({ firer, target, weaponName, faces, choices }) => {
                const targeted = (await import(/* @vite-ignore */ `${moduleRoot}/actions/targeted-action-manager.js`)) as TargetedModule;
                const basic = (await import(/* @vite-ignore */ `${moduleRoot}/actions/basic-action-manager.js`)) as BasicModule;
                const dialogModule = (await import(/* @vite-ignore */ `${moduleRoot}/applications/prompts/unified-roll-dialog.js`)) as DialogModule;
                const firerToken = g.canvas.tokens?.get(firer);
                const targetToken = target === null ? null : g.canvas.tokens?.get(target) ?? null;
                const weapon = firerToken?.actor?.items.contents.find((i) => i.name === weaponName);
                if (firerToken === undefined || weapon === undefined) throw new Error(`no firer token or weapon ${weaponName}`);
                const findDialog = (): DialogLike | null => {
                    for (const app of g.foundry.applications.instances.values()) {
                        if (!(app instanceof dialogModule.default)) continue;
                        const candidate = app as DialogLike;
                        const rd = candidate.actionData?.rollData;
                        const rolled = [rd?.weapon, rd?.power, ...(rd?.weapons ?? []), ...(rd?.psychicPowers ?? [])];
                        if (rolled.some((doc) => doc?.id === weapon.id)) return candidate;
                    }
                    return null;
                };
                const before = new Set(g.game.messages.contents.map((m) => m.id));
                const storedBefore = new Set(Object.keys(basic.DHBasicActionManager.storedRolls));
                // Record every notification the attack raises, so a spec can say why nothing posted.
                const notifications = g.ui.notifications;
                const notify = notifications.notify.bind(notifications);
                const notices: string[] = [];
                notifications.notify = (message: string, type?: string, options?: object): object => {
                    notices.push(`${type ?? 'info'}: ${message}`);
                    return notify(message, type, options);
                };
                // A dialog render that rejects is voided by its caller; surface its reason too.
                const onRejection = (event: PromiseRejectionEvent): void => {
                    notices.push(`rejection: ${event.reason instanceof Error ? event.reason.message : String(event.reason)}`);
                };
                window.addEventListener('unhandledrejection', onRejection);
                try {
                    if (weapon.type === 'psychicPower') targeted.DHTargetedActionManager.performPsychicCast(firerToken, targetToken, weapon);
                    else targeted.DHTargetedActionManager.performWeaponAttack(firerToken, targetToken, weapon);
                    const opened = await helpers.pollUntil(() => findDialog()?.rendered === true, helpers.scaledMs(15_000));
                    const dialog = findDialog();
                    if (!opened || dialog === null) throw new Error(`no roll dialog for ${weaponName}; notices: ${notices.join(' | ') || 'none'}`);
                    const rollData = dialog.actionData?.rollData;
                    // As the dialog's own selection does, re-derive the roll (its rate-of-fire ceiling) after a choice.
                    if (choices !== undefined && rollData !== undefined) {
                        Object.assign(rollData, choices);
                        await rollData.update?.();
                    }
                    try {
                        await withFaces(faces, async () => helpers.withTimeout(dialog._systemRoll(), `roll ${weaponName}`, helpers.scaledMs(30_000)));
                    } finally {
                        await findDialog()
                            ?.close()
                            .catch(() => undefined);
                    }
                } finally {
                    notifications.notify = notify;
                    window.removeEventListener('unhandledrejection', onRejection);
                }
                const actionId = Object.keys(basic.DHBasicActionManager.storedRolls).find((id) => !storedBefore.has(id)) ?? null;
                return { messageIds: newMessagesSince(before), actionId, notices };
            },

            clickInMessage: async ({ messageId, buttonSelector, faces, expectMessages }) => {
                const selector = `#sidebar .chat-log .message[data-message-id="${messageId}"] ${buttonSelector}`;
                await helpers.waitFor(
                    () => document.querySelector(selector) !== null,
                    `button ${buttonSelector} on message ${messageId}`,
                    helpers.scaledMs(10_000),
                );
                const before = new Set(g.game.messages.contents.map((m) => m.id));
                await withFaces(faces, async () => {
                    document.querySelector<HTMLButtonElement>(selector)?.click();
                    await helpers.pollUntil(() => newMessagesSince(before).length >= expectMessages, helpers.scaledMs(15_000));
                });
                return newMessagesSince(before);
            },

            clickAndRoll: async ({ messageId, buttonSelector, faces }) => {
                const dialogModule = (await import(/* @vite-ignore */ `${moduleRoot}/applications/prompts/unified-roll-dialog.js`)) as DialogModule;
                const selector = `#sidebar .chat-log .message[data-message-id="${messageId}"] ${buttonSelector}`;
                await helpers.waitFor(
                    () => document.querySelector(selector) !== null,
                    `button ${buttonSelector} on message ${messageId}`,
                    helpers.scaledMs(10_000),
                );
                const openDialogs = (): DialogLike[] =>
                    [...g.foundry.applications.instances.values()].filter(
                        (app): app is DialogLike => app instanceof dialogModule.default && (app as DialogLike).rendered,
                    );
                const already = new Set(openDialogs());
                const before = new Set(g.game.messages.contents.map((m) => m.id));
                document.querySelector<HTMLButtonElement>(selector)?.click();
                const opened = (): DialogLike | undefined => openDialogs().find((candidate) => !already.has(candidate));
                if (!(await helpers.pollUntil(() => opened() !== undefined, helpers.scaledMs(15_000))))
                    throw new Error(`${buttonSelector} opened no roll dialog`);
                const dialog = opened();
                try {
                    await withFaces(faces, async () =>
                        helpers.withTimeout(dialog?._systemRoll() ?? Promise.resolve(), `roll ${buttonSelector}`, helpers.scaledMs(30_000)),
                    );
                } finally {
                    await dialog?.close().catch(() => undefined);
                }
                await helpers.pollUntil(() => newMessagesSince(before).length > 0, helpers.scaledMs(15_000));
                return newMessagesSince(before);
            },

            teardown: async () => {
                const messages = newMessagesSince(created.messagesBefore);
                await Promise.all(
                    messages.map(async (id) =>
                        g.game.messages
                            .get(id)
                            ?.delete()
                            .catch(() => undefined),
                    ),
                );
                await Promise.all(
                    created.sceneIds.map(async (id) =>
                        g.game.scenes
                            .get(id)
                            ?.delete()
                            .catch(() => undefined),
                    ),
                );
                await Promise.all(
                    created.actorIds.map(async (id) =>
                        g.game.actors
                            .get(id)
                            ?.delete()
                            .catch(() => undefined),
                    ),
                );
                for (const restore of created.restore.reverse()) {
                    // eslint-disable-next-line no-await-in-loop -- sequential by design: settings restore in reverse order of change
                    await restore();
                }
            },
        };
    });
}
