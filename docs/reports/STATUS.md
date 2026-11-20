# Status: what is not working, not real, or not verified

Written after the test pass on 2026-11-19 (WSL2, network built from scratch). The fix log and full audit are in `BUGS.md`.

## Not on the ledger / not real
- **Pharmacy inventory, pharmacy bills, pharmacy staff list, pharmacy access list**: kept in the pharmacy service's own store. Only dispensing a hospital prescription is a ledger transaction. The pages and API say so.
- **Lab deck (`/lab/`)**: sign-in works, but its ledger actions fail with a clear error because it targets a chaincode (`labresults`) that is not deployed. Use the Lab worklist in the hospital portal.
- **Lab-report AI check and the chat in the hospital portal** (`clinical-ai-agent`): rule-based, runs offline, not a language model. Only the symptom agent at registration calls Gemini.
- **`services/clinical-decision-support`**: not wired into the stack; the lab deck's call to it fails and the deck reports AI as unavailable.

## Not built
- No screens for the insurer / provider roles (API only).
- Creating staff accounts from the admin page fails inside Docker (no enrolment tool in the container).

## Security gaps left open
- Any hospital staff role can read any patient; there is no per-patient assignment check.
- The Fabric identity is per role, not per person; the username is recorded as data.
- Endorsement policy is "any one organisation".
- Files uploaded as attachments are stored on IPFS unencrypted (JSON documents are encrypted). Pharmacy bill documents are also unencrypted.
- The disease code and its name are stored on the ledger in plain form, keyed by patient ID.
- Login pages show demo account hints; demo password hashes are in the repository.
- Portals run as development servers. First load of each portal can be blank until refreshed.

## Not verified
- **Charts on the dashboard Analytics page**: the numbers behind them were confirmed, but the test browser had no visible window, so the drawings themselves were not seen.
- **Print / Save PDF dialog** for lab reports: the print layout code is in place; the dialog was not opened.
- **DigiLocker page**: confirmed working by a team member in a normal browser; not exercised in the test pass.
- **Nurse, medical-records and discharge screens, and insurance claim APIs**: not exercised in this pass (unchanged code).
- **Staff admin page**: not exercised.
- **Ubuntu native run**: all testing was on WSL2. Nothing is WSL-specific, but it has not been run on the target Ubuntu machine yet.
- **Gemini under load**: on the test day Google's main Flash models answered "overloaded"; results came from the fallback model (`gemini-3.5-flash-lite`, about 10 s per call).

## Known rough edges
- Registration waits for the AI (up to about a minute when Google is slow) before returning.
- The first query after a cold start can take over 10 seconds.
- The symptom matcher is keyword-based: "fever, chills, headache, joint pain" matched "Pain in joint" rather than a fever code. The doctor corrects it; the history shows both.
