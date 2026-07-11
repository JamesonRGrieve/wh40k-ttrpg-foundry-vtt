/**
 * Cogitator Terminal — an in-fiction data-terminal for browsing curated records.
 *
 * A themed {@link ApplicationV2} that presents a set of Foundry Items as
 * permission-gated, cross-linked "records" — the way a Dark-Heresy cogitator or
 * data-slate lists files. It is **content-agnostic** (Direction #7): it hard-codes
 * no game content and reads whatever Items it is opened against (an Item Folder
 * or an explicit UUID list). Each record's body is the Item's
 * `system.description.value`; `@UUID[…]` cross-links inside a record that point at
 * *another record in the same terminal* navigate in-place (hypertext page turn),
 * while links to anything else fall through to Foundry's default handler.
 *
 * Access model: a record the viewing user cannot read (< OBSERVER) lists as a
 * REDACTED placeholder and its body shows an access-denied notice — so a locked
 * record is visible-but-sealed until the GM grants permission (the "authorize
 * under warrant" beat). Pure index/body decisions live in
 * {@link file://./cogitator-records.ts}; this class is the framework shell.
 *
 * Open via the API: `game.wh40k.openCogitator({ folderId })` or
 * `game.wh40k.openCogitator({ recordUuids: [...] })`. See `docs/cogitator-terminal.md`.
 */

import { t } from '../../i18n/t.ts';
import { WH40KSettings } from '../../wh40k-rpg-settings.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';
import {
    buildTerminalIndex,
    isInternalRecord,
    resolveActiveRecord,
    RECORD_ACCESS_LEVEL,
    type CogitatorRecordItem,
    type TerminalIndexEntry,
} from './cogitator-records.ts';

const { ApplicationV2 } = foundry.applications.api;

/** Options accepted by the terminal beyond the base ApplicationV2 bag. */
export interface CogitatorTerminalOptions {
    /** Item Folder id whose contents are the records (usable with recordUuids). */
    folderId?: string;
    /** Explicit record Item UUIDs (used instead of / in addition to a folder). */
    recordUuids?: string[];
    /** UUID of the record to open initially; omit for the landing screen. */
    activeUuid?: string | null;
    /** Custom window title (e.g. "Medicae Archive Cogitator"); defaults to the localized generic title. */
    title?: string;
    /** Drop records the viewer cannot read from the index entirely (default: list them REDACTED). */
    hideRestricted?: boolean;
}

/**
 * Minimal live-Item surface the terminal reads. A concrete `WH40KItem` satisfies
 * it structurally; kept narrow so the resolution path stays typed at the boundary.
 */
interface LiveRecordDoc {
    readonly id: string | null;
    readonly uuid: string;
    readonly name: string;
    readonly sort?: number;
    readonly system?: { description?: { value?: string } };
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document#testUserPermission is framework-typed
    readonly testUserPermission: (user: unknown, level: number) => boolean;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 lacks a typed constructor signature; cast required for the mixin pattern
export class CogitatorTerminal extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    readonly #folderId: string | null;
    readonly #recordUuids: string[];
    readonly #customTitle: string | null;
    readonly #hideRestricted: boolean;
    #activeUuid: string | null;
    /** Record UUIDs resolved on the last render — the internal-link set for navigation. */
    #resolvedUuids: string[] = [];

    constructor(options: CogitatorTerminalOptions = {}) {
        super(options);
        this.#folderId = options.folderId ?? null;
        this.#recordUuids = options.recordUuids ?? [];
        this.#activeUuid = options.activeUuid ?? null;
        this.#customTitle = options.title ?? null;
        this.#hideRestricted = options.hideRestricted ?? false;
    }

