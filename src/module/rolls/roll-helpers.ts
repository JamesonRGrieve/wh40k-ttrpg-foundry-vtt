import { firstSystemId } from '../utils/chat-system-id.ts';
import { WH40KSettings } from '../wh40k-rpg-settings.ts';
import type { ActionData } from './action-data.ts';

// eslint-disable-next-line no-restricted-syntax -- boundary: recursive dot-notation traversal; values are unknown by design
type DotNotationTarget = Record<string, unknown>;
type DotNotationKey = string | string[];

export function uuid(): string {
    const chars = '0123456789abcdef'.split('');

    const uuidStr: string[] = [],
        rnd = Math.random;
    let r: number;
    uuidStr[8] = uuidStr[13] = uuidStr[18] = uuidStr[23] = '-';
    uuidStr[14] = '4'; // version 4

    for (let i = 0; i < 36; i++) {
        if (!uuidStr[i]) {
            r = 0 | (rnd() * 16);
            const idx = i === 19 ? (r & 0x3) | 0x8 : r & 0xf;
            uuidStr[i] = chars[idx] ?? '0';
        }
    }

    return uuidStr.join('');
}

export function getDegree(a: number, b: number): number {
    return Math.floor(a / 10) - Math.floor(b / 10);
}

/** FFG 1st-generation lines (Dark Heresy 1e, Deathwatch, Rogue Trader) count
 * degrees by full 10s of margin; the later lines (Black Crusade, Only War,
 * Dark Heresy 2e) use the tens-digit method. Imperium Maledictum defaults to
 * the Gen-2 method (closest to its Success-Level rule). */
const GEN1_DEGREE_SYSTEMS: ReadonlySet<string> = new Set(['dh1', 'dw', 'rt']);

/** Resolve the effective degrees method for an actor's game system, honouring
 * the `degreesMode` world setting. `raw` (default) → per-system; `gen1`/`gen2`
 * force one method across every system. */
export function resolveDegreesMethod(systemId: string | undefined): 'gen1' | 'gen2' {
    const mode = WH40KSettings.getDegreesMode();
    if (mode === 'gen1' || mode === 'gen2') return mode;
    return systemId !== undefined && GEN1_DEGREE_SYSTEMS.has(systemId) ? 'gen1' : 'gen2';
}

/** Additional degrees between `a` and `b` for the given method, NOT counting
 * the base success/failure (the caller adds the leading 1). Gen 1: full 10s of
 * the absolute margin. Gen 2: difference of the tens digits (== {@link getDegree}). */
export function getDegreeForMode(method: 'gen1' | 'gen2', a: number, b: number): number {
    if (method === 'gen1') return Math.floor(Math.abs(a - b) / 10);
    return Math.floor(a / 10) - Math.floor(b / 10);
}

// The d100 success rule lives in the pure dice layer so the Foundry-free rules/
// modules can share it without importing this Foundry-heavy file; re-exported here
// for the many Foundry-side callers that already import it from roll-helpers (#463).
export { isD100Success } from '../rules/_dice.ts';

/**
 * Resolve an instance's prototype getters into a plain object of own
 * properties for Handlebars.
 *
 * Handlebars runs with `allowProtoPropertiesByDefault = false`, so it will
 * NOT read accessor properties defined on a class prototype. RollData exposes
 * `name`, `effectString`, `modifiedTarget`, `activeModifiers`, … as getters on
 * its prototype; passing a live RollData instance straight to `renderTemplate`
 * therefore renders those fields BLANK (the "target is always blank on the
 * chat card" regression). Flattening copies own enumerable props plus every
 * inherited getter's resolved value down to own properties so the template
 * sees them. Walks the whole prototype chain so subclass getters
 * (WeaponRollData / PsychicRollData) are covered too.
 */
/** Copy one property (own field or inherited getter) from an untyped runtime
 * instance into the flattened template record. The single boundary disable
 * contains the unavoidable `any` of JS reflection in one place. */
