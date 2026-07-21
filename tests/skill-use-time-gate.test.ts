/**
 * RAW per-target time gates (#458), enforced at ROLL RESOLUTION (#432).
 *
 * The gate check used to run in `WH40KAcolyte._rollTargetedSkillUse`, BEFORE the roll
 * dialog opened. That placement is unsound once the dialog carries its own target
 * selector: the player could satisfy the pre-dialog check against an eligible patient,
 * retarget in-dialog to a cooldown-locked one, and have the effect applied anyway.
 *
 * These tests pin the enforcement where it now lives — inside the ActionData
 * `descriptionText()` resolution, against the FINAL `rollData.targetActor` — and assert
 * the abort semantics: nothing is applied, nothing is stamped, and the player is told
 * why (a notification AND a chat-card effect).
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApplicationV2Api, type ApplicationV2Api } from '../src/module/testing/app-v2-stub.ts';

/* -------------------------------------------- */
/*  Foundry global stubs                         */
/* -------------------------------------------- */

interface FoundryStub {
    applications: { api: ApplicationV2Api; handlebars: { renderTemplate: () => Promise<string> } };
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's foundry.utils.Collection extends Map with framework-defined key/value types.
    utils: { Collection: new () => Map<unknown, unknown> };
}
interface GameStub {
    i18n: { localize: (key: string) => string; format: (key: string, data?: Record<string, string>) => string };
    time: { worldTime: number };
    user: { id: string };
    settings: { get: () => boolean };
    wh40k: { log: () => void; error: () => void };
}
interface UiStub {
    notifications: { warn: (message: string) => void; info: (message: string) => void; error: (message: string) => void };
}
interface FoundryStubs {
    foundry?: FoundryStub | undefined;
    game?: GameStub | undefined;
    ui?: UiStub | undefined;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's Actor constructor takes an open source data object per the framework.
    Actor?: (new (data?: Record<string, unknown>) => object) | undefined;
    Roll?: (new (formula: string) => { evaluate: () => Promise<void>; total: number }) | undefined;
    CONST?: { TOKEN_DISPLAY_MODES: { OWNER_HOVER: number }; TOKEN_DISPOSITIONS: { NEUTRAL: number; HOSTILE: number } } | undefined;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: bridging globalThis to the stub shape; `declare global` cannot augment globalThis from a test file without leaking into global scope.
const stubs = globalThis as unknown as FoundryStubs;

const ORIGINAL = { foundry: stubs.foundry, game: stubs.game, ui: stubs.ui, Actor: stubs.Actor, Roll: stubs.Roll, CONST: stubs.CONST };

/** Warnings raised through `ui.notifications.warn` during the current test. */
const warnings: string[] = [];

class FakeActor {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's Actor.system is the per-type DataModel slot; this stub never reads it.
    declare system: unknown;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's Actor constructor accepts an open source data object per the framework.
    constructor(public _data: Record<string, unknown> = {}) {
        Object.assign(this, _data);
    }
}

/** Deterministic 1d5 stand-in for the Interrogation lockout roll (always 3 days). */
const LOCKOUT_ROLL_TOTAL = 3;

stubs.foundry = {
    applications: { api: buildApplicationV2Api(), handlebars: { renderTemplate: async (): Promise<string> => Promise.resolve('') } },
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's foundry.utils.Collection extends Map with arbitrary key/value types per the framework type.
    utils: { Collection: class FakeCollection extends Map<unknown, unknown> {} },
};
stubs.Actor = FakeActor;
stubs.Roll = class FakeRoll {
    total = LOCKOUT_ROLL_TOTAL;
    constructor(public formula: string) {}
    async evaluate(): Promise<void> {
        return Promise.resolve();
    }
};
stubs.CONST = { TOKEN_DISPLAY_MODES: { OWNER_HOVER: 0 }, TOKEN_DISPOSITIONS: { NEUTRAL: 0, HOSTILE: -1 } };
stubs.ui = {
    notifications: {
        warn: (message: string): void => {
            warnings.push(message);
        },
        info: (): void => {
            /* noop */
        },
        error: (): void => {
            /* noop */
        },
    },
};
stubs.game = {
    i18n: {
        // Format echoes the key plus its interpolations so assertions can see both.
        localize: (key: string): string => key,
        format: (key: string, data?: Record<string, string>): string => `${key}|${JSON.stringify(data ?? {})}`,
    },
    time: { worldTime: 0 },
    user: { id: 'test' },
    settings: { get: (): boolean => false },
    wh40k: {
        log: (): void => {
            /* noop */
        },
        error: (): void => {
            /* noop */
        },
    },
};

// Imports must come AFTER the stubs so module-init code finds the shims.
const { InterrogationActionData, MedicaeActionData } = await import('../src/module/rolls/action-data.ts');
const { DAY_SECONDS } = await import('../src/module/rules/world-time.ts');

afterAll(() => {
    Object.assign(stubs, ORIGINAL);
});

/* -------------------------------------------- */
/*  Test harness                                 */
/* -------------------------------------------- */

/** A patient/subject standing in for a real actor — only the surface the resolvers read. */
interface FakeTarget {
    name: string;
    wounds: { value: number; max: number; critical: number };
    characteristics: Record<string, { effectiveBonus: number }>;
    /** Per-key gate expiries, exactly as `WH40KBaseActor.getTimeGate` would return them. */
    gates: Record<string, number>;
    /** Every `actor.update(...)` payload applied — empty proves nothing was written. */
    updates: Record<string, number>[];
    /** Fatigue levels inflicted through `applyFatigue`. */
    fatigueApplied: number[];
    getTimeGate: (key: string) => number | null;
    setTimeGate: (key: string, expiry: number) => Promise<void>;
    update: (patch: Record<string, number>) => Promise<void>;
    applyFatigue: (levels: number) => Promise<void>;
}

function makeTarget(opts: { name?: string; wounds?: { value: number; max: number; critical: number }; gates?: Record<string, number> } = {}): FakeTarget {
    const target: FakeTarget = {
        name: opts.name ?? 'Patient',
        wounds: opts.wounds ?? { value: 4, max: 12, critical: 0 },
        characteristics: { toughness: { effectiveBonus: 3 } },
        gates: opts.gates ?? {},
        updates: [],
        fatigueApplied: [],
        getTimeGate: (key: string): number | null => target.gates[key] ?? null,
        setTimeGate: async (key: string, expiry: number): Promise<void> => {
            target.gates[key] = expiry;
            return Promise.resolve();
        },
        update: async (patch: Record<string, number>): Promise<void> => {
            target.updates.push(patch);
            return Promise.resolve();
        },
        applyFatigue: async (levels: number): Promise<void> => {
            target.fatigueApplied.push(levels);
            return Promise.resolve();
        },
    };
    return target;
}

/** The resolved-roll slots the Medicae / Interrogation resolvers read off `rollData`. */
interface ResolvedRollData {
    targetActor: FakeTarget;
    sourceActor: { name: string };
    success: boolean;
    dos: number;
    dof: number;
}

/** Either resolution-time action under test — both extend `SimpleSkillData`. */
type GatedAction = InstanceType<typeof MedicaeActionData> | InstanceType<typeof InterrogationActionData>;

/** Bind a resolved roll outcome + final target onto an action, mirroring the live pipeline. */
function bind(action: GatedAction, target: FakeTarget, outcome: { success: boolean; dos?: number; dof?: number }): void {
    // eslint-disable-next-line no-restricted-syntax -- boundary: RollData#targetActor is typed as the real WH40KBaseActor document; the fixture satisfies only the surface the resolvers read
    const rollData = action.rollData as unknown as ResolvedRollData;
    rollData.targetActor = target;
    rollData.sourceActor = { name: 'Medic' };
    rollData.success = outcome.success;
    rollData.dos = outcome.dos ?? 0;
    rollData.dof = outcome.dof ?? 0;
}

/** The chat-card effect text an action wrote, joined for substring assertions. */
function cardText(action: GatedAction): string {
    return action.effectOutput.map((e) => e.effect).join(' ');
}

beforeEach(() => {
    warnings.length = 0;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- the stub is installed at module scope above; it is always present here
    stubs.game!.time.worldTime = 0;
});

/* -------------------------------------------- */
/*  Medicae (#432/#458)                          */
/* -------------------------------------------- */

describe('MedicaeActionData — resolution-time time gate (#458)', () => {
    it('heals and stamps the 24h gate when the patient is not on cooldown', async () => {
        const action = new MedicaeActionData('firstAid');
        const target = makeTarget();
        bind(action, target, { success: true, dos: 1 });

        await action.descriptionText();

        expect(target.updates).toHaveLength(1);
        expect(target.updates[0]).toEqual({ 'system.wounds.value': 5 });
        expect(target.gates['firstAid']).toBe(DAY_SECONDS);
        expect(warnings).toHaveLength(0);
    });

    it('applies NOTHING and warns when the patient is still inside their First Aid cooldown', async () => {
        const action = new MedicaeActionData('firstAid');
        const target = makeTarget({ gates: { firstAid: DAY_SECONDS } });
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- stub installed at module scope
        stubs.game!.time.worldTime = 6 * 3600; // 18 hours still to run
        bind(action, target, { success: true, dos: 3 });

        await action.descriptionText();

        expect(target.updates).toEqual([]);
        expect(target.wounds.value).toBe(4);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('WH40K.SkillUse.GateCooldown');
        expect(warnings[0]).toContain('18h');
        // The abort is also on the card, not just a transient toast.
        expect(cardText(action)).toContain('WH40K.SkillUse.GateCooldown');
    });

    it('does not RE-stamp the gate when it aborts (the cooldown never self-extends)', async () => {
        const action = new MedicaeActionData('firstAid');
        const target = makeTarget({ gates: { firstAid: DAY_SECONDS } });
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- stub installed at module scope
        stubs.game!.time.worldTime = 6 * 3600;
        bind(action, target, { success: true, dos: 1 });

        await action.descriptionText();

        expect(target.gates['firstAid']).toBe(DAY_SECONDS);
    });

    it('blocks First Aid through an open Extended Care window with the exclusion message (DH2 p109)', async () => {
        const action = new MedicaeActionData('firstAid');
        const target = makeTarget({ gates: { extendedCare: DAY_SECONDS } });
        bind(action, target, { success: true, dos: 1 });

        await action.descriptionText();

        expect(target.updates).toEqual([]);
        expect(warnings[0]).toContain('WH40K.SkillUse.GateExtendedCare');
    });

    it('reopens the moment in-universe time reaches the expiry', async () => {
        const action = new MedicaeActionData('firstAid');
        const target = makeTarget({ gates: { firstAid: DAY_SECONDS } });
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- stub installed at module scope
        stubs.game!.time.worldTime = DAY_SECONDS;
        bind(action, target, { success: true, dos: 1 });

        await action.descriptionText();

        expect(target.updates).toHaveLength(1);
        expect(warnings).toHaveLength(0);
        expect(target.gates['firstAid']).toBe(2 * DAY_SECONDS);
    });

    it('isolates the gate per patient — a locked patient never blocks a fresh one', async () => {
        const locked = makeTarget({ name: 'Locked', gates: { firstAid: DAY_SECONDS } });
        const fresh = makeTarget({ name: 'Fresh' });

        const blocked = new MedicaeActionData('firstAid');
        bind(blocked, locked, { success: true, dos: 1 });
        await blocked.descriptionText();

        const allowed = new MedicaeActionData('firstAid');
        bind(allowed, fresh, { success: true, dos: 1 });
        await allowed.descriptionText();

        expect(locked.updates).toEqual([]);
        expect(fresh.updates).toHaveLength(1);
    });

    it('leaves ungated uses (Surgery) unaffected by a First Aid cooldown on the same patient', async () => {
        const action = new MedicaeActionData('surgery');
        const target = makeTarget({ wounds: { value: 4, max: 12, critical: 2 }, gates: { firstAid: DAY_SECONDS } });
        bind(action, target, { success: true, dos: 1 });

        await action.descriptionText();

        expect(target.updates).toEqual([{ 'system.wounds.critical': 1 }]);
        expect(warnings).toHaveLength(0);
    });
});

/* -------------------------------------------- */
/*  Interrogation (#435/#458)                    */
/* -------------------------------------------- */

describe('InterrogationActionData — resolution-time time gate (#458)', () => {
    it('interrogates normally when the subject carries no lockout', async () => {
        const action = new InterrogationActionData();
        const target = makeTarget({ name: 'Subject' });
        bind(action, target, { success: true, dos: 2 });

        await action.descriptionText();

        expect(target.fatigueApplied).toEqual([1]);
        expect(warnings).toHaveLength(0);
    });

    it('inflicts NO fatigue and extracts nothing while the subject is locked out', async () => {
        const action = new InterrogationActionData();
        const target = makeTarget({ name: 'Subject', gates: { interrogate: 3 * DAY_SECONDS } });
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- stub installed at module scope
        stubs.game!.time.worldTime = DAY_SECONDS; // two days still to run
        bind(action, target, { success: true, dos: 4 });

        await action.descriptionText();

        expect(target.fatigueApplied).toEqual([]);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('WH40K.SkillUse.GateCooldown');
        expect(warnings[0]).toContain('2d');
        expect(cardText(action)).toContain('WH40K.SkillUse.GateCooldown');
    });

    it('stamps the rolled 1d5-day lockout on a 2+ degree failure', async () => {
        const action = new InterrogationActionData();
        const target = makeTarget({ name: 'Subject' });
        bind(action, target, { success: false, dof: 2 });

        await action.descriptionText();

        expect(target.gates['interrogate']).toBe(LOCKOUT_ROLL_TOTAL * DAY_SECONDS);
        expect(target.fatigueApplied).toEqual([1]);
    });

    it('is not blocked by an unrelated Medicae gate on the same subject', async () => {
        const action = new InterrogationActionData();
        const target = makeTarget({ name: 'Subject', gates: { firstAid: DAY_SECONDS } });
        bind(action, target, { success: true, dos: 1 });

        await action.descriptionText();

        expect(target.fatigueApplied).toEqual([1]);
        expect(warnings).toHaveLength(0);
    });
});
