'use strict';

// Diagnostic laboratory API (DiagnosticsMSP).
//
// One lab order moves through, enforced by LabContract on the ledger:
//   REQUESTED → ACKNOWLEDGED → RESULT_SUBMITTED → APPROVED
//                    ▲               └→ REJECTED ┘
// Every step is submitted with the caller's own Fabric identity, so the ledger
// records who actually did it. Result values live in the visit document on
// IPFS; the ledger keeps status, actors and the SHA-256 of the signed result.

const router = require('express').Router();
const { body, param, query, validationResult } = require('express-validator');
const { authenticate, requireRole } = require('../middleware/auth');
const { peerContext }  = require('../middleware/peerContext');
const { wrap, parseResult } = require('../middleware/errorHandler');
const { fetchByCID, pinJSON } = require('../fabric/ipfsClient');
const { anchorFHIRRecord } = require('../../../shared/fhir-anchor');
const lab = require('../../../shared/labReport');
const directory = require('../../../shared/patientDirectory');
const logger = require('../config/logger');
const { emit } = require('../../../shared/dashboardEmitter');

const LAB_ROLES   = ['labreceptionist', 'labtechnician', 'radiologist', 'labsupervisor', 'labadmin'];
const RECEPTION   = ['labreceptionist', 'labadmin'];
const BENCH       = ['labtechnician', 'radiologist', 'labadmin'];
const SUPERVISORS = ['labsupervisor', 'labadmin'];
const STATUSES    = ['REQUESTED', 'ACKNOWLEDGED', 'RESULT_SUBMITTED', 'REJECTED', 'APPROVED'];

const asLab = (...roles) => [authenticate, requireRole(...roles), peerContext];
const ids   = [param('id').trim().notEmpty(), param('reqId').trim().notEmpty()];

function invalid(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({ success: false, error: errors.array().map(e => e.msg).join('; '), errors: errors.array() });
  return true;
}

async function loadVisit(contract, visitId) {
  const onChain = parseResult(await contract.evaluateTransaction('VisitContract:GetVisit', visitId));
  if (!onChain) { const e = new Error(`Visit not found: ${visitId}`); throw e; }
  const clinical = onChain.visitCID ? await fetchByCID(onChain.visitCID) : {};
  clinical.labRequests   = clinical.labRequests   || [];
  clinical.forwardingLog = clinical.forwardingLog || [];
  return { onChain, clinical };
}

function findRequest(clinical, labRequestId) {
  const idx = clinical.labRequests.findIndex(r => r.labRequestId === labRequestId);
  return idx === -1 ? null : clinical.labRequests[idx];
}

function logStep(clinical, user, action, labRequestId, notes, to = '', toRole = '') {
  clinical.forwardingLog.push({
    action, from: user.userId, fromRole: user.role, to, toRole, notes, labRequestId,
    timestamp: new Date().toISOString(),
  });
  clinical.updatedAt = new Date().toISOString();
}

async function patientSummary(contract, patientId, cache) {
  if (cache.has(patientId)) return cache.get(patientId);
  let summary = { patientId, name: '', age: null, gender: '' };
  try {
    const p = await directory.readPatient(contract, fetchByCID, patientId);
    if (p) summary = { patientId, name: p.name || '', age: p.age ?? null, gender: p.gender || '' };
  } catch (err) {
    logger.warn('Patient lookup failed for lab queue', { patientId, error: err.message });
  }
  cache.set(patientId, summary);
  return summary;
}

// Ledger record + the request's content from the visit document.
function present(chainReq, docReq, patient, onChainVisit) {
  return {
    ...chainReq,
    tests:        docReq?.tests || [],
    instructions: docReq?.instructions || '',
    report:       docReq?.report || null,
    patient,
    assignedDoctor: onChainVisit?.assignedDoctor || chainReq.requestedBy,
    visitStatus:    onChainVisit?.status || '',
  };
}

// ── GET /lab/catalog — test definitions with reference intervals ─────────────
router.get('/catalog', ...asLab(...LAB_ROLES), [query('gender').optional().isString()],
  (req, res) => res.json({ success: true, data: lab.catalogFor(req.query.gender) }));