// eslint-disable-next-line no-restricted-syntax -- boundary: `out` is the plain template-context record assembled from an untyped runtime instance
function copyInstanceProp(out: Record<string, unknown>, instance: object, key: string): void {
    // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/no-unsafe-assignment -- boundary: untyped RollData/ActionData runtime instance property → plain template record value
    out[key] = (instance as Record<string, unknown>)[key];
}

// eslint-disable-next-line no-restricted-syntax -- boundary: produces an untyped plain record for the Handlebars template context
export function resolveGettersForTemplate(instance: object): Record<string, unknown> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: flattened own + inherited-getter values for the Handlebars template
    const out: Record<string, unknown> = {};
    // Own enumerable properties first (baseTarget, roll, success, dos, …).
    for (const key of Object.keys(instance)) {
        copyInstanceProp(out, instance, key);
    }
    // Then inherited getters down the prototype chain (modifiedTarget, name,
    // effectString, activeModifiers, …) — own props win, so we never clobber.
    let proto: object | null = Object.getPrototypeOf(instance) as object | null;
    while (proto !== null && proto !== Object.prototype) {
        for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(proto))) {
            if (typeof descriptor.get === 'function' && !(key in out)) {
                try {
                    copyInstanceProp(out, instance, key);
                } catch {
                    /* a getter that throws (e.g. depends on unset state) is skipped */
                }
            }
        }
        proto = Object.getPrototypeOf(proto) as object | null;
    }
    return out;
}

export async function roll1d100(): Promise<Roll> {
    const formula = '1d100';
    const roll = new Roll(formula, {});
    await roll.evaluate();
    return roll;
}

/**
 * Apply whisper recipients to a chatData object based on the current rollMode.
 * Mutates chatData in place.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ChatMessage.create accepts an untyped record-shaped payload
export function applyRollModeWhispers(chatData: Record<string, unknown>): void {
    const rollMode = chatData['rollMode'];
    if (typeof rollMode === 'string' && ['gmroll', 'blindroll'].includes(rollMode)) {
        chatData['whisper'] = ChatMessage.getWhisperRecipients('GM');
    } else if (rollMode === 'selfroll') {
        chatData['whisper'] = [game.user];
    }
}

/**
 * Build the standard chat payload (user + rollMode + content [+ rolls
 * + speaker]), apply roll-mode whispers, and create the message. Collapses
 * the `{ user: game.user.id, rollMode: …, content }` + applyRollModeWhispers
 * + ChatMessage.create boilerplate repeated across the action managers.
 */
export async function postChatCard(
    content: string,
    // eslint-disable-next-line no-restricted-syntax -- boundary: speaker is an opaque Foundry ChatSpeaker bag passed straight through to ChatMessage.create
    opts: { rolls?: Roll[] | undefined; speaker?: unknown; rollMode?: string | undefined; flavor?: string | undefined; type?: number | undefined } = {},
): Promise<void> {
    const chatData = buildChatPayload(content, { ...opts, applyWhispers: true });
    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create accepts an untyped Foundry payload
    await ChatMessage.create(chatData);
}

/** Options controlling how {@link emitChatFromTemplate} builds its payload.
 * Each field maps a chat key the prompt-dialog / rules / action-manager call
 * sites set by hand; `user` defaults to the current user and `rollMode` to the
 * `core.rollMode` world setting (see {@link buildChatPayload}). */
