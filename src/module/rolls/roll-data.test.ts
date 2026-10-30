import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildConditionCatalog, setConditionCatalog } from '../rules/condition-registry.ts';
import { TARGET_CONDITION_BUCKET } from '../rules/targeted-conditions.ts';
import { conditionPackFixture } from '../testing/condition-catalog.ts';
import { readRepoFile } from '../testing/repo-file.ts';
import { buildModifierComponents, clampModifierToCap, collectTargetConditionRows, RollData, ROLL_MODIFIER_CAP, WeaponRollData } from './roll-data';

/**
 * Regression tests for the ±60 modifier cap (DH2 rules).
 * The clamp is consumed by `RollData.calculateTotalModifiers` and the
 * resulting `rawModifierTotal` / `modifierCapFired` fields are
 * surfaced on chat cards so the GM can see when the cap fired.
 */
describe('clampModifierToCap (#127)', () => {
    it('exports the canonical cap value', () => {
        expect(ROLL_MODIFIER_CAP).toBe(60);
    });

    it('passes through values within the cap', () => {
        expect(clampModifierToCap(0)).toEqual({ clamped: 0, raw: 0, capFired: false });
        expect(clampModifierToCap(45)).toEqual({ clamped: 45, raw: 45, capFired: false });
        expect(clampModifierToCap(-45)).toEqual({ clamped: -45, raw: -45, capFired: false });
    });

    it('passes through boundary values (+60 and -60) without firing the cap', () => {
        expect(clampModifierToCap(60)).toEqual({ clamped: 60, raw: 60, capFired: false });
        expect(clampModifierToCap(-60)).toEqual({ clamped: -60, raw: -60, capFired: false });
    });

    it('clamps positive overflow to +60 and records the raw value', () => {
        expect(clampModifierToCap(61)).toEqual({ clamped: 60, raw: 61, capFired: true });
        expect(clampModifierToCap(100)).toEqual({ clamped: 60, raw: 100, capFired: true });
    });

    it('clamps negative overflow to -60 and records the raw value', () => {
        expect(clampModifierToCap(-61)).toEqual({ clamped: -60, raw: -61, capFired: true });
        expect(clampModifierToCap(-200)).toEqual({ clamped: -60, raw: -200, capFired: true });
    });

    it('treats non-finite inputs (NaN, Infinity, -Infinity) as zero', () => {
        expect(clampModifierToCap(Number.NaN)).toEqual({ clamped: 0, raw: 0, capFired: false });
        expect(clampModifierToCap(Number.POSITIVE_INFINITY)).toEqual({ clamped: 0, raw: 0, capFired: false });
        expect(clampModifierToCap(Number.NEGATIVE_INFINITY)).toEqual({ clamped: 0, raw: 0, capFired: false });
    });
});

