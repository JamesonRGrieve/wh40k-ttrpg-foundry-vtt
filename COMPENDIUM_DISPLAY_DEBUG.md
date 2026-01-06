# Compendium Display Debugging Guide

## What Are You Seeing?

Please check each item and tell me which scenario matches:

### Scenario A: Compendium List
When you click **Compendium Packs** in Foundry:

**Option A1**: I see folders like "Actors", "Equipment", "Journals & Rules", etc.
- ✅ This is CORRECT
- Click on "Journals & Rules" folder
- Tell me what you see inside

**Option A2**: I only see individual pack names, no folders
- ❌ This means folder structure isn't working
- Look for "Character Creation" in the list
- Is it there?

**Option A3**: I don't see any "Journals & Rules" folder at all
- ❌ This is a bigger issue
- Do you see individual journal packs like "Character Creation"?

### Scenario B: Opening "Character Creation"
When you find and click on "Character Creation":

**Option B1**: A window opens showing ONE page with `<pre>` formatted text
- ❌ You're seeing the OLD version
- The pack didn't load the new data
- Close Foundry COMPLETELY and reopen

**Option B2**: A window opens showing a LIST/TABLE of contents on the left
- ❓ This might be the table-of-contents view
- Are there 3 entries listed?
- What are their names?

**Option B3**: A window opens showing a page with styled headers and colors
- ✅ SUCCESS! The enhanced version is loading
- You should see crimson/gold gradient header
- Navigate between pages using left sidebar

**Option B4**: Nothing opens, or I get an error
- ❌ There's a loading issue
- Check browser console (F12) for errors

### Scenario C: Page Content
If a page IS open, what does it look like?

**Option C1**: Plain black text on white background, tab-separated columns
- ❌ OLD FORMAT (plain text)
- Looks like: `Explorer Creation     Guardsman Creation`
- Has `<pre>` tags visible

**Option C2**: Styled page with colors, boxes, and formatted tables
- ✅ NEW FORMAT (enhanced)
- Has gradient header at top
- Sections have colored backgrounds
- Tables have styled headers

**Option C3**: Just HTML code visible (tags showing)
- ❌ HTML isn't rendering
- You'd see literal `<div class="rt-header">` text
- This is a rendering issue

## Key Questions

1. **In Foundry, under Compendium Packs, do you see**:
   - [ ] A folder called "Journals & Rules"
   - [ ] Individual items including "Character Creation"  
   - [ ] Something else? (describe)

2. **When you click "Character Creation", what opens**:
   - [ ] Single page journal
   - [ ] Multi-page journal with sidebar
   - [ ] Table/list view
   - [ ] Nothing / Error

3. **The title at the top of the window says**:
   - [ ] "Character Creation"
   - [ ] "RT Journals: Character Creation"
   - [ ] Something else? (what)

4. **If content shows, it looks like**:
   - [ ] Plain text in `<pre>` tags
   - [ ] Styled with colors and boxes
   - [ ] Raw HTML code
   - [ ] Something else

5. **The left sidebar (if visible) shows**:
   - [ ] Nothing (no sidebar)
   - [ ] 1 page
   - [ ] 3 pages (Welcome, Characteristics, Home World)
   - [ ] More than 3 pages
   - [ ] A different layout

## Debug Checklist

- [ ] Foundry is **completely closed** (not just minimized)
- [ ] Foundry was **restarted** after running `npm run build`
- [ ] Browser cache was **cleared** (Ctrl+Shift+Delete or Ctrl+F5)
- [ ] No console errors when opening compendium (check F12 console)
- [ ] The timestamp on system.json in Foundry folder matches source
- [ ] The pack folder `rt-journals-character-creation` exists

## System Information Needed

Run these to help debug:

```bash
# Check compiled pack timestamp
ls -lh /mnt/c/Users/Dreski-PC/AppData/Local/FoundryVTT/Data/systems/rogue-trader/packs/rt-journals-character-creation/

# Check if Foundry is running
ps aux | grep -i foundry | grep -v grep

# Verify source has enhanced content
cd src/packs/rt-journals-character-creation/_source
ls -la *.json
```

## What The Enhanced Version Should Look Like

### Compendium Browser
```
📁 Journals & Rules
  └─ 📖 Character Creation
       ├─ 📄 Welcome to Rogue Trader
       ├─ 📄 Step 1: Characteristics
       └─ 📄 Step 2: Home World
```

### Opened Journal View
```
┌─────────────────────────────────────────┐
│ Character Creation                  [x] │
├──────────┬──────────────────────────────┤
│📄 Pages  │ ╔══════════════════════╗     │
│          │ ║ ⚔️ Character         ║     │
│• Welcome │ ║    Creation ⚔️       ║     │
│  to RT   │ ║ Forge Your Legacy... ║     │
│          │ ╚══════════════════════╝     │
│• Step 1  │                              │
│  Charac  │ 🌟 Welcome, Explorer         │
│          │ [Styled section with border] │
│• Step 2  │                              │
│  Home    │ 📜 The Origin Path System    │
│  World   │ [Gold callout box...]        │
│          │                              │
└──────────┴──────────────────────────────┘
```

### Old Version Looks Like
```
┌─────────────────────────────────────────┐
│ Character Creation                  [x] │
├─────────────────────────────────────────┤
│<pre>                                    │
│Explorer Creation    Guardsman Creation  │
│Generating Characteristics               │
│[massive block of tab-delimited text]    │
│</pre>                                   │
│                                         │
└─────────────────────────────────────────┘
```

## Next Steps Based on What You See

**If you see OLD format**:
1. Close Foundry COMPLETELY
2. Verify pack was rebuilt: `ls -la /mnt/c/.../packs/rt-journals-character-creation/`
3. Check timestamp is from today
4. Restart Foundry fresh

**If you see styled content but only 1 page**:
1. Check if there's a sidebar with page navigation
2. Look for tabs or buttons to switch pages
3. The folder structure might be collapsed

**If you see table of contents view**:
1. This is a valid V13 display mode
2. Try clicking on individual page names
3. Should open the actual page content

**If nothing shows or errors occur**:
1. Open browser console (F12)
2. Look for JavaScript errors
3. Check for "Failed to load" messages
4. Report the specific error message

---

## Most Likely Issue

Based on your description, I suspect you're seeing:
- The compendium list shows "Character Creation" (correct)
- But when you open it, you see the OLD single-page format
- This means Foundry hasn't reloaded the pack data yet

**Solution**: 
1. Quit Foundry completely (not just close window)
2. Wait 5 seconds
3. Relaunch Foundry
4. Open compendium again
5. Hard refresh the browser (Ctrl+F5)
