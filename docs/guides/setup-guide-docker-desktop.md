# Running with Docker Desktop (macOS)

This is the recommended macOS path for the Hospital organization (and its FHIR
integration). It uses **Docker Desktop** as the Docker runtime instead of Colima —
Colima proved unstable on this hardware (its VM kept dropping the Docker socket).

> **Note on crashes:** clearing ports with `lsof -ti :PORT | xargs kill` before a
> restart was observed to destabilize the Docker runtime. Prefer stopping a *previous*
> run cleanly (e.g. `./stop.sh`, or killing only the known service PIDs) rather than
> blanket-killing by port.

## 0. Switch to Docker Desktop

```bash
# stop colima so it doesn't compete for resources
colima stop

# start Docker Desktop (wait for "Docker Desktop is running")
open -a Docker
```

Wait ~30–60s, then confirm Docker is reachable:

```bash
docker context use desktop-linux   # or "default" if desktop-linux errors
docker info                         # should print without error
```

> **Memory:** on a 16 GB Mac, lower Docker Desktop's memory — Settings → Resources →
> Memory → **6 GB**. (The default 8 GB + the Fabric network + 6 Node services can
> thrash.)

## 1. Pre-pull the Fabric images

```bash
docker pull hyperledger/fabric-peer:2.5
docker pull hyperledger/fabric-orderer:2.5
docker pull hyperledger/fabric-ca:latest
docker pull hyperledger/fabric-nodeenv:2.5
docker pull hyperledger/fabric-baseos:2.5
docker pull ipfs/kubo:latest
```

## 2. Bring up the network + chaincode

```bash
cd /Users/snehprinceherenj/dev/Electronic_Health_Record_Blockchain/orgs/hospital/EHR_hospitalOrg-main/ehr-network

bash scripts/network-down.sh     # clean slate (removes any stale volumes)

bash scripts/network-up.sh       # CAs → enroll → peers/orderer/IPFS → channel

bash scripts/deployChaincode.sh --channel ehrchannel --chaincode-name ehr \
  --chaincode-path ../ehr-chaincode-v3 --version 2.1 --sequence 1
```

Verify the network is healthy:

```bash
docker ps | grep -E "orderer|peer|ipfs"
```

## 3. Start the backends

```bash
cd ../ehr-backend-v3

# create a .env for each service + auto-generate a JWT_SECRET (one-time)
JWT="$(openssl rand -hex 32)"
for s in peer0-api peer1-api peer2-api extorg-api patient-api ipfs-service; do
  cp "$s/.env.example" "$s/.env"
  sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=${JWT}|" "$s/.env"   # macOS (Linux: sed -i)
done

# install deps (first time only)
for s in peer0-api peer1-api peer2-api extorg-api patient-api ipfs-service; do
  (cd "$s" && npm install)
done

# start each (6 terminals, or background them) — ipfs-service first
cd ipfs-service && npm start      # :4006
cd ../peer0-api && npm start      # :4001
cd ../peer1-api && npm start      # :4002
cd ../peer2-api && npm start      # :4003
cd ../extorg-api && npm start     # :4004
cd ../patient-api && npm start    # :4005
```

Verify all six:

```bash
for p in 4001 4002 4003 4004 4005 4006; do echo -n ":$p "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:$p/health; done
```

## 4. Test the FHIR flow

Login and register a fresh patient (note the `fhirAnchor` in the response):

```bash
TOKEN=$(curl -s -X POST http://localhost:4001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"receptionist","password":"recpw"}' | jq -r '.data.token')

curl -s -X POST http://localhost:4001/patients \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"patientId":"PAT-777","name":"Aisha Khan","age":34,"gender":"female","bloodGroup":"B+","contact":"+91-90000-11111","address":"Mumbai"}' \
  | jq '.data.fhirAnchor'
```

Read the anchor back on-chain (grab `patientIdHash` from the output above):

```bash
cd ../ehr-network
source scripts/fabric-bin.sh
export CORE_PEER_TLS_ENABLED=true CORE_PEER_LOCALMSPID=HospitalMSP
export CORE_PEER_MSPCONFIGPATH="$PWD/organizations/peerOrganizations/hospital.example.com/users/receptionist/msp"
export CORE_PEER_ADDRESS=localhost:7051
export CORE_PEER_TLS_ROOTCERT_FILE="$PWD/organizations/peerOrganizations/hospital.example.com/peers/peer0.hospital.example.com/tls/ca.crt"

peer chaincode query -C ehrchannel -n ehr \
  -c '{"function":"FhirContract:GetFHIRAnchor","Args":["<patientIdHash>","PAT-777"]}'
```

Fetch the FHIR resource back from IPFS (grab `dataCID` from the register output):

```bash
curl -s http://localhost:4006/fetch/<dataCID> -H "X-IPFS-Key: change-me-in-production" | jq
```

### Offline fallback (no Docker needed — always works)

```bash
cd /Users/snehprinceherenj/dev/Electronic_Health_Record_Blockchain/fhir
npm test
node demo/cli.js examples/legacy-patient.json
```

## What "success" looks like

- `docker ps` shows the 6 peers + orderer + IPFS.
- The register response's `fhirAnchor` is **not `null`** — it has `resourceType`,
  `patientIdHash`, `patientRecordHash`, and a real `dataCID`.
- `FhirContract:GetFHIRAnchor` returns the same zero-PHI anchor from the ledger.
- The IPFS fetch returns the actual FHIR R4 `Patient` resource.

If `fhirAnchor` is `null`, check `peer0-api/logs/peer0-api.log` for `FHIR anchor failed`.
