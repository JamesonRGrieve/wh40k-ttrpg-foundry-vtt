import { describe, expect, it } from 'vitest';
import {
    applyFirstAidOutcome,
    type FirstAidPatient,
    blatherRounds,
    evaluateSkillUseGate,
    getSkillUse,
    getSkillUses,
    hasSkillUses,
    resolveFirstAid,
    getSkillReadout,
    resolveDosReadout,
    resolveInterrogation,
    resolveSocialInfluence,
    dispatchItemChoiceUse,
    isSkillUseItemSlotKey,
    itemChoiceFamily,
    type ItemChoiceHandlers,
    type SkillUseCandidate,
    skillUseItemCandidates,
    skillUseItemSlots,
    useNeedsItemChoice,
    type FirstAidTargetVitals,
    type SkillUseDef,
} from './skill-uses.ts';

describe('skill-use registry (#432)', () => {
    it('offers only the general test for a skill with no special uses', () => {
        const uses = getSkillUses('carouse');
        expect(uses).toHaveLength(1);
        expect(uses[0]?.id).toBe('general');
        expect(hasSkillUses('carouse')).toBe(false);
    });

    it('offers Medicae Special Uses (general + First Aid + Extended Care + Surgery + …)', () => {
        const uses = getSkillUses('medicae');
        const ids = uses.map((u) => u.id);
        expect(ids[0]).toBe('general');
        expect(ids).toEqual(expect.arrayContaining(['firstAid', 'extendedCare', 'surgery', 'diagnose', 'extractBullet']));
        expect(hasSkillUses('medicae')).toBe(true);
    });

    it('marks the healing/operating uses as target-directed and the informational ones as not', () => {
        expect(getSkillUse('medicae', 'firstAid')?.needsTarget).toBe(true);
        expect(getSkillUse('medicae', 'surgery')?.needsTarget).toBe(true);
        expect(getSkillUse('medicae', 'diagnose')?.needsTarget).toBe(false);
        expect(getSkillUse('medicae', 'general')?.needsTarget).toBe(false);
    });

    it('sources each use difficulty from the shared MEDICAE_ACTIONS content registry', () => {
        expect(getSkillUse('medicae', 'firstAid')?.difficultyMod).toBe(0);
        expect(getSkillUse('medicae', 'extendedCare')?.difficultyMod).toBe(-10);
        expect(getSkillUse('medicae', 'surgery')?.difficultyMod).toBe(-20);
    });

    it('every use carries a namespaced langpack label key (no raw English)', () => {
        for (const use of getSkillUses('medicae')) {
            expect(use.labelKey).toMatch(/^WH40K\.SkillUse\./);
        }
    });

    it('returns null for an unknown use id', () => {
        expect(getSkillUse('medicae', 'nope')).toBeNull();
    });
});

describe('resolveFirstAid (#432)', () => {
    const vitals = (over: Partial<FirstAidTargetVitals> = {}): FirstAidTargetVitals => ({
        woundsValue: 3,
        woundsMax: 12,
        criticalDamage: 0,
        toughnessBonus: 4,
        intelligenceBonus: 4,
        ...over,
    });

    it('a failed test heals nothing', () => {
        const out = resolveFirstAid('firstAid', vitals(), 0);
        expect(out).toEqual({ success: false, woundsRestored: 0, criticalResolved: 0, bloodLossStopped: false });
    });

    it('First Aid removes IntB + degrees of success in wounds, and closes blood loss (RAW)', () => {
        // IntB 4 + 1 degree = 5 removed; 9 wounds missing → all 5 land as wounds.
        const out = resolveFirstAid('firstAid', vitals(), 1);
        expect(out.success).toBe(true);
        expect(out.woundsRestored).toBe(5);
        expect(out.bloodLossStopped).toBe(true);
        expect(out.criticalResolved).toBe(0);
    });

    it('First Aid scales the amount with degrees of success', () => {
        // IntB 4 + 3 degrees = 7 removed (headroom 9).
        expect(resolveFirstAid('firstAid', vitals(), 3).woundsRestored).toBe(7);
    });

    it('First Aid removes Critical damage before normal wounds (RAW)', () => {
        // IntB 4 + 1 degree = 5 removed; 2 go to critical first, 3 to wounds.
        const out = resolveFirstAid('firstAid', vitals({ criticalDamage: 2 }), 1);
        expect(out.criticalResolved).toBe(2);
        expect(out.woundsRestored).toBe(3);
    });

    it('First Aid with more critical than the total only clears critical', () => {
        // IntB 4 + 1 = 5 removed, all absorbed by 6 points of critical.
        const out = resolveFirstAid('firstAid', vitals({ criticalDamage: 6 }), 1);
        expect(out.criticalResolved).toBe(5);
        expect(out.woundsRestored).toBe(0);
    });

    it('Extended Care restores Toughness-bonus wounds', () => {
        const out = resolveFirstAid('extendedCare', vitals({ toughnessBonus: 4 }), 2);
        expect(out.woundsRestored).toBe(4);
    });

    it('never overheals past max (clamped to missing-wounds headroom)', () => {
        const out = resolveFirstAid('extendedCare', vitals({ woundsValue: 10, woundsMax: 12, toughnessBonus: 5 }), 3);
        expect(out.woundsRestored).toBe(2); // only 2 wounds missing
    });

    it('Surgery removes one critical tier only when the patient carries critical damage', () => {
        expect(resolveFirstAid('surgery', vitals({ criticalDamage: 3 }), 1).criticalResolved).toBe(1);
        expect(resolveFirstAid('surgery', vitals({ criticalDamage: 0 }), 1).criticalResolved).toBe(0);
    });
});

