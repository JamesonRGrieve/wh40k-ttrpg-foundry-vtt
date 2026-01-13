# Origin Path Consolidation Audit

**Date:** January 13, 2026  
**Status:** IN PROGRESS  
**Goal:** Standardize all 62 origin paths to use the talent-based grants system

---

## Executive Summary

This audit documents every origin path in the system and identifies:
1. What talents need to be created
2. What data format changes are needed
3. What abilities need to be converted to talents

### Standardization Rules

1. **All mechanical abilities** (bonuses, penalties, special rules) should be talents
2. **Simple characteristic/skill modifiers** can remain as direct modifiers
3. **Talents array** must use `object_array` format with UUIDs, not `string_array`
4. **Special abilities** that have mechanical effects become talents
5. **Career paths** need complete rewrite - currently use broken format

### ID Convention for New Talents

| Origin Type | Prefix | Example |
|-------------|--------|---------|
| Death World | DW | DW00000000000001 |
| Void Born | VB | VB00000000000001 |
| Forge World | FW | FW00000000000001 |
| Hive World | HW | HW00000000000001 |
| Imperial World | IW | IW00000000000001 |
| Noble Born | NB | NB00000000000001 |
| Fortress World | FO | FO00000000000001 |
| Frontier World | FR | FR00000000000001 |
| Penal World | PW | PW00000000000001 |
| Battlefleet | BF | BF00000000000001 |
| Child of Dynasty | CD | CD00000000000001 |
| Footfallen | FF | FF00000000000001 |
| Criminal (Lure) | CR | CR00000000000001 |
| Tainted (Lure) | TA | TA00000000000001 |
| Zealot (Lure) | ZE | ZE00000000000001 |
| Chosen by Destiny | CB | CB00000000000001 |
| Duty Bound | DB | DB00000000000001 |
| Renegade | RN | RN00000000000001 |
| Unnatural Origin | UO | UO00000000000001 |
| Lineage | LN | LN00000000000001 |
| Birthright | BR | BR00000000000001 |
| Trials | TR | TR00000000000001 |
| Motivation | MO | MO00000000000001 |
| Career | CA | CA00000000000001 |

---

## HOMEWORLD (Step 1) - 12 Origins

### ✅ Death World
**Status:** COMPLETE  
**File:** `death-world_U7riCIV8VzbXC6SN.json`  
**Format:** Correct (object_array with UUIDs)

**Existing Talents:**
- ✅ If It Bleeds, I Can Kill It (Death World) - `DW00000000000002`
- ✅ Paranoid (Death World) - `DW00000000000003`
- ✅ Survivor (Death World) - `DW00000000000004`

**Choices (use existing talents):**
- Jaded - uses existing `ldTw7wC9T3dPeOig`
- Resistance (Poisons) - uses existing `FWzsS62FRJhejE0b`

**Action Required:** None

---

### ✅ Void Born
**Status:** COMPLETE  
**File:** `void-born_YwBPZ0s6JNPnHNI5.json`  
**Format:** Correct (object_array with UUIDs)

**Existing Talents:**
- ✅ Charmed (Void Born) - `VB00000000000001`
- ✅ Ill-Omened (Void Born) - `VB00000000000002`
- ✅ Shipwise (Void Born) - `VB00000000000003`
- ✅ Void Accustomed (Void Born) - `VB00000000000004`

**Action Required:** None

---

### ✅ Forge World
**Status:** COMPLETE  
**File:** `forge-world_8rKUJtvkUzqxcpmO.json`  
**Format:** Correct (object_array with UUIDs)

**Existing Talents:**
- ✅ Credo Omnissiah (Forge World) - `FW00000000000001`
- ✅ Fit For Purpose (Forge World) - `FW00000000000002`
- ✅ Stranger to the Cult (Forge World) - `FW00000000000003`

**Action Required:** None

---

### ✅ Hive World
**Status:** COMPLETE  
**File:** `hive-world_sFqrqi9aW6SYJiti.json`  
**Format:** Correct (object_array with UUIDs)

**Existing Talents:**
- ✅ Accustomed to Crowds (Hive World) - `HW00000000000001`
- ✅ Caves of Steel (Hive World) - `HW00000000000002`
- ✅ Hivebound (Hive World) - `HW00000000000003`
- ✅ Wary (Hive World) - `HW00000000000004`

**Action Required:** None

---

### ✅ Imperial World
**Status:** COMPLETE  
**File:** `imperial-world_eA6HTHVTDSm0nVon.json`  
**Format:** Correct (object_array with UUIDs)

**Existing Talents:**
- ✅ Blessed Ignorance (Imperial World) - `IW00000000000001`
- ✅ Hagiography (Imperial World) - `IW00000000000002`
- ✅ Liturgical Familiarity (Imperial World) - `IW00000000000003`

**Action Required:** None

---

### ✅ Noble Born
**Status:** COMPLETE  
**File:** `noble-born_ao0mxuIHUI7H08ct.json`  
**Format:** Correct (object_array with UUIDs)

**Existing Talents:**
- ✅ Etiquette (Noble Born) - `NB00000000000001`
- ✅ Legacy of Wealth (Noble Born) - `NB00000000000002`
- ✅ Supremely Connected (Noble Born) - `NB00000000000003`
- ✅ Vendetta (Noble Born) - `NB00000000000004`

**Action Required:** None

---

### ✅ Fortress World (Into the Storm)
**Status:** COMPLETE  
**File:** `fortress-world_kBzm4AAZExdlkqT6.json`  
**Format:** Correct (object_array with UUIDs)

