/**
 * @file The scanner's test (#759): an auspex's Tech-Use test, with the usual roll card.
 *
 * Every line that prints an auspex has the user make a Tech-Use test to read it. On a
 * success the token sweeps the canvas: each contact within the scanner's reach shows as
 * a blip for the scanner's player and the GMs, and the GMs get a whispered card naming
 * them. On a failure the scanner reads nothing. The card states which, and how many
 * contacts there were.
 *
 * In combat a scanner the line limits to once a round records the round it was used,
 * so a second scan that round is refused before the test opens.
 */
import { pixelsPerUnit } from '../canvas/area-regions.ts';
import { broadcastScanSweep, scanFrom, whisperScanToGM } from '../canvas/auspex-scan-canvas.ts';
import { SYSTEM_ID } from '../constants.ts';
import { t } from '../i18n/t.ts';
import type { ScannerReach, ScanStamp } from '../rules/auspex-scan.ts';
import { SimpleSkillData } from './action-data.ts';

/** The actor flag recording the round a scanner was last used. */
export const AUSPEX_SCAN_FLAG = 'auspexScan';

/** The current combat's round, or null outside a started combat. */
export function combatStamp(): ScanStamp | null {
    const combat = game.combat;
    if (combat?.id == null || !combat.started) return null;
    return { combatId: combat.id, round: combat.round };
}

/** The roll of one scan with one scanner, from one token. */
export class AuspexScanActionData extends SimpleSkillData {
    readonly #token: foundry.canvas.placeables.Token;
    readonly #reach: ScannerReach;
    readonly #itemName: string;

    constructor(token: foundry.canvas.placeables.Token, reach: ScannerReach, itemName: string) {
        super();
        this.#token = token;
        this.#reach = reach;
        this.#itemName = itemName;
    }

    /** After the test: on a success, sweep and report; either way, say what the scanner read. */
    override async descriptionText(): Promise<void> {
        const title = t('WH40K.Auspex.EffectTitle');
        const actor = this.rollData.sourceActor;
        const stamp = combatStamp();
        if (actor !== null && stamp !== null) await actor.setFlag(SYSTEM_ID, AUSPEX_SCAN_FLAG, stamp);
        if (!this.rollData.success) {
            this.addEffect(title, t('WH40K.Auspex.NoReading'));
            return;
        }
        const contacts = scanFrom(this.#token, this.#reach) ?? [];
        const ppu = pixelsPerUnit() ?? 0;
        broadcastScanSweep({
            sceneId: canvas.scene?.id ?? '',
            origin: { x: this.#token.center.x, y: this.#token.center.y },
            rangePx: this.#reach.range * ppu,
            blips: contacts.map((contact) => contact.center),
        });
        await whisperScanToGM(actor?.name ?? this.#token.document.name, this.#itemName, contacts);
        this.addEffect(title, t('WH40K.Auspex.Contacts', { count: contacts.length, range: this.#reach.range }));
    }
}
