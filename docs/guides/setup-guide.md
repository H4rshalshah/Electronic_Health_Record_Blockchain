# Comprehensive Local Setup Guide

This guide provides step-by-step instructions for running the complete Electronic Health Record (EHR) Consortium workspace on a local development machine or cloud VM. Following these steps ensures seamless execution across all 18 team members' machines.

> [!IMPORTANT]
> **Operating System & Terminal Requirements**
> - **Windows Users:** You **MUST** use an Ubuntu WSL (Windows Subsystem for Linux) terminal. Do not use standard Command Prompt or PowerShell, as the Fabric bash scripts will fail.
> - **macOS / Linux Users:** You can use your standard native Terminal.
> - **Docker:** Ensure a Docker runtime is open and running before executing any scripts. On Windows, enable Docker's WSL Integration for your Ubuntu distribution. On macOS, **Docker Desktop is recommended** — see [Running with Docker Desktop](setup-guide-docker-desktop.md). [Colima](#macos-running-with-colima) also works but proved less stable on limited-RAM machines.

## macOS: Running with Colima

macOS has no native Linux container runtime, so the Fabric network (orderer, peers, CAs) runs inside a Linux VM. [Colima](https://github.com/abiosoft/colima) is the lightweight Docker runtime used for this — a drop-in replacement for Docker Desktop.

### 1. Install prerequisites

```bash
# Colima + Docker CLI (skip if already installed)
brew install colima docker
```

**Fabric binaries** — the network scripts resolve these automatically via `scripts/fabric-bin.sh`:

- **macOS** — the committed `bin/` holds Linux ELF binaries that can't run on Apple Silicon, so the scripts use the host's **darwin/arm64** binaries instead (found under `~/go/src/github.com/*/fabric-samples/bin`, `~/fabric-samples/bin`, or a `peer` already on `PATH`).
- **Linux** — the scripts use the committed `bin/`.

To point at a specific location, export `FABRIC_BIN_DIR` before running any script:

```bash
export FABRIC_BIN_DIR="$HOME/go/src/github.com/PrinceHerenj/fabric-samples/bin"
```

### 2. Start the Docker runtime

```bash
colima start --cpu 4 --memory 8 --disk 60
docker context use colima
docker ps                         # verify the daemon is reachable
```

> `colima start` boots a Linux VM and points Docker at it. It persists across reboots — use `colima status` to check, `colima stop` / `colima delete` to tear down.

### 3. Bring up the hospital network

> **First-time / clean-slate:** if any partial or previous setup exists, tear it down before bringing it up:
> ```bash
> cd orgs/hospital/EHR_hospitalOrg-main/ehr-network
> bash scripts/network-down.sh      # full teardown — containers + crypto + channel artifacts
> ```

Then bring the network up — this runs CA start → enroll → peers/orderer/IPFS → channel → anchor peers in one go:

```bash
cd orgs/hospital/EHR_hospitalOrg-main/ehr-network/scripts
bash network-up.sh
```

### 4. Deploy the chaincode (with the FHIR contract)

First-time deploy uses **sequence 1**:

```bash
bash scripts/deployChaincode.sh \
  --channel ehrchannel \
  --chaincode-name ehr \
  --chaincode-path ../ehr-chaincode-v3 \
  --version 2.1 \
  --sequence 1
```

> On a **re-deploy** (upgrade) of an already-committed chaincode, bump `--sequence` past the
> committed value instead — check it with:
> `peer lifecycle chaincode querycommitted -C ehrchannel -n ehr`.
> Every org on the channel (HospitalMSP, DiagnosticsMSP, ProviderMSP) approves automatically.

### 5. Start the backends

> **Ports already in use?** If a previous run is still up (or you hit `EADDRINUSE`), stop the
> old processes first — from the repo root run `./stop.sh`, or free the ports manually:

```bash
for p in 4001 4002 4003 4004 4005 4006 5173 5174; do
  lsof -ti :$p | xargs kill 2>/dev/null || true
done
```

```bash
cd ../ehr-backend-v3

# 1) create a .env for each service (one-time), auto-generating a JWT_SECRET
JWT="$(openssl rand -hex 32)"
for s in peer0-api peer1-api peer2-api extorg-api patient-api ipfs-service; do
  cp "$s/.env.example" "$s/.env"
  sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=${JWT}|" "$s/.env"   # macOS
  # sed -i    "s|^JWT_SECRET=.*|JWT_SECRET=${JWT}|" "$s/.env" # Linux (no empty arg)
done
# (leave FABRIC_BASE_PATH empty in each .env — it auto-resolves)

# 2) install + start ALL services (ipfs-service first, then the APIs).
#    Run each in its own terminal, or background them with `nohup … &`:
cd ipfs-service && npm install && npm start   # :4006
cd ../peer0-api   && npm install && npm start # :4001
cd ../peer1-api   && npm install && npm start # :4002
cd ../peer2-api   && npm install && npm start # :4003
cd ../extorg-api  && npm install && npm start # :4004
cd ../patient-api && npm install && npm start # :4005
```

> **Note:** `patient-api` uses `better-sqlite3` (pinned to `^13.0.3`, which has Node 22/26
> prebuilds — an older `^11.x` would fail to compile on Node ≥ 23).

### 6. Start the frontends

```bash
cd ../../ehr-frontend-v2/hospital-portal && npm install && npm run dev   # :5173 → receptionist/doctor/nurse UI
cd ../../ehr-frontend-v2/patient-portal  && npm install && npm run dev   # :5174 → patient self-service
```

Open `http://localhost:5173` in a browser. Log in as `receptionist` to register patients.

### 7. Verify the FHIR anchor end-to-end

Default demo logins (see `SETUP_AND_RUN.md` for the full table):

| role | username | password |
|---|---|---|
| receptionist | `receptionist` | `recpw` |

1. Login and register a patient — the response now carries a `fhirAnchor`.
   Use a **fresh `patientId` each run** (a duplicate id fails with "already exists" and returns no `fhirAnchor`):

```bash
TOKEN=$(curl -s -X POST http://localhost:4001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"receptionist","password":"recpw"}' | jq -r '.data.token')

curl -s -X POST http://localhost:4001/patients \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"patientId":"PAT-100","name":"Aisha Khan","age":34,"gender":"female","bloodGroup":"B+","contact":"+91-90000-11111","address":"Mumbai"}' \
  | jq '.data.fhirAnchor'
```

2. `fhirAnchor` contains the zero-PHI anchor (`resourceType`, `patientIdHash`, `patientRecordHash`, `dataCID`). The FHIR `Patient` resource is pinned to IPFS at `dataCID`; only its digest + CID are written on-chain.

3. Read the anchor back from the ledger (run from the network dir, with the peer env sourced):

```bash
cd orgs/hospital/EHR_hospitalOrg-main/ehr-network
source scripts/fabric-bin.sh
export CORE_PEER_TLS_ENABLED=true CORE_PEER_LOCALMSPID=HospitalMSP
export CORE_PEER_MSPCONFIGPATH="$PWD/organizations/peerOrganizations/hospital.example.com/users/receptionist/msp"
export CORE_PEER_ADDRESS=localhost:7051
export CORE_PEER_TLS_ROOTCERT_FILE="$PWD/organizations/peerOrganizations/hospital.example.com/peers/peer0.hospital.example.com/tls/ca.crt"

peer chaincode query -C ehrchannel -n ehr \
  -c '{"function":"FhirContract:GetFHIRAnchor","Args":["<patientIdHash>","<patientId>"]}'
```

### macOS gotchas

- **No `sudo` is needed** for the `chown` steps — the network scripts fall back gracefully on macOS.
- **`FABRIC_BASE_PATH` is auto-resolved** — leave it empty in `.env` (the hardcoded `/home/avi/...` path has been removed).
- **`KNET` must be identical** on every machine that writes FHIR anchors (Mac and Linux alike), otherwise the same patient yields different hashes. Set it in each backend `.env`.
---

## 💻 1. System Requirements & Prerequisites

### Supported Operating Systems
- **Linux:** Ubuntu 22.04 LTS or 24.04 LTS (Recommended)
- **Windows:** Windows 10/11 with **WSL2** (Ubuntu 22.04/24.04 distribution)
- **macOS:** Apple Silicon or Intel with Docker Desktop (ensure Docker socket sharing is enabled)

### Required Software Packages
Ensure the following packages are installed on your host system:
1. **Docker Engine & Docker Compose Plugin** (v24.0+ / Compose v2.20+):
   ```bash
   docker --version
   docker compose version
   ```
   *Verify non-root Docker execution:*
   ```bash
   sudo usermod -aG docker "$USER"
   # Log out and log back in, or run:
   newgrp docker
   docker ps  # Must succeed without sudo
   ```
2. **Node.js & npm** (v20 LTS recommended):
   ```bash
   node --version  # Should be v20.x or higher
   npm --version
   ```
3. **Python** (v3.10 or v3.11):
   ```bash
   python3 --version
   ```
4. **Utility Tools**: `curl`, `git`, `jq`, `lsof`, `tar`.

---

## 🛠️ 2. First-Time Setup (From a Fresh Git Clone)

When cloning this repository for the first time:

```bash
git clone https://github.com/devbyhimans/Electronic_Health_Record_Blockchain.git
cd Electronic_Health_Record_Blockchain
```

### Step 1: Run Workspace Setup Script
The automated setup script installs Node dependencies, configures Python virtual environments, and auto-generates `.env` files from templates:
```bash
./setup.sh
```

### Step 2: Bootstrap Hyperledger Fabric Network (First Run Only)
Cryptographic identity materials (X.509 MSP certificates, CA databases, and genesis blocks) are generated locally and excluded from Git for security. Generate the network credentials:
```bash
cd orgs/hospital/EHR_hospitalOrg-main/ehr-network
bash scripts/network-up.sh
bash scripts/deployChaincode.sh
cd ../../../..
```
*Note: This bootstrap step is required only once. Once certificates and channel genesis blocks are generated, persistent Docker volumes preserve them across system reboots.*

*The `ehr` chaincode now includes `FhirContract` (HL7 FHIR R4 anchoring). On a first deploy, pass `--version 2.1 --sequence 1` to `deployChaincode.sh`; see [fhir-integration.md](fhir-integration.md) for the FHIR flow and [setup-guide-docker-desktop.md](setup-guide-docker-desktop.md) for the Docker Desktop run steps.*

### Step 3: Launch the Consortium Workspace
Start the complete stack (Fabric CAs, Peers, Orderer, Kubo IPFS, Microservices, AI Agents, and Frontends):
```bash
./start.sh
```
The startup sequence runs 6 automated stages, performs a port-sweep, starts the Fabric infrastructure, launches all microservices, and displays a live service health matrix.

---

## 🌐 3. Accessing Portals & Entry Points

Once `./start.sh` completes, open your browser:

| Application | Browser URL | Port / Ingress | Credentials / Notes |
|:---|:---|:---:|:---|
| **Consortium Launchpad** | [http://localhost/](http://localhost/) | `:80` (Hub) | Central gateway checking real-time reachability of all portals. |
| **Hospital Staff Portal** | [http://localhost:5173/](http://localhost:5173/) | `:5173` | Receptionist, Doctor, Nurse, Pharmacist, Admin accounts. |
| **Hospital Patient Portal** | [http://localhost/patient/](http://localhost/patient/) | `:5174` | Patient self-service records and visit history. |
| **Observatory Dashboard** | [http://localhost/dashboard/](http://localhost/dashboard/) | `:5176` | Role-aware Obsidian Glass UI; login using hospital credentials. |
| **Clinical AI Swagger API** | [http://localhost/ai-agent/docs](http://localhost/ai-agent/docs) | `:8000` | Interactive REST documentation for Medical RAG and Trend Analyzer. |
| **Pharmacy Main Hub** | [http://localhost/pharmacy/](http://localhost/pharmacy/) | `:5175` | MedBlock consortium dashboard with IPFS receipt verification. |
| **Pharmacy Patient Portal** | [http://localhost/pharmacy/patient/](http://localhost/pharmacy/patient/) | `:3004` | Active patient switching (`PAT-001`, `PAT-014`, `testuser`), dispensing timeline, and consent self-governance. |
| **Pharmacy Staff Portals** | `/pharmacy/manager/` (`:3001`), `/employee/` (`:3002`), `/inventory/` (`:3003`), `/billing/` (`:3005`) | `:3001`–`:3005` | Manager, Pharmacist Dispensing, Stock Inventory, and Outpatient Billing. |
| **Lab Web Console** | [http://localhost/lab/](http://localhost/lab/) | `:3006` | Diagnostic review deck with glowing gradient cards and integrity status. |

---

## 🛑 4. Graceful Teardown & Reset

### Stop Without Data Loss (Normal Daily Use)
To stop the workspace while preserving blockchain ledgers, patient records, and Docker volumes:
```bash
./stop.sh
```
This script gracefully stops application containers, Fabric peers/orderer, and Fabric CAs, sweeping ports `3000`–`5176` to guarantee no orphan background processes are left running.

### Complete Clean Slate (Hard Reset)
If you need to completely reset the network, wipe ledgers, and regenerate certificates:
```bash
./stop.sh
docker compose down -v
docker volume prune -f
cd orgs/hospital/EHR_hospitalOrg-main/ehr-network
bash scripts/network-down.sh
cd ../../../..
```
Then repeat Step 2 (`network-up.sh` and `deployChaincode.sh`) and Step 3 (`./start.sh`).

---

## 🧪 5. Running Automated Verification Suites

To verify that all subsystems are working with 100% test coverage:

### 1. Dashboard API Tests (76 Tests)
```bash
cd orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api
npm test
cd ../../../..
```

### 2. Clinical AI Agent Tests (20 Tests)
```bash
cd services/ai-agent
python3 -m pytest tests/ -v
cd ../..
```

### 3. Lab Multi-Agent Tests (24 Tests)
```bash
cd orgs/lab/EHR-LABORG-main/client/node-gateway
npm test
cd ../../../..
```

All test suites should pass with zero failures and zero unhandled rejections.
