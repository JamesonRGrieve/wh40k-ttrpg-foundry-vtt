#!/bin/bash

# GEAR Pack Diagnostic Script
# Quick analysis of current corruption state

echo "================================"
echo "GEAR PACK DIAGNOSTIC REPORT"
echo "================================"
echo ""

PACK_DIR="src/packs/rt-items-gear/_source"

echo "📊 Total Items:"
find "$PACK_DIR" -name "*.json" | wc -l

echo ""
echo "🔍 Sample Corruption Examples:"
echo ""

# Show 3 examples of the corruption
for file in $(find "$PACK_DIR" -name "*.json" | head -3); do
    name=$(cat "$file" | grep '"name"' | head -1 | cut -d'"' -f4)
    type=$(cat "$file" | grep '"type"' | grep -v '"gear"' | head -1 | cut -d'"' -f4)
    avail=$(cat "$file" | grep '"availability"' | head -1 | cut -d'"' -f4 | cut -c1-60)
    effects=$(cat "$file" | grep '"effects"' | head -1 | cut -d'"' -f4)
    weight=$(cat "$file" | grep '"weight"' | head -1 | cut -d'"' -f4)
    
    echo "Item: $name"
    echo "  type: \"$type\" ← should be category enum"
    echo "  availability: \"$avail...\" ← should be enum like 'average'"
    echo "  effects: \"$effects\" ← should be effect description"
    echo "  weight: \"$weight\" ← should be number"
    echo ""
done

echo "🔢 Field Corruption Statistics:"
echo ""

echo "Items with 'Tool' in type field:"
grep -r '"type".*"Tool' "$PACK_DIR" | wc -l

echo "Items with long availability text (>50 chars):"
grep -r '"availability"' "$PACK_DIR"/*.json | awk -F'"' '{print length($4)}' | awk '$1 > 50' | wc -l

echo "Items with availability enum in effects field:"
grep -rE '"effects".*"(Common|Average|Rare|Scarce)"' "$PACK_DIR" | wc -l

echo "Items with 'kg' in weight field:"
grep -r '"weight".*".*kg' "$PACK_DIR" | wc -l

echo ""
echo "💡 Solution:"
echo "   Run: node scripts/migrate-gear-packs.mjs --dry-run"
echo "   Read: GEAR_REFACTOR_SUMMARY.md"
echo ""
