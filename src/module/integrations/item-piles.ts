import { type CurrencyConfig, WH40K } from '../config.ts';
import { SYSTEM_ID } from '../constants.ts';

/**
 * Item Piles (and basic economy plugin) integration.
 *
 * The derived `system.price` (see PhysicalItemTemplate / docs/VALUATION.md)
 * exposes the active line's throne-gelt valuation at a Foundry-standard path so
 * generic merchant/loot modules price our items. This module additionally
 * registers all line currencies with Item Piles when that module is present.
 */

/** Minimal feature-detected view of the Item Piles API we call. */
interface ItemPilesApiLike {
    addSystemIntegration?: (data: object) => void;
}

/** Item Piles attribute-backed currency entry. */
interface ItemPilesCurrency {
    type: 'attribute';
    name: string;
    img: string;
    abbreviation: string;
    data: { path: string };
    primary: boolean;
    exchangeRate: number;
}

/** Build the Item Piles system-integration payload from CONFIG.wh40k.currencies. */
function buildItemPilesConfig(): { ITEM_PRICE_ATTRIBUTE: string; CURRENCIES: ItemPilesCurrency[] } {
    const currencies: ItemPilesCurrency[] = Object.values(WH40K.currencies).map((currency: CurrencyConfig) => ({
        type: 'attribute',
        name: currency.label,
        img: 'icons/commodities/currency/coin-engraved-skull-gold.webp',
        abbreviation: `{#}${currency.abbreviation}`,
        data: { path: currency.walletPath },
        primary: currency.primary === true,
        exchangeRate: 1,
    }));
    return { ITEM_PRICE_ATTRIBUTE: 'system.price.value', CURRENCIES: currencies };
}

/**
 * Register the wh40k-rpg ↔ Item Piles integration. No-op when the module is
 * absent; feature-detects the API and falls back to a console hint (manual
 * config documented in docs/VALUATION.md) if the surface differs.
 */
export function registerItemPilesValuation(): void {
    if (game.modules.get('item-piles')?.active !== true) return;

    // 'item-piles-ready' is a third-party module hook outside fvtt-types' hook-name unions.
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-deprecated, no-restricted-syntax -- framework boundary: Hooks.once is deprecated in V14 and typed by core hook name; this shim accepts a third-party hook id */
    // biome-ignore lint/suspicious/noExplicitAny: framework boundary — third-party hook payload
    const hooksOnce = Hooks.once.bind(Hooks) as (event: string, fn: (...args: any[]) => unknown) => number;
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-deprecated, no-restricted-syntax */
    hooksOnce('item-piles-ready', () => {
        try {
            // eslint-disable-next-line no-restricted-syntax -- boundary: item-piles is a third-party module global not present in our type surface
            const api = (game as unknown as { itempiles?: { API?: ItemPilesApiLike } }).itempiles?.API;
            const config = buildItemPilesConfig();
            if (typeof api?.addSystemIntegration === 'function') {
                api.addSystemIntegration({ VERSION: '1.0.0', ...config });
            } else {
                console.warn(
                    `${SYSTEM_ID} | Item Piles present but API.addSystemIntegration is unavailable; configure ITEM_PRICE_ATTRIBUTE='system.price.value' and the currencies manually (docs/VALUATION.md).`,
                );
            }
        } catch (err) {
            console.warn(`${SYSTEM_ID} | Item Piles integration failed; configure manually per docs/VALUATION.md.`, err);
        }
    });
}
