/**
 * @file StarshipSheet - Starship actor sheet using ApplicationV2 with PARTS system
 */

import StarshipData, { ESSENTIAL_SHIP_SLOTS, type StarshipBuildValidation } from '../../data/actor/starship.ts';
import type { WH40KItem } from '../../documents/item.ts';
import type { WH40KStarship } from '../../documents/starship.ts';
import BaseActorSheet from './base-actor-sheet.ts';

/** Localization key per essential slot for the build panel. */
const ESSENTIAL_SLOT_LABEL_KEY: Record<string, string> = {
    plasmaDrive: 'WH40K.ShipComponent.Type.PlasmaDrive',
    warpDrive: 'WH40K.ShipComponent.Type.WarpDrive',
    gellarField: 'WH40K.ShipComponent.Type.GellarField',
    voidShields: 'WH40K.ShipComponent.Type.VoidShields',
    bridge: 'WH40K.ShipComponent.Type.Bridge',
    lifeSupport: 'WH40K.ShipComponent.Type.LifeSupport',
    quarters: 'WH40K.ShipComponent.Type.Quarters',
    auger: 'WH40K.ShipComponent.Type.Auger',
};

/**
 * Actor sheet for Starship type actors.
 * Uses V2 PARTS system for modular template rendering.
 */
