#!/bin/bash

echo "═══════════════════════════════════════════════════════════════"
echo "  Birthright & Lure of the Void - Refactor Verification"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS="${GREEN}✓${NC}"
FAIL="${RED}✗${NC}"

total_checks=0
passed_checks=0

check() {
    total_checks=$((total_checks + 1))
    if [ "$1" = "true" ]; then
        passed_checks=$((passed_checks + 1))
        echo -e "$PASS $2"
    else
        echo -e "$FAIL $2"
    fi
}

echo "📋 File Existence Checks"
echo "─────────────────────────"

files=(
    "scavenger_KESTjlDNtHncRoxS.json"
    "scapegrace_VpkONuWQfxGpzMCp.json"
    "stubjack_RBpW3W9ZOIQYKgKg.json"
    "child-of-the-creed_R24GdwakB9avuffJ.json"
    "savant_0DMx4rOTVo5IennF.json"
    "vaunted_hP8LpNBP5nHZngJs.json"
    "tainted_QVoCUBiR1i4be47t.json"
    "criminal_TKW8s7sCRjsjNgql.json"
    "renegade_raFNWbq385zrzhlu.json"
    "duty-bound_gh7Ny4UdjlzbQbk7.json"
    "zealot_vWk41i89fQikyUHN.json"
    "chosen-by-destiny_jUEjBWXgfjxqjFID.json"
)

for file in "${files[@]}"; do
    path="src/packs/rt-items-origin-path/_source/$file"
    if [ -f "$path" ]; then
        check "true" "$file exists"
    else
        check "false" "$file exists"
    fi
done

echo ""
echo "🔍 Content Validation"
echo "─────────────────────────"

for file in "${files[@]}"; do
    path="src/packs/rt-items-origin-path/_source/$file"
    
    # Check for flavor text
    if grep -q "<h2>" "$path" && grep -q "<blockquote>" "$path"; then
        check "true" "${file%_*}: Has rich flavor text"
    else
        check "false" "${file%_*}: Has rich flavor text"
    fi
    
    # Check for source citation
    if grep -q "Rogue Trader Core Rulebook" "$path"; then
        check "true" "${file%_*}: Has source citation"
    else
        check "false" "${file%_*}: Has source citation"
    fi
    
    # Check for choices array
    if grep -q '"choices":' "$path"; then
        check "true" "${file%_*}: Has choices array"
    else
        check "false" "${file%_*}: Has choices array"
    fi
    
    # Validate JSON syntax
    if python3 -m json.tool "$path" >/dev/null 2>&1; then
        check "true" "${file%_*}: Valid JSON"
    else
        check "false" "${file%_*}: Valid JSON"
    fi
done

echo ""
echo "📚 Documentation Checks"
echo "─────────────────────────"

if [ -f "BIRTHRIGHT_LURE_REFACTOR_COMPLETE.md" ]; then
    check "true" "BIRTHRIGHT_LURE_REFACTOR_COMPLETE.md exists"
else
    check "false" "BIRTHRIGHT_LURE_REFACTOR_COMPLETE.md exists"
fi

if [ -f "BIRTHRIGHT_LURE_QUICK_REFERENCE.md" ]; then
    check "true" "BIRTHRIGHT_LURE_QUICK_REFERENCE.md exists"
else
    check "false" "BIRTHRIGHT_LURE_QUICK_REFERENCE.md exists"
fi

if [ -f "BIRTHRIGHT_LURE_BEFORE_AFTER.md" ]; then
    check "true" "BIRTHRIGHT_LURE_BEFORE_AFTER.md exists"
else
    check "false" "BIRTHRIGHT_LURE_BEFORE_AFTER.md exists"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo -e "  ${YELLOW}Result: ${passed_checks}/${total_checks} checks passed${NC}"

if [ "$passed_checks" = "$total_checks" ]; then
    echo -e "  ${GREEN}STATUS: ✅ ALL CHECKS PASSED${NC}"
    echo ""
    echo "  Ready for:"
    echo "    • npm run build (compile to compendium packs)"
    echo "    • Runtime implementation (choice dialogs)"
    echo "    • Testing in Foundry VTT"
else
    echo -e "  ${RED}STATUS: ❌ SOME CHECKS FAILED${NC}"
fi

echo "═══════════════════════════════════════════════════════════════"
