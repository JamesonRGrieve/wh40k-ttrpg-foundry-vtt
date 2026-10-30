import { describe, expect, it } from 'vitest';
import { DISPOSITION_MODELS } from '../../rules/disposition';
import type { DispositionModelDef, GameSystemId } from './types';
import { SystemConfigRegistry } from './index';

/**
 * Per-line Disposition model (#73). DH2 makes Disposition a 0–100 characteristic;
 * DH1, RT and DW print the seven-step ladder with "one step, plus one step per
 * degree of success"; BC and OW the same ladder with "one step per Degree of Success"; IM prints none.
 */
describe('per-system Disposition model (#73)', () => {
    const EXPECTED: Record<GameSystemId, DispositionModelDef> = {
        dh2: DISPOSITION_MODELS.characteristic,
        dh1: DISPOSITION_MODELS.ladderStepPlusDegrees,
        rt: DISPOSITION_MODELS.ladderStepPlusDegrees,
        dw: DISPOSITION_MODELS.ladderStepPlusDegrees,
        bc: DISPOSITION_MODELS.ladderDegrees,
        ow: DISPOSITION_MODELS.ladderDegrees,
        im: DISPOSITION_MODELS.none,
    };

    it('covers every registered system', () => {
        expect(SystemConfigRegistry.getIds().sort()).toEqual(Object.keys(EXPECTED).sort());
    });

    it.each(Object.entries(EXPECTED))('%s returns its RAW model', (id, model) => {
        expect(SystemConfigRegistry.get(id as GameSystemId).getDispositionModel()).toEqual(model);
    });

    it('only DH2 tests Disposition', () => {
        expect(
            SystemConfigRegistry.getAll()
                .filter((cfg) => cfg.getDispositionModel().testable)
                .map((cfg) => cfg.id),
        ).toEqual(['dh2']);
    });
});
