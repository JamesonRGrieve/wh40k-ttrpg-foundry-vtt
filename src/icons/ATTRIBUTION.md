# Icon Attribution

This system uses icons from various sources that require attribution.

## Game-Icons.net (via CDN)

Icons are loaded from [game-icons.net](https://game-icons.net/) via jsDelivr CDN.
No icons are bundled with this system - they are fetched on-demand.

**CDN URL:** `https://cdn.jsdelivr.net/gh/game-icons/icons@master`

**License:** CC BY 3.0 (Creative Commons Attribution 3.0 Unported)
**License URL:** https://creativecommons.org/licenses/by/3.0/

### Credits

The icons are created by various artists including but not limited to:
- Lorc (https://lorcblog.blogspot.com/)
- Delapouite (https://delapouite.com/)
- John Colburn
- Felbrigg
- John Redman
- Carl Olsen
- Sbed
- PriorBlue
- Willdabeast
- Viscious Speed
- Lord Berandas
- Irongamer
- HeavenlyDog
- Lucas
- Faithtoken
- Skoll
- Andy Meneely
- Cathelineau
- Kier Heyl
- Aussiesim
- DarkZaitzev
- Sparker

**Attribution Statement:**
Icons by game-icons.net contributors, licensed under CC BY 3.0.

For the full list of contributors and their individual works, please visit:
https://game-icons.net/about.html

## Font Awesome Free (inlined SVG)

A few solid and regular icons from Font Awesome Free are inlined as SVG markup into
`src/module/icons/registry.generated.ts` by `scripts/gen-icons.mjs`, which reads them
from the `@fortawesome/free-solid-svg-icons` and `@fortawesome/free-regular-svg-icons`
packages (registry keys `fa:` / `far:`).

**Copyright:** Fonticons, Inc. (https://fontawesome.com)
**License:** CC BY 4.0 (icons)
**License URL:** https://fontawesome.com/license/free

## Lucide (inlined SVG)

A few Lucide icons are inlined the same way from the `lucide` package (registry key `lucide:`).

**Copyright:** Lucide Contributors (portions Cole Bemis, Feather)
**License:** ISC License
**License URL:** https://lucide.dev/license

## Usage in Code

Icons can be accessed via the helper module:

```javascript
import { getIconUrl, getDefaultIcon } from './module/helpers/game-icons.mjs';

// Get a specific icon
const swordIcon = getIconUrl('lorc/sword');

// Get default icon for an item type
const weaponIcon = getDefaultIcon('weapon');
```

## How to Attribute

When using these icons in your derivative works, you should include an attribution such as:
"Icons from game-icons.net, licensed under CC BY 3.0"