    /** @override */
    static override DEFAULT_OPTIONS = {
        id: 'wh40k-cogitator-terminal',
        classes: ['wh40k-rpg', 'wh40k-cogitator'],
        tag: 'div',
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself
            selectRecord: CogitatorTerminal.#onSelectRecord,
        },
        position: { width: 820, height: 640 },
        window: {
            // eslint-disable-next-line no-restricted-syntax -- i18n: title set before game.i18n is initialized; resolved at render time and by the `title` getter
            title: 'WH40K.Cogitator.Title',
            resizable: true,
            minimizable: true,
        },
    } as ApplicationV2Config.DefaultOptions;

    /** @override */
    /* eslint-disable no-restricted-syntax -- boundary: PARTS must be cast for the mixin's ApplicationV2 override signature */
    static override PARTS = {
        terminal: {
            template: 'systems/wh40k-rpg/templates/applications/cogitator-terminal.hbs',
            scrollable: ['.wh40k-cog-index', '.wh40k-cog-body'],
        },
    } as Record<string, ApplicationV2Config.PartConfiguration>;
    /* eslint-enable no-restricted-syntax */

    /** @override — use the caller's custom title (e.g. a specific archive) when provided. */
    override get title(): string {
        if (this.#customTitle !== null) return this.#customTitle;
        return t('WH40K.Cogitator.Title');
    }

    /* -------------------------------------------- */
    /*  Record resolution                           */
    /* -------------------------------------------- */

    /** Resolve the configured folder + UUID list into live record Items (deduped by uuid). */
    async #resolveRecordDocs(): Promise<LiveRecordDoc[]> {
        const docs: LiveRecordDoc[] = [];
        const seen = new Set<string>();
        const push = (doc: LiveRecordDoc | null): void => {
            if (doc !== null && !seen.has(doc.uuid)) {
                seen.add(doc.uuid);
                docs.push(doc);
            }
        };

        // The ternary keeps `folder` typed `Folder | undefined` in both the main and
        // test tsconfigs (Collection#get is `T | undefined`), so the `?.` below is
        // necessary under either parser and `?? []` covers a missing/invalid folder.
        const folder = this.#folderId !== null ? game.folders.get(this.#folderId) : undefined;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Folder#contents are Documents; we read only the structural LiveRecordDoc surface
        for (const item of (folder?.contents ?? []) as unknown as LiveRecordDoc[]) push(item);

        const pending = this.#recordUuids.filter((uuid) => !seen.has(uuid));
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry global fromUuid resolves to Document | null (untyped here)
        const resolved = (await Promise.all(pending.map(async (uuid) => fromUuid(uuid)))) as (LiveRecordDoc | null)[];
        for (const doc of resolved) push(doc);

        return docs;
    }

    /** Map a live Item onto the pure record model, computing read access for the current user. */
    #toRecordItem(doc: LiveRecordDoc): CogitatorRecordItem {
        return {
            id: doc.id ?? doc.uuid,
            uuid: doc.uuid,
            name: doc.name,
            body: doc.system?.description?.value ?? '',
            sort: doc.sort ?? 0,
            accessible: doc.testUserPermission(game.user, RECORD_ACCESS_LEVEL),
        };
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _prepareContext returns Record<string,unknown> per Foundry's framework type
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        const records = (await this.#resolveRecordDocs()).map((doc) => this.#toRecordItem(doc));
        this.#resolvedUuids = records.map((r) => r.uuid);

        const index: TerminalIndexEntry[] = buildTerminalIndex(records, {
            activeUuid: this.#activeUuid,
            restrictedLabel: t('WH40K.Cogitator.Restricted'),
            hideRestricted: this.#hideRestricted,
        });

        const active = resolveActiveRecord(records, this.#activeUuid);
        let bodyHtml: string | null = null;
        if (active !== null && active.body !== null) {
            bodyHtml = await foundry.applications.ux.TextEditor.implementation.enrichHTML(active.body, { secrets: false, rollData: {} });
        }

        return {
            ...context,
            systemId: WH40KSettings.getPrimaryGameSystem(),
            terminalTitle: this.title,
            index,
            hasRecords: records.length > 0,
            activeName: active?.name ?? null,
            restricted: active !== null && !active.accessible,
            bodyHtml,
        };
    }

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _onRender signature uses Record<string,unknown> per Foundry's mixin-erased contract
    override async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
        await super._onRender(context, options);
        const root = this.element;
        // Surface the active game line so `<id>:tw-*` accent variants fire on the terminal.
        root.dataset['wh40kSystem'] = WH40KSettings.getPrimaryGameSystem();

        // Cross-link interception: a content-link to a record IN THIS terminal turns
        // the page in-place; anything else falls through to Foundry's default handler.
        const body = root.querySelector('.wh40k-cog-body');
        body?.querySelectorAll<HTMLAnchorElement>('a.content-link[data-uuid]').forEach((anchor) => {
            const uuid = anchor.dataset['uuid'];
            if (uuid === undefined || !isInternalRecord(uuid, this.#resolvedUuids)) return;
            anchor.addEventListener(
                'click',
                (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.#navigateTo(uuid);
                },
                // Capture so we preempt Foundry's own content-link click handler.
                { capture: true },
            );
        });
    }

    /** Turn to a record (by UUID) and re-render. */
    #navigateTo(uuid: string): void {
        this.#activeUuid = uuid;
        void this.render({ force: true });
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    /** Index-row click → open that record. */
    static #onSelectRecord(this: CogitatorTerminal, _event: Event, target: HTMLElement): void {
        const uuid = target.dataset['uuid'];
        if (uuid === undefined || uuid === '') return;
        this.#navigateTo(uuid);
    }

    /* -------------------------------------------- */
    /*  Factory                                     */
    /* -------------------------------------------- */

    /** Open (and render) a terminal for the given records. */
    static open(options: CogitatorTerminalOptions = {}): CogitatorTerminal {
        const terminal = new CogitatorTerminal(options);
        void terminal.render({ force: true });
        return terminal;
    }
}
