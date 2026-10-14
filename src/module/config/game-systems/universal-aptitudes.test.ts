/**
 * Which lines inject a universal aptitude (#631).
 *
 * The sheet's Aptitudes panel shows the actor's granted aptitudes plus the
 * line's `universalAptitudes`, and hides itself when both are empty. DH2 and
 * Only War give every character the General aptitude; Black Crusade has no
 * aptitudes at all (it prices advances by Chaos alignment), and the career
 * lines (DH1, RT, DW) are not aptitude-based. Pinning the set per line keeps a
 * BC sheet from regaining the lone "General" pill.
 */
import { describe, expect, it } from 'vitest';
import { AptitudeBasedSystemConfig } from './aptitude-based-system-config.ts';
import { SystemConfigRegistry } from './index.ts';
import type { GameSystemId } from './types.ts';

function universalAptitudesOf(id: GameSystemId): readonly string[] | null {
    const config = SystemConfigRegistry.get(id);
    return config instanceof AptitudeBasedSystemConfig ? config.universalAptitudes : null;
}

describe('universal aptitudes per line (#631)', () => {
    it.each<GameSystemId>(['dh2', 'ow'])('%s gives every character General', (id) => {
        expect(universalAptitudesOf(id)).toEqual(['General']);
    });

    it('bc has no aptitudes, universal or otherwise', () => {
        expect(universalAptitudesOf('bc')).toEqual([]);
    });

    it.each<GameSystemId>(['dh1', 'rt', 'dw'])('%s is career-based and carries no aptitudes', (id) => {
        expect(SystemConfigRegistry.get(id).usesAptitudes).toBe(false);
        expect(universalAptitudesOf(id)).toBeNull();
    });
});
