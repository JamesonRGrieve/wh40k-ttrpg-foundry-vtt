import { describe, expect, it } from 'vitest';
import { vehicleTestSkill } from '../../rules/vehicle-trait-tests.ts';
import { BCSystemConfig } from './bc-config';
import { DH1eSystemConfig } from './dh1-config';
import { DH2eSystemConfig } from './dh2-config';
import { DWSystemConfig } from './dw-config';
import { OWSystemConfig } from './ow-config';
import { RTSystemConfig } from './rt-config';

/**
 * The skill a driver tests for each kind of craft, as each line's skill chapter
 * prints it (content#28). A Floor It! / Difficult Terrain test is a driving test,
 * so it takes this skill and specialisation.
 */

const operate = (specialisation: string): { skill: string; specialisation: string } => ({ skill: 'operate', specialisation });

describe('aptitude lines: Operate (DH2, OW, BC)', () => {
    for (const config of [new DH2eSystemConfig(), new OWSystemConfig(), new BCSystemConfig()]) {
        describe(`line ${config.id}`, () => {
            const drive = (locomotion: Parameters<typeof vehicleTestSkill>[1]): ReturnType<typeof vehicleTestSkill> =>
                vehicleTestSkill('floorIt', locomotion, config.vehicleDriving);

            it('tracked and wheeled terracraft are Operate (Surface)', () => {
                expect(drive('tracked')).toEqual(operate('Surface'));
                expect(drive('wheeled')).toEqual(operate('Surface'));
            });

            it('walkers and skimmers are Operate (Surface): "walkers … and skimmers"', () => {
                expect(drive('walker')).toEqual(operate('Surface'));
                expect(drive('skimmer')).toEqual(operate('Surface'));
                expect(drive('hover')).toEqual(operate('Surface'));
            });

            it('boats are Operate (Surface)', () => {
                expect(drive('hull')).toEqual(operate('Surface'));
            });

            it('aircraft are Operate (Aeronautica)', () => {
                expect(drive('flyer')).toEqual(operate('Aeronautica'));
                expect(drive('vtol')).toEqual(operate('Aeronautica'));
            });

            it('voidships are Operate (Voidship)', () => {
                expect(drive('voidship')).toEqual(operate('Voidship'));
            });

            it('an emplacement is never driven', () => {
                expect(drive('immobile')).toBeNull();
            });
        });
    }
});

describe('RT and DW: Drive / Pilot (RT, DW)', () => {
    for (const config of [new RTSystemConfig(), new DWSystemConfig()]) {
        describe(`line ${config.id}`, () => {
            const drive = (locomotion: Parameters<typeof vehicleTestSkill>[1]): ReturnType<typeof vehicleTestSkill> =>
                vehicleTestSkill('difficultTerrain', locomotion, config.vehicleDriving);

            it('terracraft are Drive (Ground Vehicle), walkers Drive (Walker), skimmers Drive (Skimmer/Hover)', () => {
                expect(drive('tracked')).toEqual({ skill: 'drive', specialisation: 'Ground Vehicle' });
                expect(drive('walker')).toEqual({ skill: 'drive', specialisation: 'Walker' });
                expect(drive('skimmer')).toEqual({ skill: 'drive', specialisation: 'Skimmer/Hover' });
            });

            it('aircraft are Pilot (Flyers) and voidships Pilot (Space Craft)', () => {
                expect(drive('flyer')).toEqual({ skill: 'pilot', specialisation: 'Flyers' });
                expect(drive('voidship')).toEqual({ skill: 'pilot', specialisation: 'Space Craft' });
            });

            it('neither skill covers boats', () => {
                expect(drive('hull')).toBeNull();
            });
        });
    }
});

describe('DH1: Drive / Pilot (DH1)', () => {
    const drive = (locomotion: Parameters<typeof vehicleTestSkill>[1]): ReturnType<typeof vehicleTestSkill> =>
        vehicleTestSkill('floorIt', locomotion, new DH1eSystemConfig().vehicleDriving);

    it('terracraft are Drive (Ground Vehicle), walkers Drive (Walker), skimmers Drive (Hover Vehicle)', () => {
        expect(drive('wheeled')).toEqual({ skill: 'drive', specialisation: 'Ground Vehicle' });
        expect(drive('walker')).toEqual({ skill: 'drive', specialisation: 'Walker' });
        expect(drive('skimmer')).toEqual({ skill: 'drive', specialisation: 'Hover Vehicle' });
    });

    it('a voidship is Pilot (Spacecraft); an aircraft has no single printed group (Civilian or Military Craft)', () => {
        expect(drive('voidship')).toEqual({ skill: 'pilot', specialisation: 'Spacecraft' });
        expect(drive('flyer')).toBeNull();
    });
});
