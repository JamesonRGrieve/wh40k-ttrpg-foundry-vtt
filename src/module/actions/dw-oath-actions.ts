/**
 * Action handler module for the Deathwatch Mission Oath panel
 * (#168 — core.md Table 7-16 §"OATHS", p.10165).
 *
 * Two `data-action` handlers wired through `CharacterSheet`'s
 * `DEFAULT_OPTIONS.actions` (per `.integration-staging/168.json`):
 *
 *   - `dwSwearOath`   — opens a DialogV2 prompt for an Oath UUID, runs
 *                       the RAW gating in `canSwearOath`, projects the
 *                       Oath via `swearOath`, persists `activeOathId`
 *                       on the leader's actor, and posts a chat card.
 *   - `dwReleaseOath` — clears `activeOathId` via `releaseOath` and
 *                       posts a bookkeeping chat card. RAW does not
 *                       model player-driven release; this is the
 *                       GM-fiat / mission-end hook.
 *
 * NO actor-shape assumptions beyond the two DataModel slots contributed
 * by `dw-oath-template.ts` (`activeOathId`, `isLeader`). Per Direction
 * #7, the catalogue of Oaths and their buff / granted-ability lists
 * are compendium content; this module only manipulates the pointer
 * and projects whatever `OathDef` the caller supplies. For first
 * integration the prompt accepts a free-text Oath UUID — the dropdown
 * driven by `uuidNameCache` will land alongside the dw-oaths pack in
 * a subsequent round.
 */
import { t } from '../i18n/t.ts';
import { canSwearOath, isOathActive, releaseOath, swearOath, type CanSwearOathFailureReason, type OathBuff, type OathDef } from '../rules/dw-oath.ts';
import type { I18nKey } from '../types/i18n-keys';

const CHAT_TEMPLATE = 'systems/wh40k-rpg/templates/chat/dw-oath-chat.hbs';

/**
 * Minimal `this` shape exposed by sheet static actions. Mirrors the
 * pattern used by the Cohesion/Renown handlers — the action module
 * does not import from the applications layer (`sheets-must-not-
 * import-data-models-directly` runs the other way, but the reverse
 * coupling is equally undesirable for a rules-driven action handler).
 */
export interface DwOathActionHost {
    readonly actor: {
        readonly id: string;
        readonly name: string;
        readonly system: {
            activeOathId: string | null;
            isLeader: boolean;
        };
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document.update payload is an open bag; values are not statically known
        update: (data: Record<string, unknown>) => Promise<unknown>;
    };
    // eslint-disable-next-line no-restricted-syntax -- boundary: ui.notifications options bag is Foundry-untyped (duration, permanent, console, etc.)
    _notify: (type: 'info' | 'warning' | 'error', message: string, options?: Record<string, unknown>) => void;
}

/* -------------------------------------------- */
/*  Internal helpers                            */
/* -------------------------------------------- */

interface ChatCardContext {
    gameSystem: 'dw';
    eventKind: 'sworn' | 'released';
    headerKey: I18nKey;
    outcomeKey: I18nKey;
    oathLabel: string | null;
    buff: OathBuff | null;
    grantedSquadAbilities: string[];
    showGrantedEmpty: boolean;
}

async function postOathChat(host: DwOathActionHost, ctx: ChatCardContext): Promise<void> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: renderTemplate signature requires AnyObject; the ChatCardContext interface is structurally compatible
    const html = await foundry.applications.handlebars.renderTemplate(CHAT_TEMPLATE, ctx as unknown as Record<string, unknown>);
    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
    const payload = { user: game.user.id, content: html, speaker: { alias: host.actor.name } } as unknown as Parameters<typeof ChatMessage.create>[0];
    await ChatMessage.create(payload);
}

// eslint-disable-next-line no-restricted-syntax -- boundary: thrown values are `unknown` per TS contract; this helper is fed directly into an `instanceof Error` type-guard
function reportFailure(host: DwOathActionHost, label: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    host._notify('error', `${label}: ${message}`, { duration: 5000 });
    console.error(`${label} error:`, error);
}

