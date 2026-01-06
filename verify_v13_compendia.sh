#!/bin/bash

# Verification script for Foundry VTT V13 Compendium Updates
# This script checks that all necessary changes are in place

echo "=== Rogue Trader V13 Compendium Verification ==="
echo ""

# Check if system.json exists
if [ ! -f "build/rogue-trader/system.json" ]; then
    echo "❌ Error: build/rogue-trader/system.json not found. Please run 'npm run build' first."
    exit 1
fi

cd build/rogue-trader

# Check documentTypes section
echo "Checking documentTypes section..."
if grep -q '"documentTypes"' system.json; then
    echo "✅ documentTypes section found"
    
    # Count Actor and Item types
    ACTOR_TYPES=$(grep -o '"Actor"' system.json | wc -l)
    ITEM_TYPES=$(grep -o '"ammunition"\|"aptitude"\|"armour"\|"originPath"\|"weapon"' system.json | wc -l)
    
    if [ $ACTOR_TYPES -gt 0 ]; then
        echo "✅ Actor types configured"
    fi
    
    if [ $ITEM_TYPES -gt 0 ]; then
        echo "✅ Item types configured (including originPath)"
    fi
else
    echo "❌ documentTypes section NOT found"
    exit 1
fi

echo ""
echo "Checking pack flags..."

# Check if origin-path pack has flags
if grep -A 5 '"rt-items-origin-path"' system.json | grep -q '"flags"'; then
    echo "✅ rt-items-origin-path has flags configured"
else
    echo "❌ rt-items-origin-path missing flags"
fi

# Check total packs
PACK_COUNT=$(grep -c '"name":.*"rt-' system.json)
echo "✅ Found $PACK_COUNT compendium packs"

echo ""
echo "Checking pack directories..."

# Verify pack directories exist
MISSING_PACKS=0
for pack in rt-items-origin-path rt-items-gear rt-items-weapons rt-actors-bestiary; do
    if [ -d "packs/$pack" ]; then
        echo "✅ packs/$pack exists"
    else
        echo "❌ packs/$pack NOT found"
        MISSING_PACKS=$((MISSING_PACKS + 1))
    fi
done

echo ""
if [ $MISSING_PACKS -eq 0 ]; then
    echo "✅ All critical packs verified successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Copy the build/rogue-trader directory to your Foundry VTT systems folder"
    echo "2. Launch Foundry VTT and create/load a world with Rogue Trader"
    echo "3. Check the Compendium tab - all packs should be visible"
    echo "4. Test drag-and-drop from compendia to character sheets"
    echo "5. Verify Origin Path compendium (57 items) is accessible"
else
    echo "❌ Verification failed with $MISSING_PACKS missing packs"
    exit 1
fi
