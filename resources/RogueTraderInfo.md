# Rogue Trader VTT - Complete System Reference

> **A Foundry VTT V13 System for the Rogue Trader RPG**
> 
> *Navigate the void, chart the unknown, claim your fortune among the stars*

---

## 🌟 System Overview

Rogue Trader VTT is a modern Foundry VTT implementation of the Rogue Trader RPG, built from the ground up for **Foundry V13** using the latest DataModel architecture. This system brings the full depth of the Warhammer 40K Rogue Trader experience to your virtual tabletop.

### Key Features

- ✅ **V13 DataModel Architecture** — Clean, maintainable code following dnd5e patterns
- ✅ **Complete Character Sheet** — All 9 characteristics, skills, talents, and trackers
- ✅ **Origin Path System** — Full lifepath character creation with drag-and-drop items
- ✅ **Dynasty Economy** — Profit Factor, Acquisitions, and Endeavour tracking
- ✅ **Combat System** — Hit locations, armour by location, weapon attacks with DoS
- ✅ **Starship Support** — Complete starship actors with components and weapons
- ✅ **Vehicle Support** — Ground and air vehicles with full stat blocks
- ✅ **Comprehensive Compendiums** — 4000+ items across 30+ packs

---

## 📜 Core Resolution System

### The Test (d100 Roll-Under)

All meaningful actions resolve as **Tests** — roll percentile dice (1d100) against a target number. You succeed if your roll is **equal to or less than** the target.

| Test Type | Target Number |
|-----------|---------------|
| **Characteristic Test** | Characteristic value ± modifiers |
| **Skill Test** | Governing characteristic + skill training ± modifiers |

### Degrees of Success & Failure

The margin of success or failure determines the **Degrees**:

- **Degrees of Success (DoS)**: Every full 10 points you succeed by = +1 DoS
- **Degrees of Failure (DoF)**: Every full 10 points you fail by = +1 DoF

*Example: Rolling 23 against a target of 55 = success by 32 = 3 DoS*

### Difficulty Modifiers

| Difficulty | Modifier | When to Use |
|------------|----------|-------------|
| Trivial | +60 | Automatic success unless complications |
| Easy | +30 | Simple tasks with no pressure |
| Routine | +20 | Standard tasks with time |
| Ordinary | +10 | Typical difficulty |
| Challenging | +0 | No modifier (baseline) |
| Difficult | −10 | Complex or contested tasks |
| Hard | −20 | Very challenging circumstances |
| Very Hard | −30 | Exceptional difficulty |
| Hellish | −40 to −60 | Near-impossible feats |

**Maximum Total Modifier**: ±60

---

## 👤 Character Identity & Creation

### Header Information

Every character tracks these core identity fields:

| Field | Description |
|-------|-------------|
| **Character Name** | The character's name |
| **Player Name** | The player controlling this character |
| **Career Path** | Core career (Rogue Trader, Arch-Militant, etc.) |
| **Rank** | Current advancement tier within career |
| **Home World** | Origin planet type |
| **Motivation** | Driving force behind the character |

### The Origin Path

Character creation follows a **lifepath structure** where each step grants abilities and bonuses:

1. **Home World** — Determines starting characteristics and background
   - Death World, Void Born, Forge World, Hive World, Imperial World, Noble Born

2. **Birthright** — Early life circumstances
   - Scavenger, Scapegrace, Stubjack, Child of the Creed, Savant, Vaunted

3. **Lure of the Void** — What drew them to the stars
   - Tainted, Criminal, Renegade, Duty Bound, Zealot, Chosen by Destiny

4. **Trials and Travails** — Major life event
   - Press-ganged, Calamity, Ship-Lorn, Dark Voyage, High Vendetta

5. **Motivation** — Core driving goal
   - Endurance, Fortune, Vengeance, Renown, Pride, Prestige

6. **Career** — Role aboard the ship
   - Rogue Trader, Seneschal, Arch-Militant, Void-Master, Explorator, Missionary, Navigator, Astropath Transcendent

---

## ⚔️ The Nine Characteristics

Each characteristic has:
- **Base** — Starting value (2d10 + homeworld modifier)
- **Advance** — Purchased improvements (0-5, each adds +5)
- **Modifier** — Situational bonuses/penalties
- **Unnatural** — Multiplier for bonus (×2, ×3, ×4)
- **Total** — `Base + (Advance × 5) + Modifier`
- **Bonus** — Tens digit of total (multiplied by unnatural if applicable)

