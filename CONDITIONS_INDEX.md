# CONDITIONS System - Documentation Index

**Complete documentation suite for the CONDITIONS refactor**

---

## 📚 DOCUMENT LIBRARY

### 🎯 Start Here

**CONDITIONS_ANALYSIS_SUMMARY.md** (11KB) — **READ FIRST**
- Executive summary of problems
- Current broken state analysis
- Recommended solution
- Before/after comparison table
- Success metrics

**Purpose**: Understand WHAT is broken and WHY we need to fix it  
**Time**: 5 minutes  
**Audience**: Everyone (devs, project managers, users)

---

### 🔍 Deep Dive

**CONDITIONS_DEEP_DIVE.md** (33KB) — **IMPLEMENTATION BIBLE**
- Complete technical analysis (400+ lines)
- All 8 implementation phases with code examples
- Complete localization keys (45+)
- Migration scripts (fully functional)
- Testing checklist (40+ tests)
- SCSS styling system
- Visual design specifications

**Purpose**: HOW to implement every detail  
**Time**: 30-45 minutes  
**Audience**: Developers implementing the refactor

**Sections**:
1. Current State Analysis (problems breakdown)
2. Proper CONDITIONS Design (schema, fields, types)
3. Icons & Visual Design (colors, badges, themes)
4. Localization Keys (complete i18n structure)
5. Pack Data Structure (before/after JSON)
6. Implementation Phases 1-8 (step-by-step with code)
7. Testing Checklist (comprehensive validation)
8. Migration Statistics (effort, files, lines)

---

### 👁️ Visual Guide

**CONDITIONS_BEFORE_AFTER.md** (15KB) — **VISUAL COMPARISON**
- Side-by-side pack data comparison
- Sheet UI comparison (trait vs condition)
- Chat card comparison (broken vs proper)
- Badge system showcase
- Compendium browser comparison
- Schema field comparison table

**Purpose**: SEE the transformation visually  
**Time**: 10 minutes  
**Audience**: Visual learners, stakeholders, UX designers

**Key Sections**:
- Pack Data JSON (before/after)
- Sheet mockups (trait sheet vs condition sheet)
- Chat cards (broken vs styled)
- Badge designs (nature, appliesTo, stacks, duration)
- Schema field mapping

---

### ⚡ Quick Reference

**CONDITIONS_QUICK_REFERENCE.md** (8KB) — **CHEAT SHEET**
- Files to modify (7 files)
- Files to create (6 files)
- Key schema fields
- Computed properties list
- Color variables
- Essential localization keys
- Pack migration map
- Validation commands
- Testing checklist (abbreviated)

**Purpose**: Fast lookup during implementation  
**Time**: Reference only  
**Audience**: Developers actively coding

**Use When**:
- Need to remember a field name
- Forgot a computed property
- Need a validation command
- Want to check progress

---

### 📋 Project Plan

**CONDITIONS_IMPLEMENTATION_PLAN.md** (16KB) — **PROJECT MANAGEMENT**
- Phase-by-phase breakdown
- Effort estimates (time per phase)
- Risk assessment
- Timeline options (sprint vs incremental)
- Success criteria
- Acceptance criteria
- Continuous improvement plan

**Purpose**: PROJECT PLANNING and tracking  
**Time**: 15 minutes  
**Audience**: Project managers, team leads, developers planning work

**Sections**:
- Executive summary
- Documentation suite overview
- 8 phases with time estimates
- Effort breakdown (300 min total)
- Test plan (smoke, data, visual, edge cases)
- Acceptance criteria (must/should/nice to have)
- Risk assessment & mitigation
- Recommended timeline (3 options)
- Lessons from Critical Injuries
- Success metrics
- Final checklist

---

### 📑 This Document

**CONDITIONS_INDEX.md** (This File) — **NAVIGATION**
- Document library overview
- Reading paths for different roles
- Quick links
- Status tracking

**Purpose**: Find the right document fast  
**Time**: 2 minutes  
**Audience**: Anyone starting the project

---

## 🗺️ READING PATHS

### Path 1: Executive/Stakeholder (15 min)
1. `CONDITIONS_INDEX.md` (this file) — 2 min
2. `CONDITIONS_ANALYSIS_SUMMARY.md` — 5 min
3. `CONDITIONS_BEFORE_AFTER.md` (skim visuals) — 8 min

