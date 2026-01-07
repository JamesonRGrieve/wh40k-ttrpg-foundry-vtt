# Enhanced Animations - Testing Checklist

**Feature:** Enhanced Animated Stat Changes  
**Status:** ✅ Complete - Ready for Testing

---

## ✅ Pre-Testing Checklist

- [x] Code compiled successfully
- [x] No build errors
- [x] Mixin integrated into BaseActorSheet
- [x] SCSS compiled and included
- [x] Documentation complete
- [x] Auto-detection wired up

---

## 🧪 Test Scenarios

### Test 1: Wounds Damage Animation

**Steps:**
1. Open an Acolyte character sheet
2. Note current wounds (e.g., 20/20)
3. Click the wounds **minus (−)** button
4. **Expected:** 
   - Counter counts down: 20 → 19 → 18 → 17 → 16
   - Wounds bar shrinks smoothly from 100% → 80%
   - Red damage flash on the value
   - Brief notification appears: "-4 Wounds"

**Result:** ⬜ Pass / ⬜ Fail

---

### Test 2: Wounds Healing Animation

**Steps:**
1. Reduce wounds to half (e.g., 10/20)
2. Click the wounds **plus (+)** button multiple times
3. **Expected:**
   - Counter counts up: 10 → 11 → 12 → ... → 15
   - Wounds bar grows smoothly from 50% → 75%
   - Green healing glow on the value
   - Brief notification: "+5 Wounds"

**Result:** ⬜ Pass / ⬜ Fail

---

### Test 3: Characteristic Advance (No Bonus Change)

**Steps:**
1. Find a characteristic at 42 (Bonus: 4)
2. Manually edit advance to increase total to 47
3. **Expected:**
   - Counter counts: 42 → 43 → 44 → 45 → 46 → 47
   - Gold advancement glow on total
   - Bonus stays 4 (no bonus animation)

**Result:** ⬜ Pass / ⬜ Fail

---

### Test 4: Characteristic Advance (Bonus Change)

**Steps:**
1. Find a characteristic at 47 (Bonus: 4)
2. Increase advance to bring total to 52
3. **Expected:**
   - Total counts: 47 → 48 → ... → 52
   - Gold advancement glow on total
   - Bonus counts: 4 → 5
   - Bonus pulses and scales up (gold glow)
   - Brief notification: "Bonus +1"

**Result:** ⬜ Pass / ⬜ Fail

---

### Test 5: XP Gain Animation

**Steps:**
1. Note current XP (e.g., 1000)
2. Edit experience.total to add 150 XP (→ 1150)
3. **Expected:**
   - Counter counts: 1000 → 1010 → ... → 1150
   - Gold radial gradient bursts outward
   - Brief notification: "+150 XP"

**Result:** ⬜ Pass / ⬜ Fail

---

### Test 6: Multiple Rapid Changes

**Steps:**
1. Rapidly click wounds minus button 5 times
2. **Expected:**
   - Each animation completes smoothly
   - No overlapping/conflicting animations
   - Final value is correct (5 less than start)

**Result:** ⬜ Pass / ⬜ Fail

---

### Test 7: Progress Bar Transition

**Steps:**
1. Set wounds to 20/20 (100%)
2. Reduce to 10/20 (50%)
3. **Expected:**
   - Bar smoothly shrinks from full to half
   - Transition takes ~400ms
   - No jumps or stutters

**Result:** ⬜ Pass / ⬜ Fail

---

### Test 8: Brief Notifications

**Steps:**
1. Make any stat change (wounds, XP, etc.)
2. Watch for brief notification
3. **Expected:**
   - Notification appears near changed element
   - Fades in from left (0.2s)
   - Shows delta value ("+5 Wounds")
   - Visible for ~1.5s
   - Fades out to right
   - Automatically removes from DOM

**Result:** ⬜ Pass / ⬜ Fail

---

### Test 9: Reduced Motion Preference

**Steps:**
1. In browser DevTools, emulate reduced motion:
   - Open DevTools → Command Palette (Ctrl+Shift+P)
   - Type "Rendering"
   - Enable "Emulate CSS prefers-reduced-motion: reduce"