| Characteristic | Abbr | Governs |
|----------------|------|---------|
| **Weapon Skill** | WS | Melee attacks, Parry |
| **Ballistic Skill** | BS | Ranged attacks |
| **Strength** | S | Melee damage, carrying capacity, Leap/Jump |
| **Toughness** | T | Damage resistance, fatigue threshold |
| **Agility** | Ag | Movement, Dodge, Initiative |
| **Intelligence** | Int | Most knowledge and technical skills |
| **Perception** | Per | Awareness, detection |
| **Willpower** | WP | Psychic powers, mental resistance |
| **Fellowship** | Fel | Social skills, leadership |

---

## 🎯 Skills System

### Training Tiers

| Tier | Effect | Roll Modifier |
|------|--------|---------------|
| **Untrained** | Half characteristic | −½ Char |
| **Trained** | Full characteristic | +0 |
| **+10** | Full characteristic +10 | +10 |
| **+20** | Full characteristic +20 | +20 |

### Standard Skills

| Skill | Char | Type |
|-------|------|------|
| Acrobatics | Ag | Basic |
| Awareness | Per | Basic |
| Barter | Fel | Basic |
| Blather | Fel | Basic |
| Carouse | T | Basic |
| Charm | Fel | Basic |
| Chem-Use | Int | Advanced |
| Ciphers | Int | Advanced |
| Climb | S | Basic |
| Command | Fel | Basic |
| Commerce | Fel | Basic |
| Concealment | Ag | Basic |
| Contortionist | Ag | Basic |
| Deceive | Fel | Basic |
| Demolition | Int | Advanced |
| Disguise | Fel | Basic |
| Dodge | Ag | Basic |
| Evaluate | Int | Basic |
| Gamble | Int | Basic |
| Inquiry | Fel | Basic |
| Interrogation | WP | Advanced |
| Intimidate | S | Basic |
| Invocation | WP | Advanced |
| Lip Reading | Per | Advanced |
| Literacy | Int | Basic |
| Logic | Int | Basic |
| Medicae | Int | Advanced |
| Navigation | Int | Advanced |
| Psyniscience | Per | Advanced |
| Scrutiny | Per | Basic |
| Search | Per | Basic |
| Security | Ag | Advanced |
| Shadowing | Ag | Advanced |
| Silent Move | Ag | Basic |
| Sleight of Hand | Ag | Advanced |
| Survival | Int | Basic |
| Swim | S | Basic |
| Tech-Use | Int | Advanced |
| Tracking | Int | Advanced |
| Wrangling | Int | Advanced |

### Specialist Skills (with Specializations)

These skills require you to specify what you're trained in:

- **Common Lore** (Int) — Adeptus Mechanicus, Imperial Guard, etc.
- **Forbidden Lore** (Int) — Warp, Xenos, Daemonology, etc.
- **Scholastic Lore** (Int) — Astromancy, Heraldry, etc.
- **Speak Language** (Int) — Low Gothic, High Gothic, Techna-Lingua, etc.
- **Secret Tongue** (Int) — Military, Underhive, etc.
- **Trade** (Int) — Armorer, Voidfarer, etc.
- **Pilot** (Ag) — Spacecraft, Personal, Flyers, etc.
- **Drive** (Ag) — Ground, Skimmer, Walker, etc.
- **Performer** (Fel) — Singer, Musician, etc.

---

## 💪 Combat System

### Initiative

At combat start: `1d10 + Agility Bonus`

### Actions Per Turn

| Action Type | Examples |
|-------------|----------|
| **Half Action** | Standard Attack, Move, Ready, Aim |
| **Full Action** | Charge, Full Auto Burst, All-Out Attack |
| **Reaction** | Dodge, Parry |
| **Free Action** | Drop item, Speak |

### Attack Resolution

1. Roll WS (melee) or BS (ranged) test
2. Apply difficulty modifiers (range, cover, etc.)
3. On success, determine hit location (1d100)
4. Calculate damage: Weapon Damage + DoS (for some weapons)
5. Apply armour and toughness reduction

### Hit Locations

| Roll | Location | Typical AP |
|------|----------|------------|
| 01-10 | Head | Varies |
| 11-20 | Right Arm | Varies |
| 21-30 | Left Arm | Varies |
| 31-70 | Body | Usually highest |
| 71-85 | Right Leg | Varies |
| 86-00 | Left Leg | Varies |

