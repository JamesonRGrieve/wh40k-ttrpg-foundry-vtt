/**
 * Regression guard (#272):
 *  - character.ts no longer hand-rolls the 17-key origin step→name assignment;
 *    it folds the shared mapOriginStepNames() output (plus the legacy
 *    flags.rt.step fallback) into originPath via Object.assign, and builds its
 *    item-stepMap keys from the canonical ORIGIN_STEP_KEYS (+ lineage).
 *  - aircraft.ts / watercraft.ts no longer re-declare the locomotion StringField;
 *    they call the shared locomotionField(initial) exported from vehicle.ts.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string): string => readFileSync(resolve(__dirname, '..', p), 'utf8');
const CHARACTER = read('src/module/data/actor/character.ts');
const VEHICLE = read('src/module/data/actor/vehicle.ts');
const AIRCRAFT = read('src/module/data/actor/aircraft.ts');
const WATERCRAFT = read('src/module/data/actor/watercraft.ts');

describe('character origin-step de-dup (#272)', () => {
    it('uses the shared ORIGIN_STEP_KEYS + mapOriginStepNames helper', () => {
        expect(CHARACTER).toContain("import { ORIGIN_STEP_KEYS, mapOriginStepNames } from './origin-step-names.ts'");
        expect(CHARACTER).toContain('Object.assign(this.originPath, stepNames)');
        expect(CHARACTER).toContain('mapOriginStepNames(originItems)');
    });

    it('drops the 17 hand-written originPath assignments', () => {
        expect(CHARACTER).not.toContain('this.originPath.homeWorld = stepMap');
        expect(CHARACTER).not.toContain('this.originPath.chapter = stepMap');
    });

    it('preserves the legacy flags.rt.step fallback', () => {
        expect(CHARACTER).toMatch(/flags\.rt[\s\S]*?\['step'\]/);
    });
});

describe('vehicle locomotionField de-dup (#272)', () => {
    it('vehicle.ts exports the shared locomotionField builder and uses it', () => {
        expect(VEHICLE).toContain('export function locomotionField(initial: Locomotion)');
        expect(VEHICLE).toContain("locomotion: locomotionField('wheeled')");
    });

    it('aircraft.ts / watercraft.ts call locomotionField instead of redeclaring the field', () => {
        expect(AIRCRAFT).toContain("locomotionField('flyer')");
        expect(AIRCRAFT).not.toContain("initial: 'flyer'");
        expect(WATERCRAFT).toContain("locomotionField('hull')");
        expect(WATERCRAFT).not.toContain("initial: 'hull'");
    });
});
