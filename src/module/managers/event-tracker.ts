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

interface DispositionEntry {
    target: string; // "party" or a character name
    attitude: string;
    default?: boolean;
    trigger?: string;
    note?: string;
}

interface RelationshipInfluence {
    event: string;
    to: string;
    note?: string;
}

interface RelationshipEntry {
    target: string;
    type: string;
    state: string;
    summary?: string;
    is_private?: boolean;
    influences?: RelationshipInfluence[];
}

interface CharacterState {
    dispositions?: DispositionEntry[];
    relationships?: RelationshipEntry[];
    source_file?: string;
}

const SETTING_KEY = 'event-tracker-state';

export class EventTracker {
    static _graph: EventGraph | null = null;
    static _characters: Record<string, CharacterState> | null = null;
    static _dataVersion = 1;

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
            EventTracker._dataVersion = data.version ?? 1;
            EventTracker._characters = data.characters ?? null;
            const charCount = EventTracker._characters ? Object.keys(EventTracker._characters).length : 0;
            console.log(
                `EventTracker: loaded ${Object.keys(data.events).length} events` +
                    (charCount ? `, ${charCount} characters with disposition/relationship data` : '') +
                    ` (schema v${EventTracker._dataVersion})`,
            );
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

        const reqsMet = !event.requires?.length || event.requires.every((id: string) => id in resolved);

        const reqsAnyMet = !event.requires_any?.length || event.requires_any.some((id: string) => id in resolved);

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

    /**
     * Compute the current disposition/relationship state for every character
     * whose data was loaded from events.json, by walking dispositions[] and
     * relationships[].influences[] against the currently-resolved events.
     *
     * For dispositions: returns the triggered entry whose `trigger` event is
     * resolved; falls back to the `default: true` entry; falls back to the
     * first entry. Grouped by target (party vs per-PC).
     *
     * For relationships: walks influences[] in array order, taking the `to`
     * of the last entry whose `event` is resolved; falls back to the
     * declared `state`.
     */
    static computeCharacterStates(): Record<
        string,
        {
            dispositions: Record<string, DispositionEntry>;
            relationships: Array<{ target: string; type: string; currentState: string; summary?: string; trigger?: string }>;
        }
    > {
        const out: Record<
            string,
            {
                dispositions: Record<string, DispositionEntry>;
                relationships: Array<{ target: string; type: string; currentState: string; summary?: string; trigger?: string }>;
            }
        > = {};

        const characters = EventTracker._characters;
        if (!characters) return out;
        const resolved = EventTracker.getResolved();

        for (const [name, data] of Object.entries(characters)) {
            const entry: {
                dispositions: Record<string, DispositionEntry>;
                relationships: Array<{ target: string; type: string; currentState: string; summary?: string; trigger?: string }>;
            } = { dispositions: {}, relationships: [] };

            // Dispositions: pick per target, prefer triggered → default → first
            const byTarget: Record<string, DispositionEntry[]> = {};
            for (const d of data.dispositions ?? []) {
                const t = d.target || 'party';
                (byTarget[t] ??= []).push(d);
            }
            for (const [target, entries] of Object.entries(byTarget)) {
                const triggered = entries.find((e) => e.trigger && e.trigger in resolved);
                const fallback = entries.find((e) => e.default) ?? entries[0];
                entry.dispositions[target] = triggered ?? fallback;
            }

            // Relationships: walk influences[] in order; last-resolved wins
            for (const r of data.relationships ?? []) {
                let currentState = r.state;
                let lastTrigger: string | undefined;
                for (const inf of r.influences ?? []) {
                    if (inf.event in resolved) {
                        currentState = inf.to;
                        lastTrigger = inf.event;
                    }
                }
                entry.relationships.push({
                    target: r.target,
                    type: r.type,
                    currentState,
                    summary: r.summary,
                    trigger: lastTrigger,
                });
            }
            out[name] = entry;
        }
        return out;
    }

    /**
     * CSS color mapping for disposition/state badges.
     * Matches the palette used elsewhere in the system for semantic clarity.
     */
    static _stateColor(state: string): string {
        const colors: Record<string, string> = {
            'ally': '#2d6',
            'friendly': '#2d6',
            'helpful': '#2d6',
            'neutral': '#888',
            'cautious-neutral': '#aa8',
            'wary': '#c96',
            'rival': '#c96',
            'enemy': '#c66',
            'hostile': '#c66',
            'enraged': '#c44',
            'missing': '#68c',
        };
        return colors[state] ?? '#888';
    }

