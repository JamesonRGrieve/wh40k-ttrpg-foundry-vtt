import { describe, expect, it } from 'vitest';
import type { FatigueModel, GameSystemId } from './types';
import { SystemConfigRegistry } from './index';

/**
 * Per-system fatigue model (#114). The seven lines split three ways at RAW —
 * halving (DH1/DH2), flat (RT/DW/OW/BC), condition (IM) — and each config's
 * `getFatigueModel()` must return its line's model. A regression here means a
 * line silently reverts to the wrong fatigue mechanic. Configs are pure to
 * construct, so no Foundry runtime is needed.
 */
describe('per-system fatigue model (#114)', () => {
    const EXPECTED: Record<string, FatigueModel> = {
        dh1: 'halving',
        dh2: 'halving',
        rt: 'flat',
        dw: 'flat',
        ow: 'flat',
        bc: 'flat',
        im: 'condition',
    };

    it('covers all seven registered systems', () => {
        expect(SystemConfigRegistry.getIds().sort()).toEqual(['bc', 'dh1', 'dh2', 'dw', 'im', 'ow', 'rt']);
    });

    for (const [id, model] of Object.entries(EXPECTED)) {
        it(`${id} uses the ${model} model`, () => {
            expect(SystemConfigRegistry.get(id as GameSystemId).getFatigueModel().model).toBe(model);
        });
    }

    it('every system returns a well-formed FatigueModelDef', () => {
        for (const cfg of SystemConfigRegistry.getAll()) {
            const def = cfg.getFatigueModel();
            expect(['halving', 'flat', 'condition']).toContain(def.model);
            expect(['tb', 'tb+wpb', 'none']).toContain(def.threshold);
            expect(def.fullRecoveryHours).toBeGreaterThan(0);
        }
    });

    it('RT recovers over 8 hours; DW recovers in 1 and wakes dropping one level', () => {
        expect(SystemConfigRegistry.get('rt').getFatigueModel().fullRecoveryHours).toBe(8);
        const dw = SystemConfigRegistry.get('dw').getFatigueModel();
        expect(dw.fullRecoveryHours).toBe(1);
        expect(dw.wakeBehavior).toBe('drop-one-level');
    });

    it('halving lines use TB+WPB threshold with fatigue-death; flat lines use TB and no death', () => {
        expect(SystemConfigRegistry.get('dh2').getFatigueModel().threshold).toBe('tb+wpb');
        expect(SystemConfigRegistry.get('dh2').getFatigueModel().deathAtDoubleThreshold).toBe(true);
        expect(SystemConfigRegistry.get('ow').getFatigueModel().threshold).toBe('tb');
        expect(SystemConfigRegistry.get('ow').getFatigueModel().deathAtDoubleThreshold).toBe(false);
        expect(SystemConfigRegistry.get('im').getFatigueModel().threshold).toBe('none');
    });
});
