/**
 * Solenne Campaign — Event Tracker
 *
 * GM-only event dependency dashboard that tracks which narrative hooks
 * have been resolved, computes which are now available, and displays
 * blocking reasons for locked events.
 *
 * Usage: Create a macro with `game.wh40k.EventTracker.open()`
 *
 * State is stored in a world setting (persists across sessions).
 * Only the GM can see or interact with the tracker.
 */

import { SYSTEM_ID } from '../constants.ts';

interface EventDef {
    id: string;
    name: string;
    location?: string;
    requires?: string[];
    requires_any?: string[];
    excuse?: string;
    is_day_end?: boolean;
    branch?: string;
    source_name?: string;
    source_file?: string;
}

interface ResolvedState {
    [eventId: string]: { resolvedAt: string };
}

interface EventGraph {
    [eventId: string]: EventDef;
}

const SETTING_KEY = 'event-tracker-state';

export class EventTracker {
    static _graph: EventGraph | null = null;

    /**
     * Register the world setting for state persistence.
     * Call during system init.
     */
    static registerSettings(): void {
        // @ts-expect-error - argument type
        game.settings.register(SYSTEM_ID, SETTING_KEY, {
            name: 'Event Tracker State',
            hint: 'Stores which campaign events have been resolved.',
            scope: 'world',
            config: false,
            type: Object,
            default: {},
        });
    }

    /**
     * Load the event graph from the system's data directory.
     * Call during system ready.
     */
    static async loadGraph(): Promise<void> {
        try {
            const resp = await fetch(`systems/${SYSTEM_ID}/events.json`);
            if (!resp.ok) {
                console.warn('EventTracker: events.json not found — run export_events.py and copy to system folder');
                return;
            }
            const data = await resp.json();
            EventTracker._graph = data.events;
            console.log(`EventTracker: loaded ${Object.keys(data.events).length} events`);
        } catch (err) {
            console.error('EventTracker: failed to load events.json', err);
        }
    }

    /** Get resolved event IDs from world settings. */
    static getResolved(): ResolvedState {
        // @ts-expect-error - argument type
        return game.settings.get(SYSTEM_ID, SETTING_KEY) ?? {};
    }

    /** Mark an event as resolved (or unresolved). */
    static async setResolved(eventId: string, resolved = true): Promise<void> {
        const state = EventTracker.getResolved();
        if (resolved) {
            state[eventId] = { resolvedAt: new Date().toISOString() };
        } else {
            delete state[eventId];
        }
        // @ts-expect-error - argument type
        await game.settings.set(SYSTEM_ID, SETTING_KEY, state);
    }

    /** Check if an event's prerequisites are all met. */
    static isAvailable(eventId: string): boolean {
        const event = EventTracker._graph?.[eventId];
        if (!event) return false;
        const resolved = EventTracker.getResolved();

        const reqsMet = !event.requires?.length ||
            event.requires.every((id: string) => id in resolved);

        const reqsAnyMet = !event.requires_any?.length ||
            event.requires_any.some((id: string) => id in resolved);

        return reqsMet && reqsAnyMet;
    }

    /** Get the unmet prerequisites for a locked event. */
    static getBlockingReasons(eventId: string): string[] {
        const event = EventTracker._graph?.[eventId];
        if (!event) return [];
        const resolved = EventTracker.getResolved();
        const reasons: string[] = [];

        if (event.requires?.length) {
            const unmet = event.requires.filter((id: string) => !(id in resolved));
            for (const id of unmet) {
                const dep = EventTracker._graph?.[id];
                const depName = dep?.name ?? id;
                const depLoc = dep?.location ? ` (${dep.location})` : '';
                reasons.push(`Requires: ${depName}${depLoc}`);
            }
        }

        if (event.requires_any?.length) {
            const anyMet = event.requires_any.some((id: string) => id in resolved);
            if (!anyMet) {
                const options = event.requires_any.map((id: string) => {
                    const dep = EventTracker._graph?.[id];
                    const depName = dep?.name ?? id;
                    const depLoc = dep?.location ? ` (${dep.location})` : '';
                    return `${depName}${depLoc}`;
                });
                reasons.push(`Requires one of: ${options.join(' OR ')}`);
            }
        }

        return reasons;
    }