**Existing Talents:**
- ✅ Hated Enemy (Fortress World) - `FO00000000000001`
- ✅ Constant Combat Training (Fortress World) - `FO00000000000002`
- ✅ Steel Nerve (Fortress World) - `FO00000000000003`

**Action Required:** None

---

### ✅ Frontier World (Into the Storm)
**Status:** COMPLETE  
**File:** `frontier-world_Jm99HA5E0ip1iAWp.json`  
**Format:** Correct (object_array with UUIDs)

**Existing Talents:**
- ✅ Tough as Grox-Hide (Frontier World) - `FR00000000000001`
- ✅ Leery of Outsiders (Frontier World) - `FR00000000000002`
- ✅ Tenacious Survivalist (Frontier World) - `FR00000000000003`
- ✅ Xenos Interaction (Frontier World) - `FR00000000000004`

**Action Required:** None

---

### ✅ Penal World (Into the Storm)
**Status:** COMPLETE  
**File:** `penal-world_YrNPE9VtthnQHtcF.json`  
**Format:** Correct (object_array with UUIDs)

**Existing Talents:**
- ✅ Syndicate (Penal World) - `PW00000000000001`
- ✅ Criminal (Penal World) - `PW00000000000002`
- ✅ Nightmares (Penal World) - `PW00000000000003`
- ✅ Underground Resources (Penal World) - `PW00000000000004`

**Action Required:** None

---

### ⚠️ Battlefleet (Into the Storm)
**Status:** NEEDS TALENTS CREATED  
**File:** `battlefleet_GRTOTSgUTl1WTPbx.json`  
**Format:** Correct (object_array with UUIDs) but talents don't exist

**Referenced Talents (NEED TO CREATE):**
- ❌ Officer on Deck (Battlefleet) - `BF00000000000001` - NOT FOUND
- ⚠️ Void-Born Ancestry (Battlefleet) - `BF00000000000002` - EXISTS
- ❌ Ship-Bound Fighter (Battlefleet) - `BF00000000000003` - NOT FOUND

**Action Required:**
1. Create `officer-on-deck-battlefleet_BF00000000000001.json`
2. Create `ship-bound-fighter-battlefleet_BF00000000000003.json`

---

### ⚠️ Child of Dynasty (Into the Storm)
**Status:** NEEDS TALENTS CREATED  
**File:** `child-of-dynasty_xY33i8ZMw9cmlJen.json`  
**Format:** Correct (object_array with UUIDs) but talents don't exist

**Referenced Talents (NEED TO CREATE):**
- ❌ Dynastic Warrant (Child of Dynasty) - `CD00000000000001` - NOT FOUND
- ❌ Honour Amongst One's Peers (Child of Dynasty) - `CD00000000000002` - NOT FOUND
- ❌ Unseen Enemy (Child of Dynasty) - `CD00000000000003` - NOT FOUND

**Action Required:**
1. Create `dynastic-warrant-child-of-dynasty_CD00000000000001.json`
2. Create `honour-amongst-peers-child-of-dynasty_CD00000000000002.json`
3. Create `unseen-enemy-child-of-dynasty_CD00000000000003.json`

---

### ⚠️ Footfallen (Into the Storm)
**Status:** NEEDS TALENTS CREATED  
**File:** `footfallen_7We3BEMf0PAFsO7S.json`  
**Format:** Correct (object_array with UUIDs) but talents don't exist

**Referenced Talents (NEED TO CREATE):**
- ❌ Street Knowledge (Footfallen) - `FF00000000000001` - NOT FOUND
- ❌ Web of Contacts (Footfallen) - `FF00000000000002` - NOT FOUND
- ❌ Port of Call (Footfallen) - `FF00000000000003` - NOT FOUND
- ❌ Sixth Sense (Footfallen) - `FF00000000000004` - NOT FOUND

**Action Required:**
1. Create `street-knowledge-footfallen_FF00000000000001.json`
2. Create `web-of-contacts-footfallen_FF00000000000002.json`
3. Create `port-of-call-footfallen_FF00000000000003.json`
4. Create `sixth-sense-footfallen_FF00000000000004.json`

---

## BIRTHRIGHT (Step 2) - 9 Origins

### ✅ Child of the Creed
**Status:** COMPLETE  
**File:** `child-of-the-creed_R24GdwakB9avuffJ.json`  
**Format:** Correct (object_array with UUID)

**Grants:**
- ✅ Unshakeable Faith - uses existing `iOEQr0ljJ5zJdofj`

**Action Required:** None

---

### ✅ Stubjack
**Status:** COMPLETE  
**File:** `stubjack_RBpW3W9ZOIQYKgKg.json`  
**Format:** Correct (object_array with UUID)

**Grants:**
- ✅ Quick Draw - uses existing `qdn5GQvS11uRvnIO`

**Special Ability to Convert:**
- ⚠️ "Battle-Scarred" - grants 1d5 Insanity - This is a simple effect, can remain as specialAbility

**Action Required:** None (specialAbility is informational only)

---

### ✅ Vaunted
**Status:** COMPLETE  
**File:** `vaunted_hP8LpNBP5nHZngJs.json`  
**Format:** Correct (object_array with UUID)

**Grants:**
- ✅ Decadence - uses existing `8rzBqEoffSgKTAp3`

**Special Ability:**
- "Overindulgence" - grants 1d5 Corruption - informational only

**Action Required:** None

---

### ✅ Scavenger
**Status:** COMPLETE  
**File:** `scavenger_KESTjlDNtHncRoxS.json`  
**Format:** Correct (choices use object format with UUIDs)