describe('break object (#448)', () => {
    it('offers Athletics a break-object use (inverse of Tech-Use repair) + the #438 physical readout on general', () => {
        expect(getSkillUses('athletics').map((u) => u.id)).toEqual(['general', 'breakObject']);
        expect(getSkillUse('athletics', 'breakObject')?.needsTarget).toBe(false);
        expect(getSkillReadout('athletics')).toBe('physical');
    });
});

describe('Demolition place/defuse (#445)', () => {
    it('offers general + place-charge + defuse', () => {
        expect(getSkillUses('demolition').map((u) => u.id)).toEqual(['general', 'placeCharge', 'defuse']);
    });

    it('acts on chosen explosives (self-directed picker), not a targeted token', () => {
        expect(getSkillUse('demolition', 'placeCharge')?.needsTarget).toBe(false);
        expect(getSkillUse('demolition', 'defuse')?.needsTarget).toBe(false);
    });
});

describe('object-interaction appliers (#443/#444)', () => {
    it('offers Tech-Use Repair alongside the general (DoS-readout) test', () => {
        expect(getSkillUses('techUse').map((u) => u.id)).toEqual(['general', 'repair']);
        expect(getSkillUse('techUse', 'repair')?.needsTarget).toBe(false);
    });

    it('offers Security Bypass Lock alongside the general test', () => {
        expect(getSkillUses('security').map((u) => u.id)).toEqual(['general', 'bypassLock']);
        expect(getSkillUse('security', 'bypassLock')?.needsTarget).toBe(false);
    });

    it('keeps Tech-Use/Security on the object-interaction DoS readout for the general test (#436)', () => {
        expect(getSkillReadout('techUse')).toBe('objectInteraction');
        expect(getSkillReadout('security')).toBe('objectInteraction');
    });
});

describe('Sleight of Hand plant/steal (#442)', () => {
    it('adds opposed steal + plant uses alongside the #434 detection use', () => {
        const ids = getSkillUses('sleightOfHand').map((u) => u.id);
        expect(ids).toEqual(['general', 'detect', 'steal', 'plant']);
    });

    it('makes both transfer uses target-directed and opposed by Perception', () => {
        for (const id of ['steal', 'plant']) {
            const use = getSkillUse('sleightOfHand', id);
            expect(use?.needsTarget).toBe(true);
            expect(use?.opposedChar).toBe('Per');
        }
    });
});

describe('Chem-Use (#441)', () => {
    it('offers general + administer-chem (targeted) + coat-weapon (self)', () => {
        const ids = getSkillUses('chemUse').map((u) => u.id);
        expect(ids).toEqual(['general', 'applyChem', 'coatWeapon']);
    });

    it('marks administering as target-directed and coating as self-directed', () => {
        expect(getSkillUse('chemUse', 'applyChem')?.needsTarget).toBe(true);
        expect(getSkillUse('chemUse', 'coatWeapon')?.needsTarget).toBe(false);
    });
});

describe('RAW per-target time gates (#458)', () => {
    it('gates First Aid at 24 in-universe hours per patient (DH2 p109)', () => {
        const gate = getSkillUse('medicae', 'firstAid')?.timeGate;
        expect(gate?.key).toBe('firstAid');
        expect(gate?.windowSeconds).toBe(86400);
    });

    it('gates Extended Care on the same 24-hour cycle (it is what blocks First Aid)', () => {
        expect(getSkillUse('medicae', 'extendedCare')?.timeGate).toEqual({ key: 'extendedCare', windowSeconds: 86400 });
    });

    it('declares the Interrogation lockout gate with NO fixed window (1d5 days is rolled at resolution)', () => {
        const gate = getSkillUse('interrogation', 'interrogate')?.timeGate;
        expect(gate?.key).toBe('interrogate');
        expect(gate?.windowSeconds).toBeUndefined();
    });

    it('leaves uncooled uses ungated', () => {
        expect(getSkillUse('medicae', 'diagnose')?.timeGate).toBeUndefined();
        expect(getSkillUse('medicae', 'surgery')?.timeGate).toBeUndefined();
        expect(getSkillUse('charm', 'social')?.timeGate).toBeUndefined();
    });

    it('declares the Extended Care exclusion as DATA on the First Aid gate (not a name-match branch)', () => {
        expect(getSkillUse('medicae', 'firstAid')?.timeGate?.blockedBy).toEqual([{ key: 'extendedCare', messageKey: 'WH40K.SkillUse.GateExtendedCare' }]);
        // Extended Care itself carries no exclusion — only its own 24h cycle.
        expect(getSkillUse('medicae', 'extendedCare')?.timeGate?.blockedBy).toBeUndefined();
    });
});