const REASON_TO_KEY: Readonly<Record<Exclude<CanSwearOathFailureReason, 'none'>, I18nKey>> = {
    'not-leader': 'WH40K.DW.Oath.Validation.NotLeader',
    'already-sworn': 'WH40K.DW.Oath.Validation.AlreadySworn',
};

function reasonToKey(reason: CanSwearOathFailureReason | undefined): I18nKey {
    if (reason === undefined || reason === 'none') return 'WH40K.DW.Oath.Label';
    return REASON_TO_KEY[reason];
}

/**
 * Resolve the compendium document for an Oath UUID into the
 * content-agnostic `OathDef` the engine consumes. The compendium
 * authoring contract (Direction #7) places `leaderPrereq`, `buff`,
 * and `grantedSquadAbilities` on the Oath item's `system` block; this
 * function deep-validates that shape so a malformed compendium entry
 * fails loudly instead of swearing a half-empty Oath.
 *
 * Returns `null` on any resolution failure. The handler surfaces a
 * notification rather than throwing — Oath authoring is a content
 * concern and we should not blow up the sheet over a typo.
 */
// Boundary types for the Foundry fromUuid-returned Oath document.
// Every `unknown` field below is narrowed by a `typeof` / value type-guard
// at the consumer site before any non-boundary use.
interface FromUuidOathSystem {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `fromUuid` returns the untyped Document handle; narrowed by typeof check before use.
    leaderPrereq?: unknown;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `fromUuid` returns the untyped Document handle; narrowed by typeof check before use.
    buff?: unknown;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `fromUuid` returns the untyped Document handle; narrowed by Array.isArray + per-entry filter before use.
    grantedSquadAbilities?: unknown;
}
interface FromUuidOathDoc {
    name?: string | null;
    system?: FromUuidOathSystem;
}
interface FromUuidOathBuff {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `fromUuid` returns the untyped Document handle; narrowed by typeof check before use.
    id?: unknown;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `fromUuid` returns the untyped Document handle; narrowed by typeof check before use.
    characteristic?: unknown;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `fromUuid` returns the untyped Document handle; narrowed by typeof + Number.isFinite before use.
    modifier?: unknown;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `fromUuid` returns the untyped Document handle; narrowed by typeof check before use.
    trait?: unknown;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `fromUuid` returns the untyped Document handle; narrowed by typeof check before use.
    description?: unknown;
}

async function resolveOathDef(uuid: string): Promise<{ def: OathDef; label: string } | null> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's `fromUuid` returns the framework's untyped Document handle; narrowed to FromUuidOathDoc immediately.
    const doc = (await fromUuid(uuid)) as FromUuidOathDoc | null;
    if (doc?.system === undefined) return null;
    const sys = doc.system;
    if (sys.leaderPrereq !== true) return null;

    const rawBuff = sys.buff;
    if (rawBuff === null || rawBuff === undefined || typeof rawBuff !== 'object') return null;
    // eslint-disable-next-line no-restricted-syntax -- boundary: narrowing the Foundry fromUuid-returned buff object; each field is typeof-checked below.
    const buffShape = rawBuff as FromUuidOathBuff;
    if (typeof buffShape.id !== 'string') return null;
    const buff: OathBuff = { id: buffShape.id };
    if (typeof buffShape.characteristic === 'string') buff.characteristic = buffShape.characteristic;
    if (typeof buffShape.modifier === 'number' && Number.isFinite(buffShape.modifier)) buff.modifier = buffShape.modifier;
    if (typeof buffShape.trait === 'string') buff.trait = buffShape.trait;
    if (typeof buffShape.description === 'string') buff.description = buffShape.description;

    const rawAbilities = sys.grantedSquadAbilities;
    const grantedSquadAbilities: string[] = Array.isArray(rawAbilities) ? rawAbilities.filter((entry): entry is string => typeof entry === 'string') : [];

    const def: OathDef = {
        id: uuid,
        leaderPrereq: true,
        buff,
        grantedSquadAbilities,
    };
    const label = typeof doc.name === 'string' && doc.name.length > 0 ? doc.name : uuid;
    return { def, label };
}