**Outcome**: Understand problem, solution, and outcome

---

### Path 2: Project Manager (45 min)
1. `CONDITIONS_INDEX.md` — 2 min
2. `CONDITIONS_ANALYSIS_SUMMARY.md` — 5 min
3. `CONDITIONS_IMPLEMENTATION_PLAN.md` — 15 min
4. `CONDITIONS_DEEP_DIVE.md` (skim phases) — 20 min
5. `CONDITIONS_QUICK_REFERENCE.md` (checklist) — 3 min

**Outcome**: Ready to plan timeline and track progress

---

### Path 3: Developer (Full Implementation) (90 min)
1. `CONDITIONS_INDEX.md` — 2 min
2. `CONDITIONS_ANALYSIS_SUMMARY.md` — 5 min
3. `CONDITIONS_BEFORE_AFTER.md` — 10 min
4. `CONDITIONS_DEEP_DIVE.md` (full read) — 45 min
5. `CONDITIONS_IMPLEMENTATION_PLAN.md` — 15 min
6. `CONDITIONS_QUICK_REFERENCE.md` (bookmark) — 3 min
7. **Implement phases 1-8** — ~5 hours
8. **Test & validate** — ~1 hour

**Outcome**: Complete, tested implementation

---

### Path 4: Developer (Quick Start) (30 min)
1. `CONDITIONS_QUICK_REFERENCE.md` — 5 min
2. `CONDITIONS_DEEP_DIVE.md` Phase 1 — 5 min
3. **Start coding** — ongoing
4. **Refer back to deep dive as needed**

**Outcome**: Fastest path to first code commit

---

### Path 5: Designer/UX (30 min)
1. `CONDITIONS_BEFORE_AFTER.md` — 15 min
2. `CONDITIONS_DEEP_DIVE.md` (sections 3, 6, 7) — 15 min

**Outcome**: Understand visual design system

---

## 🔗 QUICK LINKS