**Choices use existing talents:**
- Unremarkable - `J7ThXpRuaRPOo0sj`
- Resistance (Fear) - `FWzsS62FRJhejE0b`

**Action Required:** None

---

### ✅ Scapegrace
**Status:** COMPLETE  
**File:** `scapegrace_VpkONuWQfxGpzMCp.json`  
**Format:** Correct (no talents needed - only skill/char choices)

**Action Required:** None

---

### ✅ Savant
**Status:** COMPLETE  
**File:** `savant_0DMx4rOTVo5IennF.json`  
**Format:** Correct (choices use object format with UUIDs)

**Choices use existing talents:**
- Peer (Academic) - `Icpx3A1ddmbsNRuL`

**Action Required:** None

---

### ⚠️ Unnatural Origin (Into the Storm - Advanced)
**Status:** NEEDS TALENTS CREATED  
**File:** `unnatural-origin_XaJWGdKgLzRqNqVz.json`  
**Format:** Correct structure but referenced talents don't exist

**Referenced Talents (NEED TO CREATE):**
- ❌ Contaminated Environs (Unnatural Origin) - `UO00000000000001` - NOT FOUND
- ❌ False-Man (Unnatural Origin) - `UO00000000000002` - NOT FOUND
- ❌ Tainted by the Warp (Unnatural Origin) - `UO00000000000003` - NOT FOUND

**Action Required:**
1. Create `contaminated-environs-unnatural-origin_UO00000000000001.json`
2. Create `false-man-unnatural-origin_UO00000000000002.json`
3. Create `tainted-by-the-warp-unnatural-origin_UO00000000000003.json`

---

### ⚠️ In Service to the Throne (Into the Storm - Advanced)
**Status:** NEEDS REVIEW  
**File:** `in-service-to-the-throne_JxQxQaWboYI1sb16.json`  
**Format:** Complex nested choices - uses existing talents for some options

**Uses existing talents:**
- ✅ Paranoia - `MXViwrGcKNBtNZjx`
- ✅ Unremarkable - `J7ThXpRuaRPOo0sj`

**Action Required:** 
- Consider creating wrapper talents for each path option (Tithed, Born to Lead, One Amongst Billions)
- For now: LOW PRIORITY - complex structure works

---

### ⚠️ Fringe Survivor (Into the Storm - Advanced)
**Status:** NEEDS REVIEW  
**File:** `fringe-survivor_LeGYSdFJFK9PVSBL.json`  
**Format:** Complex nested choices

**Action Required:**
- Consider creating wrapper talents for each path option (Survivalist, Heretek, Pit-Fighter)
- For now: LOW PRIORITY - complex structure works

---

## LURE OF THE VOID (Step 3) - 9 Origins

### ⚠️ Criminal
**Status:** NEEDS VERIFICATION  
**File:** `criminal_TKW8s7sCRjsjNgql.json`  
**Format:** Correct (choices use object format with UUIDs)

**Referenced Talents:**
- ✅ Wanted Fugitive (Criminal) - `CR00000000000001` - EXISTS
- ✅ Hunted by a Crime Baron (Criminal) - `CR00000000000002` - EXISTS
- ✅ Judged and Found Wanting (Criminal) - `CR00000000000003` - EXISTS

**Action Required:** None

---

### ⚠️ Tainted
**Status:** NEEDS TALENTS CREATED  
**File:** `tainted_QVoCUBiR1i4be47t.json`  
**Format:** Correct structure but referenced talents don't exist

**Referenced Talents (NEED TO CREATE):**
- ❌ Mutant (Tainted) - `TA00000000000001` - NOT FOUND
- ❌ Insane (Tainted) - `TA00000000000002` - NOT FOUND
- ❌ Deviant Philosophy (Tainted) - `TA00000000000003` - NOT FOUND

**Action Required:**
1. Create `mutant-tainted_TA00000000000001.json`
2. Create `insane-tainted_TA00000000000002.json`
3. Create `deviant-philosophy-tainted_TA00000000000003.json`

---

### ⚠️ Zealot
**Status:** NEEDS TALENTS CREATED  
**File:** `zealot_vWk41i89fQikyUHN.json`  
**Format:** Correct structure but referenced talents don't exist

**Referenced Talents (NEED TO CREATE):**
- ❌ Blessed Scars (Zealot) - `ZE00000000000001` - NOT FOUND
- ❌ Unnerving Clarity (Zealot) - `ZE00000000000002` - NOT FOUND
- ❌ Favoured of the Faithful (Zealot) - `ZE00000000000003` - NOT FOUND

**Action Required:**
1. Create `blessed-scars-zealot_ZE00000000000001.json`
2. Create `unnerving-clarity-zealot_ZE00000000000002.json`
3. Create `favoured-of-the-faithful-zealot_ZE00000000000003.json`

---

### ⚠️ Chosen by Destiny
**Status:** NEEDS TALENTS CREATED  
**File:** `chosen-by-destiny_jUEjBWXgfjxqjFID.json`  
**Format:** Correct structure but referenced talents don't exist

**Referenced Talents (NEED TO CREATE):**
- ❌ Seeker of Truth (Chosen by Destiny) - `CB00000000000001` - NOT FOUND
- ❌ Xenophile (Chosen by Destiny) - `CB00000000000002` - NOT FOUND
- ❌ Fated for Greatness (Chosen by Destiny) - `CB00000000000003` - NOT FOUND

**Action Required:**
1. Create `seeker-of-truth-chosen-by-destiny_CB00000000000001.json`
2. Create `xenophile-chosen-by-destiny_CB00000000000002.json`
3. Create `fated-for-greatness-chosen-by-destiny_CB00000000000003.json`

