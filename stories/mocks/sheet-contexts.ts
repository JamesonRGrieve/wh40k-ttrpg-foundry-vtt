/**
 * @file Unified sheet-context factories.
 *
 * Stories and Vitest tests build the SAME sheet-context shape for character
 * sheets — `{ actor, system, source, tabs, headerFields, originPathSteps,
 * biography, journalEntries, ... }` — and previously did so via two parallel
 * in-file builders that drifted (e.g. one passed 1 origin step, the other 3).
 *
 * This module is the single source of truth. Both consumers import from here.
 *
 * Header fields are sourced from `SystemConfigRegistry.get(systemId).getHeaderFields(actor)`
 * so the factory matches runtime behavior — no hand-rolled defaults that go
 * stale when a system config adds, removes, or renames a row. Callers that need
 * a different shape (e.g. legacy Rank-as-number) can override via
 * `contextOverrides.headerFields`.
 *
 * Determinism: random IDs go through `randomId()` (seeded RNG from
 * `./extended.ts`). Call `seedRandom(seed)` from a story's `loaders` or a test's
 * `beforeEach` if you want pinned IDs.
 */

import type { GameSystemId, SidebarHeaderField } from '../../src/module/config/game-systems/types';
import type { WH40KBaseActor } from '../../src/module/documents/base-actor';
import { SystemConfigRegistry } from '../../src/module/config/game-systems';
import { mockActor, type MockActor, type MockItem } from './index';
import { randomId, withSystem, type SystemId } from './extended';

// ── Types ───────────────────────────────────────────────────────────────────

/** The mock actor accepts a deep-partial of MockActor; this matches mockActor's signature. */
export type MockActorInput = NonNullable<Parameters<typeof mockActor>[0]>;

/** A single tab descriptor passed to `tabs.hbs`. */
export interface SheetTab {
    tab: string;
    group: string;
    label: string;
    cssClass: string;
    active: boolean;
}

/** Active-tab descriptor passed to `tab` in a sheet context. */
export interface ActiveTabDescriptor {
    id: string;
    group: string;
    cssClass: string;
    active: boolean;
}

/** One bubble in the origin-path strip rendered in the sidebar header. */
export interface OriginPathStep {
    label: string;
    icon: string;
    item?: { _id: string; img: string; name: string } | null;
    tooltipData?: string;
}

/** Mock journal-entry summary row used by tab-biography.hbs. */
export interface MockJournalEntrySummary {
    id: string;
    name: string;
    system: { time: string; place: string; description: string };
}

/** The biography-tab payload. */
export interface SheetBiographyContext {
    source: { notes: string };
    enriched: { notes: string };
}

/**
 * The shape consumed by player and NPC sheet templates.
 *
 * Kept loose (extra-property-friendly) because per-system templates assert on
 * additional fields (horde, transactionProfile, threat tier, etc.).
 */
export interface SheetContextLike {
    actor: MockActor & { inCombat?: boolean } & Record<string, unknown>;
    system: MockActor['system'] & Record<string, unknown>;
    source: MockActor['system'] & Record<string, unknown>;
    editable: boolean;
    inEditMode: boolean;
    isGM: boolean;
    isNPC: boolean;
    biography: SheetBiographyContext;
    journalEntries: MockJournalEntrySummary[];
    tabs: SheetTab[];
    tab: ActiveTabDescriptor;
    headerFields: SidebarHeaderField[];
    originPathComplete: boolean;
    originPathSteps: OriginPathStep[];
    [key: string]: unknown;
}

/** Per-system `withSystem` accepts `'dh2'`/`'dh1'` etc., the registry uses `'dh2e'`/`'dh1e'`. */
const SYSTEM_ID_TO_WITH_SYSTEM: Record<GameSystemId, SystemId> = {
    rt: 'rt',
    dh1e: 'dh1',
    dh2e: 'dh2',
    bc: 'bc',
    ow: 'ow',
    dw: 'dw',
    im: 'im',
};

// ── i18n stub ───────────────────────────────────────────────────────────────

/**
 * `getHeaderFields()` calls `game.i18n.localize(...)` for some systems.
 * Stories run in Storybook (no Foundry runtime); tests run in vitest+happy-dom
 * (also no Foundry runtime). Install a passthrough stub once if `game.i18n` is
 * absent so factories can be called without surrounding `beforeAll` plumbing.
 *
 * Tests that already install their own `game` stub keep it — we only fill in
 * a missing surface, never overwrite.
 */
function ensureGameI18nStub(): void {
    const g = globalThis as Record<string, unknown>;
    const game = (g.game as Record<string, unknown> | undefined) ?? {};
    const i18n = (game.i18n as Record<string, unknown> | undefined) ?? undefined;
    if (i18n && typeof (i18n as { localize?: unknown }).localize === 'function') return;

    g.game = {
        ...game,
        i18n: {
            localize: (key: string) => key,
            format: (key: string, data?: Record<string, unknown>) => {
                if (!data) return key;
                return key.replace(/\{(\w+)\}/g, (_, name) => String(data[name] ?? ''));
            },
        },
    };
}

