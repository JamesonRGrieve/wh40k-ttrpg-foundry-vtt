/**
 * Actor ↔ journal-entry link (#590).
 *
 * Every actor sheet with a portrait overlays a journal icon on it when the
 * actor has a journal entry, so the GM and players reach a character's lore in
 * one click. The link is:
 *
 *   1. an explicit per-actor link — a JournalEntry / JournalEntryPage UUID in
 *      the actor flag `flags['wh40k-rpg'].journalLink`, set by dropping a
 *      journal onto the portrait; otherwise
 *   2. the Event Tracker's journal-link resolution for `{ kind: 'character',
 *      name: actor.name }` (registered resolver, then vault identity, then
 *      exact name) — the one resolver the tracker dashboard also uses.
 *
 * The icon shows only when the resolved entry is visible to the current user,
 * and opening re-checks that, so a player never reaches a GM-only entry.
 *
 * The decisions are pure functions over injected lookups (unit-tested without
 * Foundry); the thin runtime wrappers at the bottom bind them to the world.
 */

import { SYSTEM_ID } from '../constants.ts';
import { t } from '../i18n/t.ts';
import type { JournalLinkResolver } from './event-graph.ts';
import { EventTracker } from './event-tracker.ts';

/** Actor flag key (under the system scope) holding the explicit journal link. */
export const ACTOR_JOURNAL_LINK_FLAG = 'journalLink';

/** Drag-data document types a portrait accepts as a journal link. */
const LINKABLE_DROP_TYPES = ['JournalEntry', 'JournalEntryPage'] as const;

/**
 * A world or compendium JournalEntry UUID, optionally narrowed to one of its
 * pages: `[Compendium.<pkg>.<pack>.]JournalEntry.<id>[.JournalEntryPage.<id>]`.
 */
const JOURNAL_UUID_PATTERN = /^(?:Compendium\.[^.\s]+\.[^.\s]+\.)?JournalEntry\.[A-Za-z0-9]{16}(?:\.JournalEntryPage\.[A-Za-z0-9]{16})?$/;

const COMPENDIUM_UUID_PATTERN = /^Compendium\.([^.]+)\.([^.]+)\./;

const PAGE_UUID_SEGMENT = '.JournalEntryPage.';

/** The JSON payload Foundry's `TextEditor.getDragEventData` reads off a drop. */
export type DropData = string | number | boolean | null | undefined | readonly DropData[] | { readonly [key: string]: DropData };

/** True when `value` is a JournalEntry or JournalEntryPage UUID. */
export function isJournalLinkUuid(value: string | null | undefined): value is string {
    return typeof value === 'string' && JOURNAL_UUID_PATTERN.test(value);
}

/**
 * The journal UUID carried by drag data, or null when the drop is not a
 * JournalEntry / JournalEntryPage (or its UUID does not match its declared type).
 */
export function journalLinkFromDropData(data: DropData): string | null {
    // An array carries neither key, so the `in` checks also rule it out.
    if (typeof data !== 'object' || data === null || !('type' in data) || !('uuid' in data)) return null;
    const { type, uuid } = data;
    if (typeof type !== 'string' || typeof uuid !== 'string') return null;
    if (!LINKABLE_DROP_TYPES.some((linkable) => linkable === type) || !isJournalLinkUuid(uuid)) return null;
    return (type === 'JournalEntryPage') === uuid.includes(PAGE_UUID_SEGMENT) ? uuid : null;
}

/** What dropping onto a portrait should do. */
export type PortraitJournalDrop =
    | { readonly kind: 'link'; readonly uuid: string }
    /** A journal dropped by a user who does not own the actor. */
    | { readonly kind: 'denied' }
    /** Not a journal: let the sheet's normal drop handling take it. */
    | { readonly kind: 'pass' };

/** Decide a portrait drop: only an owner may link, and only a journal links. */
export function planPortraitJournalDrop(data: DropData, isOwner: boolean): PortraitJournalDrop {
    const uuid = journalLinkFromDropData(data);
    if (uuid === null) return { kind: 'pass' };
    return isOwner ? { kind: 'link', uuid } : { kind: 'denied' };
}

/** The actor fields the link resolution reads. */
export interface ActorJournalLinkSource {
    readonly name: string;
    /** The stored explicit-link flag (validated here, never trusted). */
    readonly explicitLink: string | undefined;
}

/** The explicit link when it is a valid journal UUID, else the resolver's answer for the actor's name. */
export function resolveActorJournalLink(source: ActorJournalLinkSource, resolve: JournalLinkResolver): string | null {
    if (isJournalLinkUuid(source.explicitLink)) return source.explicitLink;
    return resolve({ kind: 'character', name: source.name });
}

/** The resolved link, kept only when the current user may view it. */
export function visibleActorJournalLink(source: ActorJournalLinkSource, resolve: JournalLinkResolver, isVisible: (uuid: string) => boolean): string | null {
    const uuid = resolveActorJournalLink(source, resolve);
    return uuid !== null && isVisible(uuid) ? uuid : null;
}

/** The `<pkg>.<pack>` collection id of a compendium UUID, or null for a world UUID. */
export function compendiumCollectionId(uuid: string): string | null {
    const match = COMPENDIUM_UUID_PATTERN.exec(uuid);
    return match === null ? null : `${match[1]}.${match[2]}`;
}

/**
 * Whether a looked-up journal is visible: a loaded document answers through
 * its own `visible` (OBSERVER for an entry, parent + LIMITED for a page); an
 * unloaded compendium index entry answers through its pack's visibility.
 */