describe('evaluateSkillUseGate (#458 — resolution-time enforcement)', () => {
    const firstAid = getSkillUse('medicae', 'firstAid') as SkillUseDef;
    const interrogate = getSkillUse('interrogation', 'interrogate') as SkillUseDef;
    const diagnose = getSkillUse('medicae', 'diagnose') as SkillUseDef;

    /** An `expiryOf` lookup over a plain per-key expiry map (an unset key is open). */
    const gatesOf =
        (map: Record<string, number>) =>
        (key: string): number | null =>
            map[key] ?? null;

    it('allows a use whose def carries no time gate at all', () => {
        expect(evaluateSkillUseGate(diagnose, gatesOf({ firstAid: 999_999 }), 0)).toBeNull();
    });

    it('allows a use whose gate has never been stamped on this target', () => {
        expect(evaluateSkillUseGate(firstAid, gatesOf({}), 5_000)).toBeNull();
    });

    it('blocks the use while its own cooldown is still running, reporting the time remaining', () => {
        // Stamped at t=0 with a 24h window; 6 hours in, 18 remain.
        const block = evaluateSkillUseGate(firstAid, gatesOf({ firstAid: 86_400 }), 6 * 3600);
        expect(block?.key).toBe('firstAid');
        expect(block?.remaining).toBe(18 * 3600);
        expect(block?.remainingLabel).toBe('18h');
        expect(block?.messageKey).toBe('WH40K.SkillUse.GateCooldown');
    });

    it('reopens the use the instant in-universe time reaches the expiry', () => {
        expect(evaluateSkillUseGate(firstAid, gatesOf({ firstAid: 86_400 }), 86_399)).not.toBeNull();
        expect(evaluateSkillUseGate(firstAid, gatesOf({ firstAid: 86_400 }), 86_400)).toBeNull();
        expect(evaluateSkillUseGate(firstAid, gatesOf({ firstAid: 86_400 }), 90_000)).toBeNull();
    });

    it('blocks First Aid through an open Extended Care window with the EXCLUSION message (RAW, DH2 p109)', () => {
        const block = evaluateSkillUseGate(firstAid, gatesOf({ extendedCare: 3600 + 1800 }), 0);
        expect(block?.key).toBe('extendedCare');
        expect(block?.messageKey).toBe('WH40K.SkillUse.GateExtendedCare');
        expect(block?.remainingLabel).toBe('1h 30m');
    });

    it('prefers the use OWN cooldown over the exclusion when both are closed', () => {
        const block = evaluateSkillUseGate(firstAid, gatesOf({ firstAid: 7200, extendedCare: 86_400 }), 0);
        expect(block?.key).toBe('firstAid');
        expect(block?.messageKey).toBe('WH40K.SkillUse.GateCooldown');
    });

    it('does NOT block Extended Care on a First Aid stamp (the exclusion is one-directional)', () => {
        const extendedCare = getSkillUse('medicae', 'extendedCare') as SkillUseDef;
        expect(evaluateSkillUseGate(extendedCare, gatesOf({ firstAid: 86_400 }), 0)).toBeNull();
    });

    it('isolates gates per target — a closed gate on one patient never blocks another', () => {
        const patientA = gatesOf({ firstAid: 86_400 });
        const patientB = gatesOf({});
        expect(evaluateSkillUseGate(firstAid, patientA, 0)).not.toBeNull();
        expect(evaluateSkillUseGate(firstAid, patientB, 0)).toBeNull();
    });

    it('isolates gates per USE — a First Aid cooldown does not block an Interrogation', () => {
        expect(evaluateSkillUseGate(interrogate, gatesOf({ firstAid: 86_400 }), 0)).toBeNull();
    });

    it('blocks a rolled-window Interrogation lockout, formatting multi-day remainders', () => {
        // A 1d5 lockout of 3 days stamped at t=0; one day later, two remain.
        const block = evaluateSkillUseGate(interrogate, gatesOf({ interrogate: 3 * 86_400 }), 86_400);
        expect(block?.key).toBe('interrogate');
        expect(block?.remainingLabel).toBe('2d');
        expect(block?.messageKey).toBe('WH40K.SkillUse.GateCooldown');
    });
});