export interface EmitChatOptions {
    /** Posting user id (defaults to the current user). */
    user?: string | undefined;
    /** Opaque Foundry ChatSpeaker bag, included only when provided. */
    // eslint-disable-next-line no-restricted-syntax -- boundary: speaker is an opaque Foundry ChatSpeaker bag passed straight through to ChatMessage.create
    speaker?: unknown;
    /** Explicit rollMode; defaults to the `core.rollMode` world setting (as
     * {@link postChatCard} does) so a routed manager keeps its whisper behavior. */
    rollMode?: string | undefined;
    /** When true, run {@link applyRollModeWhispers} after assembling the payload
     * so a `gmroll` / `blindroll` / `selfroll` rollMode is honoured. */
    applyWhispers?: boolean | undefined;
    /** Rolls to attach to the message (dice-so-nice / roll plumbing). */
    rolls?: Roll[] | undefined;
    /** Flavor line rendered above the card content. */
    flavor?: string | undefined;
    /** Chat message type (a `CONST.CHAT_MESSAGE_TYPES` value). */
    type?: number | undefined;
}

/**
 * Assemble the standard `{ user, rollMode, content }` chat payload (plus the
 * optional `speaker` / `rolls` / `flavor` / `type` keys), default `rollMode`
 * to the `core.rollMode` world setting, and apply roll-mode whispers when
 * requested. The single home of the payload shaping that {@link postChatCard}
 * and {@link emitChatFromTemplate} previously duplicated (#368 P3).
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create accepts an untyped Foundry payload; Record<string, unknown> is the correct boundary type
function buildChatPayload(content: string, opts: EmitChatOptions): Record<string, unknown> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
    const chatData: Record<string, unknown> = {
        user: opts.user ?? game.user.id,
        rollMode: opts.rollMode ?? game.settings.get('core', 'rollMode'),
        content,
    };
    if (opts.rolls !== undefined) chatData['rolls'] = opts.rolls;
    if (opts.speaker !== undefined) chatData['speaker'] = opts.speaker;
    if (opts.flavor !== undefined) chatData['flavor'] = opts.flavor;
    if (opts.type !== undefined) chatData['type'] = opts.type;
    if (opts.applyWhispers === true) applyRollModeWhispers(chatData);
    return chatData;
}

/**
 * Render a chat `.hbs` template and post the result as a ChatMessage — the
 * single home of the `renderTemplate` → build `{ user, content }` →
 * `ChatMessage.create` idiom that was hand-rolled across the prompt dialogs
 * and several `rules/` sites (each repeating the same boundary cast +
 * eslint-disable). The boundary cast to `Parameters<typeof ChatMessage.create>[0]`
 * lives here once.
 *
 * The payload is shaped by {@link buildChatPayload}: `user` defaults to the
 * current user and `rollMode` to the `core.rollMode` world setting; pass
 * `applyWhispers` to honour whisper modes, `speaker` to attribute the message,
 * or `rolls` / `flavor` / `type` for the action-manager cards routed here (#368).
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload (Foundry framework type) — `data` is the untyped Handlebars context bag fed to renderTemplate then ChatMessage.create
export async function emitChatFromTemplate(template: string, data: Record<string, unknown>, opts: EmitChatOptions = {}): Promise<void> {
    // Surface the speaking actor's game system so the chat card's `{{themeClassFor}}`
    // resolves per-system from `@root._gameSystemId` (cards render outside a sheet
    // root). Probe the render data first, then the speaker's actor (#422).
    if (data['_gameSystemId'] === undefined) {
        const speakerActor =
            opts.speaker !== undefined
                ? // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.getSpeakerActor takes an opaque Foundry ChatSpeaker bag
                  ChatMessage.getSpeakerActor(opts.speaker as Parameters<typeof ChatMessage.getSpeakerActor>[0])
                : null;
        const systemId = firstSystemId(data['actor'], data['sourceActor'], speakerActor);
        if (systemId !== undefined) data['_gameSystemId'] = systemId;
    }
    const html = await foundry.applications.handlebars.renderTemplate(template, data);
    const chatData = buildChatPayload(html, opts);
    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create accepts an untyped Foundry payload
    await ChatMessage.create(chatData);
}

/** Options for {@link postFlattenedInstanceToChat}. */
interface PostInstanceOptions {
    /** Actor whose `system.gameSystem` pins the card's per-system theme (`_gameSystemId`). */
    actor?: unknown;
    /** Rolls to attach to the posted message. */
    rolls?: Roll[] | undefined;
    /** Extra own-property patches merged onto the flattened context after
     * flattening (e.g. a nested pre-flattened `rollData`). */
    extraContext?: Record<string, unknown> | undefined;
}

