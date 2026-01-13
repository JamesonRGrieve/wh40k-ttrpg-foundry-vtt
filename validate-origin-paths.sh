#!/bin/bash
###############################################################################
# Origin Path Validation Suite
# 
# Runs all validation scripts and generates comprehensive reports.
# 
# Usage: ./validate-origin-paths.sh
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   Origin Path Validation Suite${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""

# Track overall success
ALL_PASSED=true

###############################################################################
# 1. UUID Reference Validation
###############################################################################
echo -e "${CYAN}Running UUID Reference Validation...${NC}"
echo ""

if node "${SCRIPT_DIR}/src/scripts/validate-origin-uuids.mjs"; then
    echo -e "${GREEN}✓ UUID Validation: PASSED${NC}"
    echo ""
else
    echo -e "${RED}✗ UUID Validation: FAILED${NC}"
    echo ""
    ALL_PASSED=false
fi

###############################################################################
# 2. Origin Path Audit
###############################################################################
echo -e "${CYAN}Running Origin Path Audit...${NC}"
echo ""

if node "${SCRIPT_DIR}/src/scripts/audit-origins.mjs"; then
    echo -e "${GREEN}✓ Origin Audit: COMPLETE${NC}"
    echo ""
else
    echo -e "${RED}✗ Origin Audit: FAILED${NC}"
    echo ""
    ALL_PASSED=false
fi

###############################################################################
# 3. Talent Duplicate Check
###############################################################################
echo -e "${CYAN}Running Talent Duplicate Check...${NC}"
echo ""

if node "${SCRIPT_DIR}/src/scripts/check-duplicate-talents.mjs"; then
    echo -e "${GREEN}✓ Talent Check: COMPLETE${NC}"
    echo ""
else
    echo -e "${RED}✗ Talent Check: FAILED${NC}"
    echo ""
    ALL_PASSED=false
fi

###############################################################################
# Summary
###############################################################################
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   Validation Complete${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""

if [ "$ALL_PASSED" = true ]; then
    echo -e "${GREEN}✓ All validations passed successfully!${NC}"
    echo ""
    echo "Reports generated:"
    echo "  • UUID_VALIDATION_REPORT.md"
    echo "  • ORIGIN_PATH_AUDIT_REPORT.md"
    echo "  • TALENT_REUSE_REPORT.md"
    echo ""
    exit 0
else
    echo -e "${RED}✗ Some validations failed. Check reports for details.${NC}"
    echo ""
    exit 1
fi