describe('applyFirstAidOutcome (#432)', () => {
    function patient(
        over: Partial<{ woundsValue: number; woundsMax: number; criticalDamage: number }> = {},
    ): FirstAidPatient & { patches: Array<{ woundsValue?: number; criticalDamage?: number }> } {
        const state = { woundsValue: 4, woundsMax: 12, criticalDamage: 2, ...over };
        const patches: Array<{ woundsValue?: number; criticalDamage?: number }> = [];
        return {
            get woundsValue() {
                return state.woundsValue;
            },
            get woundsMax() {
                return state.woundsMax;
            },
            get criticalDamage() {
                return state.criticalDamage;
            },
            patches,
            update: async (patch) => {
                patches.push(patch);
                return Promise.resolve();
            },
        };
    }

    it('writes restored wounds clamped to max', async () => {
        const p = patient({ woundsValue: 4, woundsMax: 12 });
        const wrote = await applyFirstAidOutcome(p, { success: true, woundsRestored: 3, criticalResolved: 0, bloodLossStopped: true });
        expect(wrote).toEqual({ woundsValue: 7 });
        expect(p.patches).toEqual([{ woundsValue: 7 }]);
    });

    it('writes reduced critical severity floored at zero', async () => {
        const p = patient({ criticalDamage: 1 });
        const wrote = await applyFirstAidOutcome(p, { success: true, woundsRestored: 0, criticalResolved: 3, bloodLossStopped: false });
        expect(wrote).toEqual({ criticalDamage: 0 });
    });

    it('does not persist when nothing changed', async () => {
        const p = patient();
        const wrote = await applyFirstAidOutcome(p, { success: false, woundsRestored: 0, criticalResolved: 0, bloodLossStopped: false });
        expect(wrote).toEqual({});
        expect(p.patches).toEqual([]);
    });
});

describe('interrogation (#435)', () => {
    it('offers general + interrogate (opposed vs WP, target-directed)', () => {
        expect(getSkillUses('interrogation').map((u) => u.id)).toEqual(['general', 'interrogate']);
        const interro = getSkillUse('interrogation', 'interrogate');
        expect(interro?.needsTarget).toBe(true);
        expect(interro?.opposedChar).toBe('WP');
    });

    it('extracts a degrees-scaled info tier on success and always fatigues the subject', () => {
        expect(resolveInterrogation(0)).toEqual({ success: false, infoTier: 0, fatigue: 1 });
        expect(resolveInterrogation(1)).toEqual({ success: true, infoTier: 1, fatigue: 1 });
        expect(resolveInterrogation(3)).toEqual({ success: true, infoTier: 3, fatigue: 1 });
    });
});

describe('knowledge DoS readout (#437)', () => {
    it('flags the knowledge/investigation skills as having a readout family', () => {
        for (const key of ['inquiry', 'commonLore', 'scholasticLore', 'forbiddenLore', 'logic', 'psyniscience']) {
            expect(getSkillReadout(key)).toBe('knowledge');
        }
        expect(getSkillReadout('medicae')).toBeNull();
    });

    it('gates the recalled tier by degrees of success', () => {
        expect(resolveDosReadout('knowledge', 0, false)).toEqual({ tier: 0, labelKey: 'WH40K.SkillUse.Readout.Knowledge.Nothing' });
        expect(resolveDosReadout('knowledge', 1, true)).toEqual({ tier: 1, labelKey: 'WH40K.SkillUse.Readout.Knowledge.Basic' });
        expect(resolveDosReadout('knowledge', 2, true)).toEqual({ tier: 2, labelKey: 'WH40K.SkillUse.Readout.Knowledge.Detailed' });
        expect(resolveDosReadout('knowledge', 4, true)).toEqual({ tier: 4, labelKey: 'WH40K.SkillUse.Readout.Knowledge.Comprehensive' });
    });
});

describe('physical feats DoS readout (#438)', () => {
    it('flags Athletics/Acrobatics as physical readout skills', () => {
        expect(getSkillReadout('athletics')).toBe('physical');
        expect(getSkillReadout('acrobatics')).toBe('physical');
    });

    it('scales the cleared feat by degrees of success', () => {
        expect(resolveDosReadout('physical', 0, false)).toEqual({ tier: 0, labelKey: 'WH40K.SkillUse.Readout.Physical.Fail' });
        expect(resolveDosReadout('physical', 3, true)).toEqual({ tier: 3, labelKey: 'WH40K.SkillUse.Readout.Physical.Success' });
    });
});

describe('object interaction DoS readout (#436)', () => {
    it('flags Security/Tech-Use as object-interaction readout skills', () => {
        expect(getSkillReadout('security')).toBe('objectInteraction');
        expect(getSkillReadout('techUse')).toBe('objectInteraction');
    });

    it('scales the time/outcome by degrees of success', () => {
        expect(resolveDosReadout('objectInteraction', 0, false)).toEqual({ tier: 0, labelKey: 'WH40K.SkillUse.Readout.Object.Fail' });
        expect(resolveDosReadout('objectInteraction', 2, true)).toEqual({ tier: 2, labelKey: 'WH40K.SkillUse.Readout.Object.Success' });
    });
});

