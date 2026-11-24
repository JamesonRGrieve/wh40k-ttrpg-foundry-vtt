/**
 * @file An auspex scan on the canvas (#759).
 *
 * The scanner's token sweeps the map: a ring runs out to the scanner's range and each
 * contact it finds shows as an unidentified blip, for the scanner's player and the GMs
 * only, then fades. Hidden tokens stay hidden: a blip names nothing. The GMs also get a
 * whispered card listing each contact by name, distance, bearing and kind.
 *
 * What the scan finds is decided by the pure `rules/auspex-scan.ts`: tokens within range
 * on the scanner's own level, behind no wall too thick for the scanner to see through.
 * A wall's thickness (centimetres) and shielding are flags the GM sets on the wall
 * (`flags.wh40k-rpg.scanThickness`, `flags.wh40k-rpg.scanShielded`).
 */
import { SYSTEM_ID } from '../constants.ts';
import { t } from '../i18n/t.ts';
import { contactKindFor, type ScanCandidate, type ScanContact, type ScannerReach, scanContacts, type ScanPoint, type ScanWall } from '../rules/auspex-scan.ts';
import { emitSystemSocket, onSystemSocket, type SystemSocketMessage } from '../utils/system-socket.ts';
import { pixelsPerUnit } from './area-regions.ts';
import { scanCardContext } from './auspex-scan-view.ts';

/** The GM card's template. */
const SCAN_CHAT_TEMPLATE = 'systems/wh40k-rpg/templates/chat/auspex-scan-chat.hbs';

/** How long the sweep runs out, and how long the blips stay, in milliseconds. */
const SWEEP_MS = 1500;
const BLIP_MS = 6000;

/** The scanner's green. */
const SCAN_COLOR = 0x4caf50;

/** A scan's result as the canvas draws it: where it came from, how far it reached, where its blips are. */
export interface ScanSweep {
    sceneId: string;
    origin: ScanPoint;
    rangePx: number;
    blips: ScanPoint[];
}

/** The sweep relayed to the GMs. */
interface ScanSweepMessage extends SystemSocketMessage, ScanSweep {
    type: 'auspexScan';
}

/** The fields of a canvas token a scan reads. */
interface ScanTokenView {
    id: string;
    name: string;
    center: ScanPoint;
    level: string | null;
    actorType: string | null;
}

/** A canvas token as the scan reads it. */
function tokenView(token: foundry.canvas.placeables.Token): ScanTokenView {
    const doc = token.document;
    // eslint-disable-next-line no-restricted-syntax -- boundary: foundry.utils.getProperty returns unknown; TokenDocument#level (V14) is absent from fvtt-types
    const level: unknown = foundry.utils.getProperty(doc, 'level');
    return {
        id: doc.id ?? '',
        name: doc.name,
        center: { x: token.center.x, y: token.center.y },
        level: typeof level === 'string' ? level : null,
        actorType: doc.actor?.type ?? null,
    };
}

/** The walls on the scene, with the thickness and shielding the GM set on them. Open doors are no wall. */
function sceneWalls(): ScanWall[] {
    const walls: ScanWall[] = [];
    for (const wall of canvas.walls?.placeables ?? []) {
        const doc = wall.document;
        if (doc.door !== CONST.WALL_DOOR_TYPES.NONE && doc.ds === CONST.WALL_DOOR_STATES.OPEN) continue;
        const [x0, y0, x1, y1] = doc.c;
        // The wall's flag scopes are typed as core-only, so read the system flags by path.
        // eslint-disable-next-line no-restricted-syntax -- boundary: foundry.utils.getProperty returns unknown; the scan flags are numbers / booleans this module reads
        const thickness: unknown = foundry.utils.getProperty(doc, `flags.${SYSTEM_ID}.scanThickness`);
        // eslint-disable-next-line no-restricted-syntax -- boundary: foundry.utils.getProperty returns unknown; the scan flags are numbers / booleans this module reads
        const shielded: unknown = foundry.utils.getProperty(doc, `flags.${SYSTEM_ID}.scanShielded`);
        walls.push({
            a: { x: x0, y: y0 },
            b: { x: x1, y: y1 },
            thickness: typeof thickness === 'number' && thickness > 0 ? thickness : null,
            shielded: shielded === true,
        });
    }
    return walls;
}

