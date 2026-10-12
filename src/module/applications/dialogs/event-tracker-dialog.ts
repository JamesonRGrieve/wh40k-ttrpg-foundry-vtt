/**
 * @file EventTrackerDialog — the GM dashboard for the campaign Event Tracker.
 *
 * Three tabs over one event graph:
 *  - Timeline: events grouped by source (day plan / quest), chronologically,
 *    with the current campaign day highlighted and future days dimmed;
 *  - Location: events grouped by location, with Go to Scene / Spawn Scene;
 *  - Relations: NPC disposition cards recomputed from the resolved events,
 *    plus an editable attitude per player character.
 *
 * Every named thing renders as a Foundry content link to its journal when the
 * tracker resolves one. The dialog holds no tracker state of its own beyond the
 * active tab: it reads and writes through the injected {@link EventTrackerSource}
 * (the `EventTracker` API), and re-renders when that API's change hooks fire.
 * All grouping and view decisions are the pure {@link buildEventTrackerView}.
 */

import { SYSTEM_ID } from '../../constants.ts';
import { isCharacterActorType } from '../../documents/actor-types.ts';
import { t } from '../../i18n/t.ts';
import {
    type CharacterState,
    type EventGraph,
    findSceneForLocation,
    type JournalRef,
    type PcAttitudeMap,
    type ResolvedState,
    sceneLocationName,
    stepCampaignDay,
    type VaultJournalIdentity,
} from '../../managers/event-graph.ts';
import { asEventTrackerTab, buildEventTrackerView, type EventTrackerTab, type EventTrackerView } from './event-tracker-view.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Canvas size (px, both axes) of a Scene spawned for a location that has none. */
export const SPAWNED_SCENE_DIMENSION = 1000;

/** How long a cross-tab link's target stays highlighted after the jump. */
const CROSS_LINK_FLASH_MS = 1500;
const FLASH_CLASS = 'tw-animate-value-change-highlight';

const WINDOW_WIDTH = 720;
const WINDOW_HEIGHT = 750;

/** The hooks whose firing means the dashboard's data changed. */
const REFRESH_HOOKS = ['wh40k-rpg.eventResolved', 'wh40k-rpg.campaignDayChanged', 'wh40k-rpg.pcAttitudeChanged'] as const;

/** The tracker surface the dashboard reads and writes — satisfied by the `EventTracker` class. */
export interface EventTrackerSource {
    readonly graph: EventGraph | null;
    readonly characters: Readonly<Record<string, CharacterState>> | null;
    getResolved: () => ResolvedState;
    setResolved: (eventId: string, resolved: boolean) => Promise<void>;
    getCampaignDay: () => number;
    setCampaignDay: (day: number) => Promise<void>;
    getAllPcAttitudes: () => PcAttitudeMap;
    setPcAttitude: (npc: string, pc: string, attitude: string) => Promise<void>;
    resolveJournalLink: (ref: JournalRef) => string | null;
    findLocationVaultIdentity: (location: string) => VaultJournalIdentity | null;
}

/** A world Scene paired with the fields the location lookup reads. */
interface WorldScene {
    readonly scene: Scene.Implementation;
    readonly name: string;
    readonly vault: VaultJournalIdentity | undefined;
}

