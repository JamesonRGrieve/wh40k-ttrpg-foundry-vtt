/**
 * Radical Services Requisition table (within.md p. 72, Table 2-10).
 *
 * Each service has an availability rating and a threat-level cost. The
 * Requisition test target is composed by piping the availability rating
 * through #68's `getRequisitionTestTarget()`. DoS on success buys the
 * service for the listed threat level (consequence escalation lives in
 * the GM's narrative purview).
 */

import type { AvailabilityKey } from './requisition-test.ts';

export type RadicalServiceId =
    | 'bountyHunter'
    | 'darkOracle'
    | 'deathCult'
    | 'heretek'
    | 'hiveGang'
    | 'maleficScholar'
    | 'mutantMercenary'
    | 'roguePsyker'
    | 'recidivist';

export interface RadicalServiceDefinition {
    id: RadicalServiceId;
    label: string;
    availability: AvailabilityKey;
    /** Threat level the warband incurs by hiring this service. */
    threatLevel: number;
    /** Subtlety hit at the moment of hire (per within.md p. 72). */
    subtletyOnHire: number;
}

export const RADICAL_SERVICES: Record<RadicalServiceId, RadicalServiceDefinition> = {
    bountyHunter:   { id: 'bountyHunter',   label: 'Bounty Hunter',    availability: 'scarce',         threatLevel: 1, subtletyOnHire: -1 },
    darkOracle:     { id: 'darkOracle',     label: 'Dark Oracle',      availability: 'veryRare',       threatLevel: 3, subtletyOnHire: -3 },
    deathCult:      { id: 'deathCult',      label: 'Death Cult',       availability: 'rare',           threatLevel: 2, subtletyOnHire: -2 },
    heretek:        { id: 'heretek',        label: 'Heretek',          availability: 'veryRare',       threatLevel: 3, subtletyOnHire: -3 },
    hiveGang:       { id: 'hiveGang',       label: 'Hive Gang',        availability: 'common',         threatLevel: 1, subtletyOnHire: -1 },
    maleficScholar: { id: 'maleficScholar', label: 'Malefic Scholar',  availability: 'extremelyRare',  threatLevel: 4, subtletyOnHire: -4 },
    mutantMercenary:{ id: 'mutantMercenary',label: 'Mutant Mercenary', availability: 'rare',           threatLevel: 2, subtletyOnHire: -2 },
    roguePsyker:    { id: 'roguePsyker',    label: 'Rogue Psyker',     availability: 'extremelyRare',  threatLevel: 4, subtletyOnHire: -4 },
    recidivist:     { id: 'recidivist',     label: 'Recidivist',       availability: 'scarce',         threatLevel: 2, subtletyOnHire: -2 },
};