---

### ⚠️ Duty Bound
**Status:** NEEDS TALENTS CREATED  
**File:** `duty-bound_gh7Ny4UdjlzbQbk7.json`  
**Format:** Correct structure but referenced talents don't exist

**Referenced Talents (NEED TO CREATE):**
- ❌ Duty to the Throne (Duty Bound) - `DB00000000000001` - NOT FOUND
- ❌ Duty to Humanity (Duty Bound) - `DB00000000000002` - NOT FOUND
- ❌ Duty to Your Dynasty (Duty Bound) - `DB00000000000003` - NOT FOUND

**Action Required:**
1. Create `duty-to-the-throne-duty-bound_DB00000000000001.json`
2. Create `duty-to-humanity-duty-bound_DB00000000000002.json`
3. Create `duty-to-your-dynasty-duty-bound_DB00000000000003.json`

---

### ⚠️ Renegade
**Status:** NEEDS TALENTS CREATED  
**File:** `renegade_raFNWbq385zrzhlu.json`  
**Format:** Correct structure but referenced talents don't exist

**Referenced Talents (NEED TO CREATE):**
- ❌ Recidivist (Renegade) - `RN00000000000001` - NOT FOUND
- ❌ Free-thinker (Renegade) - `RN00000000000002` - NOT FOUND
- ❌ Dark Visionary (Renegade) - `RN00000000000003` - NOT FOUND

**Action Required:**
1. Create `recidivist-renegade_RN00000000000001.json`
2. Create `free-thinker-renegade_RN00000000000002.json`
3. Create `dark-visionary-renegade_RN00000000000003.json`

---

### ✅ Hunter (Into the Storm - Advanced)
**Status:** COMPLETE  
**File:** `hunter_dMpRSRKSGorFLqGC.json`  
**Format:** Complex nested choices - uses existing talents

**Uses existing talents:**
- ✅ Blood Tracker - `hNSqevLz8O0Tmfbb`
- ✅ Paranoia - `MXViwrGcKNBtNZjx`
- ✅ Light Sleeper - `5zWJdxMlWz5X4Dvx`

**Sub-path choices (Bounty Hunter, Xenos Hunter, Hunted):**
- Uses existing talents with proper UUIDs
- Complex choices work correctly

**Action Required:** None

---

### ✅ New Horizons (Into the Storm - Advanced)
**Status:** COMPLETE  
**File:** `new-horizons_AltBtMSAeWOjKMIC.json`  
**Format:** Complex nested choices - uses existing talents

**Uses existing talents:**
- ✅ Peer (Academics) - `Icpx3A1ddmbsNRuL`

**Sub-path choices (Seeker of Truth, Xeno-Arcanist, Archeotechnologist):**
- Skills and characteristics properly defined
- No external talent dependencies

**Action Required:** None

---

### ✅ Crusade (Into the Storm - Advanced)
**Status:** COMPLETE  
**File:** `crusade_8eZLFtwOGCx9IOC5.json`  
**Format:** Complex nested choices - uses existing talents

**Uses existing talents:**
- ✅ Peer (Military) - `Icpx3A1ddmbsNRuL`
- ✅ Meditation - `nzJ0FV3oFUxUziW9`

**Sub-path choices (Call to War, Chasing the Enemy, Warrior):**
- Uses existing talents with proper UUIDs
- Complex choices work correctly

**Action Required:** None

---

## TRIALS AND TRAVAILS (Step 4) - 9 Origins

### ✅ Dark Voyage
**Status:** COMPLETE  
**File:** `dark-voyage_FhinjRfecsPnrmYF.json`  
**Format:** Correct (choices use object format with UUIDs)

**Uses existing talents:**
- ✅ Resistance (Fear) - `FWzsS62FRJhejE0b`

**Choices also provide Forbidden Lore skills (Warp, Daemonology, Xenos):**
- Skills properly structured

**Action Required:** None

---

### ✅ Ship Lorn
**Status:** COMPLETE  
**File:** `ship-lorn_hsbJgrqPBO7Gkec1.json`  
**Format:** Correct (choices use object format with UUIDs)

**Uses existing talents:**
- ✅ Dark Soul - `UOSAYwEb4x3AyrQ4`

**Special:** -1 Fate Point from modifiers.resources

**Action Required:** None

---

### ✅ Calamity
**Status:** COMPLETE  
**File:** `calamity_dIJXPQpY7MIAh0uX.json`  
**Format:** Correct (talents and choices use object format with UUIDs)

**Uses existing talents:**
- ✅ Light Sleeper - `5zWJdxMlWz5X4Dvx`
- ✅ Hardy - `cxdCGZYushVAWRzB`
- ✅ Nerves of Steel - `ew2l7tuorQ7fCJD8`

**Special:** -1 Profit Factor from modifiers.resources

**Action Required:** None

---

### ✅ The Hand of War
**Status:** COMPLETE  
**File:** `the-hand-of-war_rDe3gSqcyM4y0xB3.json`  
**Format:** Correct (choices use object format with UUIDs)

**Uses existing talents:**
- ✅ Leap Up - `Q6A7dCNVqRhgEp2o`
- ✅ Hatred (various) - `RR3rNt6WnWvwG4n8`

**Choice for Hatred enemy faction properly structured**

**Action Required:** None

---

### ⚠️ Press-Ganged
**Status:** NEEDS CHOICES ADDED  
**File:** `press-ganged_HNETunUVNx8Fg4RJ.json`  
**Format:** Correct structure but choices array is empty

