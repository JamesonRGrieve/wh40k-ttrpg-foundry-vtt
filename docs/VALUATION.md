# Valuation & economy-plugin compatibility

How item prices and currencies in **wh40k-rpg** interoperate with generic
Foundry economy/merchant modules (Item Piles, Loot Sheet, Trading, Monk's
Enhanced Journal, …).

## Source of truth: `system.cost`

Authored item value lives in the structured, per-line `system.cost` object
(see `src/packs/CLAUDE.md` → *Standard Cost Shape*): a native RAW acquisition
field per line plus an asymmetric `homebrew` block. This is the canonical,
hand-authored data and is never written to by the compatibility layer.

Third-party plugins can't read that nested per-line shape, so we expose a
derived baseline and register our currencies.

## Derived baseline: `system.price`

`PhysicalItemTemplate` exposes a read-only getter:

```ts
system.price === { value: number | null, denomination: 'throne' }
```

- **Derived, never authored.** It mirrors the **active line's** throne-gelt
  valuation — `cost.<line>.homebrew.throneGelt`, or DH1's native
  `cost.dh1.throneGelt`. The active line is resolved by `inferActiveGameLine`
  (owning actor's line → world `primaryGameSystem` → `rt`).
- **RAW-ruleset gated.** In worlds with `dh2Ruleset: 'raw'`, throne gelt is
  intentionally hidden (Influence-only economy), so `value` is `null`. In
  `homebrew` worlds it carries the gelt amount.
- `{ value, denomination }` is the dnd5e-style shape most merchant modules and
  Item Piles already understand, so basic plugins price items with no config.

## Currency registry: `CONFIG.wh40k.currencies`

The six per-line acquisition currencies, each with the item-cost path it reads
and the actor wallet field that holds a character's amount:

| key | currency | line | cost path | wallet path |
| --- | --- | --- | --- | --- |
| `throne` | Throne Gelt (baseline) | dh1 | `system.cost.dh1.throneGelt` | `system.throneGelt` |
| `influence` | Influence | dh2 | `system.cost.dh2.influence` | `system.influence` |
| `profitFactor` | Profit Factor | rt | `system.cost.rt.profitFactor` | `system.rogueTrader.profitFactor.current` |
| `requisition` | Requisition | dw | `system.cost.dw.requisition` | `system.requisition` |
| `infamy` | Infamy | bc | `system.cost.bc.infamy` | `system.infamy` |
| `logistics` | Logistics | ow | `system.cost.ow.logistics` | `system.logisticsRating` |

`throne` is the `primary` currency (mirrored into `system.price`).

## Item Piles integration

`src/module/integrations/item-piles.ts` (`registerItemPilesValuation`, wired in
the `init` hook) registers with Item Piles when that module is active:

- **`ITEM_PRICE_ATTRIBUTE = 'system.price.value'`** — Item Piles reads item
  prices from the derived baseline.
- **`CURRENCIES`** — all six currencies above, each an `attribute` currency
  pointed at its actor wallet path, `throne` flagged `primary`.

It feature-detects `game.itempiles.API.addSystemIntegration`; if the API
surface differs it logs a hint and you configure manually (below). It is a
no-op when Item Piles is absent.

### Manual Item Piles config (fallback)

In **Item Piles → Configure System**:

- **Item Price Attribute:** `system.price.value`
- **Currencies:** add one attribute-currency per row above, using the wallet
  path as the attribute path and the abbreviation/name from the registry; mark
  Throne Gelt primary.

## Other economy plugins

Any module that reads a conventional price path will see `system.price`
(`{ value, denomination }`). Point it at `system.price.value` if it needs a
scalar. Currency wallets use the actor paths in the table above.