describe('RollData.buildModifierSources — roll transparency provenance', () => {
    beforeEach(() => {
        vi.stubGlobal('game', { i18n: { localize: (k: string) => k } });
    });
    afterEach(() => vi.unstubAllGlobals());

    /** Build a RollData without the config-heavy constructor, then set the fields the method reads. */
    function makeRollData(modifiers: Record<string, number>, expandedBuckets: RollData['expandedBuckets'] = {}): RollData {
        // eslint-disable-next-line no-restricted-syntax -- test: bypass the WH40K-config constructor to unit-test one pure method
        const rd = Object.create(RollData.prototype) as RollData;
        rd.modifiers = modifiers;
        rd.expandedBuckets = expandedBuckets;
        rd.modifierSources = [];
        return rd;
    }

    it('expands lumped buckets into their sourced parts, skips zero, and labels named keys', () => {
        const rd = makeRollData(
            { 'difficulty': 10, 'situational': 30, 'aim': 0, 'range': -20, 'attack-special-x': 5 },
            {
                situational: [
                    { key: 'aim_act', label: 'Aim', value: 10, source: 'Aim action' },
                    { key: 'deadeye', label: 'Deadeye', value: 20, source: 'Deadeye Shot' },
                ],
            },
        );
        rd.buildModifierSources();

        const labels = rd.modifierSources.map((c) => c.label);
        // difficulty (named) + two situational sub-parts + range (named) + the unknown key title-cased; aim (0) skipped.
        expect(labels).toEqual(['WH40K.Roll.ModifierSource.Difficulty', 'Aim', 'Deadeye', 'WH40K.Roll.ModifierSource.Range', 'Attack Special X']);
    });

    it('components sum to the non-zero modifier total (the transparency invariant)', () => {
        const modifiers = { 'difficulty': 10, 'situational': 30, 'aim': 0, 'range': -20, 'attack-special-x': 5 };
        const rd = makeRollData(modifiers, {
            situational: [
                { key: 'a', label: 'Aim', value: 10, source: 'Aim action' },
                { key: 'b', label: 'Deadeye', value: 20, source: 'Deadeye Shot' },
            ],
        });
        rd.buildModifierSources();
        const componentSum = rd.modifierSources.reduce((acc, c) => acc + c.value, 0);
        const modifierSum = Object.values(modifiers).reduce((acc, v) => acc + v, 0);
        expect(componentSum).toBe(modifierSum);
        expect(componentSum).toBe(25);
    });

    it('attaches a wh40k-tooltip "modifier" payload to each component', () => {
        const rd = makeRollData({ range: -20 });
        rd.buildModifierSources();
        const range = rd.modifierSources.at(0);
        expect(range?.tooltipData).toBeDefined();
        // eslint-disable-next-line no-restricted-syntax -- test: JSON.parse returns unknown under ts-reset; the shape is asserted immediately below
        const parsed = JSON.parse(range?.tooltipData ?? '{}') as { title: string; sources: { name: string; value: number }[] };
        expect(parsed.title).toBe('WH40K.Roll.ModifierSource.Range');
        expect(parsed.sources).toEqual([{ name: 'WH40K.Roll.ModifierSource.Range', value: -20 }]);
    });

    it('does not mutate the dialog-supplied expandedBuckets components', () => {
        const situational = [{ key: 'a', label: 'Aim', value: 10, source: 'Aim action' }];
        const rd = makeRollData({ situational: 10 }, { situational });
        rd.buildModifierSources();
        // The stored expansion entry stays free of the tooltip payload (fresh objects are emitted).
        const first = situational.at(0);
        expect(first !== undefined && 'tooltipData' in first).toBe(false);
    });
});

/**
 * Path B target-condition collection on the weapon roll: the TARGET's condition
 * documents (`system.targeted`) become one `target-conditions` bucket whose
 * sourced parts the card expands — never a hand-ticked situational row.
 */
describe('WeaponRollData target-condition modifiers (Path B)', () => {
    beforeEach(() => {
        vi.stubGlobal('game', {
            i18n: { localize: (k: string) => k, format: (k: string, data: Record<string, string>) => `${k}:${data['condition'] ?? ''}` },
        });
        setConditionCatalog(buildConditionCatalog(conditionPackFixture()));
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        setConditionCatalog(new Map());
    });

    const MELEE = { isMelee: true, isRanged: false, rangeBand: 'melee' };
    const target = (line: 'dh2' | 'rt', ...statuses: string[]): { id: string; system: { gameSystem: string }; statuses: Set<string> } => ({
        id: 'target',
        system: { gameSystem: line },
        statuses: new Set(statuses),
    });

    function makeRollData(): WeaponRollData {
        // eslint-disable-next-line no-restricted-syntax -- test: bypass the WH40K-config constructor to unit-test the target-condition fold
        const rd = Object.create(WeaponRollData.prototype) as WeaponRollData;
        rd.modifiers = {};
        rd.expandedBuckets = {};
        rd.modifierSources = [];
        return rd;
    }

    it('melee vs a Prone + Stunned target (dh2): +10 and +20, each a sourced card row', () => {
        const rd = makeRollData();
        rd.foldTargetConditionComponents(collectTargetConditionRows(target('dh2', 'prone', 'stunned'), 'attacker', false, MELEE));
        expect(rd.modifiers[TARGET_CONDITION_BUCKET]).toBe(30);
        rd.buildModifierSources();
        expect(rd.modifierSources.map((c) => [c.label, c.value, c.source])).toEqual([
            ['Prone', 10, 'WH40K.Roll.ModifierSource.TargetCondition:Prone'],
            ['Stunned', 20, 'WH40K.Roll.ModifierSource.TargetCondition:Stunned'],
        ]);
    });

    it('ranged at Point Blank vs a Prone target (rt): the −10 does not apply', () => {
        const rd = makeRollData();
        rd.foldTargetConditionComponents(
            collectTargetConditionRows(target('rt', 'prone'), 'attacker', false, { isMelee: false, isRanged: true, rangeBand: 'pointBlank' }),
        );
        expect(rd.modifiers[TARGET_CONDITION_BUCKET]).toBe(0);
        expect(rd.expandedBuckets[TARGET_CONDITION_BUCKET]).toEqual([]);
    });

    it('no target, or a homebrew self-target, contributes nothing', () => {
        expect(collectTargetConditionRows(null, 'attacker', false, MELEE)).toEqual([]);
        const attackerAsTarget = { ...target('dh2', 'stunned'), id: 'attacker' };
        expect(collectTargetConditionRows(attackerAsTarget, 'attacker', true, MELEE)).toEqual([]);
        expect(collectTargetConditionRows(attackerAsTarget, 'attacker', false, MELEE).map((c) => c.value)).toEqual([20]);
    });
});

