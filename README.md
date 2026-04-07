# WH40K RPG — Foundry VTT System

Unified Foundry VTT system for FFG/Cubicle 7 Warhammer 40,000 RPGs: Dark Heresy 2e, Rogue Trader, Black Crusade, Only War, Deathwatch.

Forked from [AndruQuiroga/RogueTraderVTT](https://github.com/AndruQuiroga/RogueTraderVTT), which was forked from [mrkeathley/dark-heresy-2nd-vtt](https://github.com/mrkeathley/dark-heresy-2nd-vtt).

## Requirements

- Foundry VTT 13+ (verified on 14.359)
- Node.js 18+
- `game-icons-net` module (recommended, provides item icons)

## Development Setup

```bash
npm install
```

## Build

```bash
npm run build        # Full build: clean → SCSS → copy → packs → archive
npm run scss         # Compile SCSS only
npm run packs        # Compile compendium packs only
npx gulp             # Build + watch for changes
```

Build output goes to `dist/`.

## Code Quality

```bash
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix
npm run format       # Prettier check
npm run format:fix   # Prettier auto-fix
npm run validate:json # Validate lang/en.json
npm run check        # All of the above
```

## Deploy to Foundry VTT

The system is deployed via SCP to the Foundry VTT container. Foundry hot-reloads system files — no service restart needed, just refresh the browser.

```bash
# 1. Build
npm run build

# 2. Clear old deploy and copy new build
ssh root@192.168.5.40 "rm -rf /opt/foundry-vtt/data/Data/systems/wh40k-rpg; mkdir -p /opt/foundry-vtt/data/Data/systems/wh40k-rpg"
scp -r dist/* root@192.168.5.40:/opt/foundry-vtt/data/Data/systems/wh40k-rpg/

# 3. Fix ownership (Foundry runs as foundry-vtt user)
ssh root@192.168.5.40 "chown -R foundry-vtt:foundry-vtt /opt/foundry-vtt/data/Data/systems/wh40k-rpg"

# 4. Refresh browser
```

### One-liner

```bash
npm run build && ssh root@192.168.5.40 "rm -rf /opt/foundry-vtt/data/Data/systems/wh40k-rpg; mkdir -p /opt/foundry-vtt/data/Data/systems/wh40k-rpg" 2>/dev/null && scp -r dist/* root@192.168.5.40:/opt/foundry-vtt/data/Data/systems/wh40k-rpg/ 2>/dev/null && ssh root@192.168.5.40 "chown -R foundry-vtt:foundry-vtt /opt/foundry-vtt/data/Data/systems/wh40k-rpg" 2>/dev/null
```

### Server Details

| Field | Value |
|-------|-------|
| Foundry URL | https://vtt.jamesonrgrieve.ca |
| CT | 5040 on PVE (192.168.9.4), IP 192.168.5.40:30000 |
| System path | `/opt/foundry-vtt/data/Data/systems/wh40k-rpg` |
| Service | `foundry-vtt.service` (systemd) |
| Runs as | `foundry-vtt:foundry-vtt` |

## Architecture

### Actor Types

| Type | Sheet Classes | Description |
|------|--------------|-------------|
| `character` | DarkHeresySheet, RogueTraderSheet, CharacterSheetSidebar | Player characters |
| `npc` | NPCSheetV2 | Non-player characters |
| `vehicle` | VehicleSheet | Land vehicles |
| `starship` | StarshipSheet | Void ships |

### Sheet Inheritance

```
ActorSheetV2 (Foundry core)
  └─ ApplicationV2Mixin
      └─ PrimarySheetMixin (edit/play mode toggle)
          └─ BaseActorSheet (shared mechanics)
              └─ CharacterSheet (common PC sheet)
                  ├─ DarkHeresySheet (DH2e header: Home World, Background, Role, Elite, Divination)
                  └─ RogueTraderSheet (RT header: Home World, Career, Rank)
```

### Key Directories

```
src/
├── module/                    # JavaScript source
│   ├── applications/actor/    # Sheet classes
│   ├── data/actor/            # DataModel schemas
│   ├── documents/             # Document classes
│   ├── rules/                 # Game rules (config, combat, etc.)
│   └── rolls/                 # Roll/damage system
├── templates/                 # Handlebars templates
│   ├── actor/acolyte/         # PC sheet parts (header-dh, header-rt, tabs, etc.)
│   ├── actor/panel/           # Shared panels (skills, characteristics, combat, etc.)
│   └── item/                  # Item sheet templates
├── scss/                      # Stylesheets
├── packs/                     # Compendium pack source (JSON)
├── lang/en.json               # i18n translations (WH40K.* namespace)
└── system.json                # System manifest
```

## Content Policy

This repo does not include copyrighted book text or art.

## License

[GNU General Public License v3.0](https://choosealicense.com/licenses/gpl-3.0/)

## Credits

- [Matt Keathley](https://github.com/mrkeathley) — Original DH2e system
- [AndruQuiroga](https://github.com/AndruQuiroga) — ApplicationV2 rewrite, RT adaptation
- [moo-man](https://github.com/moo-man) — Original DH2e Foundry system