describe('opposed detection (#434)', () => {
    it('offers general + an opposed detect use for the detection skills', () => {
        // Sleight of Hand additionally carries steal/plant transfer uses (#442), so
        // assert the detect use's presence rather than an exact list for it.
        for (const key of ['stealth', 'awareness', 'scrutiny']) {
            expect(getSkillUses(key).map((u) => u.id)).toEqual(['general', 'detect']);
        }
        for (const key of ['stealth', 'awareness', 'scrutiny', 'sleightOfHand']) {
            const detect = getSkillUse(key, 'detect');
            expect(detect?.needsTarget).toBe(true);
            expect(detect?.opposedChar).toBeDefined();
        }
    });

    it('opposes each detection skill by the appropriate characteristic', () => {
        expect(getSkillUse('stealth', 'detect')?.opposedChar).toBe('Per');
        expect(getSkillUse('awareness', 'detect')?.opposedChar).toBe('Ag');
        expect(getSkillUse('scrutiny', 'detect')?.opposedChar).toBe('Fel');
    });
});

describe('opposed detection/deception — extended skills (#452)', () => {
    it('offers a detect use for the remaining hide/find/tail/disguise skills', () => {
        for (const key of ['concealment', 'silentMove', 'shadowing', 'tracking', 'disguise']) {
            const uses = getSkillUses(key);
            expect(uses.map((u) => u.id)).toEqual(['general', 'detect']);
            expect(getSkillUse(key, 'detect')?.needsTarget).toBe(true);
        }
    });

    it('opposes hide/tail/disguise by Perception and Tracking by the quarry Agility', () => {
        expect(getSkillUse('concealment', 'detect')?.opposedChar).toBe('Per');
        expect(getSkillUse('silentMove', 'detect')?.opposedChar).toBe('Per');
        expect(getSkillUse('shadowing', 'detect')?.opposedChar).toBe('Per');
        expect(getSkillUse('disguise', 'detect')?.opposedChar).toBe('Per');
        expect(getSkillUse('tracking', 'detect')?.opposedChar).toBe('Ag');
    });

    it('leaves Deceive as the social lie-contest (#433), not a duplicate detect use', () => {
        expect(getSkillUses('deceive').map((u) => u.id)).toEqual(['general', 'social']);
    });
});

describe('social influence (#433)', () => {
    it('offers general + a target-directed social use for each social skill', () => {
        for (const key of ['charm', 'command', 'intimidate', 'deceive']) {
            const ids = getSkillUses(key).map((u) => u.id);
            expect(ids[0]).toBe('general');
            expect(ids).toContain('social');
            expect(getSkillUse(key, 'social')?.needsTarget).toBe(true);
        }
    });

    it('opposes Charm/Command/Intimidate by Willpower and Deceive by the Scrutiny skill', () => {
        expect(getSkillUse('charm', 'social')?.opposedChar).toBe('WP');
        expect(getSkillUse('command', 'social')?.opposedChar).toBe('WP');
        expect(getSkillUse('intimidate', 'social')?.opposedChar).toBe('WP');
        expect(getSkillUse('deceive', 'social')?.opposedSkill).toBe('scrutiny');
        expect(getSkillUse('deceive', 'social')?.opposedChar).toBeUndefined();
    });

    it('directs the disposition shift warmer for Charm and colder for Intimidate', () => {
        expect(getSkillUse('charm', 'social')?.dispositionDir).toBe(1);
        expect(getSkillUse('intimidate', 'social')?.dispositionDir).toBe(-1);
        expect(getSkillUse('command', 'social')?.dispositionDir).toBe(0);
        expect(getSkillUse('deceive', 'social')?.dispositionDir).toBe(0);
    });

    it('scales the disposition delta by degrees of success in the use direction', () => {
        const charm = getSkillUse('charm', 'social') as SkillUseDef;
        const intimidate = getSkillUse('intimidate', 'social') as SkillUseDef;
        const command = getSkillUse('command', 'social') as SkillUseDef;

        expect(resolveSocialInfluence(charm, 1, true)).toEqual({ success: true, dispositionDelta: 1 });
        expect(resolveSocialInfluence(charm, 3, true)).toEqual({ success: true, dispositionDelta: 2 });
        expect(resolveSocialInfluence(intimidate, 3, true)).toEqual({ success: true, dispositionDelta: -2 });
        // A failed contest never shifts disposition, and a directionless use never does.
        expect(resolveSocialInfluence(charm, 0, false)).toEqual({ success: false, dispositionDelta: 0 });
        expect(resolveSocialInfluence(command, 3, true)).toEqual({ success: true, dispositionDelta: 0 });
    });

    it('offers Wrangling/Performer as unopposed warming disposition uses capped at 3 bands (#446)', () => {
        for (const key of ['wrangling', 'performer']) {
            expect(getSkillUses(key).map((u) => u.id)).toEqual(['general', 'social']);
            const use = getSkillUse(key, 'social') as SkillUseDef;
            expect(use.dispositionDir).toBe(1);
            expect(use.opposedChar).toBeUndefined();
            expect(use.opposedSkill).toBeUndefined();
            // RAW cap: a very high roll still shifts at most 3 bands.
            expect(resolveSocialInfluence(use, 11, true)).toEqual({ success: true, dispositionDelta: 3 });
            expect(resolveSocialInfluence(use, 1, true)).toEqual({ success: true, dispositionDelta: 1 });
        }
    });
});

