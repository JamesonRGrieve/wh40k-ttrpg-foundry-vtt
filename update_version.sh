#!/bin/bash
# Update Version Number
# Usage: ./update_version.sh <new-version>
NEXT_VERSION="$1" pnpm run version