export default class StarshipSheet extends BaseActorSheet {
    /** @override */
    static override DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
        ...BaseActorSheet.DEFAULT_OPTIONS,
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
        actions: {
            ...BaseActorSheet.DEFAULT_OPTIONS.actions,
            fireShipWeapon: StarshipSheet.#fireShipWeapon,
            rollInitiative: StarshipSheet.#rollInitiative,
            validateBuild: StarshipSheet.#validateBuild,
            commitBuild: StarshipSheet.#commitBuild,
            dispatchExtendedAction: StarshipSheet.#dispatchExtendedAction,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
        classes: ['starship'],
        position: {
            width: 900,
            height: 700,
        },
        tabs: [{ navSelector: 'nav.wh40k-navigation', contentSelector: '#tab-body', initial: 'stats', group: 'primary' }],
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        ...((BaseActorSheet as typeof BaseActorSheet & { PARTS?: Record<string, ApplicationV2Config.PartConfiguration> }).PARTS ?? {}),
        header: {
            template: 'systems/wh40k-rpg/templates/actor/starship/header.hbs',
        },
        tabs: {
            template: 'systems/wh40k-rpg/templates/actor/starship/tabs.hbs',
        },
        stats: {
            template: 'systems/wh40k-rpg/templates/actor/starship/tab-stats.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        components: {
            template: 'systems/wh40k-rpg/templates/actor/starship/tab-components.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        weapons: {
            template: 'systems/wh40k-rpg/templates/actor/starship/tab-weapons.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        crew: {
            template: 'systems/wh40k-rpg/templates/actor/starship/tab-crew.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        history: {
            template: 'systems/wh40k-rpg/templates/actor/starship/tab-history.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        extendedActions: {
            template: 'systems/wh40k-rpg/templates/actor/starship/tab-extended-actions.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS: HandlebarsApplicationV14.TabDescriptor[] = [
        { tab: 'stats', label: 'WH40K.Starship.Tabs.Stats', group: 'primary', cssClass: 'tab-stats' },
        { tab: 'components', label: 'WH40K.Starship.Tabs.Components', group: 'primary', cssClass: 'tab-components' },
        { tab: 'weapons', label: 'WH40K.Starship.Tabs.Weapons', group: 'primary', cssClass: 'tab-weapons' },
        { tab: 'crew', label: 'WH40K.Starship.Tabs.Crew', group: 'primary', cssClass: 'tab-crew' },
        { tab: 'history', label: 'WH40K.Starship.Tabs.History', group: 'primary', cssClass: 'tab-history' },
        { tab: 'extendedActions', label: 'WH40K.Starship.Tabs.ExtendedActions', group: 'primary', cssClass: 'tab-extended-actions' },
    ];

    /* -------------------------------------------- */

    /** @override */
    override tabGroups: HandlebarsApplicationV14.TabGroupsState = {
        primary: 'stats',
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /**
     * Starships extend `ActorDataModel` directly and have no `characteristics`
     * field — the inherited `BaseActorSheet._prepareCharacteristicsHUD`
     * blindly does `Object.entries(this.actor.system.characteristics)` which
     * throws on the undefined value. Override to a no-op for starships.
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: matches the mixin-erased base method signature
    override _prepareCharacteristicsHUD(_context: Record<string, unknown>): void {
        // Intentionally empty: starships have no characteristics block.
    }

    /**
     * Starships have no actor-level skills schema either; the inherited
     * `_prepareSkills` iterates `system.skills` which is undefined.
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: matches the mixin-erased base method signature
    override _prepareSkills(_context: Record<string, unknown>): void {
        // Intentionally empty: starships have no skills block.
    }

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _prepareContext returns untyped record
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);
        // isGM + dh now come from BaseActorSheet._prepareCommonContext via super.

        // Prepare ship-specific data
        this._prepareShipData(context);

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare starship-specific data for the template.
     * @param {object} context  The template render context.
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: render context is an untyped Record per ApplicationV2 contract
    _prepareShipData(context: Record<string, unknown>): void {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KStarship for ship-specific access
        const actor = this.actor as unknown as WH40KStarship;
        const items = actor.items;

        // Get ship components grouped by type
        context['shipComponents'] = items.filter((item: WH40KItem) => item.type === 'shipComponent');
        context['shipWeapons'] = items.filter((item: WH40KItem) => item.type === 'shipWeapon');
        context['shipUpgrades'] = items.filter((item: WH40KItem) => item.type === 'shipUpgrade');
        context['shipRoles'] = items.filter((item: WH40KItem) => item.type === 'shipRole');

        // Calculate power and space usage (use DataModel fields)
        let powerGenerated = 0;
        let powerUsed = 0;
        let spaceUsed = 0;

        for (const component of context['shipComponents'] as WH40KItem[]) {
            const sys = component.system as {
                condition?: string;
                power?: { generated?: number; used?: number };
                space?: number;
            };
            if (sys.condition === 'functional') {
                powerGenerated += sys.power?.generated ?? 0;
                powerUsed += sys.power?.used ?? 0;
                spaceUsed += sys.space ?? 0;
            }
        }

        for (const weapon of context['shipWeapons'] as WH40KItem[]) {
            const sys = weapon.system as { power?: number; space?: number };
            powerUsed += sys.power ?? 0;
            spaceUsed += sys.space ?? 0;
        }

        for (const upgrade of context['shipUpgrades'] as WH40KItem[]) {
            const sys = upgrade.system as {
                power?: { generated?: number; used?: number };
                space?: number;
            };
            powerGenerated += sys.power?.generated ?? 0;
            powerUsed += sys.power?.used ?? 0;
            spaceUsed += sys.space ?? 0;
        }

        context['powerGenerated'] = powerGenerated;
        context['powerUsed'] = powerUsed;
        context['spaceUsed'] = spaceUsed;
        context['powerAvailable'] = powerGenerated - powerUsed;
        context['spaceAvailable'] = ((this.actor.system as { space?: { total?: number } }).space?.total ?? 0) - spaceUsed;

        // SP-budget panel context (issue #190). The DataModel computes
        // `buildValidation` during prepareDerivedData; fall back to a freshly
        // calculated value when the actor was constructed before the schema
        // was extended (legacy worlds prior to migration running).
        const sys = this.actor.system as {
            buildValidation?: StarshipBuildValidation;
            shipPoints?: { budget?: number; spent?: number };
        };
        let buildValidation: StarshipBuildValidation;
        if (sys.buildValidation) {
            buildValidation = sys.buildValidation;
        } else {
            const budget = sys.shipPoints?.budget ?? 0;
            // eslint-disable-next-line no-restricted-syntax -- boundary: items collection iterates as untyped objects in the legacy fallback path
            const itemViews = [...actor.items].map((it) => ({ type: it.type, system: it.system as { componentType?: string; condition?: string; shipPoints?: number; essential?: boolean } }));
            buildValidation = StarshipData.validateBuild(budget, itemViews);
        }
        context['buildValidation'] = buildValidation;

        const missing = new Set(buildValidation.missingEssentialSlots);
        context['essentialSlots'] = ESSENTIAL_SHIP_SLOTS.map((slot) => ({
            id: slot,
            labelKey: ESSENTIAL_SLOT_LABEL_KEY[slot] ?? slot,
            filled: !missing.has(slot),
        }));
    }

    /* -------------------------------------------- */

    /**
     * Prepare context for specific parts.
     * @inheritDoc
     */
    /* eslint-disable no-restricted-syntax -- boundary: ApplicationV2 _preparePartContext signature uses untyped records */
    override async _preparePartContext(
        partId: string,
        context: Record<string, unknown>,
        options: ApplicationV2Config.RenderOptions,
    ): Promise<Record<string, unknown>> {
        /* eslint-enable no-restricted-syntax */
        // eslint-disable-next-line no-restricted-syntax -- boundary: super signature varies between V13/V14 typings
        const partContext = await super._preparePartContext(partId, context, options as unknown as Record<string, unknown>);

        // Add tab metadata for tab parts
        const tabParts = ['stats', 'components', 'weapons', 'crew', 'history', 'extendedActions'];
        if (tabParts.includes(partId)) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: subclass TABS not on shipped ApplicationV2 ctor type
            const ctor = this.constructor as unknown as { TABS: HandlebarsApplicationV14.TabDescriptor[] };
            const tabConfig = ctor.TABS.find((t: HandlebarsApplicationV14.TabDescriptor) => t.tab === partId);
            const group = tabConfig?.group ?? 'primary';
            partContext['tab'] = {
                id: partId,
                group,
                active: this.tabGroups[group] === partId,
                cssClass: tabConfig?.cssClass ?? '',
            };
        }

        if (partId === 'extendedActions') {
            partContext['extendedActions'] = await this._prepareExtendedActions();
        }

        return partContext;
    }

    /* -------------------------------------------- */

    /**
     * Resolve the list of starship Extended Actions to surface in the sheet.
     *
     * Pulls owned items of type `order` with `shipAction: true` AND any
     * `order` items from the active game system's compendium pack(s) that
     * carry the same flags. This keeps the list correct whether the GM has
     * already imported the compendium entries onto the actor or not — per
     * Direction #7 the source of truth is the compendium pack.
     *
     * @issue #186
     */
    async _prepareExtendedActions(): Promise<
        Array<{
            uuid: string;
            id: string;
            name: string;
            img: string;
            skill: string;
            modifier: number;
            duration: string;
            description: string;
            requirements: string;
            typeAndAction: string;
        }>
    > {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KStarship for ship-specific access
        const actor = this.actor as unknown as WH40KStarship;
        const gameSystemId = (actor.system as { gameSystem?: string }).gameSystem ?? 'rt';

        const out: Array<{
            uuid: string;
            id: string;
            name: string;
            img: string;
            skill: string;
            modifier: number;
            duration: string;
            description: string;
            requirements: string;
            typeAndAction: string;
        }> = [];

        const seenUuids = new Set<string>();

        const pushItem = (item: WH40KItem, uuid: string): void => {
            if (seenUuids.has(uuid)) return;
            seenUuids.add(uuid);
            const sys = item.system as {
                shipAction?: boolean;
                gameSystems?: string[];
                skill?: string;
                modifier?: number;
                duration?: string;
                requirements?: string;
                typeAndAction?: string;
                description?: { value?: string };
            };
            if (sys.shipAction !== true) return;
            const systems = sys.gameSystems ?? [];
            if (systems.length > 0 && !systems.includes(gameSystemId)) return;
            out.push({
                uuid,
                id: item.id ?? '',
                name: item.name ?? '',
                img: item.img ?? '',
                skill: sys.skill ?? '',
                modifier: sys.modifier ?? 0,
                duration: sys.duration ?? '',
                description: sys.description?.value ?? '',
                requirements: sys.requirements ?? '',
                typeAndAction: sys.typeAndAction ?? '',
            });
        };

        // 1. Owned items already on the actor.
        for (const item of actor.items) {
            if (item.type !== 'order') continue;
            // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KItem.uuid not in shipped types for our narrow view
            const uuid = (item as unknown as { uuid?: string }).uuid ?? '';
            if (uuid === '') continue;
            pushItem(item, uuid);
        }

        // 2. Compendium pack: rt-items-ship-extended-actions (and any future per-system equivalent).
        // eslint-disable-next-line no-restricted-syntax -- boundary: game.packs typing in fvtt-types is loose
        const packs = (globalThis as unknown as { game?: { packs?: { get?: (id: string) => unknown } } }).game?.packs;
        const packId = `wh40k-rpg.${gameSystemId}-items-ship-extended-actions`;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry CompendiumCollection narrowed locally
        const pack = packs?.get?.(packId) as
            | undefined
            | { getDocuments?: () => Promise<Array<WH40KItem & { uuid: string }>> };
        if (pack?.getDocuments !== undefined) {
            try {
                const docs = await pack.getDocuments();
                for (const doc of docs) {
                    if (doc.type !== 'order') continue;
                    pushItem(doc, doc.uuid);
                }
            } catch {
                // Pack unavailable (e.g. during early sheet renders before world ready) — silently skip.
            }
        }

        out.sort((a, b) => a.name.localeCompare(b.name));
        return out;
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Handle firing a ship weapon.
     * @this {StarshipSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #fireShipWeapon(this: StarshipSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KStarship for ship-specific access
        const actor = this.actor as unknown as WH40KStarship;
        const itemId = target.closest<HTMLElement>('[data-item-id]')?.dataset['itemId'];
        const weapon = actor.items.get(itemId ?? '');
        if (!weapon) return;

        const cardData = {
            actor,
            weapon: weapon,
            crewRating: (actor.system as { crew?: { crewRating?: number } }).crew?.crewRating ?? 30,
            gameSystem: (actor.system as { gameSystem?: string }).gameSystem,
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/ship-weapon-chat.hbs', cardData);

        const speaker = ChatMessage.getSpeaker({
            // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KStarship satisfies Actor.Implementation but typings widen
            actor: actor as unknown as Actor.Implementation,
        });
        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload not in shipped types for our card shape
        const payload = { user: game.user.id, speaker, content: html } as unknown as Parameters<typeof ChatMessage.create>[0];
        void ChatMessage.create(payload);
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling starship initiative.
     * @this {StarshipSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollInitiative(this: StarshipSheet, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: rollInitiative is defined on Starship document; not on Actor.Implementation
        const a = this.actor as unknown as { rollInitiative?: () => Promise<void> };
        await a.rollInitiative?.();
    }

    /* -------------------------------------------- */

    /**
     * Returns the current `StarshipBuildValidation` for this starship and
     * surfaces it to the player via `ui.notifications`. Used by the
     * "Validate Build" button in the SP-budget panel (issue #190).
     *
     * Pure helper: does not mutate the actor. The commit-button enabled state
     * is already wired against the same `buildValidation` in the template.
     */
    static async #validateBuild(this: StarshipSheet, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        const validation = this.computeBuildValidation();
        const i18n = game.i18n;
        if (validation.isValid) {
            ui.notifications?.info(i18n.localize('WH40K.Starship.Build.NotifyValid'));
        } else {
            const parts: string[] = [];
            if (validation.isOverBudget) {
                parts.push(
                    i18n.format('WH40K.Starship.Build.NotifyOverBudgetBy', {
                        amount: String(validation.spent - validation.budget),
                    }),
                );
            }
            if (validation.missingEssentialSlots.length > 0) {
                parts.push(
                    i18n.format('WH40K.Starship.Build.NotifyMissingSlots', {
                        count: String(validation.missingEssentialSlots.length),
                    }),
                );
            }
            ui.notifications?.warn(parts.join(' — '));
        }
    }

    /* -------------------------------------------- */

    /**
     * Block-the-commit handler. Refuses to "save" the build when the validation
     * fails and otherwise notifies success. The actual persistence of the build
     * happens through the existing item add/remove flow — this handler exists
     * so the template can wire `data-action="commitBuild"` to a single point
     * that enforces the invariant. (Issue #190 explicitly requires that the
     * build cannot be saved with missing essentials or an over-budget total.)
     */
    static async #commitBuild(this: StarshipSheet, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        const validation = this.computeBuildValidation();
        if (!validation.isValid) {
            ui.notifications?.error(game.i18n.localize('WH40K.Starship.Build.NotifyCannotCommit'));
            return;
        }
        ui.notifications?.info(game.i18n.localize('WH40K.Starship.Build.NotifyCommitted'));
    }

    /* -------------------------------------------- */

    /**
     * Compute and return the build validation result for this actor. Prefers
     * the live `system.buildValidation` populated by `prepareDerivedData`; if
     * absent (legacy world pre-migration), reconstructs it from owned items.
     */
    computeBuildValidation(): StarshipBuildValidation {
        const sys = this.actor.system as {
            buildValidation?: StarshipBuildValidation;
            shipPoints?: { budget?: number };
        };
        if (sys.buildValidation) return sys.buildValidation;
        const budget = sys.shipPoints?.budget ?? 0;
        // eslint-disable-next-line no-restricted-syntax -- boundary: items collection iterates as untyped Foundry CollectionEntries
        const a = this.actor as unknown as { items: Iterable<{ type: string; system: unknown }> };
        const itemViews = [...a.items].map((it) => ({ type: it.type, system: it.system as { componentType?: string; condition?: string; shipPoints?: number; essential?: boolean } }));
        return StarshipData.validateBuild(budget, itemViews);
    }

    /* -------------------------------------------- */

    /**
     * Dispatch a starship Extended Action to chat (issue #186).
     *
     * Locates the action either by `data-action-uuid` (compendium or world)
     * or `data-action-id` (owned), renders the chat card template, and posts
     * it to the chat log. Mechanical resolution (rolls, modifiers, success
     * effects) is intentionally out of scope at this stage and is a follow-up.
     */
    static async #dispatchExtendedAction(this: StarshipSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KStarship for ship-specific access
        const actor = this.actor as unknown as WH40KStarship;
        const uuid = target.dataset['actionUuid'] ?? '';
        const itemId = target.dataset['actionId'] ?? '';

        // eslint-disable-next-line no-restricted-syntax -- boundary: foundry.utils.fromUuid is loosely typed in fvtt-types
        const fromUuidFn = (globalThis as unknown as { fromUuid?: (uuid: string) => Promise<unknown> }).fromUuid;
        let item: WH40KItem | undefined;
        if (uuid !== '' && fromUuidFn !== undefined) {
            try {
                item = (await fromUuidFn(uuid)) as WH40KItem | undefined;
            } catch {
                item = undefined;
            }
        }
        if (item === undefined && itemId !== '') {
            item = actor.items.get(itemId);
        }
        if (item === undefined) {
            ui.notifications?.warn(game.i18n.localize('WH40K.Starship.ExtendedAction.Empty'));
            return;
        }

        const sys = item.system as {
            skill?: string;
            modifier?: number;
            duration?: string;
            requirements?: string;
            typeAndAction?: string;
            description?: { value?: string };
        };
        const cardData = {
            action: {
                name: item.name ?? '',
                img: item.img ?? '',
                skill: sys.skill ?? '',
                modifier: sys.modifier ?? 0,
                duration: sys.duration ?? '',
                requirements: sys.requirements ?? '',
                typeAndAction: sys.typeAndAction ?? '',
                description: sys.description?.value ?? '',
            },
            actorName: actor.name ?? '',
            gameSystem: (actor.system as { gameSystem?: string }).gameSystem ?? 'rt',
        };

        const html = await foundry.applications.handlebars.renderTemplate(
            'systems/wh40k-rpg/templates/chat/extended-action-chat.hbs',
            cardData,
        );

        const speaker = ChatMessage.getSpeaker({
            // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KStarship satisfies Actor.Implementation but typings widen
            actor: actor as unknown as Actor.Implementation,
        });
        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload not in shipped types for our card shape
        const payload = { user: game.user.id, speaker, content: html } as unknown as Parameters<typeof ChatMessage.create>[0];
        void ChatMessage.create(payload);
    }
}
