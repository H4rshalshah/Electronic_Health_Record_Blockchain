# FHIR R4 Interoperability — Chaincode Integration

This document explains how the **HL7 FHIR R4 interoperability layer** (`/fhir`) is wired into the Hospital organization's Fabric chaincode, and how the other organizations (Lab, Pharmacy) extend it.

## Overview

The `fhir/` module converts legacy clinical JSON into standard **FHIR R4** resources, then computes a **zero-PHI anchor** — a hash + CID + resource type — that is committed to the Fabric ledger. The actual (PHI-bearing) resource stays in IPFS; only its digest is ever written on-chain.

```
legacy JSON ──▶ ADAPTER ──▶ VALIDATE ──▶ CANONICALIZE (RFC 8785) ──▶ HASH (SHA-256)
                                                                        │
                                    FhirContract:AnchorFHIRRecord  ◀───  ┘ (hash + CID + type only)
```

## The core design decision

**Hashing happens in the backend, never in the chaincode.**

The backend runs the `fhir.convert()` pipeline, then passes the resulting `patientIdHash`, `patientRecordHash`, `resourceType`, `recordId`, `dataCID` and `status` into the chaincode as plain transaction arguments. The chaincode only stores and queries anchors.

Why:
- `KNET` (the HMAC key that normalises patient ids into hashes) is a **gateway-held secret** and must never live in the chaincode container or on the ledger.
- The chaincode needs **zero new dependencies** — no `ajv`, no `canonicalize`, no schemas to vendor.
- Lab and Pharmacy reuse the exact same `fhir` module in *their* backends and call the same `FhirContract`.

## On-chain anchor record

State key (matches the fhir module's `recordKey`):

```
RECORD~<patientIdHash>~<recordId>
```

`patientIdHash` is `hmac-sha256:<64-hex>` (from `identifiers.patientIdHash`, keyed by `KNET`); `recordId` is the logical id (e.g. `PAT-001`, `PAT-001-V1`, `LAB-001`).

Stored JSON (zero-PHI by construction — no clinical value, narrative or code):

```json
{
  "recordId": "RECORD~hmac-sha256:<hex>~PAT-001-V1",
  "resourceType": "Encounter",
  "patientIdHash": "hmac-sha256:<hex>",
  "patientRecordHash": "sha256:<hex>",
  "dataCID": "<ipfs cid of the canonical FHIR resource>",
  "status": "FINAL",
  "canonicalizationScheme": "RFC8785-JCS",
  "createdAt": "<iso>",
  "updatedAt": "<iso>"
}
```

`patientRecordHash` is the VCAP commitment `H(R)` = `sha256(canonicalize(resource))`. Because `dataCID` pins the same resource, any peer can fetch it, re-canonicalize, and verify it matches the on-chain hash.

## `FhirContract` (chaincode)

File: `orgs/hospital/EHR_hospitalOrg-main/ehr-chaincode-v3/lib/fhirContract.js`

| Function | Purpose |
|---|---|
| `AnchorFHIRRecord(patientIdHash, recordId, resourceType, patientRecordHash, dataCID, status)` | Write (idempotent — overwrites) a zero-PHI anchor. |
| `GetFHIRAnchor(patientIdHash, recordId)` | Read one anchor. |
| `ListFHIRAnchors(patientIdHash)` | List all anchors for a pseudonymous patient (range scan). |
| `AnchorExists(patientIdHash, recordId)` | Cheap existence check. |
| `GetFHIRAnchorHistory(patientIdHash, recordId)` | Full block history (immutable audit). |
| `UpdateFHIRAnchorStatus(patientIdHash, recordId, status)` | Status transition (e.g. `FINAL` → `SUPERSEDED`). |

The contract is registered in `ehr-chaincode-v3/index.js` alongside the existing eight contracts.

## Backend wiring

The conversion is triggered from the backend write routes, after the legacy write succeeds, via a shared helper:

- `orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/shared/fhir.js` — resolves the `fhir` module (repo-root `/fhir/src`) once.
- `orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/shared/fhir-anchor.js` — `anchorFHIRRecord(contract, ipfsClient, { sourceType, legacyJson, recordId, filename })`.

Current touch points:

| Route | Source type | FHIR resource |
|---|---|---|
| `peer0-api` `POST /patients` | `patient` | `Patient` |
| `peer0-api` `POST /visits` | `visit` | `Encounter` |
| `extorg-api` `PUT /lab/visits/:id/request/:reqId/submit` | `lab-result` | `DiagnosticReport` + contained `Observation` |

The anchor is **best-effort**: a conversion/anchor failure is logged but does not roll back the legacy write.

## Adding a new resource type (extensibility)

To have another org (Lab, Pharmacy) produce a FHIR resource:

1. **Map it** — add a mapping under `fhir/src/adapters/mappings/` and register it in `fhir/src/adapters/legacy-to-fhir.js` (e.g. Pharmacy → `MedicationRequest`; Lab → `Observation`). A schema goes in `fhir/schemas/`, terminology bindings in `fhir/terminology/`.
2. **Anchor it** — in that org's backend, after the relevant write, call `anchorFHIRRecord(contract, ipfsClient, { sourceType, legacyJson, recordId })`.
3. **Name-space the `recordId`** (e.g. `L-…` for lab, `RX-…` for pharmacy) to avoid collisions — `AnchorFHIRRecord` overwrites silently on a duplicate key.

> **Lab org note:** the lab org currently runs its own chaincode (`lab-results`) with plaintext ids, so it does not share the hospital `FhirContract`. To anchor FHIR there, either join the hospital channel/chaincode or add an equivalent `AnchorFHIRRecord` + `RECORD~…` scheme to the lab chaincode. Pharmacy already reuses the hospital chaincode, so it can call `FhirContract` directly.

## Environment / portability

- **`KNET`** (`HMAC` key) must be **identical on every machine** that writes anchors — otherwise the same patient yields different hashes and anchors become unqueryable across hosts. Set it in each backend `.env`. The fhir module falls back to `dev-knet-insecure-do-not-use-in-production` only for local demos.
- **`IPFS_SERVICE_URL`** — the backend pins through its own `ipfsClient` (port `4006`), so the fhir module's `:3006` default is never used on the write path.
- **`FABRIC_BASE_PATH`** — left empty in `.env`; auto-resolved to the sibling `ehr-network` directory.
- **Fabric binaries** — resolved by `ehr-network/scripts/fabric-bin.sh`: macOS uses the host's darwin/arm64 binaries (the committed `bin/` are Linux ELF); Linux uses `bin/`. Override with `FABRIC_BIN_DIR`.

## Deploy / verification

The chaincode must be redeployed (new `FhirContract`) with a bumped version/sequence:

```bash
cd orgs/hospital/EHR_hospitalOrg-main/ehr-network/scripts
bash deployChaincode.sh --channel ehrchannel --chaincode-name ehr \
  --chaincode-path ../ehr-chaincode-v3 --version 2.1 --sequence 2
```

Then exercise a write and read the anchor back:

```bash
# register a patient (POST /patients on :4001) → triggers AnchorFHIRRecord
peer chaincode query -C ehrchannel -n ehr \
  -c '{"Args":["FhirContract:ListFHIRAnchors","hmac-sha256:<hex>"]}' \
  --peerAddresses localhost:7051 --tlsRootCertFiles <peer0 tls ca.crt>
```

Run the module's own unit tests (offline, no network):

```bash
cd fhir && npm install && npm test    # 18 tests
```

See also the module's own docs under `fhir/` (`README.md`, `migration-plan.md`, `implementation-roadmap.md`, `resource-mapping.md`).
