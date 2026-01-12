# Origin Path Builder - User Guide

## Opening the Builder

The Origin Path Builder allows you to create your character's background by selecting six origin path steps in sequence.

**To Open:**
1. Open your character sheet
2. Navigate to the "Origin Path" or "Biography" tab
3. Click the "Open Origin Path Builder" button

## Using the Builder

### The Six Steps

Your character's origin path consists of six steps taken in order:

1. **Home World** - Where you were born (Death World, Forge World, Hive World, etc.)
2. **Birthright** - Your early life circumstances (Scavenger, Vaunted, etc.)
3. **Lure of the Void** - What drew you to the stars (Criminal, Duty Bound, etc.)
4. **Trials and Travails** - A major life event (Calamity, Dark Voyage, etc.)
5. **Motivation** - Your driving goal (Fortune, Renown, Vengeance, etc.)
6. **Career** - Your role aboard the ship (Rogue Trader, Arch-Militant, etc.)

### Adding Origins

**Method 1: Drag from Compendium**
1. Open the "Origin Path" compendium (Items directory)
2. Find an item matching the step you want
3. Drag it onto the corresponding step slot in the builder

**Method 2: Browse Button**
1. Click the "Browse" button on an empty step slot
2. The Origin Path compendium will open
3. Drag an item from there onto the slot

**Method 3: Randomize**
1. Click the "Randomize Path" button in the toolbar
2. All empty slots will be filled with random selections

### Making Choices

Some origins offer you choices (e.g., "Choose 1 of 3 talents"):

1. When you drag such an origin into a slot, a dialog will appear
2. Review the available options
3. Click to select your choices (checkboxes will appear)
4. Once all required choices are made, click "Confirm Selections"
5. If you cancel, the origin won't be added

### Preview Panel

The preview panel on the right shows your total bonuses from all selected origins:

- **Characteristics**: Total modifiers to WS, BS, S, T, Ag, Int, Per, WP, Fel
- **Skills**: All skills you'll gain training in
- **Talents**: All talents you'll receive
- **Traits**: All traits you'll gain
- **Special Abilities**: Unique abilities from your path

### Toolbar Actions

**Randomize Path** - Fill empty slots with random origins  
**Reset All** - Clear all selections (requires confirmation)  
**Export** - Save your path configuration to a JSON file  
**Import** - Load a previously saved path configuration  

### Removing Origins

To remove an origin from a slot:
1. Click the X button in the top-right corner of the item card
2. The slot will become empty again

To replace an origin:
- Simply drag a different origin onto the slot (it will replace the existing one)

### Applying Your Path

Once all 6 steps are filled (you'll see "Path Complete" status):

1. Review your selections and the total bonuses
2. Click the "Apply to Character" button
3. Confirm the action (this will modify your character)

**What Happens:**
- Old origin path items are removed from your character
- New origin path items are added
- Characteristic bonuses are applied to your base stats
- Skills are added or upgraded on your character
- Talents are added as items
- Traits are added as items
- Equipment is added to your inventory (if specified)

### Tips & Tricks

**Visual Flow**: The builder shows your path as a flowchart:
- Row 1: Steps 1-3 (left to right)
- Arrow down to Row 2
- Row 2: Steps 4-6 (right to left)

**Status Indicators**:
- Empty slots show a + icon and "Drag an origin here" text
- Filled slots show the item card with bonuses
- Choice indicators appear if an origin has unresolved choices

**Unsaved Changes**: The builder tracks whether your current selections differ from your character's actual origin items. The "Apply to Character" button is only enabled when there are changes to apply.

**Path Validation**: You cannot apply a partial path - all 6 steps must be filled.

**Reordering**: You can drag origins between slots if needed (they must match the target step type).

## Frequently Asked Questions

**Q: Can I change my origin path later?**  
A: Yes! Open the builder again, make changes, and click "Apply to Character". Your old path will be replaced.

**Q: What if I select the wrong origin?**  
A: Just click the X button to remove it, or drag a different origin onto the slot to replace it.

**Q: Do I have to fill the steps in order?**  
A: No, you can fill them in any order. But thematically, they represent your life chronologically.

**Q: Can I see what bonuses an origin gives before adding it?**  
A: Yes, hover over items in the compendium or click the eye icon after adding them to view full details.

**Q: What happens to skills I already have?**  
A: If you already have a skill, applying the origin path will upgrade it (e.g., Trained → +10).

**Q: Can I undo applying a path?**  
A: Not automatically. You would need to manually remove the added items and adjust characteristics. Consider exporting your current path before applying a new one.

**Q: Why can't I drag an item onto a slot?**  
A: The item's step type must match the slot. For example, you can't drag a "Home World" origin into the "Career" slot.

## Troubleshooting

**Builder won't open**  
- Make sure you're using an Acolyte/Character actor (not NPC, vehicle, or ship)
- Check browser console for errors
- Try refreshing Foundry

**Can't drag items**  
- Ensure the Origin Path compendium is properly loaded
- Check that items are the correct type (originPath)
- Verify the item's step matches the target slot

**Choices dialog doesn't appear**  
- The origin may not have choices defined
- Check browser console for errors
- Try closing and reopening the builder

**Apply button is disabled**  
- Ensure all 6 steps are filled
- Check that path is marked as complete
- Verify you have unsaved changes

**Bonuses not applying**  
- Verify the origin items have modifiers defined in their data
- Check the character sheet after applying
- Some bonuses (like special abilities) may need manual application

---

## Example Walkthrough

**Creating a Death World Scavenger Arch-Militant**:

1. Open Origin Path Builder
2. Open Origin Path compendium
3. Drag "Death World" to Home World slot
   - Choice dialog appears: Select "Jaded" talent
4. Drag "Scavenger" to Birthright slot
5. Drag "Criminal" to Lure of the Void slot
6. Drag "Dark Voyage" to Trials slot
7. Drag "Fortune" to Motivation slot
8. Drag "Arch-Militant" to Career slot
   - Choice dialog appears: Select starting weapon
9. Review total bonuses in preview panel:
   - +5 S, +5 T, -5 WP, -5 Fel (Death World)
   - Multiple combat skills
   - Various talents
10. Click "Apply to Character"
11. Confirm the application
12. Character sheet now shows all bonuses applied!

---

**For the Emperor and the Warrant of Trade!**