// ── GET /lab/requests?status= — the work queue ───────────────────────────────
router.get('/requests', ...asLab(...LAB_ROLES),
  [query('status').optional().isIn(STATUSES).withMessage(`status must be one of ${STATUSES.join(', ')}`)],
  wrap(async (req, res) => {
    if (invalid(req, res)) return;
    const chain = parseResult(await req.contract.evaluateTransaction('LabContract:ListLabRequests', req.query.status || '')) || [];

    const visits = new Map();
    const patients = new Map();
    const out = [];
    for (const chainReq of chain) {
      try {
        if (!visits.has(chainReq.visitId)) visits.set(chainReq.visitId, await loadVisit(req.contract, chainReq.visitId));
        const { onChain, clinical } = visits.get(chainReq.visitId);
        const patient = await patientSummary(req.contract, chainReq.patientId, patients);
        out.push(present(chainReq, findRequest(clinical, chainReq.labRequestId), patient, onChain));
      } catch (err) {
        logger.warn('Could not load lab request content', { labRequestId: chainReq.labRequestId, error: err.message });
        out.push(present(chainReq, null, { patientId: chainReq.patientId, name: '', age: null, gender: '' }, null));
      }
    }
    out.sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)));
    return res.json({ success: true, data: out });
  })
);

// ── GET /lab/visits/:id/request/:reqId — one order with its report ───────────
router.get('/visits/:id/request/:reqId', ...asLab(...LAB_ROLES), ids,
  wrap(async (req, res) => {
    if (invalid(req, res)) return;
    const { id: visitId, reqId: labRequestId } = req.params;
    const chainReq = parseResult(await req.contract.evaluateTransaction('LabContract:GetLabRequest', labRequestId));
    if (!chainReq || chainReq.visitId !== visitId) {
      return res.status(404).json({ success: false, error: `Lab request not found: ${labRequestId}` });
    }
    const { onChain, clinical } = await loadVisit(req.contract, visitId);
    const patient = await patientSummary(req.contract, chainReq.patientId, new Map());
    return res.json({ success: true, data: present(chainReq, findRequest(clinical, labRequestId), patient, onChain) });
  })
);

// ── PUT …/acknowledge — reception accepts the order and sample ───────────────
router.put('/visits/:id/request/:reqId/acknowledge', ...asLab(...RECEPTION), ids,
  wrap(async (req, res) => {
    if (invalid(req, res)) return;
    const { id: visitId, reqId: labRequestId } = req.params;
    const { clinical } = await loadVisit(req.contract, visitId);
    const docReq = findRequest(clinical, labRequestId);
    if (!docReq) return res.status(404).json({ success: false, error: `Lab request not found: ${labRequestId}` });

    docReq.status         = 'ACKNOWLEDGED';
    docReq.acknowledgedBy = req.user.userId;
    docReq.acknowledgedAt = new Date().toISOString();
    logStep(clinical, req.user, 'LAB_REQUEST_ACKNOWLEDGED', labRequestId, `Order accepted: ${docReq.tests.join(', ')}`);

    const newCID = await pinJSON(clinical, `visit-${visitId}-lab-ack.json`);
    const result = parseResult(await req.contract.submitTransaction('LabContract:AcknowledgeLabRequest', visitId, labRequestId, newCID));
    logger.info('Lab request acknowledged', { visitId, labRequestId, userId: req.user.userId });
    return res.json({ success: true, data: result.labRequest });
  })
);

// ── POST …/attachments — upload a report file (PDF / image) ──────────────────
// Body: { filename, mimeType, dataBase64 }. Returns the attachment record to
// include in the result submission.
router.post('/visits/:id/request/:reqId/attachments', ...asLab(...BENCH), ids,
  wrap(async (req, res) => {
    if (invalid(req, res)) return;
    const { id: visitId, reqId: labRequestId } = req.params;
    const chainReq = parseResult(await req.contract.evaluateTransaction('LabContract:GetLabRequest', labRequestId));
    if (!chainReq || chainReq.visitId !== visitId) {
      return res.status(404).json({ success: false, error: `Lab request not found: ${labRequestId}` });
    }
    const built = lab.buildAttachmentEnvelope(req.body || {}, { visitId, labRequestId, uploadedBy: req.user.userId });
    if (built.error) return res.status(400).json({ success: false, error: built.error });
    const cid = await pinJSON(built.envelope, `lab-attachment-${labRequestId}.json`);
    return res.status(201).json({ success: true, data: { cid, ...built.meta } });
  })
);