describe('social buff/debuff sub-uses (#447)', () => {
    it('offers Inspire on Command/Charm, Terrify on Command, War Cry on Intimidate, Blather on Blather', () => {
        expect(getSkillUses('command').map((u) => u.id)).toEqual(['general', 'social', 'inspire', 'terrify']);
        expect(getSkillUses('charm').map((u) => u.id)).toEqual(['general', 'social', 'inspire']);
        expect(getSkillUses('intimidate').map((u) => u.id)).toEqual(['general', 'social', 'warCry']);
        expect(getSkillUses('blather').map((u) => u.id)).toEqual(['general', 'blather']);
    });

    it('opposes only Blather (vs Willpower); the buffs are unopposed', () => {
        expect(getSkillUse('blather', 'blather')?.opposedChar).toBe('WP');
        expect(getSkillUse('command', 'inspire')?.opposedChar).toBeUndefined();
        expect(getSkillUse('intimidate', 'warCry')?.opposedChar).toBeUndefined();
        for (const id of ['inspire', 'terrify', 'warCry', 'blather']) {
            expect(getSkillUse(id === 'warCry' ? 'intimidate' : id === 'blather' ? 'blather' : 'command', id)?.kind).toBe('socialBuff');
        }
    });

    it('scales Blather inaction to 1 + degrees of victory on a win, 0 on a loss', () => {
        expect(blatherRounds(false, 4)).toBe(0);
        expect(blatherRounds(true, 0)).toBe(1);
        expect(blatherRounds(true, 3)).toBe(4);
    });
});

describe('opposed utility contests (#453)', () => {
    it('offers a same-skill opposed contest use on Barter/Commerce/Gamble', () => {
        for (const key of ['barter', 'commerce', 'gamble']) {
            const ids = getSkillUses(key).map((u) => u.id);
            expect(ids).toEqual(['general', 'contest']);
            const use = getSkillUse(key, 'contest');
            expect(use?.needsTarget).toBe(true);
            expect(use?.opposedSkill).toBe(key);
        }
    });
});

describe('opposed pilot/operate chases (#454)', () => {
    it('offers a same-skill opposed contest use on Pilot/Operate', () => {
        for (const key of ['pilot', 'operate']) {
            const ids = getSkillUses(key).map((u) => u.id);
            expect(ids).toEqual(['general', 'contest']);
            const use = getSkillUse(key, 'contest');
            expect(use?.needsTarget).toBe(true);
            expect(use?.opposedSkill).toBe(key);
        }
    });
});

describe('item-choice use classification (#432/#535)', () => {
    it('classifies the item-choice families as needing an item pick', () => {
        expect(useNeedsItemChoice(getSkillUse('chemUse', 'applyChem') as SkillUseDef)).toBe(true);
        expect(useNeedsItemChoice(getSkillUse('chemUse', 'coatWeapon') as SkillUseDef)).toBe(true);
        expect(useNeedsItemChoice(getSkillUse('sleightOfHand', 'steal') as SkillUseDef)).toBe(true);
        expect(useNeedsItemChoice(getSkillUse('sleightOfHand', 'plant') as SkillUseDef)).toBe(true);
        expect(useNeedsItemChoice(getSkillUse('techUse', 'repair') as SkillUseDef)).toBe(true);
        expect(useNeedsItemChoice(getSkillUse('security', 'bypassLock') as SkillUseDef)).toBe(true);
        expect(useNeedsItemChoice(getSkillUse('athletics', 'breakObject') as SkillUseDef)).toBe(true);
        expect(useNeedsItemChoice(getSkillUse('demolition', 'placeCharge') as SkillUseDef)).toBe(true);
        expect(useNeedsItemChoice(getSkillUse('demolition', 'defuse') as SkillUseDef)).toBe(true);
    });

    it('classifies every target-directed / informational family as inline-resolvable', () => {
        for (const use of [
            getSkillUse('medicae', 'general'),
            getSkillUse('medicae', 'firstAid'),
            getSkillUse('medicae', 'extendedCare'),
            getSkillUse('medicae', 'surgery'),
            getSkillUse('medicae', 'diagnose'),
            getSkillUse('medicae', 'extractBullet'),
            getSkillUse('interrogation', 'interrogate'),
            getSkillUse('stealth', 'detect'),
            getSkillUse('charm', 'social'),
            getSkillUse('charm', 'inspire'),
            getSkillUse('barter', 'contest'),
        ]) {
            expect(useNeedsItemChoice(use as SkillUseDef)).toBe(false);
        }
    });

    it('lets one skill mix item-choice and plain uses (Sleight of Hand)', () => {
        const uses = getSkillUses('sleightOfHand');
        expect(uses.some((u) => !useNeedsItemChoice(u))).toBe(true);
        expect(uses.some((u) => useNeedsItemChoice(u))).toBe(true);
    });

    it('maps each item-choice kind to the family whose handler builds it', () => {
        expect(itemChoiceFamily(useDef('chemUse', 'applyChem'))).toBe('chem');
        expect(itemChoiceFamily(useDef('chemUse', 'coatWeapon'))).toBe('chem');
        expect(itemChoiceFamily(useDef('sleightOfHand', 'steal'))).toBe('palm');
        expect(itemChoiceFamily(useDef('sleightOfHand', 'plant'))).toBe('palm');
        expect(itemChoiceFamily(useDef('techUse', 'repair'))).toBe('objectState');
        expect(itemChoiceFamily(useDef('security', 'bypassLock'))).toBe('objectState');
        expect(itemChoiceFamily(useDef('athletics', 'breakObject'))).toBe('objectState');
        expect(itemChoiceFamily(useDef('demolition', 'placeCharge'))).toBe('demolition');
        expect(itemChoiceFamily(useDef('demolition', 'defuse'))).toBe('demolition');
        expect(itemChoiceFamily(useDef('medicae', 'firstAid'))).toBeNull();
    });
});