### Damage Reduction

**Effective Damage** = Weapon Damage − Armour Points − Toughness Bonus

### Reactions

- **Dodge** (Ag test): Avoid one attack (melee or ranged)
- **Parry** (WS test): Deflect one melee attack (requires melee weapon)

---

## 🏃 Movement & Physical Capacity

### Movement Rates (Based on Agility Bonus)

| Move Type | Distance |
|-----------|----------|
| **Half Move** | AB + Size − 4 meters |
| **Full Move** | Half × 2 meters |
| **Charge** | Half × 3 meters |
| **Run** | Half × 6 meters |

### Leap & Jump (Based on Strength Bonus)

| Action | Distance |
|--------|----------|
| **Vertical Leap** | SB ÷ 4 meters (standing) |
| **Horizontal Leap** | SB meters (running) |
| **Jump** | SB × 20 centimeters |

### Carrying Capacity (Based on Strength Bonus)

| Capacity | Weight |
|----------|--------|
| **Carry** | SB × 4.5 kg (sustained) |
| **Lift** | SB × 9 kg (brief overhead) |
| **Push** | SB × 18 kg (drag/push) |

---

## ❤️ Health & Status Trackers

### Wounds

| Field | Description |
|-------|-------------|
| **Max Wounds** | Total wound capacity |
| **Current Wounds** | Remaining wounds |
| **Critical Damage** | Damage beyond 0 wounds (0-10) |

### Fatigue

Fatigue accumulates from exertion, warp exposure, etc.

- **Threshold**: Toughness Bonus + Willpower Bonus
- When fatigue exceeds a characteristic bonus, that characteristic is halved

### Fate Points

Meta-currency for heroic actions:

| Spend | Effect |
|-------|--------|
| Re-roll | Re-roll a failed test (keep new result) |
| +10 Bonus | Add +10 before rolling |
| +1 DoS | Add 1 degree of success after rolling |
| Initiative 10 | Count as having rolled 10 for initiative |
| Recover | Instantly recover 1d5 wounds |

### Insanity & Corruption

| Tracker | Threshold | Effect |
|---------|-----------|--------|
| **Insanity** | Every 10 points | +1 Insanity Degree, risk of Disorders |
| **Corruption** | Every 10 points | +1 Corruption Degree, risk of Malignancies |

---

## 👑 Dynasty Economy

### Profit Factor

An abstract wealth score (1-100+) representing the dynasty's resources.

| Field | Description |
|-------|-------------|
| **Starting PF** | Initial Profit Factor from Warrant |
| **Current PF** | Current dynasty wealth |
| **Misfortunes** | Events that reduced PF |

### Acquisition Tests

To obtain significant items/resources:
1. Roll d100 vs Profit Factor
2. Apply modifiers for Availability, Craftsmanship, and Scale

| Availability | Modifier |
|--------------|----------|
| Ubiquitous | +70 |
| Abundant | +50 |
| Plentiful | +30 |
| Common | +20 |
| Average | +10 |
| Scarce | +0 |
| Rare | −10 |
| Very Rare | −20 |
| Extremely Rare | −30 |
| Near Unique | −50 |
| Unique | −70 |

### Endeavours

Long-term ventures that award Profit Factor:

| Field | Description |
|-------|-------------|
| **Endeavour Name** | Current venture |
| **Achievement Points Required** | Target to complete |
| **Achievement Points Earned** | Current progress |
| **Reward** | PF awarded on completion |

---

## 🚀 Starships

### Ship Statistics

| Stat | Description |
|------|-------------|
| **Speed** | Void Units moved per turn |
| **Manoeuvrability** | Pilot test modifier |
| **Detection** | Sensor capability |
| **Turret Rating** | Point defense weapons |
| **Void Shields** | Hits absorbed before hull |
| **Armour** | Damage reduction |
| **Hull Integrity** | Ship "wounds" |

### Ship Resources

| Resource | Description |
|----------|-------------|
| **Space** | Total/Used capacity for components |
| **Power** | Total/Used power output |
| **Ship Points** | Build budget from Warrant |

### Ship Crew

| Stat | Description |
|------|-------------|
| **Population** | Current crew count |
| **Crew Rating** | Crew skill level (like characteristic) |
| **Morale** | Crew willingness/loyalty |

### Weapon Locations

