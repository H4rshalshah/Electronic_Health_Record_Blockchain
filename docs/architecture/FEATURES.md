# Features added in the integration pass

Everything here was run on a network built from scratch on 2026-11-19 unless marked otherwise.

## Lab and diagnostics
- Lab orders are their own ledger records with an enforced sequence: requested → accepted → result entered → verified (or rejected with a reason and re-entered).
- The person who verifies a result must be different from the person who entered it. The API and the chaincode apply the same role rules.
- Structured report: parameter, result, unit, reference range and a computed flag (low / high / abnormal), specimen, comments, attachments, who accepted / entered / verified and when, and a SHA-256 fingerprint of the report on the ledger.
- Lab worklist page: role-based queue, status filters, test catalogue with units and ranges, inline validation.
- Report view for the doctor and the patient, with Print / Save PDF. The patient sees no values until the result is verified.

## One identity per patient
- Each patient gets one DID (`did:ehr:…`) at registration. Every document created for the patient (profile, EHR, visits, consultations, prescriptions, lab steps, dispense, symptom analysis) is appended under that DID as a numbered entry with its CID, type, author, organisation and transaction ID.
- Timeline in the doctor's visit view and in the patient portal ("My Timeline"); each entry opens its document.

## Disease codes
- ICD-10 code template (58 codes) stored on IPFS; its CID, version and hash are on the ledger.
- A provisional code is matched from the symptoms at registration and when a visit is opened with a chief complaint.
- The doctor confirms or changes the code. Every step is a new ledger entry; nothing is overwritten. A change needs a reason, and only codes in the published template are accepted.
- History table in the doctor's view and the patient portal.

## Symptom analysis agent
- At registration the symptoms are sent to Gemini; the reply is shown as "AI cross-reference, not a diagnosis" beside the template match and, later, the doctor's code.
- Suggested codes outside the template are dropped. If no model answers, registration still completes and the panel states why the AI was unavailable.
- Falls back to lighter models when the preferred one is overloaded; the result records which model answered.

## Privacy
- Patient name, age, contact and address are no longer on the ledger. The ledger holds the CID and hash of an encrypted profile document.
- JSON documents on IPFS are encrypted (AES-256-GCM).
- Patient portal sign-up requires the phone number given at reception.

## Dashboard
- Connected to the ledger with its own read-only identity.
- Analytics: patients, records, transactions by type and organisation, success rate, throughput, submit-to-commit time (average, min, median, p95, max, per function), block time and size, IPFS upload/retrieval time, agent runs and response time, and how often the doctor's code matched the AI suggestion.
- Block explorer: blocks, block detail, transaction lookup.
- Invented fallback figures removed from every dashboard page.

## Access control added
- Pharmacy backend, lab deck and clinical AI agent now require a staff sign-in; previously anyone could call them.

## Scripts
- `./start.sh` builds or reuses the network and deploys or upgrades the chaincode by itself. `./stop.sh --reset` wipes everything, including application data tied to the old ledger.
