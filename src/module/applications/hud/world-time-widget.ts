/**
 * @file WorldTimeWidget — persistent in-universe clock readout (#487).
 *
 * Surfaces the shared world clock (#455, `game.time.worldTime`) to the whole
 * table as a small, always-visible floating panel:
 *   - **Day N since inception** — the integer day counter measured from the
 *     campaign's inception stamp (world setting `world-time-inception`). Day 0 is
 *     the campaign/mission inception and is FIXED — there is deliberately no
 *     "set Day 0 here" control, since re-anchoring silently rewrites every
 *     historical day number.
 *   - **Imperial date** — the canonical `check.fraction.year.millennium` stamp
 *     (`rules/imperial-date.ts`), computed as the campaign's inception date
 *     advanced by elapsed world time. Explicitly NOT a Gregorian timestamp from
 *     `game.time.calendar`: the Imperium has no universal calendar to render.
 *   - **Time of day** — a plain `HH:MM`, separate from the Imperial stamp because
 *     that format's smallest unit is the year fraction (~8.8h) and cannot express
 *     "evening".
 *   - **GM-only advance controls** — +1 hour / +1 day / advance N, wrapping
 *     `game.time.advance()`; hidden for players.
 *
 * Which date a campaign began on is **world data**, set per world by its GM — the
 * system ships only the format and a neutral placeholder default.
 *
 * All date/day arithmetic and formatting is delegated to the pure, unit-tested
 * helpers in `rules/world-time.ts` and `rules/imperial-date.ts`; this class is the
 * thin ApplicationV2 shell. It is system-agnostic (world time is not per-line), so
 * it carries no `data-wh40k-system` and no per-system theming.
 *
 * The widget refreshes live: advancing the clock fires `updateWorldTime`
 * (re-render driven from `HooksManager.onUpdateWorldTime`), and a change to the
 * inception settings fires `updateSetting` (handled here) so every client stays
 * current.
 */
import { SYSTEM_ID } from '../../constants.ts';
import { t } from '../../i18n/t.ts';
import { addSecondsToImperialDate, formatImperialDate } from '../../rules/imperial-date.ts';
import { type CelestialBody, localDayNumber, localSeason, localTimeOfDay, SOLENNE_SYSTEM } from '../../rules/planetary-calendar.ts';
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
 * The current in-universe date as a canonical **Imperial timestamp** (#487).
 *
 * Deliberately NOT `game.time.calendar.format()`: that emits a Gregorian
 * wall-clock string, and the Imperium has no universal calendar to render. The
 * campaign's own inception stamp is the anchor, advanced by elapsed world time.
 */
function currentImperialDateLabel(clock: WorldClock): string {
    const inceptionDate = WH40KSettings.getCampaignInceptionDate();
    const elapsed = clock.worldTime - WH40KSettings.getWorldTimeInception();
    return formatImperialDate(addSecondsToImperialDate(inceptionDate, elapsed));
}

/**
 * Time of day for the current world time, as `HH:MM`. Kept separate from the
 * Imperial stamp on purpose: the Imperial format's smallest unit is the year
 * fraction (~8.8 hours), so it cannot express "evening" — the table still needs a
 * clock, it just isn't part of the date.
 */
function currentClockLabel(clock: WorldClock): string {
    const c = clock.components;
    return formatClock(c.hour, c.minute);
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
            // 260 (not 240) so the GM advance row fits amount + unit select + button
            // without the select collapsing under its label (#473).
            width: 260,
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

    /**
     * Register the scene-control button that reopens the widget.
     *
     * The window frame supplies a header close button, but `show()` was only ever
     * called once on `ready` — so closing the panel was a one-way door and the only
     * way back was reloading the world (#487). This gives it a discoverable, always
     * present affordance. Available to players as well as GMs: the counter is
     * table-visible and the advance controls are gated inside the template.
     *
     * `show()` is singleton-safe, so re-invoking while open re-renders/focuses the
     * existing instance rather than stacking duplicates, and it re-establishes the
     * `updateSetting` subscription.
     */

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

        const elapsed = now - inception;

        const body: CelestialBody = SOLENNE_SYSTEM['solenne-minoris'] ?? { name: 'Terran Standard', rotationHours: 24 };
        const localDay = localDayNumber(elapsed, body);
        const localTime = localTimeOfDay(elapsed, body);

        context['dayNumber'] = day;
        context['dayCounterLabel'] = t('WH40K.WorldTime.DayCounter', { day });
        context['fullDate'] = currentImperialDateLabel(clock);
        context['timeOfDay'] = currentClockLabel(clock);
        context['elapsed'] = formatRemaining(elapsed);
        context['isGM'] = game.user.isGM;
        context['localBodyName'] = body.name;
        context['localDay'] = localDay;
        context['localTimeOfDay'] = formatClock(localTime.hour, localTime.minute);
        context['localRotationHours'] = body.rotationHours;
        const season = localSeason(elapsed, body);
        context['localSeason'] = season?.name ?? '';
        context['localSeasonIcon'] = season?.icon ?? '';

        const ratio = (24 / body.rotationHours).toFixed(2);
        const orbitalInfo = body.orbitalDays !== undefined ? `\nOrbital period: ${body.orbitalDays} Terran days` : '';
        const tiltInfo = body.axialTilt !== undefined ? `\nAxial tilt: ${body.axialTilt}°` : '';
        context['localBodyTooltip'] = `${body.name}\nLocal day: ${
            body.rotationHours
        } Terran hours\n1 Terran day = ${ratio} local days${orbitalInfo}${tiltInfo}${season !== null ? `\nCurrent season: ${season.name}` : ''}`;

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
        const amountInput = this.element.querySelector<HTMLInputElement>('[data-wh40k-hook="wt-amount"]');
        const unitSelect = this.element.querySelector<HTMLSelectElement>('[data-wh40k-hook="wt-unit"]');
        const count = Number(amountInput?.value ?? '0');
        const unit: TimeAdvanceUnit = unitSelect?.value === 'day' ? 'day' : 'hour';
        // Forward-only: ignore a non-positive / non-finite custom amount.
        if (!Number.isFinite(count) || count <= 0) return;
        await WorldTimeWidget.#advance(advanceSeconds(count, unit));
    }
}
