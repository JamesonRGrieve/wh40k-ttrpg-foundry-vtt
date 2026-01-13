# Skill UUID Helper

**Location**: `src/module/helpers/skill-uuid-helper.mjs`

Utility module for looking up skill UUIDs from compendium packs. Handles both standard skills and specialist skills with specializations.

---

## Purpose

The Skill UUID Helper provides functions to:
1. Look up compendium UUIDs for skills by name and specialization
2. Handle specialist skills with specializations (e.g., "Common Lore (Imperium)")
3. Cache results for performance
4. Parse skill names into base name + specialization components

This is particularly useful in the **Origin Path Builder** where choices may grant skills, and we need to display "View Item Sheet" buttons that link to the skill's compendium entry.

---

## Core Functions

### `findSkillUuid(skillName, specialization?)`

Find a skill UUID from the compendium.

**Parameters:**
- `skillName` (string) - The skill name (e.g., "Awareness" or "Common Lore (Imperium)")
- `specialization` (string, optional) - Optional specialization (e.g., "Imperium")

**Returns:** `Promise<string|null>` - Compendium UUID or null if not found

**Examples:**

```javascript
import { findSkillUuid } from "./helpers/skill-uuid-helper.mjs";

// Standard skill
const awarenessUuid = await findSkillUuid("Awareness");
// Returns: "Compendium.rogue-trader.rt-items-skills.xxx"

// Specialist skill with inline specialization
const loreUuid = await findSkillUuid("Common Lore (Imperium)");
// Returns: "Compendium.rogue-trader.rt-items-skills.yyy"

// Specialist skill with separate specialization parameter
const loreUuid2 = await findSkillUuid("Common Lore", "Imperium");
// Returns: "Compendium.rogue-trader.rt-items-skills.yyy"
```

**Search Strategy:**
1. Parse embedded specialization from name if present: `"Common Lore (Imperium)"` → `name="Common Lore"`, `spec="Imperium"`
2. Check cache for previous lookup
3. Try exact name matches in compendium index
4. Try case-insensitive partial matches
5. Return UUID or null

---

### `batchFindSkillUuids(skills)`

Batch lookup multiple skills at once for better performance.

**Parameters:**
- `skills` (Array<{name: string, specialization?: string}>) - Array of skill objects

**Returns:** `Promise<Map<string, string|null>>` - Map of cache keys to UUIDs

**Example:**

```javascript
const skills = [
  { name: "Awareness" },
  { name: "Common Lore", specialization: "Imperium" },
  { name: "Tech-Use" }
];
const results = await batchFindSkillUuids(skills);
// Returns: Map {
//   "Awareness" => "Compendium...",
//   "Common Lore::Imperium" => "Compendium...",
//   "Tech-Use" => "Compendium..."
// }
```

---

### `parseSkillName(fullName)`

Parse a skill name into base name and specialization.

**Parameters:**
- `fullName` (string) - Full skill name (e.g., "Common Lore (Imperium)")

**Returns:** `{name: string, specialization: string|null}`

**Examples:**

```javascript
parseSkillName("Common Lore (Imperium)")
// Returns: { name: "Common Lore", specialization: "Imperium" }

parseSkillName("Awareness")
// Returns: { name: "Awareness", specialization: null }
```

---

### `getSkillFromUuid(uuid)`

Get a skill Item from UUID.

**Parameters:**
- `uuid` (string) - Compendium UUID

**Returns:** `Promise<Item|null>` - The skill Item or null

**Example:**

```javascript
const skill = await getSkillFromUuid("Compendium.rogue-trader.rt-items-skills.xxx");
// Returns: Item instance or null
```

---

### `clearSkillUuidCache()`

Clear the internal cache. Useful when compendium packs are reloaded or modified.

**Example:**

```javascript
clearSkillUuidCache();
```

---

## Cache Behavior

The helper maintains an internal cache (`_skillUuidCache`) to avoid repeated compendium lookups:

- **Cache Key Format**: For standard skills: `"Awareness"`. For specialist skills: `"Common Lore::Imperium"`
- **Cache Hit**: Returns cached UUID immediately
- **Cache Miss**: Performs compendium search, caches result (even if null)
- **Manual Clear**: Call `clearSkillUuidCache()` to invalidate all cached entries

---

## Integration with Origin Path Builder

The Origin Path Choice Dialog uses this helper to fetch UUIDs for skill grants:

```javascript
// In origin-path-choice-dialog.mjs
import { findSkillUuid, parseSkillName } from "../../helpers/skill-uuid-helper.mjs";

// When preparing context for a choice with skill grants
if (grants.skills?.length > 0) {
    const skillData = grants.skills[0];
    if (skillData.uuid) {
        optUuid = skillData.uuid;
    } else {
        // Parse and lookup
        const skillName = skillData.name || skillData;
        const specialization = skillData.specialization || null;
        optUuid = await findSkillUuid(skillName, specialization);
    }
}
```

This allows the "View Item Sheet" button to work for skills in choice cards:

```handlebars
{{#if option.uuid}}
    <button type="button" class="view-item-btn" data-action="viewItem" data-uuid="{{option.uuid}}">
        <i class="fa-solid fa-eye"></i>
    </button>
{{/if}}
```

---

## Skill Data Model

Skills in this system have the following relevant fields:

| Field | Type | Description |
|-------|------|-------------|
| `identifier` | string | Slugified identifier (e.g., "common-lore") |
| `skillType` | string | "basic", "advanced", or "specialist" |
| `specializations` | array | Predefined specializations for specialist skills |

Specialist skills like "Common Lore" have multiple instances in the compendium, one for each common specialization. The helper searches for the exact match.

---

## Compendium Structure

The helper expects the following compendium setup:

- **Pack Name**: `rt-items-skills`
- **Pack Type**: `Item`
- **Document Type**: `skill`

Example compendium entries:
- `Awareness` (standard skill)
- `Common Lore (Imperium)` (specialist skill with specialization)
- `Common Lore (Adeptus Mechanicus)` (different specialization)
- `Tech-Use` (advanced skill)

---

## Error Handling

The helper gracefully handles errors:

1. **Pack Not Found**: Logs warning, returns null
2. **UUID Lookup Fails**: Catches error, returns null
3. **No Match Found**: Logs debug message, returns null

All functions return `null` on failure rather than throwing exceptions, so calling code can safely handle missing skills.

---

## Performance Considerations

- **Caching**: First lookup hits compendium, subsequent lookups use cache
- **Batch Processing**: `batchFindSkillUuids()` runs lookups in parallel
- **Index Search**: Uses lightweight pack index rather than loading full documents
- **Cache Size**: Unbounded - cache grows with unique skill lookups (typically <100 entries)

To clear cache if memory is a concern (rare):
```javascript
clearSkillUuidCache();
```

---

## Testing

When testing the helper:

1. **Standard Skills**: Verify exact name matches work
2. **Specialist Skills**: Test both inline `"Common Lore (Imperium)"` and split `name + specialization`
3. **Case Insensitivity**: Test partial matches with different casing
4. **Missing Skills**: Verify null is returned for non-existent skills
5. **Cache**: Verify repeated lookups are fast (cache hit)

---

## Future Enhancements

Possible improvements:

- **Fuzzy Matching**: Use Levenshtein distance for typo tolerance
- **Multiple Packs**: Support searching multiple skill compendium packs
- **Custom Specializations**: Handle user-created specializations not in compendium
- **Preload Cache**: Option to preload all skill UUIDs at system init

---

## Related Files

- **Data Model**: `src/module/data/item/skill.mjs` - Skill data schema
- **Choice Dialog**: `src/module/applications/character-creation/origin-path-choice-dialog.mjs` - Uses helper for skill UUIDs
- **Origin Builder**: `src/module/applications/character-creation/origin-path-builder.mjs` - Uses helper in preview panel

---

*Last Updated: January 2026*