    /** Build the events pane HTML (the original, unchanged content). */
    static _buildEventsPane(): string {
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
        const availableCount = Object.keys(graph).filter((id) => !(id in resolved) && EventTracker.isAvailable(id)).length;

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

    /** Build the NPC State pane HTML (dispositions + relationships). */
    static _buildNPCStatePane(): string {
        const states = EventTracker.computeCharacterStates();
        const names = Object.keys(states).sort((a, b) => a.localeCompare(b));
        if (!names.length) {
            return `<div class="evt-tracker"><p style="color:#888;">No character dispositions or relationships loaded. Backfill <code>dispositions</code> / <code>relationships</code> frontmatter on character files and re-run <code>export_events.py</code>.</p></div>`;
        }

        let html = `<div class="evt-tracker evt-npc-state">`;
        html += `<div class="evt-stats">${names.length} NPC(s) with disposition/relationship data &bull; state recomputed from resolved events</div>`;

        for (const name of names) {
            const s = states[name];
            html += `<div class="evt-group evt-npc-group">`;
            html += `<h3>${name}</h3>`;

            // Dispositions section
            const dispTargets = Object.keys(s.dispositions);
            if (dispTargets.length) {
                html += `<div class="evt-npc-disp">`;
                for (const target of dispTargets.sort((a, b) => (a === 'party' ? -1 : b === 'party' ? 1 : a.localeCompare(b)))) {
                    const d = s.dispositions[target];
                    const color = EventTracker._stateColor(d.attitude);
                    const badge = `<span class="evt-badge" style="background:${color};">${d.attitude || 'unknown'}</span>`;
                    const targetLabel = target === 'party' ? '<strong>Party</strong>' : target;
                    const triggered = d.trigger ? ` <span class="evt-trigger">(via ${EventTracker._graph?.[d.trigger]?.name ?? d.trigger})</span>` : '';
                    html += `<div class="evt-row"><span class="evt-npc-target">${targetLabel}</span> ${badge}${triggered}`;
                    if (d.note) html += `<div class="evt-npc-note">${d.note}</div>`;
                    html += `</div>`;
                }
                html += `</div>`;
            }

            // Relationships section
            if (s.relationships.length) {
                html += `<div class="evt-npc-rel">`;
                for (const r of s.relationships) {
                    const color = EventTracker._stateColor(r.currentState);
                    const badge = `<span class="evt-badge" style="background:${color};">${r.currentState}</span>`;
                    const triggered = r.trigger ? ` <span class="evt-trigger">(via ${EventTracker._graph?.[r.trigger]?.name ?? r.trigger})</span>` : '';
                    html += `<div class="evt-row"><span class="evt-npc-target">${r.target}</span> <span class="evt-npc-type">${r.type}</span> ${badge}${triggered}`;
                    if (r.summary) html += `<div class="evt-npc-note">${r.summary}</div>`;
                    html += `</div>`;
                }
                html += `</div>`;
            }

            html += `</div>`;
        }
        html += `</div>`;
        return html;
    }

    /**
     * Build the dialog body: a two-tab container (Events / NPC State) with
     * the tab selector at the top. Selected tab is determined by a dataset
     * attribute; the open() handler re-renders on change.
     */
    static _buildContent(activeTab: 'events' | 'npcs' = 'events'): string {
        const eventsClass = activeTab === 'events' ? 'active' : '';
        const npcsClass = activeTab === 'npcs' ? 'active' : '';
        const hasCharacters = !!EventTracker._characters && Object.keys(EventTracker._characters).length > 0;

        let html = `<style>
            .evt-tracker { font-family: var(--font-primary); font-size: 13px; max-height: 70vh; overflow-y: auto; }
            .evt-tabs { display: flex; gap: 4px; border-bottom: 1px solid #444; margin-bottom: 8px; }
            .evt-tab-btn { background: transparent; border: none; color: #aaa; padding: 6px 14px; cursor: pointer; font-size: 13px; border-bottom: 2px solid transparent; }
            .evt-tab-btn.active { color: #fff; border-bottom-color: #2d6; font-weight: bold; }
            .evt-tab-btn:hover { color: #fff; }
            .evt-tab-pane { display: none; }
            .evt-tab-pane.active { display: block; }
            .evt-stats { padding: 4px 0 8px; font-size: 12px; color: #aaa; border-bottom: 1px solid #444; margin-bottom: 8px; }
            .evt-group { margin-bottom: 12px; }
            .evt-group h3 { margin: 0 0 4px; font-size: 14px; border-bottom: 1px solid #666; padding-bottom: 2px; }
            .evt-row { display: flex; align-items: center; gap: 6px; padding: 2px 0; flex-wrap: wrap; }
            .evt-row.resolved { opacity: 0.5; }
            .evt-row.locked { color: #999; }
            .evt-row.available { color: #2d6; font-weight: bold; }
            .evt-name { flex: 1; }
            .evt-block { font-size: 11px; color: #c66; margin-left: 24px; font-style: italic; }
            .evt-excuse { font-size: 11px; color: #c96; margin-left: 24px; }
            .evt-loc { font-size: 11px; color: #888; }
            .evt-day-end { font-size: 10px; color: #68c; margin-left: 4px; }
            .evt-npc-disp, .evt-npc-rel { padding: 2px 0; }
            .evt-npc-target { min-width: 160px; display: inline-block; }
            .evt-npc-type { color: #aaa; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
            .evt-badge { color: #000; background: #888; padding: 1px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; }
            .evt-trigger { color: #68c; font-size: 11px; }
            .evt-npc-note { font-size: 11px; color: #bbb; margin-left: 20px; font-style: italic; flex-basis: 100%; }
        </style>`;
        html += `<div class="evt-tabs">`;
        html += `<button type="button" class="evt-tab-btn ${eventsClass}" data-tab="events">Events</button>`;
        if (hasCharacters) {
            html += `<button type="button" class="evt-tab-btn ${npcsClass}" data-tab="npcs">NPC State</button>`;
        }
        html += `</div>`;
        html += `<div class="evt-tab-pane ${eventsClass}" data-pane="events">${EventTracker._buildEventsPane()}</div>`;
        if (hasCharacters) {
            html += `<div class="evt-tab-pane ${npcsClass}" data-pane="npcs">${EventTracker._buildNPCStatePane()}</div>`;
        }
        return html;
    }

    /** Open the tracker dialog. GM only. */
    static open(): void {
        if (!game.user.isGM) {
            ui.notifications.warn('Event Tracker is GM-only.');
            return;
        }

        if (!EventTracker._graph) {
            // @ts-expect-error - argument type
            ui.notifications.warn('Event graph not loaded. Ensure events.json is in the system folder.');
            return;
        }

        // Track the active tab across re-renders so toggling a checkbox
        // doesn't throw the GM back to the Events pane.
        let activeTab: 'events' | 'npcs' = 'events';

        const d = new Dialog({
            title: 'Solenne Campaign — Event Tracker',
            content: EventTracker._buildContent(activeTab),
            buttons: {
                close: { label: 'Close' },
            },
            render: (html: any) => {
                const $html = html instanceof HTMLElement ? $(html) : html;
                const rebind = () => {
                    // Event checkboxes
                    $html
                        .find('input[type="checkbox"]')
                        .off('change')
                        .on('change', async (ev: any) => {
                            const id = ev.currentTarget.dataset.eventId;
                            const isChecked = ev.currentTarget.checked;
                            await EventTracker.setResolved(id, isChecked);
                            $html.closest('.dialog').find('.dialog-content').html(EventTracker._buildContent(activeTab));
                            rebind();
                        });
                    // Tab buttons
                    $html
                        .find('.evt-tab-btn')
                        .off('click')
                        .on('click', (ev: any) => {
                            const tab = ev.currentTarget.dataset.tab as 'events' | 'npcs';
                            if (!tab || tab === activeTab) return;
                            activeTab = tab;
                            $html.closest('.dialog').find('.dialog-content').html(EventTracker._buildContent(activeTab));
                            rebind();
                        });
                };
                rebind();
            },
            default: 'close',
        });
        d.options.width = 650;
        d.options.height = 750;
        d.options.resizable = true;
        d.render(true);
    }
}