**Special Abilities describe skill grants but no choices implemented:**
- "Unwilling Accomplice" should grant skill choices
- Needs choices array populated

**Action Required:**
1. Add skill choice for "any skill without prerequisites"
2. Add Common Lore skill choice

---

### ✅ High Vendetta
**Status:** COMPLETE  
**File:** `high-vendetta_X3Gred9TuPjB7F2B.json`  
**Format:** Correct (choices use object format with UUIDs)

**Uses existing talents:**
- ✅ Die Hard - `L6hVwqVcbLe6h4Dt`
- ✅ Paranoia - `MXViwrGcKNBtNZjx`

**Grants Inquiry skill directly**

**Action Required:** None

---

### ⚠️ Lost Worlds (Into the Storm - Advanced)
**Status:** NEEDS TALENTS CREATED  
**File:** `lost-worlds_ZRAqpUCN29Gzv0vY.json`  
**Format:** Correct structure but referenced talents don't exist

**Referenced Talents (NEED TO CREATE):**
- ❌ Lost Dynasty (Lost Worlds) - `LW00000000000001` - NOT FOUND
- ❌ Rogue Planet (Lost Worlds) - `LW00000000000002` - NOT FOUND
- ❌ Beyond the Pale (Lost Worlds) - `LW00000000000003` - NOT FOUND

**Action Required:**
1. Create `lost-dynasty-lost-worlds_LW00000000000001.json`
2. Create `rogue-planet-lost-worlds_LW00000000000002.json`
3. Create `beyond-the-pale-lost-worlds_LW00000000000003.json`

---

### ⚠️ A Product of Upbringing (Into the Storm - Advanced)
**Status:** NEEDS TALENTS CREATED  
**File:** `the-product-of-upbringing_lygxZbY7Vy3yBTo7.json`  
**Format:** Correct structure but referenced talents don't exist

**Referenced Talents (NEED TO CREATE):**
- ❌ New Blood (Product of Upbringing) - `PU00000000000001` - NOT FOUND
- ❌ Rivals (Product of Upbringing) - `PU00000000000002` - NOT FOUND
- ❌ Decadent (Product of Upbringing) - `PU00000000000003` - NOT FOUND

**Action Required:**
1. Create `new-blood-product-of-upbringing_PU00000000000001.json`
2. Create `rivals-product-of-upbringing_PU00000000000002.json`
3. Create `decadent-product-of-upbringing_PU00000000000003.json`

---

### ✅ Darkness (Into the Storm - Advanced)
**Status:** COMPLETE  
**File:** `darkness_sRvYGgUsCiZPnbho.json`  
**Format:** Complex nested choices - uses existing talents

**Uses existing talents:**
- ✅ Paranoia - `MXViwrGcKNBtNZjx`
- ✅ Resistance (Psychic Powers) - `FWzsS62FRJhejE0b`
- ✅ Light Sleeper - `5zWJdxMlWz5X4Dvx`

**Sub-path choices (Forbidden Knowledge, Warp Incursion, Dark Secret):**
- Complex choices work correctly

**Action Required:** None

---

## MOTIVATION (Step 5) - 10 Origins

### ✅ Prestige
**Status:** COMPLETE  
**File:** `prestige_rn7fg6IEWDmbH86S.json`  
**Format:** Correct (choices use object format with UUIDs)

**Uses existing talents:**
- ✅ Talented (X) - `QRbdcZXAqmmHdgfn`
- ✅ Peer (X) - `Icpx3A1ddmbsNRuL`

**Action Required:** None

---

### ✅ Pride
**Status:** COMPLETE  
**File:** `pride_zSpMWs1ANuSihUGV.json`  
**Format:** Correct (choices with characteristic or equipment options)

**Choices:**
- Heirloom Item (random roll)
- +3 Toughness

**Note:** Heirloom equipment needs to be determined at runtime

**Action Required:** None

---

### ✅ Renown
**Status:** COMPLETE  
**File:** `renown_sqbmXTBhzpdQiat7.json`  
**Format:** Correct (choices use object format with UUIDs)

**Uses existing talents:**
- ✅ Air of Authority - `uzlRRMNKLdIYKiCn`
- ✅ Peer (X) - `Icpx3A1ddmbsNRuL`

**Action Required:** None

---

### ✅ Fortune
**Status:** COMPLETE  
**File:** `fortune_Sw4y6TekvknMmLBo.json`  
**Format:** Simple (grants +1 Fate directly)

**Grants:**
- +1 Fate Point via modifiers.resources

**Action Required:** None

---

### ✅ Vengeance
**Status:** COMPLETE  
**File:** `vengeance_xNk3kM4PYB4UgGO1.json`  
**Format:** Correct (choices use object format with UUIDs)

**Uses existing talents:**
- ✅ Hatred (X) - `RR3rNt6WnWvwG4n8`

**Action Required:** None

---

### ✅ Endurance
**Status:** COMPLETE  
**File:** `endurance_HaMgw4EQnrYEpIJA.json`  
**Format:** Simple (grants +1 Wound directly)

**Grants:**
- +1 Wound via modifiers.resources

**Action Required:** None

---

### ✅ Exhilaration (Into the Storm - Advanced)
**Status:** COMPLETE  
**File:** `exhilaration_lcuT3rio1pb0nPHb.json`  
**Format:** Complex nested choices - uses existing talents

**Uses existing talents:**
- ✅ Nerves of Steel - `ew2l7tuorQ7fCJD8`
- ✅ Quick Draw - `qdn5GQvS11uRvnIO`
- ✅ Decadence - `8rzBqEoffSgKTAp3`

