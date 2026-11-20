# System Overview

This repository contains an Electronic Health Record (EHR) Consortium workspace built on Hyperledger Fabric 2.5, Kubo IPFS, containerized microservices, autonomous AI intelligence agents, and React/Vite frontends. It federates three healthcare organizations—**Hospital**, **Diagnostics Lab**, and **Pharmacy**—under a shared cryptographic channel (`ehrchannel`) while maintaining sovereign microservices, role-based access control, and zero-PHI observability.

---

## 🏛️ Consortium Organizations & Components

### 1. Hyperledger Fabric Blockchain Network
- **Channel:** `ehrchannel` shared across all consortium members.
- **Consensus:** Crash Fault Tolerant (CFT) Raft consensus via `orderer.example.com` on port `7050` (operations `/healthz` on port `9443`).
- **Organizations:**
  - `HospitalMSP`: Governs core hospital operations with `peer0.hospital` (`:7051`), `peer1.hospital` (`:9051`), and `peer2.hospital` (`:10051`).
  - `DiagnosticsMSP`: Governs laboratory diagnostic reports with `peer0.diagnostic` (`:8051`).
  - `ProviderMSP`: Governs billing claims and external provider audits with `peer0.provider` (`:11051`).
- **Smart Contracts (10 deployed contracts in `ehr-chaincode-v3`):**
  - `PatientContract`, `VisitContract`, `ForwardContract`, `ClinicalContract`, `LabContract`, `ClaimsContract`, `EhrContract`, `AccessContract`, `DigiLockerContract`, and `FhirContract`.

### 2. Clinical AI Agent & Medical RAG Microservice (`services/ai-agent`)
- **Runtime:** Containerized Python 3.11 FastAPI microservice (`clinical-ai-agent:8000`), reverse-proxied at `http://localhost/ai-agent/`.
- **Clinical Governance:** Evaluates vitals in real time against clinical thresholds (Hypertensive Crisis, Hypoxia $SpO_2 < 90\%$, Hypoglycemia, Tachycardia) and calculates historical trajectory deltas.
- **Medical RAG:** Hybrid semantic and keyword retrieval over curated PubMed clinical literature (`medical_data/pubmed_articles.json`) with scientific citations and confidence scores.
- **Verification:** 20 passing unit and integration tests (`pytest`).

### 3. Lab Multi-Agent Subsystem & Gateway (`orgs/lab/EHR-LABORG-main`)
- **Runtime:** Node.js Express gateway on host port `3006`, reverse-proxied at `http://localhost/lab/`.
- **Tool Layer & VCAP Provenance (`tools/` & `provenance/vcap.js`):** Modular tools for Fabric, IPFS, Hospital, and Pharmacy operations paired with Verifiable Clinical AI Provenance (VCAP) records anchoring execution telemetry and hashes.
- **Lab Report Analysis Agent (`agents/lab-agent.js`):** Extracts clinical biomarkers (CBC, metabolic panels) from unstructured diagnostic reports.
- **Longitudinal History Agent (`agents/history-agent.js`):** Synthesizes multi-visit historical trajectory and correlates chronic trends.
- **Human-in-the-Loop Orchestrator (`orchestrator/orchestrator.js`):** Enforces mandatory review and sign-off by a licensed clinician before anchoring diagnostic reports on-chain.
- **Scheduled Ledger-Integrity Recheck Engine (`integrity-check.js`):** Background 4-hour verification loop comparing raw IPFS multihashes against on-chain Fabric digests.
- **Verification:** 23 passing automated node-gateway unit and integration tests.

### 4. Unified Pharmacy Organization (`orgs/pharmacy/fabric-network-swarm`)
- **Runtime:** Node.js Express API (`p-backend:3000`) and Unified 5-in-1 Frontend Suite (`:5175`).
- **Zero-Trust RBAC & Workspace Enforcement:** Role switcher with credential authentication for Pharmacy Manager, Pharmacist Dispensing, Stock Officer, Outpatient Billing, and Patient Self-Service.
- **Persistent Storage (`store.js`):** Resilient file-backed JSON store with seeded medications, patient records (`PAT-001`, `PAT-014`, `PAT-021`, `testuser`), initial bills, and staff roles.
- **Automatic Stock Deduction:** Deducts inventory units in real time upon prescription fulfillment.
- **IPFS Receipt Pinning:** Prescription bills pinned to Kubo IPFS (`http://localhost:8090/ipfs/<CID>`).
- **Consolidation:** 5 legacy micro-frontends decommissioned; RAM and ports 3001–3005 freed up.

