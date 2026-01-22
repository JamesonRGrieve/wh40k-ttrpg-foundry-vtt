/**
 * Test data for StatBlockParser
 * Contains sample stat blocks in various formats
 */

export const TEST_STAT_BLOCKS = {
    // Horizontal format (typical Dark Heresy / Rogue Trader)
    horizontal: `Clawed Fiend
WS  BS  S   T   Ag  Int Per WP  Fel Inf
43  01  45  40  40  15  36  28  05  --
(+3)    (x2)
Movement: 5/10/15/30
Wounds: 48
Skills: Awareness (Per), Climb (S) +10, Dodge (Ag) +10
Talents: Swift Attack, Lightning Attack
Traits: Dark Sight, Fear (2), Natural Armour (4), Natural Weapons (Claws), Quadruped, Size (Hulking), Unnatural Strength (x2), Unnatural Toughness (x2)
Weapons: Claws (1d10+14 R; Pen 3; Tearing, Razor Sharp)
Armour: Natural Armour (4) All
Threat Rating: 15`,

    // Vertical format
    vertical: `Chaos Cultist
Weapon Skill: 30
Ballistic Skill: 28
Strength: 32
Toughness: 35
Agility: 30
Intelligence: 28
Perception: 30
Willpower: 25
Fellowship: 28
Influence: 10

Wounds: 12
Movement: 3/6/9/18
Armour: 2

Skills: Athletics, Awareness, Dodge, Intimidate
Talents: Weapon Training (Las, Low-Tech)
Traits: None
Weapons: Autogun (100m; S/-/-; 1d10+3 I; Pen 0; Clip 30; Reload Full)
Threat Level: 5`,

    // Compact format
    compact: `Gretchin
WS 20, BS 25, S 15, T 20, Ag 35, Int 25, Per 30, WP 20, Fel 15
Wounds: 6, Movement: 3/6/9/18, Armour: 0
Skills: Awareness, Dodge, Stealth
Talents: None
Traits: Size (Scrawny), Cowardly
Weapons: Autopistol (30m; S/-/-; 1d10+2 I; Pen 0)
Threat: Minor`,

    // JSON format
    json: `{
  "name": "Test NPC",
  "type": "npcV2",
  "system": {
    "characteristics": {
      "weaponSkill": { "base": 35, "total": 35, "bonus": 3 },
      "ballisticSkill": { "base": 30, "total": 30, "bonus": 3 },
      "strength": { "base": 40, "total": 40, "bonus": 4 },
      "toughness": { "base": 35, "total": 35, "bonus": 3 },
      "agility": { "base": 30, "total": 30, "bonus": 3 },
      "intelligence": { "base": 28, "total": 28, "bonus": 2 },
      "perception": { "base": 32, "total": 32, "bonus": 3 },
      "willpower": { "base": 30, "total": 30, "bonus": 3 },
      "fellowship": { "base": 25, "total": 25, "bonus": 2 }
    },
    "wounds": { "value": 15, "max": 15 },
    "threatLevel": 10
  },
  "items": []
}`,

    // Edge case: minimal data
    minimal: `Unknown Creature
WS 30
Wounds: 10`,

    // Edge case: malformed but parseable
    malformed: `Some NPC
Characteristics: WS40 BS35 S45
Skills: Dodge+20, Awareness
Wounds:25
Threat:8`,
};