// ── Defaults ────────────────────────────────────────────────────────────────

/**
 * Default origin-path bubbles. Three steps so the sidebar grid layout is
 * exercised; the test fixture used to pass one, the story used to pass three —
 * the three-step shape is the visually richer default and renders correctly in
 * both contexts (no tests assert step count).
 */
function defaultOriginPathSteps(systemId: GameSystemId): OriginPathStep[] {
    const homeWorld = systemId === 'im' ? 'House Varonius' : 'Hive World';
    const background = systemId === 'im' ? 'Administratum' : 'Adeptus Administratum';
    const role = systemId === 'im' ? 'Savant' : 'Seeker';
    return [
        { label: 'Home World', icon: 'fa-globe', item: { _id: randomId('origin'), img: 'icons/svg/book.svg', name: homeWorld } },
        { label: 'Background', icon: 'fa-scroll', item: { _id: randomId('origin'), img: 'icons/svg/book.svg', name: background } },
        { label: 'Role', icon: 'fa-user-shield', item: { _id: randomId('origin'), img: 'icons/svg/book.svg', name: role } },
    ];
}

/** The five primary tabs visible on a player sheet. */
function defaultPlayerTabs(activeTab: string): SheetTab[] {
    return [
        { tab: 'skills', group: 'primary', label: 'Skills', cssClass: 'tab-skills', active: activeTab === 'skills' },
        { tab: 'combat', group: 'primary', label: 'Combat', cssClass: 'tab-combat', active: activeTab === 'combat' },
        { tab: 'equipment', group: 'primary', label: 'Equipment', cssClass: 'tab-equipment', active: activeTab === 'equipment' },
        { tab: 'biography', group: 'primary', label: 'Biography', cssClass: 'tab-biography', active: activeTab === 'biography' },
        { tab: 'npc', group: 'primary', label: 'NPC', cssClass: 'tab-npc', active: activeTab === 'npc' },
    ];
}

function defaultJournalEntries(): MockJournalEntrySummary[] {
    return [
        {
            id: 'journal-1',
            name: 'Interrogation Log',
            system: { time: 'M41.998', place: 'Scintilla', description: 'Details from the latest investigation.' },
        },
    ];
}

function defaultBiography(): SheetBiographyContext {
    return {
        source: { notes: '<p>Background notes.</p>' },
        enriched: { notes: '<p>Background notes.</p>' },
    };
}

/**
 * Per-system bio + originPath defaults so the actor presents consistent values
 * regardless of which system config consumes its `system.originPath`.
 */
function defaultSystemActorOverrides(systemId: GameSystemId): MockActorInput {
    const isIM = systemId === 'im';
    return {
        name: isIM ? 'Interrogator Hale' : 'Acolyte Vex',
        system: {
            bio: {
                playerName: 'Player One',
                age: '31',
                gender: 'Non-binary',
                description: '',
            },
            originPath: {
                homeWorld: isIM ? 'House Varonius' : 'Hive World',
                background: isIM ? 'Administratum' : 'Imperial Guard',
                role: isIM ? 'Savant' : 'Warrior',
                motivation: isIM ? 'Recover a lost ledger' : 'Duty',
                trialsAndTravails: '',
                career: 'Adept',
                divination: 'Trust in your fellow man, and put your faith in the Emperor.',
            },
        },
    };
}

// ── Player factory ──────────────────────────────────────────────────────────

export interface PlayerSheetContextOptions {
    /** Which game system to render for; default 'dh2e'. */
    systemId?: GameSystemId;
    /** Deep-merged on top of the system-aware default actor. */
    actorOverrides?: MockActorInput;
    /** Spread last over the assembled context — wins all collisions. */
    contextOverrides?: Partial<SheetContextLike>;
    /** Active tab key. Default 'biography'. */
    activeTab?: string;
}

/**
 * Build a player sheet context for `systemId`. Header fields are pulled from
 * `SystemConfigRegistry.get(systemId).getHeaderFields(actor)` so per-system
 * runtime behavior and story/test fixtures stay synchronized.
 */
