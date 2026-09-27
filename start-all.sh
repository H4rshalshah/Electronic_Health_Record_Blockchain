#!/bin/bash
# ============================================================
# start-all.sh — Complete One-Click Orchestrator
# Automates the setup of Hospital, Pharmacy, and Lab networks,
# then launches all 14 Node.js apps via Docker Compose.
# ============================================================

set -e
export PATH=$PWD/bin:$PATH
export FABRIC_BIN=$PWD/bin
export FABRIC_CFG=$PWD/config
export FABRIC_CFG_PATH=$PWD/config

echo "============================================================"
echo " 1. Initializing Environment Configurations"
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

echo ""
echo "============================================================"
echo " 2. Starting Blockchain Networks"
echo "============================================================"
echo "NOTE: This step requires Fabric binaries. If they are missing,"
echo "you must download them per the docs/setup-guide.md instructions first."

echo "--> Starting Hospital Network..."
(cd orgs/hospital/EHR_hospitalOrg-main/ehr-network && bash scripts/network-up.sh || echo "Warning: Hospital network startup failed or binaries missing.")

echo "--> Starting Pharmacy Network..."
(cd orgs/pharmacy/fabric-network-swarm && bash deploy.sh || echo "Warning: Pharmacy deployment failed.")

echo "--> Starting Lab Network..."
(cd orgs/lab/EHR-LABORG-main && bash scripts/start-machine1.sh || echo "Warning: Lab network startup failed.")

echo ""
echo "============================================================"
echo " 3. Launching Application Tier (Docker Compose)"
echo "============================================================"
echo "Spinning up all 14 Node.js frontends and backends in Docker..."
docker compose up -d

echo ""
echo "============================================================"
echo " ALL SYSTEMS GO 🚀"
echo "============================================================"
echo "Hospital UIs : http://localhost:5173 (Reception) | :5174 (Patient)"
echo "Pharmacy UIs : http://localhost:3001 to 3005"
echo "Lab Gateway  : http://localhost:3006"
echo "============================================================"
