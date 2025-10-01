#!/bin/bash

# ==============================================================================
# DevCoach AI - Run All Postman Tests
# ==============================================================================
# This script runs all Postman collections using Newman in the correct order
# with proper error handling and reporting.
#
# Usage:
#   ./run-all-tests.sh [environment]
#
# Arguments:
#   environment - Optional. Values: dev (default), staging, production
#
# Examples:
#   ./run-all-tests.sh              # Uses development environment
#   ./run-all-tests.sh staging      # Uses staging environment
# ==============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-dev}
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COLLECTIONS_DIR="${BASE_DIR}/collections"
ENVIRONMENTS_DIR="${BASE_DIR}/environments"
REPORTS_DIR="${BASE_DIR}/reports"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Environment file mapping
case $ENVIRONMENT in
  dev|development)
    ENV_FILE="${ENVIRONMENTS_DIR}/global-environment.json"
    ;;
  staging)
    ENV_FILE="${ENVIRONMENTS_DIR}/global-environment-staging.json"
    ;;
  prod|production)
    ENV_FILE="${ENVIRONMENTS_DIR}/global-environment-production.json"
    ;;
  *)
    echo -e "${RED}❌ Invalid environment: ${ENVIRONMENT}${NC}"
    echo "Valid options: dev, staging, production"
    exit 1
    ;;
esac

# Check if Newman is installed
if ! command -v newman &> /dev/null; then
    echo -e "${RED}❌ Newman is not installed${NC}"
    echo "Install it with: npm install -g newman newman-reporter-htmlextra"
    exit 1
fi

# Create reports directory
mkdir -p "${REPORTS_DIR}/${TIMESTAMP}"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        DevCoach AI - API Test Suite (Newman)                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}🌍 Environment:${NC} ${ENVIRONMENT}"
echo -e "${GREEN}📁 Environment File:${NC} ${ENV_FILE}"
echo -e "${GREEN}📊 Reports Directory:${NC} ${REPORTS_DIR}/${TIMESTAMP}"
echo ""

# Check if environment file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ Environment file not found: ${ENV_FILE}${NC}"
    exit 1
fi

# Track overall status
TOTAL_TESTS=0
FAILED_TESTS=0

# Function to run a collection
run_collection() {
    local collection_name=$1
    local collection_file=$2
    local report_prefix=$3

    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}🧪 Running: ${collection_name}${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if [ ! -f "$collection_file" ]; then
        echo -e "${RED}❌ Collection file not found: ${collection_file}${NC}"
        return 1
    fi

    if newman run "$collection_file" \
        -e "$ENV_FILE" \
        --reporters cli,json,htmlextra \
        --reporter-json-export "${REPORTS_DIR}/${TIMESTAMP}/${report_prefix}-report.json" \
        --reporter-htmlextra-export "${REPORTS_DIR}/${TIMESTAMP}/${report_prefix}-report.html" \
        --reporter-htmlextra-title "${collection_name}" \
        --reporter-htmlextra-logs \
        --color on \
        --delay-request 100; then

        echo -e "${GREEN}✅ ${collection_name} - PASSED${NC}"
        return 0
    else
        echo -e "${RED}❌ ${collection_name} - FAILED${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

# Run collections in order
echo -e "${BLUE}📋 Starting test execution...${NC}"
echo ""

# 1. Run Master Collection
run_collection \
    "All Tests (Master Collection)" \
    "${COLLECTIONS_DIR}/all-tests-collection.json" \
    "all-tests"
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# 2. Run individual module collections for detailed reports
echo ""
echo -e "${BLUE}📋 Running individual module collections...${NC}"

run_collection \
    "Authentication Module" \
    "${COLLECTIONS_DIR}/auth-collection.json" \
    "auth"
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Generate summary
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    Test Execution Summary                     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}📊 Total Collections Run:${NC} ${TOTAL_TESTS}"
echo -e "${GREEN}✅ Passed:${NC} $((TOTAL_TESTS - FAILED_TESTS))"

if [ $FAILED_TESTS -gt 0 ]; then
    echo -e "${RED}❌ Failed:${NC} ${FAILED_TESTS}"
else
    echo -e "${GREEN}❌ Failed:${NC} 0"
fi

echo ""
echo -e "${GREEN}📁 Reports saved to:${NC}"
echo "   ${REPORTS_DIR}/${TIMESTAMP}/"
echo ""
echo -e "${GREEN}📄 Available reports:${NC}"
ls -lh "${REPORTS_DIR}/${TIMESTAMP}/"
echo ""

# Open HTML report in browser (optional, comment out if not needed)
if command -v xdg-open &> /dev/null; then
    echo -e "${BLUE}🌐 Opening HTML report in browser...${NC}"
    xdg-open "${REPORTS_DIR}/${TIMESTAMP}/all-tests-report.html" 2>/dev/null || true
elif command -v open &> /dev/null; then
    echo -e "${BLUE}🌐 Opening HTML report in browser...${NC}"
    open "${REPORTS_DIR}/${TIMESTAMP}/all-tests-report.html" 2>/dev/null || true
fi

# Exit with appropriate code
if [ $FAILED_TESTS -gt 0 ]; then
    echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ❌ Some tests FAILED - Please review the reports above       ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
    exit 1
else
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  🎉 All tests PASSED successfully!                            ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    exit 0
fi