### 5. Hospital Applications & Peer APIs (`orgs/hospital/EHR_hospitalOrg-main`)
- **Portals:** Hospital Staff Portal (`:5173`) and Patient Portal (`:5174`) styled with the CareGrid Soft Glass Bento design system.
- **Peer APIs:** Six Express microservices on ports `4001`–`4006` (`peer0-api`, `peer1-api`, `peer2-api`, `extorg-api`, `patient-api`, `ipfs-service`).

### 6. Group 1 Real-Time Observatory Dashboard (`dashboard-api` & `dashboard-portal`)
- **Runtime:** `dashboard-api:4010` and `dashboard-portal:5176` (served at `http://localhost/dashboard/`).
- **Telemetry Coverage:** **12/12 Live Consortium Targets Reporting `OK`** (Fabric orderer, 4 peer operations `/healthz`, Clinical AI agent, Lab agents, IPFS, and microservices).
- **Zero-PHI Compliance:** Strict Common Event Envelope scrubbing all patient-identifiable data into keyed HMAC hashes (`patientIdHash`).
- **Real-Time Streaming:** High-throughput WebSocket (`/ws`) and SSE (`/stream`) with single-use stream tickets.
- **Luxury Obsidian Glass UI:** Deep Obsidian theme (`#0B0F17`), radiant opposite-corner gradient card glows, interactive Block Stream Inspector with 1-click clipboard copy, 5 clinical agent views, and real-time threshold alert engine.
- **Verification:** 76 passing automated backend test suites.

### 7. DigiLocker Clinical Vault (`orgs/digilocker/backend`)
- **Runtime:** Express microservice on port `4007`, reverse-proxied at `http://localhost/api/digilocker/`.
- **Dynamic Clinical PDFs:** Generates authentic CareGrid clinical documents (CBC reports, Lipid Profiles, OPD Prescriptions, and Discharge Summaries) directly from Hyperledger Fabric patient visits and lab diagnostics.
- **Security:** AES-256-GCM envelope encryption with per-document salts; encrypted ciphertext is pinned to IPFS and zero-PHI cryptographic digests are anchored on `DigiLockerContract`.
- **Verification:** 10 passing unit and integration tests.

### 8. HL7 FHIR R4 Interoperability Layer (`fhir/`)
- **Runtime:** Repository-root interoperability engine mounted into hospital backend services and available via CLI (`node demo/cli.js`).
- **Features:** Adapters converting legacy EHR models into standard FHIR R4 resources, JSON schema validation, RFC 8785 deterministic canonicalization, and on-chain anchoring via `FhirContract`.
- **Verification:** 18 passing automated tests.

### 9. Unified Ingress Gateway (`nginx/nginx.conf`)
- Central reverse proxy on Port 80 routing all traffic cleanly to prevent browser CORS issues:
  - `/` $\rightarrow$ Consortium Showcase Hub (Glassmorphic cards, v11)
  - `/hospital/` $\rightarrow$ Hospital Staff Portal (`:5173`)
  - `/patient/` $\rightarrow$ Patient Portal & DigiLocker Vault (`:5174`)
  - `/dashboard/` $\rightarrow$ System Dashboard (`:5176`)
  - `/pharmacy/` $\rightarrow$ Unified Pharmacy Suite (`:5175`)
  - `/lab/` $\rightarrow$ Lab Web Console (`:3006`)
  - `/ai-agent/` $\rightarrow$ Clinical AI Agent & Swagger Docs (`:8000`)
  - `/api/*` $\rightarrow$ Respective microservice backends

---

## 🚀 Running the System

