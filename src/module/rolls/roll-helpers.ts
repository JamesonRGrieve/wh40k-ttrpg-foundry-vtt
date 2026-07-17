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

/** The d100 success rule, single-sourced: a roll-under test succeeds when the
 * total is at or below the target, EXCEPT that a natural 01 ALWAYS succeeds and
 * a natural 100 ALWAYS fails, regardless of target. Every success/failure
 * decision across the config / document / dice / dialog layers routes through
 * this so identical rolls resolve identically. */
export function isD100Success(roll: number, target: number): boolean {
    return roll === 1 || (roll <= target && roll !== 100);
}

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

export function getOpposedDegrees(dos: number, dof: number, opposedDos: number, opposedDof: number): number {
    if (dos > 0) {
        if (opposedDos > 0) {
            return dos - opposedDos;
        } else {
            return dos + opposedDof;
        }
    } else if (opposedDos > 0) {
        return -1 * (dof + opposedDos);
    } else {
        return -1 * (dof - opposedDof);
    }
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create accepts an untyped payload; Record<string, unknown> is the correct boundary type
    const chatData: Record<string, unknown> = {
        user: game.user.id,
        rollMode: opts.rollMode ?? game.settings.get('core', 'rollMode'),
        content,
    };
    if (opts.rolls !== undefined) chatData['rolls'] = opts.rolls;
    if (opts.speaker !== undefined) chatData['speaker'] = opts.speaker;
    if (opts.flavor !== undefined) chatData['flavor'] = opts.flavor;
    if (opts.type !== undefined) chatData['type'] = opts.type;
    applyRollModeWhispers(chatData);
    await ChatMessage.create(chatData);
}

/** Options controlling how {@link emitChatFromTemplate} builds its payload.
 * Each field maps a chat key the prompt-dialog / rules call sites set by hand;
 * defaults reproduce the bare `{ user: game.user.id, content }` public post. */
export interface EmitChatOptions {
    /** Posting user id (defaults to the current user). */
    user?: string | undefined;
    /** Opaque Foundry ChatSpeaker bag, included only when provided. */
    // eslint-disable-next-line no-restricted-syntax -- boundary: speaker is an opaque Foundry ChatSpeaker bag passed straight through to ChatMessage.create
    speaker?: unknown;
    /** Explicit rollMode; included in the payload only when provided (so the
     * default public post carries no rollMode, matching the legacy call sites). */
    rollMode?: string | undefined;
    /** When true, run {@link applyRollModeWhispers} after assembling the payload
     * so a `gmroll` / `blindroll` / `selfroll` rollMode is honoured. */
    applyWhispers?: boolean | undefined;
}

/**
 * Render a chat `.hbs` template and post the result as a ChatMessage — the
 * single home of the `renderTemplate` → build `{ user, content }` →
 * `ChatMessage.create` idiom that was hand-rolled across the prompt dialogs
 * and several `rules/` sites (each repeating the same boundary cast +
 * eslint-disable). The boundary cast to `Parameters<typeof ChatMessage.create>[0]`
 * lives here once.
 *
 * Defaults reproduce the bare public post (`{ user: game.user.id, content }`);
 * pass `rollMode` / `applyWhispers` to honour whisper modes, or `speaker` to
 * attribute the message — so each call site keeps its exact prior intent.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload (Foundry framework type) — `data` is the untyped Handlebars context bag fed to renderTemplate then ChatMessage.create
export async function emitChatFromTemplate(template: string, data: Record<string, unknown>, opts: EmitChatOptions = {}): Promise<void> {
    const html = await foundry.applications.handlebars.renderTemplate(template, data);
    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
    const chatData: Record<string, unknown> = {
        user: opts.user ?? game.user.id,
        content: html,
    };
    if (opts.rollMode !== undefined) chatData['rollMode'] = opts.rollMode;
    if (opts.speaker !== undefined) chatData['speaker'] = opts.speaker;
    if (opts.applyWhispers === true) applyRollModeWhispers(chatData);
    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create accepts an untyped Foundry payload
    await ChatMessage.create(chatData);
}

export async function sendActionDataToChat(actionData: ActionData): Promise<void> {
    // Flatten the ActionData + its RollData so Handlebars can read the
    // prototype getters (modifiedTarget / name / activeModifiers / …); passing
    // the live instances renders those fields blank (proto-property guard).
    const context = resolveGettersForTemplate(actionData);
    context['rollData'] = resolveGettersForTemplate(actionData.rollData);
    // Surface the rolling actor's game system on the chat render context so the
    // `{{themeClassFor}}` helper resolves the per-system themed class from
    // `@root._gameSystemId` on chat cards (rendered outside any sheet root) rather
    // than falling back to the RT default (#422).
    const chatSystem = actionData.rollData.sourceActor?.system.gameSystem;
    if (chatSystem !== undefined) context['_gameSystemId'] = chatSystem;
    const html = await foundry.applications.handlebars.renderTemplate(actionData.template, context);
    const rollData = actionData.rollData as typeof actionData.rollData & { isManualRoll?: boolean };
    const roll = rollData.roll;
    const rolls = roll != null && rollData.isManualRoll !== true ? [roll] : undefined;
    await postChatCard(html, { rolls });
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