### Problem Analysis
- [Executive Summary](CONDITIONS_ANALYSIS_SUMMARY.md#-executive-summary)
- [Current Broken State](CONDITIONS_ANALYSIS_SUMMARY.md#-current-state-analysis)
- [Schema Mismatches](CONDITIONS_ANALYSIS_SUMMARY.md#schema-mismatches)
- [Pack Data Problems](CONDITIONS_ANALYSIS_SUMMARY.md#pack-data-problems)

### Implementation
- [Phase 1: Data Model](CONDITIONS_DEEP_DIVE.md#phase-1-data-model-update)
- [Phase 2: Template.json](CONDITIONS_DEEP_DIVE.md#phase-2-templatejson-update)
- [Phase 3: Sheet](CONDITIONS_DEEP_DIVE.md#phase-3-modern-condition-sheet)
- [Phase 4: Migration](CONDITIONS_DEEP_DIVE.md#phase-4-pack-data-migration)
- [Phase 5: Additional](CONDITIONS_DEEP_DIVE.md#phase-5-additional-conditions)
- [Phase 6: Chat Card](CONDITIONS_DEEP_DIVE.md#phase-6-chat-card-template)
- [Phase 7: SCSS](CONDITIONS_DEEP_DIVE.md#phase-7-scss-styling)
- [Phase 8: Registration](CONDITIONS_DEEP_DIVE.md#phase-8-system-registration)

### Testing
- [Testing Checklist](CONDITIONS_DEEP_DIVE.md#-testing-checklist)
- [Validation Commands](CONDITIONS_QUICK_REFERENCE.md#-validation-commands)

### Reference
- [Schema Fields](CONDITIONS_QUICK_REFERENCE.md#-key-schema-fields)
- [Computed Properties](CONDITIONS_QUICK_REFERENCE.md#-computed-properties-add-to-conditiondata)
- [Localization Keys](CONDITIONS_QUICK_REFERENCE.md#-localization-keys-45-total)
- [Color Variables](CONDITIONS_QUICK_REFERENCE.md#-color-variables-already-in-_variablesscss)

---

## 📊 STATISTICS

### Documentation
- **Total Documents**: 5
- **Total Size**: ~82KB
- **Total Lines**: ~2400
- **Total Words**: ~18000

### Implementation
- **Files to Modify**: 7
- **Files to Create**: 6
- **Total Files**: 13
- **Code Lines**: ~1200
- **Localization Keys**: 45+
- **Time Estimate**: 4-5 hours

### Outcomes
- **Conditions (Before)**: 8 (broken)
- **Conditions (After)**: 14 (working)
- **Error Reduction**: 100% ("Object [object]" → zero)
- **User Experience**: Dramatically improved

---

## ✅ PROGRESS TRACKING

### Planning Phase
- [x] Analyze current system
- [x] Identify all problems
- [x] Design solution
- [x] Create documentation suite
- [x] Write implementation plan

### Implementation Phase
- [ ] Phase 1: Data Model & Localization
- [ ] Phase 2: Template.json Update
- [ ] Phase 3: Modern Condition Sheet
- [ ] Phase 4: Pack Data Migration (8 conditions)
- [ ] Phase 5: Additional Conditions (6 new)
- [ ] Phase 6: Chat Card Template
- [ ] Phase 7: SCSS Styling
- [ ] Phase 8: System Registration

### Testing Phase
- [ ] Build succeeds
- [ ] Smoke tests pass
- [ ] Data model tests pass
- [ ] Sheet tests pass
- [ ] Visual tests pass
- [ ] Chat card tests pass
- [ ] Compendium browser tests pass
- [ ] Edge case tests pass

### Completion
- [ ] All tests pass
- [ ] Zero console errors
- [ ] Documentation updated
- [ ] AGENTS.md updated
- [ ] Ready for production

---

## 🎯 SUCCESS CRITERIA

### Technical
- ✅ Zero "Object [object]" errors
- ✅ Proper `condition` item type (not trait hack)
- ✅ All 8 conditions migrated successfully
- ✅ 6 additional conditions added (14 total)
- ✅ Modern ApplicationV2 sheet
- ✅ Complete localization (45+ keys)
- ✅ Chat cards with styling
- ✅ Compendium browser integration

### Quality
- ✅ Build succeeds without errors
- ✅ No console errors in Foundry
- ✅ All tests pass
- ✅ User-friendly UI
- ✅ Consistent with system aesthetic

---

## 🚀 NEXT STEPS

1. **Read**: Start with `CONDITIONS_ANALYSIS_SUMMARY.md`
2. **Understand**: Review `CONDITIONS_BEFORE_AFTER.md` for visuals
3. **Plan**: Check `CONDITIONS_IMPLEMENTATION_PLAN.md` for timeline
4. **Implement**: Follow `CONDITIONS_DEEP_DIVE.md` phases 1-8
5. **Reference**: Keep `CONDITIONS_QUICK_REFERENCE.md` open while coding
6. **Test**: Use checklists from deep dive and implementation plan
7. **Complete**: Update progress tracking above

---

## 📞 NEED HELP?

### Stuck on Implementation?
- Re-read relevant phase in `CONDITIONS_DEEP_DIVE.md`
- Check `CONDITIONS_QUICK_REFERENCE.md` for syntax
- Compare to Critical Injuries (same pattern)
- Look at code examples in deep dive

### Visual Design Questions?
- See `CONDITIONS_BEFORE_AFTER.md` for mockups
- Check `CONDITIONS_DEEP_DIVE.md` section 3 for specs
- Reference existing SCSS in `src/scss/item/_critical-injury.scss`

### Project Planning Questions?
- Review `CONDITIONS_IMPLEMENTATION_PLAN.md`
- Check phase time estimates
- Consider incremental approach (Option B)

---

## 🔄 DOCUMENT MAINTENANCE

### When to Update
- After completing each phase
- When encountering issues
- When adding new conditions
- When user feedback received

### What to Update
- Progress tracking (this file)
- Testing results (implementation plan)
- Lessons learned (implementation plan)
- Code examples (deep dive, if patterns change)

---

**Status**: Documentation complete, ready for implementation  
**Last Updated**: 2026-01-09  
**Next Review**: After Phase 4 completion (migration)

**Begin with**: `CONDITIONS_ANALYSIS_SUMMARY.md` → 5 min read → GO! 🚀
