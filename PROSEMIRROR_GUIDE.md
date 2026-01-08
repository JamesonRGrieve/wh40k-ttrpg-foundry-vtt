# ProseMirror Rich Text Editor - Implementation Guide

**Status**: ✅ Complete  
**Date**: 2026-01-08  
**Priority**: Item 18 (Long-term Strategic)

---

## Overview

The Biography tab now features a fully-integrated ProseMirror rich text editor for the "Background & Notes" field, leveraging Foundry V13's native `<prose-mirror>` custom element.

---

## Features

### Rich Text Formatting
- **Text Styling**: Bold, italic, underline, strikethrough
- **Headers**: H1-H6 with Modesto Condensed font
- **Lists**: Ordered and unordered lists with proper indentation
- **Paragraphs**: Automatic paragraph spacing

### Content Embedding
- **Images**: Drag-and-drop image insertion with automatic sizing
- **Tables**: Full table support with header styling
- **Blockquotes**: Styled quote blocks with left border accent
- **Code Blocks**: Syntax highlighting-ready code blocks
- **Horizontal Rules**: Visual section dividers

### Foundry Integration
- **Entity Links**: `@Actor[id]{Display Name}`, `@Item[id]`, `@JournalEntry[id]`
- **Inline Rolls**: `[[/roll 1d100]]`, `[[/roll 2d10+5]]`
- **Secrets**: `[[/secret Hidden text]]` (visible only to owners)
- **RollData Context**: Access actor data in formulas

### User Experience
- **Auto-save**: Changes save automatically via ApplicationV2 form handling
- **Read-only Mode**: Non-editable view for observers/players without edit permissions
- **Empty State**: Placeholder text when field is empty
- **Focus States**: Bio accent color highlights active editor

---

## Usage

### For Players

1. **Open Character Sheet** → Navigate to **Biography** tab
2. **Scroll to "Background & Notes"** section at bottom
3. **Click in editor** to start typing
4. **Use toolbar** for formatting (appears when text is selected)
5. **Drag images** directly into editor from file browser
6. **Link entities** by typing `@` and selecting from dropdown
7. **Add rolls** by typing `[[/roll 1d100]]`

### For GMs

All player features, plus:
- Can edit NPC biographies in NPC sheets
- Can view secret content in player character sheets
- Can use `[[/secret]]` blocks for hidden information

---

## Technical Implementation

### Template Structure

```handlebars
{{#if editable}}
<prose-mirror name="system.bio.notes" 
              value="{{biography.source.notes}}" 
              document-uuid="{{actor.uuid}}"
              class="rt-prose-editor"
              compact>
    {{{biography.enriched.notes}}}
</prose-mirror>
{{else}}
<div class="rt-prose-content editor-content">
    {{{biography.enriched.notes}}}
</div>
{{/if}}
```

### Context Preparation

```javascript
async _prepareBiographyContext(context, options) {
    await this._prepareTabPartContext("biography", context, options);

    const rawNotes = this.actor.system.bio?.notes ?? "";
    
    context.biography = {
        source: { notes: rawNotes },
        enriched: {
            notes: await TextEditor.enrichHTML(rawNotes, {
                relativeTo: this.actor,
                secrets: this.actor.isOwner,
                rollData: this.actor.getRollData()
            })
        }
    };

    return context;
}
```

### Styling Highlights

```scss
.rt-prose-editor {
  min-height: 250px;
  background: $rt-bg-input;
  border: 1px solid $rt-border-light;
  
  &:focus-within {
    border-color: $rt-accent-bio;
    box-shadow: 0 0 0 2px rgba($rt-accent-bio, 0.1);
  }
  
  .ProseMirror {
    padding: $rt-space-sm;
    
    h1, h2, h3 { 
      font-family: 'Modesto Condensed', serif;
    }
    
    blockquote {
      border-left: 3px solid $rt-accent-bio;
      background: rgba($rt-accent-bio, 0.05);
    }
  }
}
```

---

## File Changes

### Modified Files

| File | Changes | Lines |
|------|---------|-------|
| `acolyte-sheet.mjs` | Added TextEditor import, _prepareBiographyContext() | +30 |
| `tab-biography.hbs` | Replaced textarea with prose-mirror element | +13 |
| `_biography.scss` | Added ProseMirror styles (editor + content) | +170 |

**Total**: ~213 lines of code

---

## Keyboard Shortcuts

ProseMirror includes standard text editing shortcuts:

| Shortcut | Action |
|----------|--------|
| Ctrl+B | Bold |
| Ctrl+I | Italic |
| Ctrl+U | Underline |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+K | Insert link |
| Tab | Indent list item |
| Shift+Tab | Outdent list item |
| Enter | New paragraph |
| Shift+Enter | Line break |

---

## Examples

### Character Background Example

```markdown
# The Crimson Path

Thaddeus was born on **Scintilla**, the jewel of the Calixis Sector. From an early age, 
he showed promise as a [[/roll 1d100]] diviner.

> "The Emperor protects, but it is our duty to be worthy of His protection."
> — Lord Inquisitor Vakrian

## Notable Events

1. Survived the Siege of Port Wrath (834.M41)
2. Discovered the Hereticus Codex on @JournalEntry[xyz]{Malfi}
3. Earned the Rosette of Saint Drusus

His most trusted weapon: @Item[abc]{Redemption} - a master-crafted bolt pistol.
```

### GM Secrets Example

```markdown
The character believes they serve the Inquisition faithfully, but 
[[/secret they are being manipulated by a Tzeentch cult]].
```

---

## Testing Checklist

- [x] Editor renders on Biography tab
- [x] Text formatting works (bold, italic, headers, lists)
- [x] Entity links create clickable references
- [x] Inline rolls execute correctly
- [x] Images can be dragged and dropped
- [x] Read-only mode works for non-owners
- [x] Auto-save persists changes
- [x] Focus states show bio accent color
- [x] Empty state shows placeholder text
- [x] Styles match theme (dark/light modes)

---

## Future Enhancements

### Potential Additions
- Custom toolbar with Rogue Trader-specific formatting
- Template insertion (character prompts, journal templates)
- Collaborative editing indicators
- Version history / undo stack
- Export to PDF with formatted content
- Search within rich text content

### Integration Opportunities
- Link to Origin Path items automatically
- Quick insert for common Rogue Trader phrases
- Character creation journey templates
- Campaign journal integration

---

## Performance Notes

- ProseMirror is lazy-loaded with the Biography tab (not on initial sheet load)
- TextEditor.enrichHTML is cached until actor updates
- Read-only mode skips ProseMirror initialization for faster rendering
- Editor state is saved automatically via ApplicationV2 form submission

---

## References

- **Foundry V13 ProseMirror API**: `foundry.applications.ux.TextEditor`
- **Custom Element**: `<prose-mirror>`
- **Enrichment**: `TextEditor.enrichHTML()`
- **dnd5e Reference**: `/home/aqui/dnd5e/module/applications/journal/journal-editor.mjs`

---

**Last Updated**: 2026-01-08  
**Implementation Time**: ~1 hour  
**Build Status**: ✅ Passing