// ── GET …/attachments/:cid — view or download an attached file ───────────────
router.get('/visits/:id/request/:reqId/attachments/:cid', ...asLab(...LAB_ROLES), ids,
  wrap(async (req, res) => {
    if (invalid(req, res)) return;
    const { clinical } = await loadVisit(req.contract, req.params.id);
    if (!lab.findAttachment(clinical, req.params.reqId, req.params.cid)) {
      return res.status(404).json({ success: false, error: 'Attachment not found on this lab request' });
    }
    return lab.sendAttachment(res, await fetchByCID(req.params.cid));
  })
);

// ── PUT …/submit — technician enters the results ─────────────────────────────
router.put('/visits/:id/request/:reqId/submit', ...asLab(...BENCH), ids,
  wrap(async (req, res) => {
    if (invalid(req, res)) return;
    const { id: visitId, reqId: labRequestId } = req.params;

    const normalized = lab.normalizeReport(req.body);
    if (normalized.errors) {
      return res.status(400).json({ success: false, error: normalized.errors.join('; '), errors: normalized.errors });
    }

    const { onChain, clinical } = await loadVisit(req.contract, visitId);
    const docReq = findRequest(clinical, labRequestId);
    if (!docReq) return res.status(404).json({ success: false, error: `Lab request not found: ${labRequestId}` });

    const report = normalized.report;
    const resultsHash = lab.hashReport(labRequestId, docReq.tests, report);
    const ai = req.body.aiAnalysis && typeof req.body.aiAnalysis === 'object' ? req.body.aiAnalysis : null;

    docReq.status      = 'RESULT_SUBMITTED';
    docReq.report      = {
      ...report,
      aiAnalysis: ai ? {
        findings:      (ai.findings || []).map(String).slice(0, 30),
        abnormalities: (ai.abnormalities || []).map(String).slice(0, 30),
        followups:     (ai.followups || []).map(String).slice(0, 30),
        source:        String(ai.source || '').slice(0, 60),
        generatedAt:   new Date().toISOString(),
      } : null,
      enteredBy:   req.user.userId,
      enteredAt:   new Date().toISOString(),
      revision:    (docReq.report?.revision || 0) + 1,
      resultsHash,
    };
    docReq.results     = lab.legacyResults(report);
    docReq.resultsHash = resultsHash;
    docReq.submittedBy = req.user.userId;
    docReq.submittedAt = docReq.report.enteredAt;
    docReq.approvedBy  = ''; docReq.approvedAt = '';
    logStep(clinical, req.user, 'LAB_RESULT_SUBMITTED', labRequestId, `Results entered for ${docReq.tests.join(', ')}`);

    const newCID = await pinJSON(clinical, `visit-${visitId}-lab-results.json`);
    const result = parseResult(await req.contract.submitTransaction(
      'LabContract:SubmitLabResult', visitId, labRequestId, newCID, resultsHash
    ));
    emit('AGENT_EXECUTION_COMPLETED', {
      source: 'extorg-api', org: 'DiagnosticsMSP', severity: 'INFO',
      payload: {
        agentId: 'lab-agent',
        status: 'COMPLETED',
        durationMs: 120,
        model: 'clinical-ai-agent'
      }
    });
    logger.info('Lab result submitted', { visitId, labRequestId, userId: req.user.userId });

    // FHIR DiagnosticReport anchor (hashes only on-chain). Not part of the
    // clinical workflow: a failure is reported to the caller but does not undo
    // the committed result.
    let fhirAnchor = null;
    let fhirError = null;
    try {
      fhirAnchor = await anchorFHIRRecord(req.contract, { pinJSON }, {
        sourceType: 'lab-result',
        legacyJson: {
          patientId: onChain.patientId, visitId, labRequestId,
          panel: docReq.tests.join(', '), results: docReq.results,
          submittedBy: req.user.userId, submittedAt: docReq.submittedAt,
        },
        recordId: `${labRequestId}-r${docReq.report.revision}`,
        filename: `fhir-lab-${labRequestId}.json`,
      });
    } catch (err) {
      fhirError = err.message;
      logger.error('FHIR anchor failed', { labRequestId, error: err.message });
    }

    return res.json({ success: true, data: { ...result.labRequest, report: docReq.report, fhirAnchor, fhirError } });
  })
);

