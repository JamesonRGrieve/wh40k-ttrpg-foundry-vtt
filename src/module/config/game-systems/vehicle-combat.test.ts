import { describe, expect, it } from 'vitest';
import { BCSystemConfig } from './bc-config';
import { DH1eSystemConfig } from './dh1-config';
import { DH2eSystemConfig } from './dh2-config';
import { DWSystemConfig } from './dw-config';
import { IMSystemConfig } from './im-config';
import { OWSystemConfig } from './ow-config';
import { RTSystemConfig } from './rt-config';
import { vehicleCombatRulesFor } from './index';

/** Each line's printed rules for attacking vehicles (content#28). */
describe('vehicleCombat line config', () => {
    it('gives DH2 and OW the Vehicle Hit Locations table (Table 7-29 / 8-24)', () => {
        for (const config of [new DH2eSystemConfig(), new OWSystemConfig()]) {
            expect(config.vehicleCombat.hitLocations).toEqual([
                { max: 20, location: 'motive' },
                { max: 60, location: 'hull' },
                { max: 80, location: 'weapon' },
                { max: 100, location: 'turret' },
            ]);
        }
    });

    it('gives RT and DW one chart and no table', () => {
        expect(new RTSystemConfig().vehicleCombat.hitLocations).toBeNull();
        expect(new DWSystemConfig().vehicleCombat.hitLocations).toBeNull();
    });

    it('needs a damaging hit for Righteous Fury only where the line prints it (OW, DW)', () => {
        expect(new OWSystemConfig().vehicleCombat.righteousFuryNeedsDamage).toBe(true);
        expect(new DWSystemConfig().vehicleCombat.righteousFuryNeedsDamage).toBe(true);
        expect(new DH2eSystemConfig().vehicleCombat.righteousFuryNeedsDamage).toBe(false);
        expect(new RTSystemConfig().vehicleCombat.righteousFuryNeedsDamage).toBe(false);
    });

    it('rolls Righteous Fury on 1d5 on every line', () => {
        for (const config of [
            new BCSystemConfig(),
            new DH1eSystemConfig(),
            new DH2eSystemConfig(),
            new DWSystemConfig(),
            new IMSystemConfig(),
            new OWSystemConfig(),
            new RTSystemConfig(),
        ]) {
            expect(config.vehicleCombat.righteousFuryDie).toBe('1d5');
        }
    });

    it('resolves through the registry, null for an unknown line', () => {
        expect(vehicleCombatRulesFor('dh2')?.hitLocations?.length).toBe(4);
        expect(vehicleCombatRulesFor('bc')?.hitLocations).toBeNull();
        expect(vehicleCombatRulesFor('nope')).toBeNull();
        expect(vehicleCombatRulesFor(undefined)).toBeNull();
    });
});