Ships mount weapons at specific arcs:
- **Dorsal** — Top-mounted
- **Prow** — Forward-facing
- **Port** — Left side
- **Starboard** — Right side
- **Keel** — Underside

### Ship Combat

1. **Initiative**: 1d10 + Detection Bonus
2. **Actions Per Turn**:
   - One Manoeuvre Action (helmsman)
   - One Shooting Action (gunner)
   - Extended Actions for other crew

---

## 🔮 Psychic Powers

### Psy Rating

Psykers have a Psy Rating (PR) that determines power strength.

| Field | Description |
|-------|-------------|
| **Rating** | Base psy rating |
| **Sustained** | Powers currently maintained |
| **Current** | Available rating (Rating − Sustained) |

### Psychic Disciplines

Powers organized by discipline (Telekinesis, Telepathy, etc.) with:
- **Threshold** — Difficulty to manifest
- **Focus Time** — Action type required
- **Range** — Effect distance
- **Sustained** — Whether power requires ongoing concentration

---

## 📋 Compendium Contents

### Actor Packs
- **Bestiary** — Enemy creatures and NPCs
- **Ships** — Pre-built starship templates
- **Vehicles** — Ground and air vehicles

### Item Packs
- **Weapons** — 1000+ ranged and melee weapons
- **Armour** — Protective gear with location coverage
- **Gear** — 750+ equipment items
- **Talents** — 650+ character abilities
- **Traits** — 77 innate characteristics
- **Psychic Powers** — 355 warp abilities
- **Navigator Powers** — 70 Navigator abilities
- **Ship Components** — 212 ship systems
- **Ship Weapons** — 50 macrobatteries and lances
- **Origin Path** — 57 lifepath options
- **Skills** — All skills as droppable items
- **Conditions** — Status effects
- **Rituals** — 22 ritual powers

### Journal Packs
- **Character Actions** — Combat action reference
- **Character Creation** — Creation guide
- **Colonies** — Colony management rules
- **Fear, Insanity, Corruption** — Mental trauma rules
- **Ship & Vehicle Actions** — Starship combat reference

---

## 🛠️ Technical Implementation

### V13 DataModel Architecture

```
Data Models (src/module/data/actor/):
  ActorDataModel
    └── CommonTemplate (templates/common.mjs)
          └── CreatureTemplate (templates/creature.mjs)
                ├── CharacterData (character.mjs)
                └── NPCData (npc.mjs)
    └── StarshipData (starship.mjs)
    └── VehicleData (vehicle.mjs)
```

### Data Preparation Flow

1. `prepareBaseData()` — Initialize tracking objects
2. `prepareDerivedData()` — Calculate characteristics, skills, movement
3. `prepareEmbeddedData()` — Process items (armour, modifiers, XP)

### Modifier System

Items can provide modifiers to:
- Characteristics
- Skills
- Combat stats (to-hit, damage, initiative, defence)
- Wounds and Fate
- Movement

All modifier sources are tracked for transparency/tooltips.

---

## 🎮 Sheet Features

### Character Sheet Tabs

| Tab | Contents |
|-----|----------|
| **Overview** | Vitals, characteristics HUD, quick stats |
| **Combat** | Weapons, armour, hit locations |
| **Skills** | All skills with training controls |
| **Talents** | Talents and traits |
| **Equipment** | Gear, cybernetics, force fields |
| **Powers** | Psychic powers, Navigator powers |
| **Dynasty** | Profit Factor, acquisitions, endeavours |
| **Biography** | Personal details, notes |

### Interactive Features

- **Click characteristics** to roll tests
- **Click skills** to roll skill tests
- **Click training buttons** to toggle T/+10/+20
- **Click hit location roller** to roll 1d100 location
- **Drag items** from compendiums to sheet
- **Expand panels** for additional details

---

## 📝 Version History

### January 2026 — V13 Architecture Refactor

- Migrated to Foundry V13 DataModel architecture
- Implemented template mixins (CommonTemplate, CreatureTemplate)
- Added hit location roll bands with interactive roller
- Added Leap/Jump/Lift/Carry/Push auto-calculations
- Added Player Name and Rank to character header
- Slimmed document classes (acolyte.mjs: 709 → 388 lines)
- Extracted utility functions (armour-calculator, encumbrance-calculator)
- Consolidated event handlers in parent sheet classes

---

*For the Emperor and the Warrant of Trade!*