/**
 * Prompt for an Oath UUID. Returns `null` on cancel / empty input.
 * The first-integration UX is a freeform text prompt; a UUID picker
 * driven by the dw-oaths compendium will replace it once the pack
 * lands.
 */
async function promptForOathUuid(): Promise<string | null> {
    const i18n = game.i18n;
    const title = i18n.localize('WH40K.DW.Oath.Label');
    const label = i18n.localize('WH40K.DW.Oath.Label');

    // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2.prompt return type is `unknown` per Foundry's contract; narrowed locally
    const result = (await foundry.applications.api.DialogV2.prompt({
        window: { title },
        content: `
            <div class="form-group">
                <label>${label}</label>
                <input type="text" name="oathUuid" value="" autofocus
                    placeholder="Compendium.wh40k-rpg.dw-oaths.Item.&lt;id&gt;" />
            </div>
        `,
        ok: {
            callback: (_cbEvent: Event, button: HTMLButtonElement): string | null => {
                const input = button.form?.elements.namedItem('oathUuid') as HTMLInputElement | null;
                const raw = (input?.value ?? '').trim();
                if (raw.length === 0) return null;
                return raw;
            },
        },
        rejectClose: false,
    })) as string | null | undefined;

    if (result === null || result === undefined) return null;
    if (typeof result !== 'string' || result.length === 0) return null;
    return result;
}

/* -------------------------------------------- */
/*  Action: Swear Oath                          */
/* -------------------------------------------- */

/**
 * `data-action="dwSwearOath"` handler. RAW: only the kill-team leader
 * may swear, and only one Oath at a time. Gating is enforced by
 * `canSwearOath`; a blocked swear surfaces the failure reason as a
 * notification and does not write the actor.
 */
export async function dwSwearOath(this: DwOathActionHost, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        const uuid = await promptForOathUuid();
        if (uuid === null) return;

        const resolved = await resolveOathDef(uuid);
        if (resolved === null) {
            this._notify('warning', t('WH40K.DW.Oath.Label'), { duration: 5000 });
            return;
        }

        const gating = canSwearOath({
            isLeader: this.actor.system.isLeader,
            currentOathId: this.actor.system.activeOathId,
            oath: resolved.def,
        });
        if (!gating.allowed) {
            this._notify('warning', t(reasonToKey(gating.reason)));
            return;
        }

        const projected = swearOath({ oath: resolved.def });
        await this.actor.update({ 'system.activeOathId': projected.activeOathId });

        await postOathChat(this, {
            gameSystem: 'dw',
            eventKind: 'sworn',
            headerKey: 'WH40K.DW.Oath.Label',
            outcomeKey: 'WH40K.DW.Oath.Sworn',
            oathLabel: resolved.label,
            buff: projected.missionBuff,
            grantedSquadAbilities: projected.grantedSquadAbilities,
            showGrantedEmpty: true,
        });
    } catch (error: unknown) {
        reportFailure(this, t('WH40K.DW.Oath.Label'), error);
    }
}

/* -------------------------------------------- */
/*  Action: Release Oath                        */
/* -------------------------------------------- */

/**
 * `data-action="dwReleaseOath"` handler. Clears the leader's active
 * Oath. RAW: Oaths persist for the mission; this is the bookkeeping
 * hook for mission-end / leader-killed / GM-fiat oath breaking. A
 * release with no active Oath is a no-op (info notification).
 */
export async function dwReleaseOath(this: DwOathActionHost, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        if (!isOathActive(this.actor.system.activeOathId)) {
            this._notify('info', t('WH40K.DW.Oath.Released'));
            return;
        }

        const result = releaseOath();
        await this.actor.update({ 'system.activeOathId': result.activeOathId });

        await postOathChat(this, {
            gameSystem: 'dw',
            eventKind: 'released',
            headerKey: 'WH40K.DW.Oath.Label',
            outcomeKey: 'WH40K.DW.Oath.Released',
            oathLabel: null,
            buff: null,
            grantedSquadAbilities: [],
            showGrantedEmpty: false,
        });
    } catch (error: unknown) {
        reportFailure(this, t('WH40K.DW.Oath.Released'), error);
    }
}