**Sub-path choices (New Horizons, Thrill of War, No Joy Unexplored):**
- Complex choices work correctly

**Action Required:** None

---

### ✅ Fear (Into the Storm - Advanced)
**Status:** COMPLETE  
**File:** `fear_zyEUfSFLQb2XFJko.json`  
**Format:** Complex nested choices - uses existing talents

**Uses existing talents:**
- ✅ Paranoia - `MXViwrGcKNBtNZjx`
- ✅ Dark Soul - `UOSAYwEb4x3AyrQ4`
- ✅ Frenzy - `h0r6im1YDlmrxdAC`
- ✅ Flagellant - `vk2BLAEVdV1l6EgE`
- ✅ Light Sleeper - `5zWJdxMlWz5X4Dvx`
- ✅ Jaded - `ldTw7wC9T3dPeOig`
- ✅ Resistance (Fear) - `FWzsS62FRJhejE0b`

**Sub-path choices (Enemy in Ascendance, Haunted by Sins, Tormented):**
- Complex choices work correctly

**Action Required:** None

---

### ✅ Knowledge (Into the Storm - Advanced)
**Status:** COMPLETE  
**File:** `knowledge_HOv4DlMTBBdgQ5jG.json`  
**Format:** Complex nested choices - uses existing talents

**Uses existing talents:**
- ✅ Total Recall - `5w4MtzbhmNP9VKbQ`
- ✅ Foresight - `OJFzaZs0NhmI5ySC`

**Sub-path choices (Knowledge is Life, Know Thy Foe, Knowledge is Power):**
- Complex choices work correctly

**Action Required:** None

---

### ✅ Devotion (Into the Storm - Advanced)
**Status:** COMPLETE  
**File:** `devotion_FrjpkfY761rgTn4w.json`  
**Format:** Complex nested choices - uses existing talents

**Uses existing talents:**
- ✅ Inspire Wrath - `m4ByYYPM9jVtcy3f`
- ✅ Armour of Contempt - `KX2Dp1gAZcPXbZMI`
- ✅ Unshakeable Faith - `iOEQr0ljJ5zJdofj`

**Sub-path choices (Creed, Duty, Loyalty):**
- Complex choices work correctly

**Action Required:** None

---

## LINEAGE (Step 7) - 5 Origins

### ⚠️ Lineage: A Long and Glorious History
**Status:** NEEDS TALENTS CREATED  
**File:** `lineage-a-long-and-glorious-history_LNPATH0000000001.json`  
**Format:** Correct structure but referenced talents don't exist

**Referenced Talents (NEED TO CREATE):**
- ❌ A Dark Secret (Lineage) - `LN00000000000001` - NOT FOUND
- ❌ My Great-Grandfather Built This Colony (Lineage) - `LN00000000000002` - NOT FOUND
- ❌ Prominent Ancestry (Lineage) - `LN00000000000003` - NOT FOUND

**Action Required:**
1. Create `a-dark-secret-lineage_LN00000000000001.json`
2. Create `colonial-legacy-lineage_LN00000000000002.json`
3. Create `prominent-ancestry-lineage_LN00000000000003.json`

---

### ⚠️ Lineage: A Proud Tradition
**Status:** NEEDS TALENTS CREATED  
**File:** `lineage-a-proud-tradition_LNPATH0000000002.json`  
**Format:** Correct structure but referenced talents don't exist

**Referenced Talents (NEED TO CREATE):**
- ❌ Heir Apparent (Lineage) - `LN00000000000004` - NOT FOUND
- ❌ Uncertain Inheritance (Lineage) - `LN00000000000005` - NOT FOUND
- ❌ Shameful Offspring (Lineage) - `LN00000000000006` - NOT FOUND

**Action Required:**
1. Create `heir-apparent-lineage_LN00000000000004.json`
2. Create `uncertain-inheritance-lineage_LN00000000000005.json`
3. Create `shameful-offspring-lineage_LN00000000000006.json`

---

### ⚠️ Lineage: Accursed Be Thy Name
**Status:** NEEDS TALENTS CREATED  
**File:** `lineage-accursed-be-thy-name_LNPATH0000000003.json`  
**Format:** Correct structure but referenced talents don't exist

**Referenced Talents (NEED TO CREATE):**
- ❌ Outraged Scion (Lineage) - `LN00000000000007` - NOT FOUND
- ❌ Secret Taint (Lineage) - `LN00000000000008` - NOT FOUND
- ❌ Vile Insight (Lineage) - `LN00000000000009` - NOT FOUND

**Action Required:**
1. Create `outraged-scion-lineage_LN00000000000007.json`
2. Create `secret-taint-lineage_LN00000000000008.json`
3. Create `vile-insight-lineage_LN00000000000009.json`

---

### ⚠️ Lineage: Disgraced
**Status:** NEEDS TALENTS CREATED  
**File:** `lineage-disgraced_LNPATH0000000004.json`  
**Format:** Correct structure but referenced talents don't exist

**Referenced Talents (NEED TO CREATE):**
- ❌ Another Generation of Shame (Lineage) - `LN00000000000010` - NOT FOUND
- ❌ The Last Child (Lineage) - `LN00000000000011` - NOT FOUND
- ❌ The One to Redeem Them (Lineage) - `LN00000000000012` - NOT FOUND

**Action Required:**
1. Create `another-generation-of-shame-lineage_LN00000000000010.json`
2. Create `the-last-child-lineage_LN00000000000011.json`
3. Create `the-one-to-redeem-them-lineage_LN00000000000012.json`

---