/** The world's Scenes, each with its vault identity flag (if any). */
function worldScenes(): WorldScene[] {
    return Array.from(game.scenes, (scene) => ({ scene, name: scene.name, vault: scene.flags[SYSTEM_ID]?.vault }));
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 context is a free-form template payload; Record<string, unknown> is the correct base shape
interface EventTrackerContext extends Record<string, unknown>, EventTrackerView {}

export default class EventTrackerDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    static #instance: EventTrackerDialog | null = null;

    /** @override */
    static override DEFAULT_OPTIONS = {
        id: 'wh40k-event-tracker',
        classes: ['wh40k-rpg', 'event-tracker-dialog'],
        tag: 'div',
        window: {
            title: 'WH40K.Notify.EventTracker.DialogTitle',
            icon: 'fa-solid fa-project-diagram',
            resizable: true,
        },
        position: { width: WINDOW_WIDTH, height: WINDOW_HEIGHT },
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            selectTab: EventTrackerDialog.#onSelectTab,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            stepDay: EventTrackerDialog.#onStepDay,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            toggleResolved: EventTrackerDialog.#onToggleResolved,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            jumpToGroup: EventTrackerDialog.#onJumpToGroup,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            viewScene: EventTrackerDialog.#onViewScene,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            spawnScene: EventTrackerDialog.#onSpawnScene,
        },
    };

    /** @override */
    static PARTS = {
        header: { template: 'systems/wh40k-rpg/templates/dialogs/event-tracker/header.hbs' },
        body: { template: 'systems/wh40k-rpg/templates/dialogs/event-tracker/body.hbs', scrollable: [''] },
    };

    readonly #source: EventTrackerSource;
    #activeTab: EventTrackerTab = 'timeline';
    #hookIds: Array<[(typeof REFRESH_HOOKS)[number], number]> = [];

    constructor(source: EventTrackerSource) {
        super({});
        this.#source = source;
    }

    /** Open (or focus) the dashboard over a tracker. */
    static show(source: EventTrackerSource): EventTrackerDialog {
        const existing = EventTrackerDialog.#instance;
        if (existing !== null) {
            void existing.render({ force: true });
            return existing;
        }
        const dialog = new EventTrackerDialog(source);
        EventTrackerDialog.#instance = dialog;
        void dialog.render({ force: true });
        return dialog;
    }

    /** @override */
    get title(): string {
        return t('WH40K.Notify.EventTracker.DialogTitle');
    }

    /** @override */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<EventTrackerContext> {
        const context = await super._prepareContext(options);
        const source = this.#source;
        const scenes = worldScenes();
        const activeScene = scenes.find(({ scene }) => scene.active);
        const view = buildEventTrackerView({
            graph: source.graph ?? {},
            characters: source.characters,
            resolved: source.getResolved(),
            campaignDay: source.getCampaignDay(),
            pcAttitudes: source.getAllPcAttitudes(),
            pcNames: game.actors
                .filter((actor) => isCharacterActorType(actor.type))
                .map((actor) => actor.name)
                .sort((a, b) => a.localeCompare(b)),
            activeTab: this.#activeTab,
            activeSceneName: activeScene === undefined ? '' : sceneLocationName(activeScene),
            // A scene answers for its own name and, when vault-flagged, for its location.
            sceneNames: new Set(scenes.flatMap((scene) => [scene.name, sceneLocationName(scene)])),
            journalLink: (ref) => source.resolveJournalLink(ref),
        });
        return { ...context, ...view };
    }

    /**
     * @override
     * The window element outlives re-renders (only the parts are replaced), so the
     * delegated attitude listener and the refresh hooks are attached once.
     */
    override async _onRender(context: EventTrackerContext, options: ApplicationV2Config.RenderOptions): Promise<void> {
        await super._onRender(context, options);
        if (this.#hookIds.length > 0) return;
        this.#hookIds = REFRESH_HOOKS.map((hook) => [hook, Hooks.on(hook, () => this.#refresh())]);
        this.element.addEventListener('change', (event) => {
            this.#onAttitudeChange(event);
        });
    }

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2._onClose receives Foundry's untyped close-options bag
    override _onClose(options: Record<string, unknown>): void {
        super._onClose(options);
        for (const [hook, id] of this.#hookIds) Hooks.off(hook, id);
        this.#hookIds = [];
        if (EventTrackerDialog.#instance === this) EventTrackerDialog.#instance = null;
    }

    #refresh(): void {
        if (this.isRendered) void this.render();
    }

    /** Run a tracker write, surfacing a failure to the GM rather than as an unhandled rejection. */
    async #write(task: () => Promise<void>): Promise<void> {
        try {
            await task();
        } catch (err) {
            console.error('EventTracker: dashboard write failed', err);
            ui.notifications.error(t('WH40K.EventTracker.UpdateFailed'));
        }
    }

    #onAttitudeChange(event: Event): void {
        const input = event.target;
        if (!(input instanceof HTMLInputElement)) return;
        const npc = input.dataset['npc'];
        const pc = input.dataset['pc'];
        if (npc === undefined || pc === undefined) return;
        void this.#write(async () => this.#source.setPcAttitude(npc, pc, input.value));
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    static async #onSelectTab(this: EventTrackerDialog, _event: Event, target: HTMLElement): Promise<void> {
        this.#activeTab = asEventTrackerTab(target.dataset['tab']);
        await this.render();
    }

    static async #onStepDay(this: EventTrackerDialog, _event: Event, target: HTMLElement): Promise<void> {
        const delta = Number(target.dataset['delta']);
        if (!Number.isInteger(delta)) return;
        const day = stepCampaignDay(this.#source.getCampaignDay(), delta);
        await this.#write(async () => this.#source.setCampaignDay(day));
    }

    static async #onToggleResolved(this: EventTrackerDialog, _event: Event, target: HTMLElement): Promise<void> {
        const eventId = target.dataset['eventId'];
        if (!(target instanceof HTMLInputElement) || eventId === undefined) return;
        await this.#write(async () => this.#source.setResolved(eventId, target.checked));
        await this.render();
    }

    static async #onJumpToGroup(this: EventTrackerDialog, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const group = target.dataset['group'] ?? '';
        this.#activeTab = asEventTrackerTab(target.dataset['tab']);
        await this.render();
        const groupEl = this.element.querySelector<HTMLElement>(`[data-group-key="${CSS.escape(group)}"]`);
        if (groupEl === null) return;
        groupEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        groupEl.classList.add(FLASH_CLASS);
        window.setTimeout(() => {
            groupEl.classList.remove(FLASH_CLASS);
        }, CROSS_LINK_FLASH_MS);
    }

    static async #onViewScene(this: EventTrackerDialog, _event: Event, target: HTMLElement): Promise<void> {
        const match = findSceneForLocation(worldScenes(), target.dataset['location'] ?? '');
        if (match !== undefined) await match.scene.view();
    }

    static async #onSpawnScene(this: EventTrackerDialog, _event: Event, target: HTMLElement): Promise<void> {
        const name = target.dataset['location'] ?? '';
        if (name === '') return;
        try {
            // Stamp the vault identity only when the location's journal carries one,
            // so the scene is found by flag; otherwise it stays unflagged.
            const identity = this.#source.findLocationVaultIdentity(name);
            await Scene.create({
                name,
                width: SPAWNED_SCENE_DIMENSION,
                height: SPAWNED_SCENE_DIMENSION,
                ...(identity === null
                    ? {}
                    : { flags: { [SYSTEM_ID]: { vault: { path: identity.path, entityType: identity.entityType, name: identity.name } } } }),
            });
        } catch (err) {
            console.error(`EventTracker: failed to create scene "${name}"`, err);
            ui.notifications.error(t('WH40K.EventTracker.SceneSpawnFailed', { name }));
        }
        await this.render();
    }
}