export function isLookedUpJournalVisible(found: object | null, packVisible: boolean | null): boolean {
    if (found === null) return false;
    if ('visible' in found && typeof found.visible === 'boolean') return found.visible;
    return packVisible === true;
}

/* -------------------------------------------- */
/*  Runtime bindings                            */
/* -------------------------------------------- */

/** The minimal actor surface the runtime reads. */
export interface JournalLinkedActor {
    readonly name: string;
    readonly flags: { readonly [SYSTEM_ID]?: { readonly [ACTOR_JOURNAL_LINK_FLAG]?: string } };
}

/** Read an actor's link source (name + stored explicit flag). */
export function actorJournalLinkSource(actor: JournalLinkedActor): ActorJournalLinkSource {
    return { name: actor.name, explicitLink: actor.flags[SYSTEM_ID]?.[ACTOR_JOURNAL_LINK_FLAG] };
}

/** True when the actor carries a valid explicit link (the one an owner can clear). */
export function hasExplicitJournalLink(actor: JournalLinkedActor): boolean {
    return isJournalLinkUuid(actorJournalLinkSource(actor).explicitLink);
}

/** Whether the current user may view the journal at `uuid` (synchronous; GMs always may). */
export function journalVisibleToUser(uuid: string): boolean {
    if (game.user.isGM) return true;
    const collectionId = compendiumCollectionId(uuid);
    const packVisible = collectionId === null ? null : game.packs.get(collectionId)?.visible ?? false;
    return isLookedUpJournalVisible(fromUuidSync(uuid, { strict: false }), packVisible);
}

/** The journal UUID the actor's portrait icon opens for the current user, or null for no icon. */
export function portraitJournalLink(actor: JournalLinkedActor): string | null {
    return visibleActorJournalLink(actorJournalLinkSource(actor), (ref) => EventTracker.resolveJournalLink(ref), journalVisibleToUser);
}

/**
 * The journal sheet's V2 render options. The V2 JournalEntrySheet opens at
 * `pageId` (Foundry's own content-link path passes it); fvtt-types omits it.
 */
interface JournalSheetRenderer {
    render: (options: { force: true; pageId?: string }) => Promise<void>;
}

function isV2Sheet(sheet: object | null | undefined): sheet is JournalSheetRenderer {
    return sheet instanceof foundry.applications.api.ApplicationV2;
}

/** Render a journal's sheet, at a page when given; warns when the journal has no (V2) sheet. */
async function renderJournalSheet(sheet: object | null | undefined, pageId: string | null): Promise<void> {
    if (!isV2Sheet(sheet)) {
        ui.notifications.warn(t('WH40K.Portrait.Journal.NotFound'));
        return;
    }
    await sheet.render(pageId === null ? { force: true } : { force: true, pageId });
}

/**
 * Open a journal entry (or a page, inside its entry) under Foundry's normal
 * ownership: a missing or unviewable document warns instead of opening.
 */
export async function openJournalLink(uuid: string): Promise<void> {
    const document = await fromUuid(uuid);
    const isPage = document instanceof foundry.documents.JournalEntryPage;
    if (!isPage && !(document instanceof foundry.documents.JournalEntry)) {
        ui.notifications.warn(t('WH40K.Portrait.Journal.NotFound'));
        return;
    }
    if (!document.visible) {
        ui.notifications.warn(t('WH40K.Portrait.Journal.NoPermission'));
        return;
    }
    if (isPage) await renderJournalSheet(document.parent?.sheet, document.id);
    else await renderJournalSheet(document.sheet, null);
}

/**
 * Open the actor's journal from its portrait icon. Re-resolved at click time
 * (never read from the DOM) and opened under Foundry's ownership rules.
 */
export async function openActorJournal(actor: JournalLinkedActor): Promise<void> {
    const uuid = portraitJournalLink(actor);
    if (uuid === null) {
        ui.notifications.warn(t('WH40K.Portrait.Journal.NotFound'));
        return;
    }
    await openJournalLink(uuid);
}

/** The actor surface that writes the explicit link (a WH40KBaseActor satisfies it). */
export interface JournalLinkWritableActor extends JournalLinkedActor {
    readonly isOwner: boolean;
    setFlag: (scope: typeof SYSTEM_ID, key: typeof ACTOR_JOURNAL_LINK_FLAG, value: string) => Promise<object | undefined>;
    unsetFlag: (scope: typeof SYSTEM_ID, key: typeof ACTOR_JOURNAL_LINK_FLAG) => Promise<object | undefined>;
}

/**
 * Apply a drop onto the actor's portrait: a journal sets the explicit link
 * (owners only). Returns true when the drop was a journal and is handled here,
 * false when it should take the sheet's normal drop path.
 */
export async function applyPortraitJournalDrop(actor: JournalLinkWritableActor, data: DropData): Promise<boolean> {
    const plan = planPortraitJournalDrop(data, actor.isOwner);
    if (plan.kind === 'pass') return false;
    if (plan.kind === 'denied') {
        ui.notifications.warn(t('WH40K.Portrait.Journal.OwnerOnly', { actor: actor.name }));
        return true;
    }
    await actor.setFlag(SYSTEM_ID, ACTOR_JOURNAL_LINK_FLAG, plan.uuid);
    ui.notifications.info(t('WH40K.Portrait.Journal.Linked', { actor: actor.name }));
    return true;
}

/** Clear the explicit link, falling back to name resolution. Owners only. */
export async function clearActorJournalLink(actor: JournalLinkWritableActor): Promise<void> {
    if (!actor.isOwner) return;
    await actor.unsetFlag(SYSTEM_ID, ACTOR_JOURNAL_LINK_FLAG);
}
