/**
 * @file WorldTimeWidget — persistent in-universe clock readout (#487).
 *
 * Surfaces the shared world clock (#455, `game.time.worldTime`) to the whole
 * table as a small, always-visible floating panel:
 *   - **Day N since inception** — the integer day counter anchored to a durable,
 *     GM-settable campaign-inception stamp (world setting `world-time-inception`).
 *   - **Full standard date/time** — from `game.time.calendar` (the V14
 *     SIMPLIFIED_GREGORIAN calendar #455 adopted), with a Foundry-free fallback.
 *   - **GM-only advance controls** — +1 hour / +1 day / advance N, wrapping
 *     `game.time.advance()`; hidden for players.
 *
 * All date/day arithmetic and formatting is delegated to the pure, unit-tested
 * helpers in `rules/world-time.ts`; this class is the thin ApplicationV2 shell.
 * It is system-agnostic (world time is not per-line), so it carries no
 * `data-wh40k-system` and no per-system theming.
 *
 * The widget refreshes live: advancing the clock fires `updateWorldTime`
 * (re-render driven from `HooksManager.onUpdateWorldTime`), and re-anchoring
 * inception fires `updateSetting` (handled here) so every client stays current.
 */
import { SYSTEM_ID } from '../../constants.ts';
import { t } from '../../i18n/t.ts';
import { advanceSeconds, dayNumberSince, formatClock, formatRemaining, type TimeAdvanceUnit } from '../../rules/world-time.ts';
import { WH40KSettings } from '../../wh40k-rpg-settings.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** ApplicationV2 action handler bound to a `WorldTimeWidget` instance. */
type ActionHandler = (this: WorldTimeWidget, event: Event, target: HTMLElement) => Promise<void> | void;

/** The subset of Foundry's `game.time` (GameTime) surface this widget reads and
 *  drives. Concentrated in one boundary accessor so the framework typing of
 *  `worldTime` / `components` / `calendar.format` / `advance` is asserted once. */
interface WorldClock {
    worldTime: number;
    components: { year: number; day: number; hour: number; minute: number; second: number };
    calendar?: { format?: (time?: number, formatter?: string, options?: object) => string } | undefined;
    advance: (delta: number) => Promise<number>;
}

/** Read the narrow world-clock view of `game.time`. */
function worldClock(): WorldClock {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's game.time (GameTime) surface — worldTime/components/calendar.format/advance — is framework-typed; this concentrates the boundary in one place.
    return game.time as unknown as WorldClock;
}

/**
 * The full standard date/time string for the current world time. Uses the native
 * `game.time.calendar.format()` timestamp when the calendar is available, and
 * falls back to a composed `Year Y, Day D — HH:MM:SS` from `game.time.components`
 * (via the pure {@link formatClock}) when it is not — so the readout never blanks
 * on a world without a configured calendar.
 */
function currentDateLabel(clock: WorldClock): string {
    const format = clock.calendar?.format;
    if (typeof format === 'function') {
        try {
            const label = format(clock.worldTime, 'timestamp');
            if (typeof label === 'string' && label.length > 0) return label;
        } catch {
            // Fall through to the component-based fallback below.
        }
    }
    const c = clock.components;
    return t('WH40K.WorldTime.FallbackDate', {
        year: c.year,
        day: c.day,
        clock: formatClock(c.hour, c.minute, c.second),
    });
}

