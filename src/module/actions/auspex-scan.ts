/**
 * @file Start an auspex scan (#759): the item roll of a scanner.
 *
 * A gear item with scanner data (`GearData.scanner`) is used like this: find the
 * user's token on the viewed scene, refuse a second scan in the same combat round when
 * the scanner is limited to once a round, then open the scanner's test through the
 * actor's normal skill roll so the card shows every modifier. `AuspexScanActionData`
 * does the sweep after the roll.
 */
import { scannerToken } from '../canvas/auspex-scan-canvas.ts';
import { SYSTEM_ID } from '../constants.ts';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import type { WH40KItem } from '../documents/item.ts';
import { t } from '../i18n/t.ts';
import type { SimpleSkillData } from '../rolls/action-data.ts';
import { AUSPEX_SCAN_FLAG, AuspexScanActionData, combatStamp } from '../rolls/auspex-scan-action-data.ts';
import { scanAllowed, scannerReach, type ScanStamp } from '../rules/auspex-scan.ts';

/** An actor that can roll a skill with an action instance (a character or an NPC). */
interface SkillRoller {
    rollSkill: (skillName: string, speciality?: string | number, options?: { instance?: SimpleSkillData }) => void | Promise<void>;
}

function canRollSkill(actor: WH40KBaseActor): actor is WH40KBaseActor & SkillRoller {
    return 'rollSkill' in actor && typeof actor.rollSkill === 'function';
}

/** The round recorded on the actor by its last scan, if it is one. */
function lastScan(actor: WH40KBaseActor): ScanStamp | null {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Document#getFlag returns unknown; narrowed to the stamp this module writes
    const flag: unknown = actor.getFlag(SYSTEM_ID, AUSPEX_SCAN_FLAG);
    if (typeof flag !== 'object' || flag === null || !('combatId' in flag) || !('round' in flag)) return null;
    const { combatId, round } = flag;
    return typeof combatId === 'string' && typeof round === 'number' ? { combatId, round } : null;
}

/** Use `item`, a scanner, as `actor`. */
export function performAuspexScan(actor: WH40KBaseActor, item: WH40KItem): void {
    const scanner = item.scanner;
    if (scanner === null || !canRollSkill(actor)) return;
    // eslint-disable-next-line no-restricted-syntax -- boundary: craftsmanship is a PhysicalItemTemplate field not on the shared item system union; narrowed here
    const craftsmanship = (item.system as { craftsmanship?: string }).craftsmanship ?? 'common';
    const reach = scannerReach(scanner, craftsmanship);
    if (reach === null) return;
    const token = scannerToken(actor);
    if (token === null) {
        ui.notifications.warn(t('WH40K.Auspex.NoToken'));
        return;
    }
    if (!scanAllowed(lastScan(actor), combatStamp(), scanner.perRound)) {
        ui.notifications.warn(t('WH40K.Auspex.OncePerRound'));
        return;
    }
    void actor.rollSkill(scanner.testSkill, undefined, { instance: new AuspexScanActionData(token, reach, item.name) });
}
