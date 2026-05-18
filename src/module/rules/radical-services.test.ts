import { describe, expect, it } from 'vitest';
import { RADICAL_SERVICES, type RadicalServiceId } from './radical-services';

/**
 * Radical Services Requisition table (#89 — within.md p.72, Table 2-10).
 * Pins the nine canonical services with their availability rating,
 * threat-level cost, and Subtlety hit at hire.
 *
 * Runtime wiring (piping each service through `getRequisitionTestTarget`
 * + the Subtlety apply hook) remains follow-up.
 */
describe('RADICAL_SERVICES table (#89)', () => {
    const ids: RadicalServiceId[] = [
        'bountyHunter',
        'darkOracle',
        'deathCult',
        'heretek',
        'hiveGang',
        'maleficScholar',
        'mutantMercenary',
        'roguePsyker',
        'recidivist',
    ];

    it('exposes a definition for every Table 2-10 service', () => {
        for (const id of ids) {
            const entry = RADICAL_SERVICES[id];
            expect(entry, `missing service: ${id}`).toBeDefined();
            expect(entry.id).toBe(id);
            expect(entry.label.length).toBeGreaterThan(0);
        }
    });

    it('Bounty Hunter — Scarce / threat 1 / Subtlety −1', () => {
        const s = RADICAL_SERVICES.bountyHunter;
        expect(s.availability).toBe('scarce');
        expect(s.threatLevel).toBe(1);
        expect(s.subtletyOnHire).toBe(-1);
    });

    it('Dark Oracle — Very Rare / threat 3 / Subtlety −3', () => {
        const s = RADICAL_SERVICES.darkOracle;
        expect(s.availability).toBe('veryRare');
        expect(s.threatLevel).toBe(3);
        expect(s.subtletyOnHire).toBe(-3);
    });

    it('Malefic Scholar — Extremely Rare / threat 4 / Subtlety −4', () => {
        const s = RADICAL_SERVICES.maleficScholar;
        expect(s.availability).toBe('extremelyRare');
        expect(s.threatLevel).toBe(4);
        expect(s.subtletyOnHire).toBe(-4);
    });

    it('Subtlety hit equals the negation of threat level for every service', () => {
        for (const id of ids) {
            const s = RADICAL_SERVICES[id];
            expect(s.subtletyOnHire, `subtlety mismatch on ${id}`).toBe(-s.threatLevel);
        }
    });

    it('threat levels span 1..4 (no service is threat-free or above 4)', () => {
        for (const id of ids) {
            const s = RADICAL_SERVICES[id];
            expect(s.threatLevel).toBeGreaterThanOrEqual(1);
            expect(s.threatLevel).toBeLessThanOrEqual(4);
        }
    });
});
