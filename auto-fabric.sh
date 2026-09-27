#!/bin/bash
set -e

echo "=========================================================="
echo "🚀 Automating Hyperledger Fabric Test Network Setup"
echo "=========================================================="

# 1. Locate the test-network directory dynamically for ANY user
echo "🔍 Locating fabric-samples directory..."
if [ -d "$HOME/fabric-samples/test-network" ]; then
    FABRIC_DIR="$HOME/fabric-samples/test-network"
elif [ -d "$HOME/go/src/github.com/$USER/fabric-samples/test-network" ]; then
    FABRIC_DIR="$HOME/go/src/github.com/$USER/fabric-samples/test-network"
else
    # Fallback to searching the user's home directory
    FABRIC_DIR=$(find "$HOME" -type d -name "test-network" -path "*/fabric-samples/test-network" 2>/dev/null | head -n 1)
fi

if [ -z "$FABRIC_DIR" ] || [ ! -d "$FABRIC_DIR" ]; then
    echo "❌ Could not find fabric-samples/test-network in $HOME"
    exit 1
fi

echo "✅ Found test-network at: $FABRIC_DIR"
cd "$FABRIC_DIR"

echo "🧹 1. Tearing down any existing network..."
./network.sh down

echo "🏗️ 2. Bringing up Network (Org1 & Org2) and Creating Channel (mychannel)..."
./network.sh up createChannel -ca -c mychannel

echo "➕ 3. Adding Org3 to the channel..."
cd addOrg3
./addOrg3.sh up -ca -c mychannel
cd ..

echo "📦 4. Deploying 'basic' Smart Contract (Chaincode)..."
./network.sh deployCC -ccn basic -ccp ../asset-transfer-basic/chaincode-go -ccl go

echo "✅ 5. Setting up Peer CLI Environment for Org1..."
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=${PWD}/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

echo "📝 6. Executing Smart Contract (Creating an Asset)..."
peer chaincode invoke \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls \
  --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
  -C mychannel \
  -n basic \
  --peerAddresses localhost:7051 \
  --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
  --peerAddresses localhost:9051 \
  --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
  -c '{"function":"CreateAsset","Args":["asset300","blue","10","Javed","1000"]}'

echo "⏳ Waiting 3 seconds for transaction to commit..."
sleep 3

echo "🔍 7. Querying Smart Contract (Reading the Ledger)..."
peer chaincode query -C mychannel -n basic -c '{"function":"ReadAsset","Args":["asset300"]}'

echo "=========================================================="
echo "🎉 Network with 3 Orgs successfully built and tested!"
echo "=========================================================="