export function mockPlayerSheetContext(opts: PlayerSheetContextOptions = {}): SheetContextLike {
    ensureGameI18nStub();
    const systemId: GameSystemId = opts.systemId ?? 'dh2e';
    const activeTab = opts.activeTab ?? 'biography';

    const baseOverrides = defaultSystemActorOverrides(systemId);
    const merged: MockActorInput = mergeActorInput(baseOverrides, opts.actorOverrides);
    const playerActor = mockActor({
        _id: `actor-${systemId}`,
        items: [],
        ...merged,
    });
    const actor = withSystem(playerActor, SYSTEM_ID_TO_WITH_SYSTEM[systemId], 'character');

    const headerFields = SystemConfigRegistry.get(systemId).getHeaderFields(actor as unknown as WH40KBaseActor);

    const context: SheetContextLike = {
        actor: actor as SheetContextLike['actor'],
        system: actor.system as SheetContextLike['system'],
        source: actor.system as SheetContextLike['source'],
        editable: true,
        inEditMode: false,
        isGM: true,
        isNPC: false,
        biography: defaultBiography(),
        journalEntries: defaultJournalEntries(),
        tabs: defaultPlayerTabs(activeTab),
        tab: { id: activeTab, group: 'primary', cssClass: `tab-${activeTab}`, active: true },
        headerFields,
        originPathComplete: true,
        originPathSteps: defaultOriginPathSteps(systemId),
        ...(opts.contextOverrides ?? {}),
    };
    return context;
}

// ── NPC factory ─────────────────────────────────────────────────────────────

export interface NpcSheetContextOptions {
    systemId?: GameSystemId;
    actorOverrides?: MockActorInput;
    contextOverrides?: Partial<SheetContextLike>;
    activeTab?: string;
}

const NPC_DEFAULT_HEADER_FIELDS: SidebarHeaderField[] = [
    {
        label: 'Threat',
        name: 'system.threatLevel',
        type: 'number',
        value: 7,
        min: 1,
        max: 30,
        icon: 'fa-solid fa-skull',
        rowClass: 'wh40k-threat-row',
        inputClass: 'wh40k-threat-input',
        borderColor: '#f97316',
        valueLabel: 'Major Threat',
        valueClass: 'wh40k-threat-tier',
        valueColor: '#f97316',
    },
    { label: 'Type', name: 'system.type', type: 'select', value: 'elite', options: { elite: 'Elite', troop: 'Troop' } },
    { label: 'Role', name: 'system.role', type: 'select', value: 'commander', options: { commander: 'Commander', bruiser: 'Bruiser' } },
    { label: 'Faction', name: 'system.faction', type: 'text', value: 'Imperium Nihilus Separatists', placeholder: 'Faction' },
];

const NPC_DEFAULT_HORDE = {
    enabled: true,
    magnitude: 18,
    magnitudeMax: 25,
    magnitudePercent: 72,
    damageMultiplier: 2,
    sizeModifier: 20,
    barClass: 'healthy',
    destroyed: false,
};

/**
 * Build an NPC sheet context. NPCs do not consume `getHeaderFields()` — their
 * sidebar shows threat / type / role / faction rows that aren't part of the
 * player-identity panel — so we use a fixed default and let callers override.
 */
export function mockNpcSheetContext(opts: NpcSheetContextOptions = {}): SheetContextLike {
    ensureGameI18nStub();
    const systemId: GameSystemId = opts.systemId ?? 'im';
    const activeTab = opts.activeTab ?? 'npc';

    const baseActor = {
        ...mockActor({
            _id: `npc-${systemId}`,
            name: 'Cult Demagogue',
            type: 'npc',
            ...(opts.actorOverrides ?? {}),
        }),
        inCombat: false,
    };
    const npcSystem = {
        ...baseActor.system,
        threatLevel: 7,
        threatTier: { label: 'Major Threat', color: '#f97316' },
        type: 'elite',
        role: 'commander',
        faction: 'Imperium Nihilus Separatists',
        subfaction: 'The Ragged Choir',
        allegiance: 'Chaos',
        source: 'IM Core p.214',
        quickNotes: '<p>Uses bodyguards aggressively.</p>',
        tactics: '<p>Opens with suppression and retreats to elevation.</p>',
    } as MockActor['system'] & Record<string, unknown>;
    baseActor.system = npcSystem;

    const actor = withSystem(baseActor as MockActor, SYSTEM_ID_TO_WITH_SYSTEM[systemId], 'npc');
    actor.system = npcSystem;

    const context: SheetContextLike = {
        actor: { ...actor, inCombat: false } as SheetContextLike['actor'],
        system: npcSystem,
        source: npcSystem,
        editable: true,
        inEditMode: false,
        isGM: true,
        isNPC: true,
        biography: { source: { notes: '' }, enriched: { notes: '' } },
        journalEntries: [],
        tabs: [{ tab: 'npc', group: 'primary', label: 'NPC', cssClass: 'tab-npc', active: activeTab === 'npc' }],
        tab: { id: activeTab, group: 'primary', cssClass: `tab-${activeTab}`, active: true },
        headerFields: NPC_DEFAULT_HEADER_FIELDS,
        originPathComplete: true,
        originPathSteps: defaultOriginPathSteps(systemId),
        horde: NPC_DEFAULT_HORDE,
        transactionProfile: { mode: 'barter' },
        tags: ['leader', 'chaos', 'ranged'],
        ...(opts.contextOverrides ?? {}),
    };
    return context;
}

