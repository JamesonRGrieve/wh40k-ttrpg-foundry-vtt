import { describe, expect, it } from 'vitest';
import { ELITE_ADVANCES } from './elite-advances';

/**
 * Elite Advances registry (#86 — Astropath; baseline core elite
 * advances). Pins the canonical XP cost + prerequisite shape so the
 * advancement dialog cannot drift the data.
 *
 * Runtime acceptance still pending:
 *  - Bound to the Highest Power Fate-spend action on the sheet
 *    (suppresses one Psychic Phenomena / Perils roll).
 *  - Supreme Telepath +1 PR rider when manifesting a Telepathy power.
 *  - The Astropath elite-advance item attaching both talent grants.
 */
describe('ELITE_ADVANCES registry (#86)', () => {
    it('exposes Astropath, Inquisitor, Psyker, Untouchable elite-advance entries', () => {
        for (const id of ['astropath', 'inquisitor', 'psyker', 'untouchable']) {
            const entry = ELITE_ADVANCES[id];
            expect(entry, `missing elite advance: ${id}`).toBeDefined();
            expect(entry!.id).toBe(id);
            expect(entry!.label.length).toBeGreaterThan(0);
        }
    });

    it('Astropath: 1000 XP cost, WP 40 + Psyniscience + Sanctioned prereqs', () => {
        const a = ELITE_ADVANCES['astropath'];
        expect(a, 'Astropath entry missing').toBeDefined();
        expect(a!.xpCost).toBe(1000);
        const prereqs = a!.prerequisites;
        const wpPrereq = prereqs.find((p) => p.type === 'characteristic' && p.key === 'willpower');
        expect(wpPrereq?.minimum).toBe(40);
        expect(prereqs.some((p) => p.type === 'skill' && p.key === 'psyniscience')).toBe(true);
        expect(prereqs.some((p) => p.type === 'talent' && p.key === 'Sanctioned')).toBe(true);
    });

    it('every elite advance carries a non-zero XP cost', () => {
        // Note: prerequisite count is intentionally not pinned at >= 1.
        // Some advances (e.g. Untouchable) are GM-gated per RAW with no
        // characteristic/skill/talent prerequisite, so an empty
        // prerequisites array is canonical, not a data gap.
        for (const entry of Object.values(ELITE_ADVANCES)) {
            expect(entry.xpCost, `${entry.id} XP cost should be > 0`).toBeGreaterThan(0);
        }
    });

    it('prerequisite shape: {type, key, minimum} where type ∈ {characteristic, skill, talent}', () => {
        for (const entry of Object.values(ELITE_ADVANCES)) {
            for (const p of entry.prerequisites) {
                expect(['characteristic', 'skill', 'talent']).toContain(p.type);
                expect(p.key.length).toBeGreaterThan(0);
                expect(Number.isFinite(p.minimum)).toBe(true);
            }
        }
    });
});
