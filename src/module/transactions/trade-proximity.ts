import { t } from '../i18n/t.ts';
import { calculateTokenDistance } from '../utils/range-calculator.ts';
import { TransactionManager } from './transaction-manager.ts';

/**
 * @file Trade proximity detection + token-HUD entry point.
 *
 * The player→NPC trade interface is offered against a source NPC only when the
 * buyer's token shares the active scene with it and stands within
 * {@link TRADE_RANGE_METRES}. The pure {@link selectNearbySources} function
 * holds the rule so it can be unit-tested without a live canvas; the thin
 * wrappers below read Foundry's canvas/HUD state.
 */

/** Maximum distance (metres) between a buyer token and a source NPC token for trade to be offered. */
export const TRADE_RANGE_METRES = 3;

export interface NearbySource {
    actorId: string;
    actorName: string;
    tokenId: string;
    distance: number;
}

type TokenLike = foundry.canvas.placeables.Token;

interface TradeHudApp {
    object?: TokenLike | null;
}

/**
 * Pure selection: from a buyer token and a list of candidate tokens on the
 * same scene, return the ones whose actor is a configured transaction source
 * and that lie within range, nearest first.
 *
 * @param buyerToken      The buyer's placed token.
 * @param candidates      Other tokens on the same scene as the buyer.
 * @param isSource        Predicate: is this actor a barter/requisition source?
 * @param distanceFn      Distance (metres) between two tokens.
 * @param maxRangeMetres  Inclusive range cap.
 */
export function selectNearbySources(
    buyerToken: TokenLike,
    candidates: TokenLike[],
    isSource: (actor: Actor.Implementation) => boolean,
    distanceFn: (a: TokenLike, b: TokenLike) => number,
    maxRangeMetres: number = TRADE_RANGE_METRES,
): NearbySource[] {
    const buyerActorId = buyerToken.actor?.id ?? null;
    const found: NearbySource[] = [];

    for (const candidate of candidates) {
        const actor = candidate.actor;
        if (actor === null) continue;
        if (actor.id === null) continue;
        if (buyerActorId !== null && actor.id === buyerActorId) continue;
        if (!isSource(actor)) continue;

        const distance = distanceFn(buyerToken, candidate);
        if (distance > maxRangeMetres) continue;

        found.push({
            actorId: actor.id,
            actorName: actor.name,
            tokenId: candidate.id,
            distance,
        });
    }

    return found.sort((left, right) => left.distance - right.distance);
}

/**
 * Canvas-backed wrapper: every source NPC within trade range of the buyer
 * token on the active scene. Tokens in `canvas.tokens.placeables` are by
 * definition on the active scene, so scene membership reduces to "is there an
 * active scene". Returns an empty array when the canvas is unavailable.
 */
function findNearbySources(buyerToken: TokenLike | null | undefined, maxRangeMetres: number = TRADE_RANGE_METRES): NearbySource[] {
    if (!buyerToken) return [];
    if (canvas.scene?.active !== true) return [];

    const candidates = canvas.tokens?.placeables ?? [];
    return selectNearbySources(buyerToken, candidates, (actor) => TransactionManager.isSourceActor(actor), calculateTokenDistance, maxRangeMetres);
}

/**
 * Inject a "Trade" button into the buyer token's HUD when a configured source
 * NPC is within reach. This is the deliberate, proximity-gated entry point:
 * the option only appears on the player's own token while a source stands
 * within {@link TRADE_RANGE_METRES} on the active scene.
 */
function onTokenHudRender(app: TradeHudApp, html: HTMLElement | JQuery): void {
    const token = app.object ?? null;
    const actor = token?.actor ?? null;
    if (!token || !actor) return;
    if (!actor.isOwner) return;
    if (TransactionManager.isSourceActor(actor)) return;

    const nearby = findNearbySources(token);
    if (nearby.length === 0) return;

    const root = html instanceof HTMLElement ? html : html[0];
    if (!(root instanceof HTMLElement)) return;
    if (root.querySelector('.wh40k-token-trade')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add('wh40k-token-trade');
    button.title = t('WH40K.Trade.HudTooltip');
    button.innerHTML = `<i class="fa-solid fa-handshake"></i><span style="font-weight:700">${t('WH40K.Trade.HudButton')}</span>`;
    Object.assign(button.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 8px',
        background: 'rgba(0,0,0,0.7)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '4px',
        color: '#ddd',
        fontSize: '0.7rem',
        cursor: 'pointer',
    });

    button.addEventListener('click', (event) => {
        event.preventDefault();
        void openTradeForToken(token);
    });

    const container = document.createElement('div');
    container.classList.add('wh40k-token-trade-row');
    Object.assign(container.style, {
        display: 'flex',
        justifyContent: 'center',
        padding: '4px',
        position: 'absolute',
        top: '-40px',
        left: '50%',
        transform: 'translateX(-50%)',
        whiteSpace: 'nowrap',
    });
    container.appendChild(button);
    root.appendChild(container);
}

/** Open the trade dialog for the given buyer token, scoped to its in-range sources. */
async function openTradeForToken(buyerToken: TokenLike): Promise<void> {
    const actor = buyerToken.actor;
    if (!actor) return;

    const nearby = findNearbySources(buyerToken);
    if (nearby.length === 0) {
        ui.notifications.warn(t('WH40K.Trade.NoSourcesNearby'));
        return;
    }

    const { default: TransactionRequestDialog } = await import('../applications/dialogs/transaction-request-dialog.ts');
    const [primary] = nearby;
    await TransactionRequestDialog.show(actor, {
        sourceId: primary!.actorId,
        restrictToSourceIds: nearby.map((entry) => entry.actorId),
    });
}

/** Register the proximity trade HUD hook. Called once during system init. */
export function registerTradeProximityHud(): void {
    Hooks.on('renderTokenHUD', (app: TradeHudApp, html: HTMLElement | JQuery) => {
        onTokenHudRender(app, html);
    });
}