// ── Vehicle / Starship stubs ────────────────────────────────────────────────

export interface VehicleSheetContextOptions {
    systemId?: GameSystemId;
    actorOverrides?: MockActorInput;
    contextOverrides?: Partial<SheetContextLike>;
}

/**
 * Vehicle sheet context. Currently shares the NPC-style chrome — vehicles
 * don't have a player identity panel, so the header fields are minimal.
 */
export function mockVehicleSheetContext(opts: VehicleSheetContextOptions = {}): SheetContextLike {
    ensureGameI18nStub();
    const systemId: GameSystemId = opts.systemId ?? 'dh2e';

    const baseActor = mockActor({
        _id: `vehicle-${systemId}`,
        name: 'Chimera APC',
        type: 'vehicle',
        ...(opts.actorOverrides ?? {}),
    });
    const actor = withSystem(baseActor, SYSTEM_ID_TO_WITH_SYSTEM[systemId], 'vehicle');

    const context: SheetContextLike = {
        actor: actor as SheetContextLike['actor'],
        system: actor.system as SheetContextLike['system'],
        source: actor.system as SheetContextLike['source'],
        editable: true,
        inEditMode: false,
        isGM: true,
        isNPC: false,
        biography: defaultBiography(),
        journalEntries: [],
        tabs: [
            { tab: 'overview', group: 'primary', label: 'Overview', cssClass: 'tab-overview', active: true },
            { tab: 'crew', group: 'primary', label: 'Crew', cssClass: 'tab-crew', active: false },
        ],
        tab: { id: 'overview', group: 'primary', cssClass: 'tab-overview', active: true },
        headerFields: [],
        originPathComplete: false,
        originPathSteps: [],
        ...(opts.contextOverrides ?? {}),
    };
    return context;
}

export interface StarshipSheetContextOptions {
    systemId?: GameSystemId;
    actorOverrides?: MockActorInput;
    contextOverrides?: Partial<SheetContextLike>;
}

/**
 * Starship sheet context (Rogue Trader). Same chrome shape as the vehicle
 * stub; the per-system divergence lives in the template.
 */
export function mockStarshipSheetContext(opts: StarshipSheetContextOptions = {}): SheetContextLike {
    ensureGameI18nStub();
    const systemId: GameSystemId = opts.systemId ?? 'rt';

    const baseActor = mockActor({
        _id: `starship-${systemId}`,
        name: 'Sword of Terra',
        type: 'starship',
        ...(opts.actorOverrides ?? {}),
    });
    // Starships piggyback on the vehicle role in withSystem (no dedicated kind yet).
    const actor = withSystem(baseActor, SYSTEM_ID_TO_WITH_SYSTEM[systemId], 'vehicle');

    const context: SheetContextLike = {
        actor: actor as SheetContextLike['actor'],
        system: actor.system as SheetContextLike['system'],
        source: actor.system as SheetContextLike['source'],
        editable: true,
        inEditMode: false,
        isGM: true,
        isNPC: false,
        biography: defaultBiography(),
        journalEntries: [],
        tabs: [
            { tab: 'bridge', group: 'primary', label: 'Bridge', cssClass: 'tab-bridge', active: true },
            { tab: 'components', group: 'primary', label: 'Components', cssClass: 'tab-components', active: false },
        ],
        tab: { id: 'bridge', group: 'primary', cssClass: 'tab-bridge', active: true },
        headerFields: [],
        originPathComplete: false,
        originPathSteps: [],
        ...(opts.contextOverrides ?? {}),
    };
    return context;
}

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Shallow merge of two `MockActorInput` shapes with a single level of nesting
 * preserved for `system.bio` and `system.originPath` so caller overrides don't
 * blow away unrelated keys.
 */
function mergeActorInput(base: MockActorInput, override?: MockActorInput): MockActorInput {
    if (!override) return base;
    const baseSystem = (base?.system ?? {}) as Record<string, unknown>;
    const overrideSystem = (override.system ?? {}) as Record<string, unknown>;
    const mergedSystem: Record<string, unknown> = { ...baseSystem };
    for (const [key, value] of Object.entries(overrideSystem)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            const baseVal = (baseSystem[key] ?? {}) as Record<string, unknown>;
            mergedSystem[key] = { ...baseVal, ...(value as Record<string, unknown>) };
        } else {
            mergedSystem[key] = value;
        }
    }
    return {
        ...base,
        ...override,
        system: mergedSystem as MockActorInput['system'],
    };
}

// Re-export utility types so consumers don't need a second import path.
export type { GameSystemId, SidebarHeaderField, MockActor, MockItem };
