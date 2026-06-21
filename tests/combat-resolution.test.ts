import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BasicActionManager } from '../src/module/actions/basic-action-manager.ts';
import type { TargetedActionManager } from '../src/module/actions/targeted-action-manager.ts';
import type { WH40KBaseActor } from '../src/module/documents/base-actor.ts';
import type { WeaponActionData as WeaponActionDataType } from '../src/module/rolls/action-data.ts';
import type { Hit as HitType } from '../src/module/rolls/damage-data.ts';
import type { RollData as RollDataType } from '../src/module/rolls/roll-data.ts';
import { seedRandom } from '../stories/mocks/extended.ts';
import { buildApplicationV2Api } from '../src/module/testing/app-v2-stub.ts';

/**
 * Runtime modules are loaded via dynamic `import()` *after* the Foundry globals
 * are stubbed (Vitest hoists static imports above the stubs, and these module
 * graphs read `foundry.applications.api` / extend `Actor` at evaluation time).
 * Type-only imports above are erased and do not trigger module evaluation.
 */
async function loadModules(): Promise<{
    DHBasicActionManager: BasicActionManager;
    DHTargetedActionManager: TargetedActionManager;
    WH40KBaseActor: typeof WH40KBaseActor;
    Hit: typeof HitType;
    WeaponActionData: typeof WeaponActionDataType;
    RollData: typeof RollDataType;
}> {
    const [basic, targeted, baseActor, damage, action, rollData] = await Promise.all([
        import('../src/module/actions/basic-action-manager.ts'),
        import('../src/module/actions/targeted-action-manager.ts'),
        import('../src/module/documents/base-actor.ts'),
        import('../src/module/rolls/damage-data.ts'),
        import('../src/module/rolls/action-data.ts'),
        import('../src/module/rolls/roll-data.ts'),
    ]);
    return {
        DHBasicActionManager: basic.DHBasicActionManager,
        DHTargetedActionManager: targeted.DHTargetedActionManager,
        WH40KBaseActor: baseActor.WH40KBaseActor,
        Hit: damage.Hit,
        WeaponActionData: action.WeaponActionData,
        RollData: rollData.RollData,
    };
}

/**
 * Combat resolution coverage for the four reported combat bugs:
 *   1. action dispatch (actor.rollWeaponAttack → rollItem)
 *   2. target resolution (TargetedActionManager reads game.user.targets)
 *   3. hit → auto-damage trigger (ActionData.maybeAutoRollDamage)
 *   4. modifier / formula breakdown assembly (RollData.activeModifiers etc.)
 *
 * The pure breakdown logic runs without any Foundry globals. The dispatch,
 * target-resolution, and auto-damage paths touch a small number of Foundry
 * globals (game.settings, game.user.targets, ui.notifications, Roll); those
 * are stubbed below with typed shapes (no `any`).
 */

/* -------------------------------------------- */
/*  Typed global stubs                          */
/* -------------------------------------------- */

interface TokenLike {
    actor: { name: string } | null;
}
interface SettingsStub {
    // eslint-disable-next-line no-restricted-syntax -- boundary: mirrors Foundry's game.settings.get, which is typed to return unknown
    get: (scope: string, key: string) => unknown;
}
interface TargetsStub {
    size: number;
    values: () => IterableIterator<TokenLike>;
}

/**
 * Minimal deterministic `Roll` stub. `RollData.calculateTotalModifiers` builds
 * a formula like `0 + @difficulty - @modifier` with a params bag; this stub
 * substitutes the params and evaluates the resulting signed integer arithmetic
 * (no dice in the modifier formula).
 */
class StubRoll {
    formula: string;
    total = 0;
    constructor(formula: string, params: Record<string, number> = {}) {
        this.formula = formula.replace(/@(\w+)/g, (_m, k: string) => String(params[k] ?? 0));
    }
    async evaluate(): Promise<this> {
        const tokens = this.formula.match(/[+-]?\s*\d+/g) ?? [];
        this.total = tokens.reduce((sum, tok) => sum + Number(tok.replace(/\s+/g, '')), 0);
        return Promise.resolve(this);
    }
    async render(): Promise<string> {
        return Promise.resolve('');
    }
}

function installFoundryGlobal(): void {
    const stubEnrichHTML = async (): Promise<string> => Promise.resolve('');
    const stubRenderTemplate = async (): Promise<string> => Promise.resolve('');
    vi.stubGlobal('foundry', {
        applications: {
            api: buildApplicationV2Api({ mixinShape: 'identity' }),
            handlebars: { renderTemplate: stubRenderTemplate },
            ux: { TextEditor: { implementation: { enrichHTML: stubEnrichHTML } } },
        },
        utils: { Collection: Map },
    });
    vi.stubGlobal('Roll', StubRoll);
    vi.stubGlobal('Hooks', { on: () => 0, once: () => 0, off: () => undefined, callAll: () => undefined });
    // `WH40KBaseActor extends Actor` needs a base class at module-eval time.
    class StubActor {}
    vi.stubGlobal('Actor', StubActor);
}