2. Make stat changes (wounds, characteristics)
3. **Expected:**
   - Values update instantly (no counting)
   - No smooth transitions
   - No flash effects
   - Stats still change correctly
   - Brief notifications fade faster

**Result:** ⬜ Pass / ⬜ Fail

---

### Test 10: Auto-Detection on Document Update

**Steps:**
1. Open character sheet
2. In console: `actor.update({ "system.wounds.value": actor.system.wounds.value - 3 })`
3. **Expected:**
   - Animation triggers automatically
   - Counter counts down by 3
   - Flash effect appears
   - No manual triggering needed

**Result:** ⬜ Pass / ⬜ Fail

---

## 🐛 Common Issues & Solutions

### Issue: Counter doesn't animate

**Causes:**
- Missing `value-counter` class on element
- Element contains extra markup (should be just the number)
- Previous state not captured

**Debug:**
```javascript
// In browser console
const sheet = Object.values(ui.windows).find(w => w.document?.type === "acolyte");
console.log("Previous state:", sheet._previousState);
console.log("Has animateWoundsChange:", typeof sheet.animateWoundsChange);
```

**Fix:**
- Add `value-counter` class to template
- Ensure `_captureAnimationState()` is called in `_onRender()`

---

### Issue: Progress bar jumps instantly

**Causes:**
- Missing CSS transition on `.rt-wounds-bar-fill`
- CSS variable not updating
- Conflicting CSS overriding transition

**Debug:**
```javascript
// Check bar element
const bar = document.querySelector(".rt-wounds-bar-fill");
console.log(getComputedStyle(bar).transition);  // Should show "width 0.4s..."
```

**Fix:**
- Verify SCSS compiled correctly
- Check for `!important` rules overriding transition

---

### Issue: Bonus doesn't pulse

**Causes:**
- Missing `.changed` class application
- Bonus value didn't actually change
- CSS animation not defined

**Debug:**
```javascript
// Watch for bonus changes
const bonus = document.querySelector(".characteristic-bonus");
const observer = new MutationObserver(() => console.log("Bonus changed!"));
observer.observe(bonus, { characterData: true, subtree: true });
```

**Fix:**
- Ensure `animateCharacteristicBonus()` is called when bonus changes
- Verify `.changed` class exists in compiled CSS

---

### Issue: Animations run multiple times

**Causes:**
- Sheet re-rendering multiple times
- State not updating properly
- Multiple event listeners

**Debug:**
```javascript
// Add logging to detect multiple calls
const originalAnimate = sheet.animateWoundsChange;
sheet.animateWoundsChange = function(...args) {
    console.trace("animateWoundsChange called");
    return originalAnimate.apply(this, args);
};
```

**Fix:**
- Check document update isn't triggering multiple re-renders
- Ensure animation cancellation is working

---

## 📊 Performance Testing

### FPS Monitoring

**Steps:**
1. Open DevTools → Performance tab
2. Start recording
3. Make rapid stat changes (click minus/plus buttons quickly)
4. Stop recording
5. **Expected:**
   - Steady 60fps during animations
   - No dropped frames
   - Smooth green bars in timeline

**Result:** ⬜ Pass / ⬜ Fail

---

### Memory Leaks

**Steps:**
1. Open DevTools → Memory tab
2. Take heap snapshot
3. Open/close character sheet 10 times
4. Take another heap snapshot
5. Compare snapshots
6. **Expected:**
   - No significant memory increase
   - Animation frames properly cancelled
   - Event listeners cleaned up

**Result:** ⬜ Pass / ⬜ Fail

---

## ✅ Sign-Off Checklist

- [ ] All 10 test scenarios pass
- [ ] No console errors or warnings
- [ ] FPS stays at 60 during animations
- [ ] No memory leaks detected
- [ ] Works with reduced motion enabled
- [ ] Animations feel smooth and natural
- [ ] Brief notifications are readable
- [ ] No visual glitches or stutters
- [ ] Ready for player testing

---

## 📝 Testing Notes

**Tester:** _________________  
**Date:** _________________  
**Build Version:** _________________

**Overall Assessment:**
- ⬜ Ready for production
- ⬜ Needs minor fixes
- ⬜ Needs major rework

**Additional Comments:**

---

**Approved by:** _________________  
**Date:** _________________