describe('result formula transparency (#… — central derivation in ActionData)', () => {
    const actionData = readRepoFile('src/module/rolls/action-data.ts');

    it('ActionData builds the result formula through the shared per-method readout (#335)', () => {
        expect(actionData).toContain('this.rollData.resultFormula = degreesResultFormula(');
        // The method is stamped where the degrees are counted, so the card prints the line's own count.
        expect(actionData).toContain('this.rollData.degreesMethod = degreesMethod;');
    });
});

describe('RollData.printedDegrees — the count the card shows (#335)', () => {
    function resolved(method: 'gen1' | 'gen2', success: boolean, count: number): RollData {
        // eslint-disable-next-line no-restricted-syntax -- test: bypass the WH40K-config constructor to unit-test one getter
        const rd = Object.create(RollData.prototype) as RollData;
        rd.degreesMethod = method;
        rd.success = success;
        rd.dos = success ? count : 0;
        rd.dof = success ? 0 : count;
        return rd;
    }

    it('a DH1 (Gen 1) 01 vs 75 prints 7 DoS from the engine count of 8', () => {
        expect(resolved('gen1', true, 8).printedDegrees).toEqual({ dos: 7, dof: 0 });
    });

    it('Gen 2 prints the engine count unchanged', () => {
        expect(resolved('gen2', true, 8).printedDegrees).toEqual({ dos: 8, dof: 0 });
        expect(resolved('gen2', false, 3).printedDegrees).toEqual({ dos: 0, dof: 3 });
    });

    it('a Gen 1 narrow failure prints 0 DoF', () => {
        expect(resolved('gen1', false, 1).printedDegrees).toEqual({ dos: 0, dof: 0 });
    });
});

describe('RollData.gameSystemId reads an NPC DataModel static (#335, #607)', () => {
    it("resolves an NPC's line from its DataModel class, so its rolls use that line's rules", () => {
        class Dh1NpcModel {
            static gameSystem = 'dh1';
        }
        // eslint-disable-next-line no-restricted-syntax -- test: bypass the WH40K-config constructor to unit-test one getter
        const rd = Object.create(RollData.prototype) as RollData;
        // eslint-disable-next-line no-restricted-syntax -- test: an NPC actor reduced to the DataModel surface the getter reads
        rd.sourceActor = { system: new Dh1NpcModel() } as unknown as RollData['sourceActor'];
        expect(rd.gameSystemId).toBe('dh1');
    });
});

describe('assembleFinalModifiers — the record the dialog previews and the card commits (#489)', () => {
    it('a plain test commits the modifiers it is given, without touching its own', () => {
        // eslint-disable-next-line no-restricted-syntax -- test: bypass the WH40K-config constructor to unit-test one pure method
        const rd = Object.create(RollData.prototype) as RollData;
        rd.modifiers = { difficulty: 10 };
        expect(rd.assembleFinalModifiers({ ...rd.modifiers, fatigue: -10 })).toEqual({ difficulty: 10, fatigue: -10 });
        expect(rd.modifiers).toEqual({ difficulty: 10 });
    });
});