function installGlobals(opts: { settings?: Record<string, boolean>; targets?: TokenLike[] } = {}): { warnings: string[] } {
    installFoundryGlobal();
    const warnings: string[] = [];
    const settingsMap = opts.settings ?? {};
    const targetList = opts.targets ?? [];

    const gameStub = {
        // eslint-disable-next-line no-restricted-syntax -- boundary: mirrors Foundry's game.settings.get, which is typed to return unknown
        settings: { get: (_scope: string, key: string): unknown => settingsMap[key] } satisfies SettingsStub,
        user: {
            targets: {
                size: targetList.length,
                values: (): IterableIterator<TokenLike> => targetList[Symbol.iterator](),
            } satisfies TargetsStub,
        },
        wh40k: { log: (): void => undefined, error: (): void => undefined },
        canvas: { tokens: { controlled: [] as TokenLike[] } },
    };
    vi.stubGlobal('game', gameStub);
    vi.stubGlobal('ui', {
        notifications: {
            warn: (m: string): void => void warnings.push(m),
            info: (): void => undefined,
            error: (): void => undefined,
        },
    });
    return { warnings };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

/* -------------------------------------------- */
/*  4. Modifier / formula breakdown assembly    */
/* -------------------------------------------- */

describe('RollData modifier/formula breakdown (audit)', () => {
    beforeEach(() => installGlobals());

    it('activeModifiers surfaces every non-zero modifier with a labelled key, dropping zeros', async () => {
        const { RollData } = await loadModules();
        const rd = new RollData();
        rd.modifiers['difficulty'] = 10;
        rd.modifiers['aim'] = 0; // zero must be dropped from the audit list
        rd.modifiers['modifier'] = -20;
        rd.modifiers['target-size'] = 10;

        const active = rd.activeModifiers;
        expect(active['DIFFICULTY']).toBe(10);
        expect(active['MODIFIER']).toBe(-20);
        expect(active['TARGET-SIZE']).toBe(10);
        expect(active['AIM']).toBeUndefined();
    });

    it('modifiedTarget = baseTarget + clamped modifier total', async () => {
        const { RollData } = await loadModules();
        const rd = new RollData();
        rd.baseTarget = 40;
        rd.modifiers['difficulty'] = 10;
        rd.modifiers['modifier'] = -30;
        await rd.calculateTotalModifiers();
        // 10 + (-30) = -20, within the ±60 cap
        expect(rd.modifierTotal).toBe(-20);
        expect(rd.modifiedTarget).toBe(20);
    });

    it('modifiersToRollData builds an auditable signed formula with per-term params', async () => {
        const { RollData } = await loadModules();
        const rd = new RollData();
        rd.modifiers['difficulty'] = 10;
        rd.modifiers['modifier'] = -20;
        const { formula, params } = rd.modifiersToRollData();
        expect(formula).toContain('+ @difficulty');
        expect(formula).toContain('- @modifier');
        expect(params['difficulty']).toBe(10);
        expect(params['modifier']).toBe(20);
    });
});

/* -------------------------------------------- */
/*  3. Hit → auto-damage trigger                */
/* -------------------------------------------- */

describe('ActionData.maybeAutoRollDamage (hit → auto-damage)', () => {
    async function makeWeaponAction(success: boolean): Promise<{
        action: WeaponActionDataType;
        mods: Awaited<ReturnType<typeof loadModules>>;
    }> {
        const mods = await loadModules();
        const action = new mods.WeaponActionData();
        action.rollData.success = success;
        action.rollData.dos = success ? 3 : 0;
        return { action, mods };
    }

    it('auto-rolls damage on a hit when the setting is enabled', async () => {
        installGlobals({ settings: { 'auto-roll-damage': true } });
        const { action, mods } = await makeWeaponAction(true);
        const post = vi.spyOn(mods.DHBasicActionManager, '_postDamageCard').mockResolvedValue();
        const calc = vi.spyOn(action, 'calculateHits').mockResolvedValue();

        await action.maybeAutoRollDamage();

        expect(calc).toHaveBeenCalledTimes(1);
        expect(post).toHaveBeenCalledTimes(1);
    });

    it('does NOT auto-roll when the attack missed', async () => {
        installGlobals({ settings: { 'auto-roll-damage': true } });
        const { action, mods } = await makeWeaponAction(false);
        const post = vi.spyOn(mods.DHBasicActionManager, '_postDamageCard').mockResolvedValue();

        await action.maybeAutoRollDamage();

        expect(post).not.toHaveBeenCalled();
    });

    it('does NOT auto-roll when the setting is disabled (manual button path preserved)', async () => {
        installGlobals({ settings: { 'auto-roll-damage': false } });
        const { action, mods } = await makeWeaponAction(true);
        const post = vi.spyOn(mods.DHBasicActionManager, '_postDamageCard').mockResolvedValue();

        await action.maybeAutoRollDamage();

        expect(post).not.toHaveBeenCalled();
    });

    it('does NOT auto-roll for a target-only post (no roll entered yet)', async () => {
        installGlobals({ settings: { 'auto-roll-damage': true } });
        const { action, mods } = await makeWeaponAction(true);
        (action.rollData as RollDataType & { isTargetOnly?: boolean }).isTargetOnly = true;
        const post = vi.spyOn(mods.DHBasicActionManager, '_postDamageCard').mockResolvedValue();

        await action.maybeAutoRollDamage();

        expect(post).not.toHaveBeenCalled();
    });

    it('is idempotent: does not re-calculate hits that already exist (no double-roll)', async () => {
        installGlobals({ settings: { 'auto-roll-damage': true } });
        const { action, mods } = await makeWeaponAction(true);
        action.damageData.hits.push(new mods.Hit());
        vi.spyOn(mods.DHBasicActionManager, '_postDamageCard').mockResolvedValue();
        const calc = vi.spyOn(action, 'calculateHits').mockResolvedValue();

        await action.maybeAutoRollDamage();

        expect(calc).not.toHaveBeenCalled();
    });

    it('propagates the attack DoS onto each hit so the damage card can offer DoS replacement', async () => {
        installGlobals({ settings: { 'auto-roll-damage': true } });
        const { action, mods } = await makeWeaponAction(true);
        const hit = new mods.Hit();
        action.damageData.hits.push(hit);
        vi.spyOn(mods.DHBasicActionManager, '_postDamageCard').mockResolvedValue();

        await action.maybeAutoRollDamage();

        expect(hit.dos).toBe(3);
    });
});

/* -------------------------------------------- */
/*  2. Target resolution                        */
/* -------------------------------------------- */

describe('TargetedActionManager.getTargetToken (Foundry targeting)', () => {
    it('resolves the single targeted token from game.user.targets', async () => {
        const token: TokenLike = { actor: { name: 'Heretic' } };
        installGlobals({ targets: [token] });
        const { DHTargetedActionManager } = await loadModules();
        const resolved = DHTargetedActionManager.getTargetToken();
        expect(resolved).toBe(token);
    });

    it('returns undefined with no target (graceful zero-target handling)', async () => {
        installGlobals({ targets: [] });
        const { DHTargetedActionManager } = await loadModules();
        expect(DHTargetedActionManager.getTargetToken()).toBeUndefined();
    });

    it('warns and bails on multiple targets (graceful multi-target handling)', async () => {
        const t1: TokenLike = { actor: { name: 'A' } };
        const t2: TokenLike = { actor: { name: 'B' } };
        const { warnings } = installGlobals({ targets: [t1, t2] });
        const { DHTargetedActionManager } = await loadModules();
        expect(DHTargetedActionManager.getTargetToken()).toBeUndefined();
        expect(warnings.length).toBeGreaterThan(0);
    });
});

/* -------------------------------------------- */
/*  1. Action dispatch                          */
/* -------------------------------------------- */

describe('actor.rollWeaponAttack dispatch', () => {
    beforeEach(() => installGlobals());

    it('routes rollWeaponAttack(weaponId) through rollItem(weaponId)', async () => {
        const { WH40KBaseActor } = await loadModules();
        const calls: string[] = [];
        // Structural stand-in exercising only the two methods on the chain.
        const actor: { rollItem: (id: string) => Promise<void>; rollWeaponAttack: WH40KBaseActor['rollWeaponAttack'] } = {
            rollItem: async (id: string): Promise<void> => {
                calls.push(id);
                return Promise.resolve();
            },
            // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: invoke the real prototype method with a structural `this` to assert it delegates to rollItem
            rollWeaponAttack: WH40KBaseActor.prototype.rollWeaponAttack,
        };
        await actor.rollWeaponAttack('weapon-123', { rateOfFire: 'single' });
        expect(calls).toEqual(['weapon-123']);
    });
});

/* -------------------------------------------- */
/*  Determinism note                            */
/* -------------------------------------------- */

describe('seeded RNG determinism', () => {
    it('seedRandom produces a repeatable stream for deterministic assertions', () => {
        const a = seedRandom(1234);
        const b = seedRandom(1234);
        expect(a()).toBe(b());
        expect(a()).toBe(b());
    });
});