export default class WorldTimeWidget extends HandlebarsApplicationMixin(ApplicationV2) {
    /* -------------------------------------------- */
    /*  Configuration                               */
    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS = {
        id: 'wh40k-world-time-widget',
        classes: ['wh40k-rpg', 'world-time-widget'],
        tag: 'aside',
        window: {
            title: 'WH40K.WorldTime.Title',
            icon: 'fa-solid fa-hourglass-half',
            minimizable: true,
            resizable: false,
            positioned: true,
        },
        position: {
            top: 8,
            left: 130,
            width: 240,
            // V2 accepts 'auto' for height but the upstream type is `number`; the
            // string is the documented sentinel for content-driven sizing.
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry V2 accepts the literal 'auto' though the upstream type narrows to number.
            height: 'auto' as unknown as number,
        },
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            advanceHour: WorldTimeWidget.#advanceHour as ActionHandler,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            advanceDay: WorldTimeWidget.#advanceDay as ActionHandler,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            advanceCustom: WorldTimeWidget.#advanceCustom as ActionHandler,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            setInception: WorldTimeWidget.#setInception as ActionHandler,
        },
    };

    /** @override */
    static PARTS = {
        panel: {
            template: 'systems/wh40k-rpg/templates/hud/world-time-widget.hbs',
        },
    };

    /** ApplicationV2 exposes `rendered` as a getter, but HandlebarsApplicationMixin
     *  flattens the base type and drops it; re-declare it so subclass access is
     *  typed (mirrors EncounterBuilder). */
    declare rendered: boolean;

    /* -------------------------------------------- */
    /*  Singleton lifecycle                         */
    /* -------------------------------------------- */

    static #instance: WorldTimeWidget | null = null;

    static #settingHookRegistered = false;

    /**
     * Show the singleton widget, rendering it if not already open. Registers the
     * `updateSetting` listener once so re-anchoring inception on any client keeps
     * every widget current (advance-driven refreshes come via `updateWorldTime`
     * in `HooksManager.onUpdateWorldTime`).
     */
    static show(): WorldTimeWidget {
        if (!WorldTimeWidget.#settingHookRegistered) {
            WorldTimeWidget.#settingHookRegistered = true;
            const inceptionKey = `${SYSTEM_ID}.${WH40KSettings.SETTINGS.worldTimeInception}`;
            Hooks.on('updateSetting', (setting: { key?: string }) => {
                if (setting.key === inceptionKey) WorldTimeWidget.refresh();
            });
        }
        let instance = WorldTimeWidget.#instance;
        if (instance === null) {
            instance = new WorldTimeWidget();
            WorldTimeWidget.#instance = instance;
        }
        void instance.render(true);
        return instance;
    }

    /** Re-render the widget if it is open (no-op otherwise). Called when the world
     *  clock advances or the inception stamp changes. */
    static refresh(): void {
        const instance = WorldTimeWidget.#instance;
        if (instance?.rendered === true) void instance.render(false);
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _prepareContext signature is framework-defined.
    override async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        const clock = worldClock();
        const now = clock.worldTime;
        const inception = WH40KSettings.getWorldTimeInception();
        const day = dayNumberSince(inception, now);

        context['dayNumber'] = day;
        context['dayCounterLabel'] = t('WH40K.WorldTime.DayCounter', { day });
        context['fullDate'] = currentDateLabel(clock);
        context['elapsed'] = formatRemaining(now - inception);
        context['isGM'] = game.user.isGM;

        return context;
    }

    /* -------------------------------------------- */
    /*  Action handlers                             */
    /* -------------------------------------------- */

    /** Advance the world clock by `seconds`, GM-gated. Advancing fires
     *  `updateWorldTime`, which refreshes the widget (and expires timed effects /
     *  releases time gates), so no explicit re-render is needed here. */
    static async #advance(seconds: number): Promise<void> {
        if (!game.user.isGM) {
            ui.notifications.warn(t('WH40K.WorldTime.GmOnly'));
            return;
        }
        if (seconds === 0) return;
        await worldClock().advance(seconds);
    }

    /* -------------------------------------------- */

    static async #advanceHour(this: WorldTimeWidget, _event: Event, _target: HTMLElement): Promise<void> {
        await WorldTimeWidget.#advance(advanceSeconds(1, 'hour'));
    }

    /* -------------------------------------------- */

    static async #advanceDay(this: WorldTimeWidget, _event: Event, _target: HTMLElement): Promise<void> {
        await WorldTimeWidget.#advance(advanceSeconds(1, 'day'));
    }

    /* -------------------------------------------- */

    static async #advanceCustom(this: WorldTimeWidget, _event: Event, _target: HTMLElement): Promise<void> {
        const amountInput = this.element.querySelector<HTMLInputElement>('.wh40k-wt-amount');
        const unitSelect = this.element.querySelector<HTMLSelectElement>('.wh40k-wt-unit');
        const count = Number(amountInput?.value ?? '0');
        const unit: TimeAdvanceUnit = unitSelect?.value === 'day' ? 'day' : 'hour';
        // Forward-only: ignore a non-positive / non-finite custom amount.
        if (!Number.isFinite(count) || count <= 0) return;
        await WorldTimeWidget.#advance(advanceSeconds(count, unit));
    }

    /* -------------------------------------------- */

    /** Re-anchor "Day 0" to the current world time (GM-only). */
    static async #setInception(this: WorldTimeWidget, _event: Event, _target: HTMLElement): Promise<void> {
        if (!game.user.isGM) {
            ui.notifications.warn(t('WH40K.WorldTime.GmOnly'));
            return;
        }
        await WH40KSettings.setWorldTimeInception(worldClock().worldTime);
        ui.notifications.info(t('WH40K.WorldTime.InceptionSet'));
        WorldTimeWidget.refresh();
    }
}