// ── PUT …/approve — supervisor verifies and signs; report is released ────────
// Body: { resultsHash } — the hash of the report the supervisor reviewed.
router.put('/visits/:id/request/:reqId/approve', ...asLab(...SUPERVISORS),
  [...ids, body('resultsHash').matches(/^[a-f0-9]{64}$/).withMessage('resultsHash of the reviewed report is required')],
  wrap(async (req, res) => {
    if (invalid(req, res)) return;
    const { id: visitId, reqId: labRequestId } = req.params;
    const { onChain, clinical } = await loadVisit(req.contract, visitId);
    const docReq = findRequest(clinical, labRequestId);
    if (!docReq) return res.status(404).json({ success: false, error: `Lab request not found: ${labRequestId}` });
    if (!docReq.report) return res.status(400).json({ success: false, error: 'No result has been entered for this request' });

    // The stored report must still hash to what was submitted and reviewed.
    const actual = lab.hashReport(labRequestId, docReq.tests, docReq.report);
    if (actual !== req.body.resultsHash) {
      return res.status(409).json({ success: false, error: 'The report changed since you opened it. Reload and review it again.' });
    }

    docReq.status     = 'APPROVED';
    docReq.approvedBy = req.user.userId;
    docReq.approvedAt = new Date().toISOString();
    docReq.report.verifiedBy = req.user.userId;
    docReq.report.verifiedAt = docReq.approvedAt;
    logStep(clinical, req.user, 'LAB_RESULT_APPROVED', labRequestId,
      `Report verified and released for ${docReq.tests.join(', ')}`, onChain.assignedDoctor, 'doctor');

    const newCID = await pinJSON(clinical, `visit-${visitId}-lab-approved.json`);
    const result = parseResult(await req.contract.submitTransaction(
      'LabContract:ApproveLabResult', visitId, labRequestId, newCID, req.body.resultsHash
    ));
    logger.info('Lab result approved', { visitId, labRequestId, userId: req.user.userId });
    return res.json({ success: true, data: { ...result.labRequest, visitStatus: result.status } });
  })
);

// ── PUT …/reject — supervisor sends the result back to the bench ─────────────
router.put('/visits/:id/request/:reqId/reject', ...asLab(...SUPERVISORS),
  [...ids, body('reason').trim().isLength({ min: 3, max: 500 }).withMessage('A reason (3–500 characters) is required')],
  wrap(async (req, res) => {
    if (invalid(req, res)) return;
    const { id: visitId, reqId: labRequestId } = req.params;
    const { clinical } = await loadVisit(req.contract, visitId);
    const docReq = findRequest(clinical, labRequestId);
    if (!docReq) return res.status(404).json({ success: false, error: `Lab request not found: ${labRequestId}` });

    docReq.status          = 'REJECTED';
    docReq.rejectedBy      = req.user.userId;
    docReq.rejectedAt      = new Date().toISOString();
    docReq.rejectionReason = req.body.reason;
    logStep(clinical, req.user, 'LAB_RESULT_REJECTED', labRequestId, `Returned to bench: ${req.body.reason}`);

    const newCID = await pinJSON(clinical, `visit-${visitId}-lab-rejected.json`);
    const result = parseResult(await req.contract.submitTransaction(
      'LabContract:RejectLabResult', visitId, labRequestId, newCID, req.body.reason
    ));
    logger.info('Lab result rejected', { visitId, labRequestId, userId: req.user.userId });
    return res.json({ success: true, data: result.labRequest });
  })
);

module.exports = router;