/** A registered use, asserted present. */
function useDef(skill: string, id: string): SkillUseDef {
    const def = getSkillUse(skill, id);
    if (def === null) throw new Error(`no ${skill}/${id} use`);
    return def;
}

/** A carried item as the candidate filters read it. */
function candidate(id: string, opts: Partial<Omit<SkillUseCandidate, 'id'>> = {}): SkillUseCandidate {
    return { id, name: id, type: 'gear', isWeapon: false, isArmour: false, isGear: true, system: {}, ...opts };
}

describe('item pickers per use (#535)', () => {
    it('gives Coat Weapon a chem picker and a weapon picker, and every other item use one picker', () => {
        expect(skillUseItemSlots(useDef('chemUse', 'coatWeapon')).map((s) => s.key)).toEqual(['item', 'weapon']);
        for (const [skill, id] of [
            ['chemUse', 'applyChem'],
            ['sleightOfHand', 'steal'],
            ['sleightOfHand', 'plant'],
            ['techUse', 'repair'],
            ['security', 'bypassLock'],
            ['athletics', 'breakObject'],
            ['demolition', 'placeCharge'],
            ['demolition', 'defuse'],
        ] as const) {
            expect(skillUseItemSlots(useDef(skill, id)).map((s) => s.key)).toEqual(['item']);
        }
        expect(skillUseItemSlots(useDef('medicae', 'firstAid'))).toEqual([]);
    });

    it('labels each picker and names what is missing from the langpack', () => {
        const [repair] = skillUseItemSlots(useDef('techUse', 'repair'));
        expect(repair).toEqual({
            key: 'item',
            labelKey: 'WH40K.SkillUse.ItemSlot.Item',
            hintKey: 'WH40K.SkillUse.Object.PickRepairHint',
            emptyKey: 'WH40K.SkillUse.Object.NoBroken',
        });
        expect(skillUseItemSlots(useDef('chemUse', 'coatWeapon')).map((s) => s.emptyKey)).toEqual([
            'WH40K.SkillUse.Chem.NoChem',
            'WH40K.SkillUse.Chem.NoWeapon',
        ]);
    });

    it('recognises only the declared slot keys', () => {
        expect(isSkillUseItemSlotKey('item')).toBe(true);
        expect(isSkillUseItemSlotKey('weapon')).toBe(true);
        expect(isSkillUseItemSlotKey('target')).toBe(false);
    });
});

