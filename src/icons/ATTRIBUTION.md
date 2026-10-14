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

### Compendium document icons

Pack documents without curated art show a game-icons.net icon chosen for their
function (a weapon by its type, a condition by name, a talent by its aptitude…),
hotlinked as `https://cdn.jsdelivr.net/gh/game-icons/icons@master/<author>/<name>.svg`.
The reviewed choice table is `scripts/pack-icon-map.json`; every icon it uses is
credited here, CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/), no
changes made:

- Icons made by **Carl Olsen** (https://twitter.com/unstoppableCarl): `carl-olsen/crossbow`
- Icons made by **Delapouite** (https://delapouite.com/): `delapouite/all-seeing-eye`, `delapouite/armor-upgrade`, `delapouite/biceps`, `delapouite/blindfold`, `delapouite/bow-arrow`, `delapouite/brain-tentacle`, `delapouite/bullet-impacts`, `delapouite/captain-hat-profile`, `delapouite/chainsaw`, `delapouite/chest-armor`, `delapouite/crosshair`, `delapouite/eye-target`, `delapouite/flail`, `delapouite/flamethrower`, `delapouite/knocked-out-stars`, `delapouite/laser-turret`, `delapouite/leather-armor`, `delapouite/megaphone`, `delapouite/missile-launcher`, `delapouite/overlord-helm`, `delapouite/reload-gun-barrel`, `delapouite/rocket-thruster`, `delapouite/sawed-off-shotgun`, `delapouite/shaking-hands`, `delapouite/spaceship`, `delapouite/star-medal`, `delapouite/swords-power`, `delapouite/warhammer`, `delapouite/wood-club`
- Icons made by **John Colburn** (http://ninmunanmu.com/): `john-colburn/pistol-gun`
- Icons made by **Lorc** (https://lorcblog.blogspot.com/): `lorc/anatomy`, `lorc/armor-vest`, `lorc/armoured-shell`, `lorc/aura`, `lorc/barbed-spear`, `lorc/battle-axe`, `lorc/bestial-fangs`, `lorc/bleeding-wound`, `lorc/bloody-sword`, `lorc/bolt-shield`, `lorc/bolter-gun`, `lorc/book-aura`, `lorc/bordered-shield`, `lorc/brain`, `lorc/broad-dagger`, `lorc/broadsword`, `lorc/broken-bone`, `lorc/bullets`, `lorc/checked-shield`, `lorc/claw-slashes`, `lorc/compass`, `lorc/conversation`, `lorc/crossed-swords`, `lorc/daemon-skull`, `lorc/dna1`, `lorc/electric-whip`, `lorc/energy-shield`, `lorc/fire-bomb`, `lorc/fire-silhouette`, `lorc/fireball`, `lorc/fist`, `lorc/frozen-orb`, `lorc/gears`, `lorc/glowing-hands`, `lorc/gooey-daemon`, `lorc/grab`, `lorc/grenade`, `lorc/hidden`, `lorc/interstellar-path`, `lorc/laser-precision`, `lorc/laserburn`, `lorc/laurel-crown`, `lorc/layered-armor`, `lorc/lightning-saber`, `lorc/lightning-storm`, `lorc/mailed-fist`, `lorc/mighty-spanner`, `lorc/open-book`, `lorc/pentagram-rose`, `lorc/plasma-bolt`, `lorc/prayer`, `lorc/psychic-waves`, `lorc/ray-gun`, `lorc/rune-sword`, `lorc/scroll-unfurled`, `lorc/sentry-gun`, `lorc/space-suit`, `lorc/spanner`, `lorc/spiked-mace`, `lorc/sprint`, `lorc/surprised`, `lorc/sword-clash`, `lorc/tank`, `lorc/telepathy`, `lorc/third-eye`, `lorc/thrown-daggers`, `lorc/turtle-shell`, `lorc/whip`, `lorc/wizard-staff`
- Icons made by **Skoll** (https://game-icons.net/): `skoll/hearing-disabled`, `skoll/machine-gun`, `skoll/tank-tread`, `skoll/winchester-rifle`

The commercial GameDevMarket icon packs these replaced are not licensed for
this system and must never be referenced; `scripts/validate-pack-schema.mjs`
rejects any `_vendored-ui` path (#625).

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

The inlined Font Awesome and Lucide SVGs are generated into `src/module/icons/registry.generated.ts` by `scripts/gen-icons.mjs`, and rendered by key:

```javascript
import { icon } from './module/icons/icon.ts';

const dice = icon('fa:dice-d20', { class: 'tw-w-4 tw-h-4' });
```

In templates: `{{iconSvg "lucide:settings" label="Settings"}}`. game-icons.net icons are referenced by CDN URL, not bundled.

## How to Attribute

When using these icons in your derivative works, you should include an attribution such as:
"Icons from game-icons.net, licensed under CC BY 3.0"
