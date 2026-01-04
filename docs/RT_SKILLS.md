# Rogue Trader Skill Model

The Rogue Trader skill list replaces the previous Dark Heresy 2e layout. Skills use the RT defaults for their characteristics and training tiers (untrained, Basic, Trained, +10, +20) plus an optional flat bonus and notes field. Specialist skills now store repeatable entries as arrays.

## UI Improvements (v1.8.2+)

The skills UI has been completely redesigned for better readability and usability:

### Standard Skills Panel
- **8-column grid layout**: Skill name, characteristic, 4 training columns (Basic, Trained, +10, +20), bonus, and total
- **Individual training checkboxes**: Each training level has its own column for easier reading and selection
- **Icon-enhanced roll buttons**: Dice icon indicates clickable roll buttons
- **Improved spacing**: Better visual hierarchy with hover effects
- **Responsive design**: Adapts to different screen sizes

### Specialist Skills Panel
- **Clear group headers**: Each specialization group (Common Lore, Pilot, etc.) has a distinct header
- **Inline editing**: Name field and roll button are side-by-side for each specialization
- **Visual add buttons**: "Add" button with icon for creating new specializations
- **Helpful empty states**: Informative messages when no specializations exist
- **Consistent layout**: Uses same 8-column grid as standard skills

## Specialisation Groups

These skills hold repeatable entries in `system.skills.<skill>.entries[]`:

- Common Lore (Int)
- Forbidden Lore (Int)
- Scholastic Lore (Int)
- Speak Language (Int)
- Secret Tongue (Int)
- Trade (Int)
- Performer (Fel)
- Pilot (Ag)

Each entry records its own training flags and bonus.

## Complete RT Skills List

### Standard Skills (41 total)

All skills follow the pattern: `system.skills.<skillKey>` with properties:
- `label` (string): Display name
- `characteristic` (string): Default characteristic (WS/BS/S/T/Ag/Int/Per/WP/Fel)
- `basic` (boolean): Basic training level
- `trained` (boolean): Trained level
- `plus10` (boolean): +10 expertise
- `plus20` (boolean): +20 mastery
- `bonus` (number): Flat modifier
- `notes` (string): Optional notes
- `hidden` (boolean): Whether to hide from sheet

**Agility-based:**
- Acrobatics, Concealment, Contortionist, Dodge, Drive, Security, Shadowing, Silent Move, Sleight of Hand

**Perception-based:**
- Awareness, Lip Reading, Psyniscience, Scrutiny, Search

**Fellowship-based:**
- Barter, Blather, Charm, Command, Commerce, Deceive, Disguise, Inquiry

**Intelligence-based:**
- Chem-Use, Ciphers, Demolition, Evaluate, Gamble, Literacy, Logic, Medicae, Navigation, Survival, Tech-Use, Tracking, Wrangling

**Strength-based:**
- Climb, Intimidate, Swim

**Toughness-based:**
- Carouse

**Willpower-based:**
- Interrogation, Invocation

## Compatibility Notes

- Legacy DH2e-only skills are preserved but hidden from the sheet: `Parry`, `Stealth`, and `Athletics`.
- All RT skills now point to their book-accurate default characteristics (e.g., Commerce uses Fel, Survival uses Int, Security uses Ag, Intimidate uses S).
- Existing character data will automatically use the new UI without migration.

## Styling

Skills styling is defined in `src/scss/components/_skills.scss` and includes:
- `.rt-skills-panel` and `.rt-specialist-skills-panel`: Main container classes
- `.rt-skill-row` and `.rt-specialist-row`: Individual skill rows with hover effects
- `.rt-skill-button`: Styled roll buttons with icons
- `.rt-add-specialization`: Styled add buttons for specialist skills
- Responsive breakpoints for smaller screens at 1200px
