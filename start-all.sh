#!/bin/bash
# ============================================================
# start-all.sh — ONE-COMMAND Orchestrator for EHR Blockchain
# Run this once. It handles everything automatically:
#   - Pulls latest pre-built Docker images from GitHub (GHCR)
#   - Copies environment config files
#   - Attempts to start Fabric blockchain networks (optional)
#   - Launches all Node.js apps via Docker Compose
#
# USAGE:
#   bash start-all.sh
#
# ACCESS EVERYTHING AT:
#   http://localhost
# ============================================================

set -e
export PATH=$PWD/bin:$PATH
export FABRIC_BIN=$PWD/bin
export FABRIC_CFG=$PWD/config
export FABRIC_CFG_PATH=$PWD/config

# ─────────────────────────────────────────────────────────────
# STEP 0: Verify Docker is running
# ─────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo " 0. Checking Docker..."
echo "============================================================"
if ! docker info > /dev/null 2>&1; then
  echo ""
  echo "  ❌ ERROR: Docker is not running."
  echo ""
  echo "  Please open Docker Desktop and wait until the icon turns"
  echo "  green (Engine Running), then re-run this script."
  echo ""
  exit 1
fi
echo "  ✅ Docker is running."

# ─────────────────────────────────────────────────────────────
# STEP 1: Pull the latest pre-built images from GHCR
# ─────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo " 1. Pulling latest images from GitHub (GHCR)..."
echo "    (This is fast after the first run — uses cached layers)"
echo "============================================================"
docker compose pull || echo "  ⚠ Warning: Could not pull some images. Will use local cache."

# ─────────────────────────────────────────────────────────────
# STEP 2: Copy environment config files
# ─────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo " 2. Initializing Environment Configurations"
echo "============================================================"
# Automatically copy all *.env.example files to *.env across the repo
find . -type f -name "*.env.example" -exec sh -c 'cp -n "$0" "${0%.example}"' {} \;

# Dynamically resolve hardcoded paths to match the user's current system path
HOSPITAL_NET_PATH="$PWD/orgs/hospital/EHR_hospitalOrg-main/ehr-network"
find . -type f -name "*.env" -exec sed -i "s|FABRIC_BASE_PATH=.*|FABRIC_BASE_PATH=${HOSPITAL_NET_PATH}|g" {} \;

PHARMACY_CRYPTO_PATH="$PWD/orgs/pharmacy/fabric-network-swarm/crypto-config"
find ./orgs/pharmacy/fabric-network-swarm/app/backend -type f -name "connection.json" -exec sed -i "s|/home/ankit/fabric-network/crypto-config|${PHARMACY_CRYPTO_PATH}|g" {} 2>/dev/null \;
find ./orgs/pharmacy/fabric-network-swarm/app/backend -type f -name "connection.json" -exec sed -i "s|/srv/fabric-network-swarm/crypto-config|${PHARMACY_CRYPTO_PATH}|g" {} 2>/dev/null \;
find ./orgs/pharmacy -type f -name "registerAdmin.js" -exec sed -i "s|/home/ankit/fabric-network/crypto-config|${PHARMACY_CRYPTO_PATH}|g" {} 2>/dev/null \;

echo "Environment templates copied and dynamic paths resolved to $PWD."

# ─────────────────────────────────────────────────────────────
# STEP 3: Start Blockchain Networks (requires Fabric binaries)
# ─────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo " 3. Starting Blockchain Networks (Optional)"
echo "    Requires Hyperledger Fabric binaries in PATH."
echo "    If binaries are missing, this step is skipped safely."
echo "============================================================"

echo "--> Starting Hospital Network..."
(cd orgs/hospital/EHR_hospitalOrg-main/ehr-network && bash scripts/network-up.sh) \
  && echo "  ✅ Hospital network started." \
  || echo "  ⚠ Hospital network skipped (Fabric binaries not found)."

echo "--> Starting Pharmacy Network..."
(cd orgs/pharmacy/fabric-network-swarm && bash deploy.sh) \
  && echo "  ✅ Pharmacy network started." \
  || echo "  ⚠ Pharmacy network skipped."

echo "--> Starting Lab Network..."
(cd orgs/lab/EHR-LABORG-main && bash scripts/start-machine1.sh) \
  && echo "  ✅ Lab network started." \
  || echo "  ⚠ Lab network skipped."

# ─────────────────────────────────────────────────────────────
# STEP 4: Launch All Apps via Docker Compose
# ─────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo " 4. Launching All Applications (Docker Compose)"
echo "============================================================"
docker compose up -d
echo "  ✅ All containers started."

# ─────────────────────────────────────────────────────────────
# DONE
# ─────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo " ✅  ALL SYSTEMS GO 🚀"
echo "============================================================"
echo ""
echo "  Open your browser and go to:"
echo ""
echo "  👉  http://localhost"
echo ""
echo "  All portals are available under that single address:"
echo "    /             → Hospital Reception"
echo "    /patient/     → Hospital Patient Portal"
echo "    /pharmacy/    → Pharmacy Main"
echo "    /pharmacy/manager/   → Pharmacy Manager"
echo "    /pharmacy/employee/  → Pharmacy Employee"
echo "    /pharmacy/billing/   → Pharmacy Billing"
echo "    /pharmacy/inventory/ → Pharmacy Inventory"
echo "    /pharmacy/patient/   → Pharmacy Patient"
echo "    /lab/         → Lab Gateway"
echo ""
echo "  To stop everything:  docker compose down"
echo "  To see logs:         docker compose logs -f"
echo ""
echo "============================================================"