/**
 * Flatten a runtime instance's getters into a Handlebars context, surface the
 * card's per-system `_gameSystemId` from `opts.actor`, render `template`, and
 * post the result. The single home of the `resolveGettersForTemplate → set
 * _gameSystemId → renderTemplate → postChatCard` idiom that
 * {@link sendActionDataToChat}, ForceFieldData, and AssignDamageData each
 * re-implemented (#368).
 */
export async function postFlattenedInstanceToChat(instance: object, template: string, opts: PostInstanceOptions = {}): Promise<void> {
    // Flatten own + inherited-getter values so Handlebars can read prototype
    // getters (passing the live instance renders those fields blank — the
    // proto-property guard). See {@link resolveGettersForTemplate}.
    const context = resolveGettersForTemplate(instance);
    if (opts.extraContext !== undefined) Object.assign(context, opts.extraContext);
    // Surface the rolling actor's game system so `{{themeClassFor}}` resolves the
    // per-system themed class from `@root._gameSystemId` on chat cards (rendered
    // outside any sheet root) rather than falling back to the RT default (#422).
    const systemId = firstSystemId(opts.actor);
    if (systemId !== undefined) context['_gameSystemId'] = systemId;
    const html = await foundry.applications.handlebars.renderTemplate(template, context);
    await postChatCard(html, { rolls: opts.rolls });
}

export async function sendActionDataToChat(actionData: ActionData): Promise<void> {
    const rollData = actionData.rollData as typeof actionData.rollData & { isManualRoll?: boolean };
    const roll = rollData.roll;
    const rolls = roll != null && rollData.isManualRoll !== true ? [roll] : undefined;
    // The ActionData's RollData is flattened separately and nested under `rollData`
    // so the template can read its prototype getters too.
    await postFlattenedInstanceToChat(actionData, actionData.template, {
        actor: actionData.rollData.sourceActor,
        rolls,
        extraContext: { rollData: resolveGettersForTemplate(actionData.rollData) },
    });
}

export function recursiveUpdate(targetObject: DotNotationTarget, updateObject: DotNotationTarget): void {
    for (const key of Object.keys(updateObject)) {
        handleDotNotationUpdate(targetObject, key, updateObject[key]);
    }
}

// eslint-disable-next-line no-restricted-syntax -- boundary: recursive dot-notation update traverses arbitrary nested unknown values
export function handleDotNotationUpdate(targetObject: DotNotationTarget, key: DotNotationKey, value: unknown): void {
    if (typeof key === 'string') {
        // Key Starts as string and we split across dots
        handleDotNotationUpdate(targetObject, key.split('.'), value);
    } else if (key.length === 1) {
        // Final Key -- either delete or set parent field
        const leafKey = key[0];
        if (!leafKey) return;
        if (value === undefined || value === null) {
            delete targetObject[leafKey];
        } else if ('object' === typeof value && !Array.isArray(value)) {
            const current = targetObject[leafKey];
            if (current != null && typeof current === 'object' && !Array.isArray(current)) {
                recursiveUpdate(current as DotNotationTarget, value as DotNotationTarget);
            } else {
                targetObject[leafKey] = value;
            }
        } else if ('number' === typeof targetObject[leafKey]) {
            // Coerce numbers
            targetObject[leafKey] = Number(value);
        } else {
            targetObject[leafKey] = value;
        }
    } else {
        // Go a layer deeper into object
        const [head, ...tail] = key;
        if (!head) return;
        const next = targetObject[head];
        if (next == null || typeof next !== 'object' || Array.isArray(next)) return;
        handleDotNotationUpdate(next as DotNotationTarget, tail, value);
    }
}