/** The token on the viewed scene that stands for `actor` (a linked token, else any controlled token of it). */
export function scannerToken(actor: Actor.Implementation): foundry.canvas.placeables.Token | null {
    const tokens = actor.getActiveTokens(true);
    return tokens.find((token) => token.controlled) ?? tokens.at(0) ?? null;
}

/**
 * Run a scan from `scanner`'s token: the contacts it finds, nearest first. Every other
 * token with an actor is a candidate, on the scanner's own level when levels are used.
 * Null without a drawn scene.
 */
export function scanFrom(scanner: foundry.canvas.placeables.Token, reach: ScannerReach): ScanContact[] | null {
    const ppu = pixelsPerUnit();
    if (ppu === null) return null;
    const scannerView = tokenView(scanner);
    const candidates: ScanCandidate[] = [];
    for (const token of canvas.tokens?.placeables ?? []) {
        const view = tokenView(token);
        if (view.id === scannerView.id || view.actorType === null) continue;
        if (scannerView.level !== null && view.level !== null && view.level !== scannerView.level) continue;
        candidates.push({ id: view.id, name: view.name, center: view.center, kind: contactKindFor(view.actorType) });
    }
    return scanContacts(scannerView.center, candidates, sceneWalls(), ppu, reach);
}

/** Draw a sweep on this client: a ring running out to the range, then a blip on each contact, fading out. */
export function drawScanSweep(sweep: ScanSweep): void {
    const controls = canvas.controls;
    if (controls === undefined || canvas.scene?.id !== sweep.sceneId) return;
    const graphics = new PIXI.Graphics();
    graphics.eventMode = 'none';
    controls.addChild(graphics);
    const start = performance.now();
    const frame = (now: number): void => {
        const elapsed = now - start;
        if (elapsed >= SWEEP_MS + BLIP_MS || graphics.destroyed) {
            if (!graphics.destroyed) {
                controls.removeChild(graphics);
                graphics.destroy();
            }
            return;
        }
        graphics.clear();
        const sweepT = Math.min(1, elapsed / SWEEP_MS);
        const fade = elapsed < SWEEP_MS ? 1 : 1 - (elapsed - SWEEP_MS) / BLIP_MS;
        graphics.lineStyle(3, SCAN_COLOR, 0.8 * fade);
        graphics.drawCircle(sweep.origin.x, sweep.origin.y, sweep.rangePx * sweepT);
        for (const blip of sweep.blips) {
            const reached = Math.hypot(blip.x - sweep.origin.x, blip.y - sweep.origin.y) <= sweep.rangePx * sweepT;
            if (!reached) continue;
            const pulse = 0.6 + 0.4 * Math.sin(elapsed / 150);
            graphics.beginFill(SCAN_COLOR, 0.85 * fade * pulse);
            graphics.drawCircle(blip.x, blip.y, 12);
            graphics.endFill();
        }
        requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
}

/** Show a sweep here and on every GM's client. */
export function broadcastScanSweep(sweep: ScanSweep): void {
    drawScanSweep(sweep);
    const message: ScanSweepMessage = { type: 'auspexScan', ...sweep };
    emitSystemSocket(message);
}

function isScanSweepMessage(message: SystemSocketMessage): message is ScanSweepMessage {
    return message.type === 'auspexScan';
}

/** Let GMs see other players' sweeps (ready). */
export function registerAuspexScanSocket(): void {
    onSystemSocket((message) => {
        if (!isScanSweepMessage(message) || !game.user.isGM) return;
        drawScanSweep(message);
    });
}

/** Whisper the scan's contacts to the GMs. */
export async function whisperScanToGM(scannerName: string, itemName: string, contacts: readonly ScanContact[]): Promise<void> {
    const content = await foundry.applications.handlebars.renderTemplate(SCAN_CHAT_TEMPLATE, scanCardContext(scannerName, itemName, contacts, t));
    await ChatMessage.create({ user: game.user.id, content, whisper: ChatMessage.getWhisperRecipients('GM') });
}
