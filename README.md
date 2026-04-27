# WH40K RPG — Foundry VTT System

Unified Foundry VTT system for FFG/Cubicle 7 Warhammer 40,000 RPGs: Dark Heresy 1e, Dark Heresy 2e, Rogue Trader, Black Crusade, Only War, Deathwatch, and Imperium Maledictum.

Forked from [AndruQuiroga/RogueTraderVTT](https://github.com/AndruQuiroga/RogueTraderVTT), which was forked from [mrkeathley/dark-heresy-2nd-vtt](https://github.com/mrkeathley/dark-heresy-2nd-vtt).

## Requirements

- Foundry VTT 13+ (verified on 14.359)
- Node.js 18+
- pnpm 10+ (`corepack enable` or install standalone)
- `game-icons-net` module (recommended, provides item icons)

## Development Setup

```bash
pnpm install
```

## Build

```bash
pnpm build        # Full build: clean → SCSS → copy → packs → archive
pnpm scss         # Compile SCSS only
pnpm packs        # Compile compendium packs only
pnpm exec gulp             # Build + watch for changes
```

Build output goes to `dist/`.

## Code Quality

```bash
pnpm lint         # ESLint check
pnpm lint:fix     # ESLint auto-fix
pnpm format       # Prettier check
pnpm format:fix   # Prettier auto-fix
pnpm validate:json # Validate lang/en.json
pnpm check        # All of the above
```

## Deploy to Foundry VTT

The system is deployed via SCP to the Foundry VTT container.

- **System files only** (JS/CSS/templates): Foundry hot-reloads — just refresh the browser.
- **Compendium packs updated**: Purge world pack copies and restart the service so Foundry reimports from the new system packs.

```bash
# 1. Build
pnpm build

# 2. Clear old deploy and copy new build
ssh root@192.168.5.40 "rm -rf /opt/foundry-vtt/data/Data/systems/wh40k-rpg; mkdir -p /opt/foundry-vtt/data/Data/systems/wh40k-rpg"
scp -r dist/* root@192.168.5.40:/opt/foundry-vtt/data/Data/systems/wh40k-rpg/

# 3. Fix ownership (Foundry runs as foundry-vtt user)
ssh root@192.168.5.40 "chown -R foundry-vtt:foundry-vtt /opt/foundry-vtt/data/Data/systems/wh40k-rpg"

# 4a. Refresh browser (system files only)
# OR
# 4b. Purge world packs + restart service (compendiums updated)
ssh root@192.168.5.40 "rm -rf /opt/foundry-vtt/data/Data/worlds/dark-heresy/packs && systemctl restart foundry-vtt.service"
```

### One-liners

System files only (browser refresh after):
```bash
pnpm build && ssh root@192.168.5.40 "rm -rf /opt/foundry-vtt/data/Data/systems/wh40k-rpg; mkdir -p /opt/foundry-vtt/data/Data/systems/wh40k-rpg" 2>/dev/null && scp -r dist/* root@192.168.5.40:/opt/foundry-vtt/data/Data/systems/wh40k-rpg/ 2>/dev/null && ssh root@192.168.5.40 "chown -R foundry-vtt:foundry-vtt /opt/foundry-vtt/data/Data/systems/wh40k-rpg" 2>/dev/null
```

Full deploy with compendium reset:
```bash
pnpm build && ssh root@192.168.5.40 "rm -rf /opt/foundry-vtt/data/Data/systems/wh40k-rpg; mkdir -p /opt/foundry-vtt/data/Data/systems/wh40k-rpg" 2>/dev/null && scp -r dist/* root@192.168.5.40:/opt/foundry-vtt/data/Data/systems/wh40k-rpg/ 2>/dev/null && ssh root@192.168.5.40 "chown -R foundry-vtt:foundry-vtt /opt/foundry-vtt/data/Data/systems/wh40k-rpg && rm -rf /opt/foundry-vtt/data/Data/worlds/dark-heresy/packs && systemctl restart foundry-vtt.service" 2>/dev/null
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