describe('eligible items per use (#535)', () => {
    const chem = candidate('stimm', { type: 'drug', isGear: false, system: { uses: { value: 2 }, grants: { activeEffects: [{}] } } });
    const emptyChem = candidate('spent', { type: 'drug', isGear: false, system: { uses: { value: 0 }, grants: { activeEffects: [{}] } } });
    const inertChem = candidate('inert', { type: 'consumable', isGear: false, system: { uses: { value: 1 }, grants: { activeEffects: [] } } });
    const lasgun = candidate('lasgun', { type: 'weapon', isWeapon: true, isGear: false });
    const brokenAuspex = candidate('auspex', { system: { state: { broken: true } } });
    const jammedPistol = candidate('pistol', { type: 'weapon', isWeapon: true, isGear: false, system: { jammed: true } });
    const destroyed = candidate('slag', { system: { state: { broken: true, destroyed: true } } });
    const lockbox = candidate('lockbox', { system: { state: { locked: true } } });
    const charge = candidate('krak', { system: { state: { armed: { active: false } } } });
    const armed = candidate('armed', { system: { state: { armed: { active: true } } } });
    const talent = candidate('talent', { type: 'talent', isGear: false });
    const unsaved = { ...brokenAuspex, id: null };

    const ids = (items: readonly SkillUseCandidate[]): Array<string | null> => items.map((i) => i.id);

    it('Apply/Coat lists your chems with a dose left and an effect; Coat also lists your weapons', () => {
        const own = [chem, emptyChem, inertChem, lasgun];
        expect(ids(skillUseItemCandidates(useDef('chemUse', 'applyChem'), 'item', own, null))).toEqual(['stimm']);
        expect(ids(skillUseItemCandidates(useDef('chemUse', 'coatWeapon'), 'weapon', own, null))).toEqual(['lasgun']);
    });

    it('Steal lists the target’s physical items; Plant lists yours', () => {
        expect(ids(skillUseItemCandidates(useDef('sleightOfHand', 'steal'), 'item', [lasgun], [brokenAuspex, talent]))).toEqual(['auspex']);
        expect(ids(skillUseItemCandidates(useDef('sleightOfHand', 'steal'), 'item', [lasgun], null))).toEqual([]);
        expect(ids(skillUseItemCandidates(useDef('sleightOfHand', 'plant'), 'item', [lasgun, talent], [brokenAuspex]))).toEqual(['lasgun']);
    });

    it('Repair lists broken or jammed items, yours and the target’s, but never a destroyed one (#444)', () => {
        expect(ids(skillUseItemCandidates(useDef('techUse', 'repair'), 'item', [brokenAuspex, destroyed, lockbox], [jammedPistol]))).toEqual([
            'auspex',
            'pistol',
        ]);
    });

    it('Bypass Lock lists locked items; Break lists intact ones', () => {
        expect(ids(skillUseItemCandidates(useDef('security', 'bypassLock'), 'item', [lockbox, brokenAuspex], null))).toEqual(['lockbox']);
        expect(ids(skillUseItemCandidates(useDef('athletics', 'breakObject'), 'item', [lockbox, brokenAuspex, talent], null))).toEqual(['lockbox']);
    });

    it('Place lists your unarmed charges; Defuse lists armed ones on you or the target', () => {
        expect(ids(skillUseItemCandidates(useDef('demolition', 'placeCharge'), 'item', [charge, armed], [candidate('theirs')]))).toEqual(['krak']);
        expect(ids(skillUseItemCandidates(useDef('demolition', 'defuse'), 'item', [charge], [armed]))).toEqual(['armed']);
    });

    it('never offers an item without an id, nor anything for a use that needs no item', () => {
        expect(skillUseItemCandidates(useDef('techUse', 'repair'), 'item', [unsaved], null)).toEqual([]);
        expect(skillUseItemCandidates(useDef('medicae', 'firstAid'), 'item', [brokenAuspex], null)).toEqual([]);
    });
});

describe('dispatching a picked item to its handler (#535)', () => {
    type Call = [family: string, use: string, ...ids: Array<string | null>];
    function spyHandlers(calls: Call[]): ItemChoiceHandlers<string> {
        return {
            chem: (u, chemId, weaponId) => {
                calls.push(['chem', u.id, chemId, weaponId]);
                return 'chem';
            },
            palm: (u, itemId) => {
                calls.push(['palm', u.id, itemId]);
                return 'palm';
            },
            objectState: (u, itemId) => {
                calls.push(['objectState', u.id, itemId]);
                return 'objectState';
            },
            demolition: (u, itemId) => {
                calls.push(['demolition', u.id, itemId]);
                return 'demolition';
            },
        };
    }

    it.each([
        ['chemUse', 'applyChem', ['chem', 'applyChem', 'x', null]],
        ['sleightOfHand', 'steal', ['palm', 'steal', 'x']],
        ['sleightOfHand', 'plant', ['palm', 'plant', 'x']],
        ['techUse', 'repair', ['objectState', 'repair', 'x']],
        ['security', 'bypassLock', ['objectState', 'bypassLock', 'x']],
        ['athletics', 'breakObject', ['objectState', 'breakObject', 'x']],
        ['demolition', 'placeCharge', ['demolition', 'placeCharge', 'x']],
        ['demolition', 'defuse', ['demolition', 'defuse', 'x']],
    ] as const)('%s / %s calls its handler with the picked item', (skill, id, expected) => {
        const calls: Call[] = [];
        dispatchItemChoiceUse(useDef(skill, id), { item: 'x' }, spyHandlers(calls));
        expect(calls).toEqual([expected]);
    });

    it('Coat Weapon passes both the chem and the weapon', () => {
        const calls: Call[] = [];
        dispatchItemChoiceUse(useDef('chemUse', 'coatWeapon'), { item: 'stimm', weapon: 'lasgun' }, spyHandlers(calls));
        expect(calls).toEqual([['chem', 'coatWeapon', 'stimm', 'lasgun']]);
    });

    it('Apply Chem ignores a stray weapon pick', () => {
        const calls: Call[] = [];
        dispatchItemChoiceUse(useDef('chemUse', 'applyChem'), { item: 'stimm', weapon: 'lasgun' }, spyHandlers(calls));
        expect(calls).toEqual([['chem', 'applyChem', 'stimm', null]]);
    });

    it('calls nothing while a needed slot is empty, or for a use that needs no item', () => {
        const calls: Call[] = [];
        expect(dispatchItemChoiceUse(useDef('techUse', 'repair'), {}, spyHandlers(calls))).toBeNull();
        expect(dispatchItemChoiceUse(useDef('chemUse', 'coatWeapon'), { item: 'stimm' }, spyHandlers(calls))).toBeNull();
        expect(dispatchItemChoiceUse(useDef('medicae', 'firstAid'), { item: 'x' }, spyHandlers(calls))).toBeNull();
        expect(calls).toEqual([]);
    });
});