### ⚠️ Lineage: Of Extensive Means
**Status:** NEEDS TALENT CREATED  
**File:** `lineage-of-extensive-means_LNPATH0000000005.json`  
**Format:** Correct structure but referenced talent doesn't exist

**Referenced Talents (NEED TO CREATE):**
- ❌ A Powerful Legacy (Lineage) - `LN00000000000013` - NOT FOUND

**Note:** This lineage has no choices - it directly grants the talent.

**Action Required:**
1. Create `a-powerful-legacy-lineage_LN00000000000013.json`

---

## CAREER (Step 6) - 8 Origins

### 🔴 ALL CAREERS NEED COMPLETE REWRITE

**Common Issues Across All Careers:**
1. `talents` array uses broken `string_array` format (e.g., `["s: Air of Authority", "Pistol Weapon Training (Universal)"]`)
2. `skills` array has malformed entries (e.g., `"Speak Language (High Gothic"`, `"Low Gothic)<br>"`)
3. Skills should use proper object format with UUID references
4. Talents should use proper object format with UUID references
5. Each career has a unique "Special Ability" that should become a talent

---

### 🔴 Rogue Trader
**Status:** NEEDS COMPLETE REWRITE  
**File:** `rogue-trader_iRaYAhcZNkQMGTXF.json`

**Current Problems:**
- Skills array malformed: `"Speak Language (High Gothic"`, `"Low Gothic)<br>"`, `"Universal"`
- Talents array uses string format: `["s: Air of Authority", "Pistol Weapon Training (Universal)"]`

**Special Ability to Convert to Talent:**
- "Exceptional Leader" - Free action once/round, grant ally +10 to any test

**Correct Skills (from description):**
- Command, Commerce, Charm, Common Lore (Imperium), Evaluate, Literacy
- Scholastic Lore (Astromancy), Speak Language (High Gothic), Speak Language (Low Gothic)

**Correct Talents:**
- Air of Authority
- Pistol Weapon Training (Universal)
- Melee Weapon Training (Universal)

**Talent to Create:**
- ❌ Exceptional Leader (Rogue Trader) - `CA00000000000001` - NEEDS CREATION

---

### 🔴 Arch-Militant
**Status:** NEEDS COMPLETE REWRITE  
**File:** `arch-militant_HR1V7Q2gZ1472Lpf.json`

**Talent to Create:**
- ❌ [Special Ability] (Arch-Militant) - `CA00000000000002` - NEEDS CREATION

---

### 🔴 Astropath Transcendent
**Status:** NEEDS COMPLETE REWRITE  
**File:** `astropath-transcendant_anJnAinTc4LLkXgp.json`

**Talent to Create:**
- ❌ [Special Ability] (Astropath) - `CA00000000000003` - NEEDS CREATION

---

### 🔴 Explorator
**Status:** NEEDS COMPLETE REWRITE  
**File:** `explorator_NTbFQLfoHWa3xoOs.json`

**Talent to Create:**
- ❌ [Special Ability] (Explorator) - `CA00000000000004` - NEEDS CREATION

---

### 🔴 Missionary
**Status:** NEEDS COMPLETE REWRITE  
**File:** `missionary_oJq2iajSQI6E2SFr.json`

**Talent to Create:**
- ❌ [Special Ability] (Missionary) - `CA00000000000005` - NEEDS CREATION

---

### 🔴 Navigator
**Status:** NEEDS COMPLETE REWRITE  
**File:** `navigator_ckUATOFoyuffMRxV.json`

**Talent to Create:**
- ❌ [Special Ability] (Navigator) - `CA00000000000006` - NEEDS CREATION

---

### 🔴 Seneschal
**Status:** NEEDS COMPLETE REWRITE  
**File:** `seneschal_578lUVDhu7dwlUI4.json`

**Talent to Create:**
- ❌ [Special Ability] (Seneschal) - `CA00000000000007` - NEEDS CREATION

---

### 🔴 Void-Master
**Status:** NEEDS COMPLETE REWRITE  
**File:** `void-master_yrCCXTtAJeAVeARi.json`

**Talent to Create:**
- ❌ [Special Ability] (Void-Master) - `CA00000000000008` - NEEDS CREATION

---



## SUMMARY

### Status Counts

| Step | Total | Complete | Needs Talents | Needs Rewrite |
|------|-------|----------|---------------|---------------|
| Homeworld | 12 | 9 | 3 | 0 |
| Birthright | 9 | 7 | 2 | 0 |
| Lure of the Void | 9 | 6 | 3 | 0 |
| Trials and Travails | 9 | 6 | 3 | 0 |
| Motivation | 10 | 10 | 0 | 0 |
| Lineage | 5 | 0 | 5 | 0 |
| Career | 8 | 0 | 0 | 8 |
| **TOTAL** | **62** | **38** | **16** | **8** |

### Talents to Create

#### Homeworlds (9 talents)
1. `officer-on-deck-battlefleet_BF00000000000001.json` - Officer on Deck (Battlefleet)
2. `ship-bound-fighter-battlefleet_BF00000000000003.json` - Ship-Bound Fighter (Battlefleet)
3. `dynastic-warrant-child-of-dynasty_CD00000000000001.json` - Dynastic Warrant
4. `honour-amongst-peers-child-of-dynasty_CD00000000000002.json` - Honour Amongst Peers
5. `unseen-enemy-child-of-dynasty_CD00000000000003.json` - Unseen Enemy
6. `street-knowledge-footfallen_FF00000000000001.json` - Street Knowledge (Footfallen)
7. `web-of-contacts-footfallen_FF00000000000002.json` - Web of Contacts (Footfallen)
8. `port-of-call-footfallen_FF00000000000003.json` - Port of Call (Footfallen)
9. `sixth-sense-footfallen_FF00000000000004.json` - Sixth Sense (Footfallen)