1. **First-time clone setup:** Run `./setup.sh` to install dependencies and initialize `.env` configuration files.
2. **Start all services:** Run `./start.sh` from the repository root. All 20 services will launch cleanly and be reachable at [http://localhost/](http://localhost/).
3. **Stop all services:** Run `./stop.sh` to gracefully stop containers and free ports without deleting persistent Docker volume data.

---

In Hyperledger Fabric, the network is divided into **Organizations**. Each Organization has multiple computers/servers called **Peers**. Each Peer represents a specific department or role, running its own API and UI.

### 🏥 Hospital Organization
* **Peer 0 (Reception / Admin):** Handles patient registration and general hospital administration.
* **Peer 1 (Doctor):** Handles reading patient histories, updating diagnoses, and requesting lab tests.
* **Peer 2 (Nurse / Pharmacist / Medical Records):** Handles fulfilling prescriptions internally and maintaining ward records.

### 💊 Pharmacy Organization
* **Peer 0 (Pharmacy Node):** Contains multiple sub-modules (Manager, Billing, Employee, Inventory, Patient). It handles fulfilling prescriptions sent by the Hospital and managing drug inventory levels securely on-chain.

### 🔬 Lab Organization
* **Peer 0 (Lab Node):** Handles receiving test requests from the Hospital, conducting tests, running the results through the Gemini AI agent for analysis, and securely uploading the final encrypted PDFs to IPFS.

**How they interact:** If a Patient goes to the Hospital (Peer 0) and sees a Doctor (Peer 1), the Doctor requests a blood test. That request is logged on the blockchain. The Lab (Lab Peer 0) sees the authorized request, does the test, and uploads the result. The Doctor (Peer 1) gets an alert, views the result, and writes a prescription on the blockchain. The Pharmacy (Pharmacy Peer 0) sees the prescription and fills it. **All of this happens without a central server—they communicate purely by reading and writing to the shared blockchain ledger.**

---

## 3. Current Implementation Status

**✅ What is ALREADY Implemented:**
* The core Hyperledger Fabric v2.5 multi-org blockchain network.
* The Docker orchestration scripts (`start-all.sh` and `docker-compose.yaml`) to run all 14 Node.js apps on a single machine.
* Basic Smart Contracts (Chaincode) for creating records.
* Basic Frontend UIs (React) and Backend APIs (Express.js) for Hospital, Pharmacy, and Lab.
* IPFS Kubo node integration for off-chain file pinning.
* **HL7 FHIR R4 interoperability layer** (`/fhir`): legacy records are converted to FHIR R4 and a **zero-PHI anchor** (hash + CID + resource type) is written on-chain via `FhirContract` under `RECORD~<patientIdHash>~<recordId>`. See [`fhir-integration.md`](fhir-integration.md).

**🚧 What is NOT Implemented (Your Tasks!):**
* **Digilocker:** Files are currently uploaded to IPFS in plaintext. Encryption needs to be built.
* **FHIR on-chain enrichment (Phase D):** the anchor stores the *hash* of each record, but legacy plaintext JSON is still the source of truth in IPFS — retiring it (storing only the FHIR resource) is a follow-up.
* **Advanced ABAC:** The consent mechanism is rudimentary. A full Patient Consent Portal needs to be finalized so patients can revoke access.
* **Agentic AI Expansion:** The Gemini LLM integration needs to be expanded to analyze historical patient trends, not just single lab reports.

---

## 4. Comprehensive Folder Structure

Here is a breakdown of where everything lives and what each file does:

```text
EHR_blockchain/
├── start-all.sh                 # The master orchestration script to boot the entire project
├── docker-compose.yaml          # Orchestrates all 14 Node.js Apps into Docker containers
├── .gitignore                   # Ensures secrets (.env, crypto material) are never committed to GitHub
├── README.md                    # The main landing page for the repository
│
├── docs/                        # Documentation Folder
│   ├── architecture.md          # Contains Mermaid.js visual flowcharts of the system
│   ├── fhir-integration.md      # How the FHIR R4 layer is wired into the chaincode
│   ├── roadmap.md               # The task list and gap analysis of what needs to be built
│   ├── setup-guide.md           # Instructions for running organizations individually
│   └── system-overview.md       # (You are reading this file!)
│
├── fhir/                        # HL7 FHIR R4 interoperability layer (Team D module)
│   ├── src/                     # adapter, validator, canonicalizer, hasher, anchor builder
│   ├── schemas/                 # FHIR R4 JSON schemas (Patient, Observation, …)
│   ├── terminology/             # LOINC / SNOMED / ICD-10 / UCUM subsets
│   └── test/                    # 18 offline unit tests (node --test)
│
└── orgs/                        # The Codebase (Divided by Organization)
    │
    ├── hospital/EHR_hospitalOrg-main/
    │   ├── ehr-network/         # The Fabric scripts to boot the Hospital blockchain nodes
    │   ├── ehr-backend-v3/      # The Node.js Express APIs for Peer0, Peer1, Peer2
    │   └── ehr-frontend-v2/     # The React UIs (hospital-portal, patient-portal)
    │
    ├── pharmacy/fabric-network-swarm/
    │   ├── deploy.sh            # Script to deploy the pharmacy blockchain network
    │   └── app/                 # Contains both the React UIs and Express Backends for Pharmacy
    │
    ├── lab/EHR-LABORG-main/
    │   ├── scripts/             # Scripts to boot the Lab blockchain nodes
    │   └── client/node-gateway/ # The Node.js Gateway + AI Integration + Lab UI
    │
    └── digilocker/
        └── README.md            # The scaffold/design document for the Digilocker module
```