describe('buildModifierComponents — one builder for card and dialog (#489)', () => {
    beforeEach(() => {
        vi.stubGlobal('game', { i18n: { localize: (k: string) => k } });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('itemises collector buckets, named keys and dialog keys as hoverable rows', () => {
        const rows = buildModifierComponents(
            { 'parrying-weapon': 15, 'environment': -20, 'modification-availability': -10, 'fatigue': -10, 'gang-up': 10, 'difficulty': 0 },
            {
                'parrying-weapon': [{ key: 'parrying-weapon-defensive', label: 'Defensive (Sword)', value: 15, source: 'Sword' }],
                'environment': [{ key: 'zero-g', label: 'Zero gravity', value: -20, source: 'Environment' }],
            },
        );
        expect(rows.map((r) => [r.label, r.value])).toEqual([
            ['Defensive (Sword)', 15],
            ['Zero gravity', -20],
            ['WH40K.Roll.ModifierSource.ModificationAvailability', -10],
            ['WH40K.Roll.ModifierSource.Fatigue', -10],
            ['WH40K.Roll.ModifierSource.GangUp', 10],
        ]);
        for (const row of rows) {
            const payload = JSON.parse(row.tooltipData ?? '') as { title: string; sources: Array<{ name: string; value: number }> };
            expect(payload.sources[0]?.value).toBe(row.value);
        }
    });
});

describe('A Called Shot test substitution swaps the attack onto a skill, from the item data (#101)', () => {
    beforeEach(() => {
        vi.stubGlobal('game', {
            i18n: {
                localize: (k: string) => k,
                format: (k: string, d: Record<string, string>) => `${k}:${d['skill'] ?? ''}:${d['characteristic'] ?? ''}:${d['source'] ?? ''}`,
            },
        });
    });
    afterEach(() => vi.unstubAllGlobals());

    /** A talent whose Called Shot substitution rolls Medicae against a studied xenos, for its specialization's attack kind. */
    const SUBSTITUTION = {
        test: 'calledShot',
        skill: 'medicae',
        basis: 'trainingOffset',
        attack: 'bySpecialization',
        targetTag: 'xenos',
        requiresSkill: 'forbiddenLore',
        requiresSpecialization: 'xenos',
    } as const;

    const attacker = (specialization: string, loreRank: number): Parameters<WeaponRollData['applyCalledShotSubstitution']>[0] => ({
        items: [{ name: 'Fixture Talent', system: { specialization, modifiers: { testSubstitutions: [SUBSTITUTION] } } }],
        system: {
            skills: {
                forbiddenLore: { current: 0, characteristic: 'intelligence', entries: [{ name: 'Xenos', rank: loreRank }] },
                medicae: { current: 55, characteristic: 'intelligence' },
            },
        },
        getCharacteristicFuzzy: (key: string) => (key === 'intelligence' ? { total: 45 } : undefined),
    });

    interface AttackCase {
        readonly calledShot: boolean;
        readonly ranged: boolean;
        readonly nature: string;
    }

    function attack(opts: AttackCase, spec: string, rank: number): WeaponRollData {
        // eslint-disable-next-line no-restricted-syntax -- test: bypass the WH40K-config constructor to unit-test one method, as the cases above do
        const rd = Object.create(WeaponRollData.prototype) as WeaponRollData;
        rd.isCalledShot = opts.calledShot;
        rd.baseTarget = 38;
        rd.baseChar = 'BS';
        rd.applyCalledShotSubstitution(attacker(spec, rank), { system: { nature: opts.nature }, items: [] }, opts.ranged);
        return rd;
    }

    it('rolls Medicae (BS) — Medicae training over BS — and labels the base row with the granting item', () => {
        const rd = attack({ calledShot: true, ranged: true, nature: 'xenos' }, 'Ranged', 1);
        expect(rd.baseTarget).toBe(48);
        expect(rd.baseLabel).toBe('WH40K.TestSubstitution.Base:medicae:BS:Fixture Talent');
    });

    it.each([
        ['not a Called Shot', { calledShot: false, ranged: true, nature: 'xenos' }, 'Ranged', 1],
        ['the wrong Specialisation', { calledShot: true, ranged: true, nature: 'xenos' }, 'Melee', 1],
        ['a non-xenos target', { calledShot: true, ranged: true, nature: 'creature' }, 'Ranged', 1],
        ['no Forbidden Lore (Xenos)', { calledShot: true, ranged: true, nature: 'xenos' }, 'Ranged', 0],
    ] as const)('leaves BS alone for %s', (_case, opts, spec, rank) => {
        const rd = attack(opts, spec, rank);
        expect(rd.baseTarget).toBe(38);
        expect(rd.baseLabel).toBe('');
    });
});

describe('Talent test hooks reach the roll flow (#101)', () => {
    it('area attack cards resolve the template, each avoidance routed through the test-substitution resolver (#599)', () => {
        expect(readRepoFile('src/templates/chat/action-roll-chat.hbs')).toContain('roll-control__resolve-area');
        const manager = readRepoFile('src/module/actions/basic-action-manager.ts');
        expect(manager).toContain("querySelectorAll('.roll-control__resolve-area')");
        expect(manager).toContain('areaAvoidanceTest(');
        // The defenders are the tokens inside the template, not whatever the clicker controls.
        expect(manager).toContain('tokensInAreaTemplate(');
        expect(manager).not.toContain('canvas.tokens?.controlled');
    });

    it('a situational row failure consequence (Push the Limit) is resolved on every simple roll path, from row data', () => {
        const dialog = readRepoFile('src/module/applications/prompts/unified-roll-dialog.ts');
        expect(dialog).toMatch(/_resolveSimpleActionHooks\(\): Promise<void> \{[^}]*this\.#applySituationalFailureConsequences\(\);/);
        expect(dialog).toContain('failureConsequenceFires(consequence');
        // Direction #7: no talent identifier, skill set or table key is named in the dialog.
        expect(dialog).not.toContain('pushTheLimit');
        expect(dialog).not.toContain('PUSH_THE_LIMIT');
        expect(dialog).not.toContain('MotiveSystemsTable');
    });

    it('once-per-round situational rows are marked spent, refused on toggle, and stamped after a rolled test', () => {
        const dialog = readRepoFile('src/module/applications/prompts/unified-roll-dialog.ts');
        expect(dialog).toContain('isRowSpent(row, uses, now)');
        expect(dialog).toMatch(/#onToggleSituational[\s\S]{0,400}mod\.spent === true/);
        expect(dialog).toMatch(/if \(manualTotal !== null\) await this\.#stampRoundLimitedRows\(\);/);
        expect(dialog).toMatch(/await this\.#postSimpleAction\(\);\s*\}\s*await this\.#stampRoundLimitedRows\(\);/);
    });

    it('the attack card prints the substituted base label', () => {
        expect(readRepoFile('src/templates/chat/action-roll-chat.hbs')).toContain('baseLabel=baseLabel');
    });
});

describe('opposed psychic resolution wired to the #449 engine (#451)', () => {
    const rollData = readRepoFile('src/module/rolls/roll-data.ts');
    const actionData = readRepoFile('src/module/rolls/action-data.ts');

    it('a power flagged focusPower.opposed becomes an opposed roll vs its resist characteristic', () => {
        expect(rollData).toContain('focusPower?.opposed === true');
        expect(rollData).toContain('this.isOpposed = true');
        // Defaults to Willpower when the power does not name a resist characteristic.
        expect(rollData).toContain("'willpower'");
    });

    it('the psychic card surfaces whether the target resisted and the #449 margin', () => {
        expect(actionData).toContain('this.rollData.isOpposed');
        expect(actionData).toContain('WH40K.Psychic.OpposedResisted');
        expect(actionData).toContain('this.rollData.opposedMargin');
    });
});

describe('area and no-roll flags resolve after the attack specials (#600)', () => {
    // The flags used to be read before `updateAttackSpecials` filled the list, so the
    // first update saw no Spray and the card printed a roll, a target and degrees.
    const source = readRepoFile('src/module/rolls/roll-data.ts');
    const update = source.slice(source.indexOf('    update(): void {', source.indexOf('class WeaponRollData')));

    it('reads the attack specials and the range before resolving the area', () => {
        const resolved = update.indexOf('resolveAreaTemplate(');
        expect(resolved).toBeGreaterThan(update.indexOf('updateAttackSpecials(this)'));
        expect(resolved).toBeGreaterThan(update.indexOf('calculateWeaponRange(this)'));
        expect(update.indexOf('this.ignoreDegrees = this.noAttackRoll')).toBeGreaterThan(update.indexOf('attackHasNoAttackRoll('));
    });

    it('never name-matches a quality for the area or the roll', () => {
        expect(source).not.toContain("hasAttackSpecial('Spray')");
        expect(readRepoFile('src/module/rolls/action-data.ts')).not.toContain("hasAttackSpecial('Spray')");
    });
});

describe('a weapon that deals no damage offers no damage roll (#601)', () => {
    function attack(dealsDamage: boolean, success: boolean, isThrown = false): WeaponRollData {
        // eslint-disable-next-line no-restricted-syntax -- test: bypass the WH40K-config constructor to unit-test the damage gate
        const rd = Object.create(WeaponRollData.prototype) as WeaponRollData;
        Object.defineProperty(rd, 'weapon', { value: { system: { dealsDamage } } });
        rd.success = success;
        rd.isThrown = isThrown;
        return rd;
    }

    it('a hit with a damaging weapon shows Roll Damage', () => {
        expect(attack(true, true).noDamage).toBe(false);
        expect(attack(true, true).showDamage).toBe(true);
    });

    it('a hit (or a thrown miss) with a no-damage weapon shows none', () => {
        expect(attack(false, true).noDamage).toBe(true);
        expect(attack(false, true).showDamage).toBe(false);
        expect(attack(false, false, true).showDamage).toBe(false);
    });

    it('a miss shows no damage either way', () => {
        expect(attack(true, false).showDamage).toBe(false);
    });

    it('the attack action takes its damage gate from the roll, so auto-damage skips it', () => {
        const actionData = readRepoFile('src/module/rolls/action-data.ts');
        const weaponAction = actionData.slice(actionData.indexOf('export class WeaponActionData'), actionData.indexOf('export class PsychicActionData'));
        expect(weaponAction).toContain('this.hasDamage = !this.rollData.noDamage;');
        expect(actionData).toContain("if (!this.hasDamage || this.damageData === undefined) return 'action has no damage data';");
    });
});

describe('RollData.effectString lists (#698)', () => {
    it('separates the qualities and the mods with a comma and a space', () => {
        // eslint-disable-next-line no-restricted-syntax -- test: bypass the WH40K-config constructor to unit-test one getter
        const rd = Object.create(WeaponRollData.prototype) as WeaponRollData;
        rd.weapon = { system: {} } as WeaponRollData['weapon'];
        rd.attackSpecials = [{ name: 'Balanced' }, { name: 'Tearing' }];
        rd.weaponModifications = [{ name: 'Red-Dot Laser Sight' }, { name: 'Fluid Action' }];
        expect(rd.effectString).toBe('Balanced, Tearing | Red-Dot Laser Sight, Fluid Action');
    });
});

describe('RollData.modifiedTarget floors at 0 like the Roll Test dialog (#701 audit)', () => {
    function rollWith(baseTarget: number, modifierTotal: number): RollData {
        // eslint-disable-next-line no-restricted-syntax -- test: bypass the WH40K-config constructor to unit-test one getter, as the cases above do
        const rd = Object.create(RollData.prototype) as RollData;
        rd.baseTarget = baseTarget;
        rd.modifierTotal = modifierTotal;
        return rd;
    }

    it('keeps a positive sum', () => {
        expect(rollWith(40, -10).modifiedTarget).toBe(30);
    });

    it('floors a negative sum at 0, so the card matches the dialog', () => {
        expect(rollWith(-20, 0).modifiedTarget).toBe(0);
        expect(rollWith(10, -30).modifiedTarget).toBe(0);
    });
});