#### Birthrights (3 talents)
1. `contaminated-environs-unnatural-origin_UO00000000000001.json` - Contaminated Environs
2. `false-man-unnatural-origin_UO00000000000002.json` - False-Man
3. `tainted-by-the-warp-unnatural-origin_UO00000000000003.json` - Tainted by the Warp

#### Lure of the Void (9 talents)
1. `mutant-tainted_TA00000000000001.json` - Mutant (Tainted)
2. `insane-tainted_TA00000000000002.json` - Insane (Tainted)
3. `deviant-philosophy-tainted_TA00000000000003.json` - Deviant Philosophy (Tainted)
4. `blessed-scars-zealot_ZE00000000000001.json` - Blessed Scars (Zealot)
5. `unnerving-clarity-zealot_ZE00000000000002.json` - Unnerving Clarity (Zealot)
6. `favoured-of-the-faithful-zealot_ZE00000000000003.json` - Favoured of the Faithful (Zealot)
7. `seeker-of-truth-chosen-by-destiny_CB00000000000001.json` - Seeker of Truth
8. `xenophile-chosen-by-destiny_CB00000000000002.json` - Xenophile
9. `fated-for-greatness-chosen-by-destiny_CB00000000000003.json` - Fated for Greatness
10. `duty-to-the-throne-duty-bound_DB00000000000001.json` - Duty to the Throne
11. `duty-to-humanity-duty-bound_DB00000000000002.json` - Duty to Humanity
12. `duty-to-your-dynasty-duty-bound_DB00000000000003.json` - Duty to Your Dynasty
13. `recidivist-renegade_RN00000000000001.json` - Recidivist (Renegade)
14. `free-thinker-renegade_RN00000000000002.json` - Free-thinker (Renegade)
15. `dark-visionary-renegade_RN00000000000003.json` - Dark Visionary (Renegade)

#### Trials and Travails (6 talents)
1. `lost-dynasty-lost-worlds_LW00000000000001.json` - Lost Dynasty (Lost Worlds)
2. `rogue-planet-lost-worlds_LW00000000000002.json` - Rogue Planet (Lost Worlds)
3. `beyond-the-pale-lost-worlds_LW00000000000003.json` - Beyond the Pale (Lost Worlds)
4. `new-blood-product-of-upbringing_PU00000000000001.json` - New Blood
5. `rivals-product-of-upbringing_PU00000000000002.json` - Rivals
6. `decadent-product-of-upbringing_PU00000000000003.json` - Decadent

#### Lineages (13 talents)
1. `a-dark-secret-lineage_LN00000000000001.json` - A Dark Secret
2. `colonial-legacy-lineage_LN00000000000002.json` - Colonial Legacy
3. `prominent-ancestry-lineage_LN00000000000003.json` - Prominent Ancestry
4. `heir-apparent-lineage_LN00000000000004.json` - Heir Apparent
5. `uncertain-inheritance-lineage_LN00000000000005.json` - Uncertain Inheritance
6. `shameful-offspring-lineage_LN00000000000006.json` - Shameful Offspring
7. `outraged-scion-lineage_LN00000000000007.json` - Outraged Scion
8. `secret-taint-lineage_LN00000000000008.json` - Secret Taint
9. `vile-insight-lineage_LN00000000000009.json` - Vile Insight
10. `another-generation-of-shame-lineage_LN00000000000010.json` - Another Generation of Shame
11. `the-last-child-lineage_LN00000000000011.json` - The Last Child
12. `the-one-to-redeem-them-lineage_LN00000000000012.json` - The One to Redeem Them
13. `a-powerful-legacy-lineage_LN00000000000013.json` - A Powerful Legacy

#### Careers (8 talents - Special Abilities)
1. `exceptional-leader-rogue-trader_CA00000000000001.json` - Exceptional Leader (Rogue Trader)
2. `special-ability-arch-militant_CA00000000000002.json` - [To be determined from file]
3. `special-ability-astropath_CA00000000000003.json` - [To be determined from file]
4. `special-ability-explorator_CA00000000000004.json` - [To be determined from file]
5. `special-ability-missionary_CA00000000000005.json` - [To be determined from file]
6. `special-ability-navigator_CA00000000000006.json` - [To be determined from file]
7. `special-ability-seneschal_CA00000000000007.json` - [To be determined from file]
8. `special-ability-void-master_CA00000000000008.json` - [To be determined from file]

### TOTAL TALENTS TO CREATE: ~48 talents

### Career Rewrite Required (8 files)

All career origin paths need complete rewrite:
1. Fix skills array (remove HTML, proper format)
2. Fix talents array (use object_array with UUIDs)
3. Convert Special Ability to talent
4. Add proper equipment choices

---

## Next Steps

1. **Phase 1: Create Missing Talents** (~48 talents)
   - Work through each origin path with missing talents
   - Create talent JSON files with proper IDs
   - Each talent should encode its mechanical effects

2. **Phase 2: Fix Press-Ganged**
   - Add choices array for skill selection

3. **Phase 3: Rewrite Careers** (8 files)
   - Most complex - each needs complete restructuring
   - Parse special abilities from descriptions
   - Create career-specific special ability talents

4. **Phase 4: Verification**
   - Build system
   - Test each origin path in-game
   - Verify all UUID references resolve

---

*Last Updated: January 13, 2026*