    /** Build HTML content for the tracker dialog. */
    static _buildContent(): string {
        const graph = EventTracker._graph;
        if (!graph) return '<p>Event graph not loaded. Check console.</p>';

        const resolved = EventTracker.getResolved();

        // Group events by source
        const groups: Record<string, (EventDef & { id: string })[]> = {};
        for (const [id, event] of Object.entries(graph)) {
            const src = event.source_name || event.source_file || 'Unknown';
            if (!groups[src]) groups[src] = [];
            groups[src].push({ id, ...event });
        }

        // Count stats
        const total = Object.keys(graph).length;
        const resolvedCount = Object.keys(resolved).length;
        const availableCount = Object.keys(graph).filter(id => !(id in resolved) && EventTracker.isAvailable(id)).length;

        let html = `<style>
            .evt-tracker { font-family: var(--font-primary); font-size: 13px; max-height: 70vh; overflow-y: auto; }
            .evt-stats { padding: 4px 0 8px; font-size: 12px; color: #aaa; border-bottom: 1px solid #444; margin-bottom: 8px; }
            .evt-group { margin-bottom: 12px; }
            .evt-group h3 { margin: 0 0 4px; font-size: 14px; border-bottom: 1px solid #666; padding-bottom: 2px; }
            .evt-row { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
            .evt-row.resolved { opacity: 0.5; }
            .evt-row.locked { color: #999; }
            .evt-row.available { color: #2d6; font-weight: bold; }
            .evt-name { flex: 1; }
            .evt-block { font-size: 11px; color: #c66; margin-left: 24px; font-style: italic; }
            .evt-excuse { font-size: 11px; color: #c96; margin-left: 24px; }
            .evt-loc { font-size: 11px; color: #888; }
            .evt-day-end { font-size: 10px; color: #68c; margin-left: 4px; }
        </style><div class="evt-tracker">`;

        html += `<div class="evt-stats">${resolvedCount}/${total} resolved &bull; ${availableCount} available now</div>`;

        for (const [groupName, events] of Object.entries(groups)) {
            html += `<div class="evt-group"><h3>${groupName}</h3>`;
            for (const evt of events) {
                const isResolved = evt.id in resolved;
                const isAvail = EventTracker.isAvailable(evt.id);
                const cls = isResolved ? 'resolved' : isAvail ? 'available' : 'locked';
                const checked = isResolved ? 'checked' : '';
                const disabled = !isResolved && !isAvail ? 'disabled' : '';

                html += `<div class="evt-row ${cls}">`;
                html += `<input type="checkbox" data-event-id="${evt.id}" ${checked} ${disabled}>`;
                html += `<span class="evt-name">${evt.name}</span>`;
                if (evt.location) html += `<span class="evt-loc">${evt.location}</span>`;
                if (evt.is_day_end) html += `<span class="evt-day-end">[DAY END]</span>`;
                html += `</div>`;

                // Show blocking reasons for locked events
                if (!isResolved && !isAvail) {
                    const reasons = EventTracker.getBlockingReasons(evt.id);
                    for (const reason of reasons) {
                        html += `<div class="evt-block">${reason}</div>`;
                    }
                    if (evt.excuse) {
                        html += `<div class="evt-excuse">Excuse: ${evt.excuse}</div>`;
                    }
                }
            }
            html += `</div>`;
        }
        html += `</div>`;
        return html;
    }

    /** Open the tracker dialog. GM only. */
    static open(): void {
        // @ts-expect-error - argument type
        if (!game.user.isGM) {
            // @ts-expect-error - argument type
            ui.notifications.warn('Event Tracker is GM-only.');
            return;
        }

        if (!EventTracker._graph) {
            // @ts-expect-error - argument type
            ui.notifications.warn('Event graph not loaded. Ensure events.json is in the system folder.');
            return;
        }

        const d = new Dialog({
            title: 'Solenne Campaign — Event Tracker',
            content: EventTracker._buildContent(),
            buttons: {
                close: { label: 'Close' },
            },
            render: (html: any) => {
                const $html = html instanceof HTMLElement ? $(html) : html;
                const bindCheckboxes = () => {
                    $html.find('input[type="checkbox"]').off('change').on('change', async (ev: any) => {
                        const id = ev.currentTarget.dataset.eventId;
                        const isChecked = ev.currentTarget.checked;
                        await EventTracker.setResolved(id, isChecked);
                        // Re-render content
                        $html.closest('.dialog').find('.dialog-content').html(EventTracker._buildContent());
                        bindCheckboxes();
                    });
                };
                bindCheckboxes();
            },
            default: 'close',
        });
        d.options.width = 650;
        d.options.height = 750;
        d.options.resizable = true;
        d.render(true);
    }
}
