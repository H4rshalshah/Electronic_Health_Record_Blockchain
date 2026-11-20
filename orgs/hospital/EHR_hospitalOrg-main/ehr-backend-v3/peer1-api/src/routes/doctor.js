'use strict';

const router = require('express').Router();
const { body, param, validationResult } = require('express-validator');
const { authenticate, requireRole } = require('../middleware/auth');
const { peerContext }  = require('../middleware/peerContext');
const { wrap, parseResult } = require('../middleware/errorHandler');
const { fetchByCID, pinJSON } = require('../fabric/ipfsClient');
const lab = require('../../../shared/labReport');
const codes = require('../../../shared/diseaseCodes');
const timeline = require('../../../shared/timeline');
const directory = require('../../../shared/patientDirectory');
const logger = require('../config/logger');
const { emit } = require('../../../shared/dashboardEmitter');

const asDoctor = [authenticate, requireRole('doctor'), peerContext];

// Helper: fetch visit on-chain record + IPFS JSON together
async function getVisitWithContent(contract, visitId) {
  const onChain = parseResult(await contract.evaluateTransaction('VisitContract:GetVisit', visitId));
  if (!onChain) throw new Error(`Visit not found: ${visitId}`);
  const clinical = onChain.visitCID ? await fetchByCID(onChain.visitCID) : null;
  return { onChain, clinical };
}

// ── GET /doctor/visits — visits assigned to this doctor ──────
router.get('/visits', ...asDoctor, wrap(async (req, res) => {
  const result = await req.contract.evaluateTransaction('VisitContract:ListAllVisits');
  const all = parseResult(result) || [];
  return res.json({ success: true, data: all.filter(v => v.assignedDoctor === req.user.userId) });
}));

// ── GET /doctor/visits/:id — GetVisit + IPFS content ─────────
router.get('/visits/:id',
  ...asDoctor,
  wrap(async (req, res) => {
    const { onChain, clinical } = await getVisitWithContent(req.contract, req.params.id);
    // Who the patient is (name, age, sex) for the treating doctor.
    let patient = { patientId: onChain.patientId };
    try {
      const p = await directory.readPatient(req.contract, fetchByCID, onChain.patientId);
      if (p) patient = { patientId: p.patientId, name: p.name, age: p.age, gender: p.gender, bloodGroup: p.bloodGroup, did: p.did };
    } catch (err) {
      logger.warn('Patient profile could not be loaded for visit', { visitId: req.params.id, error: err.message });
    }
    return res.json({ success: true, data: { ...onChain, clinical, patient } });
  })
);

// ── GET /doctor/visits/:id/history ───────────────────────────
router.get('/visits/:id/history',
  ...asDoctor,
  wrap(async (req, res) => {
    const result = await req.contract.evaluateTransaction(
      'VisitContract:GetVisitHistory', req.params.id
    );
    return res.json({ success: true, data: parseResult(result) });
  })
);

// ── GET /doctor/visits/:id/prescription ──────────────────────
// Reads latest prescription from IPFS visit JSON
router.get('/visits/:id/prescription',
  ...asDoctor,
  wrap(async (req, res) => {
    const { onChain, clinical } = await getVisitWithContent(req.contract, req.params.id);
    const prescriptions = clinical?.prescriptions || [];
    const latest = prescriptions.length ? prescriptions[prescriptions.length - 1] : null;
    return res.json({ success: true, data: latest });
  })
);

// ── GET /doctor/visits/:id/ehr — patient EHR for this visit ──
// Doctor reads the patient's persistent EHR (allergies, conditions etc)
router.get('/visits/:id/ehr',
  ...asDoctor,
  wrap(async (req, res) => {
    const { onChain } = await getVisitWithContent(req.contract, req.params.id);
    const patientId = onChain.patientId;

    const cidResult = await req.contract.evaluateTransaction(
      'EhrContract:GetCurrentCID', patientId
    );
    const { currentCID } = parseResult(cidResult) || {};
    if (!currentCID) return res.json({ success: true, data: null });

    const ehr = await fetchByCID(currentCID);
    return res.json({ success: true, data: { cid: currentCID, ehr } });
  })
);

// ── PUT /doctor/visits/:id/diagnosis ─────────────────────────
// Fetch visit JSON → update diagnosisNotes → repin → UpdateDiagnosisNotes(newCID)
router.put('/visits/:id/diagnosis',
  ...asDoctor,
  [
    param('id').trim().notEmpty(),
    body('notes').trim().notEmpty().withMessage('notes required'),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const visitId = req.params.id;
    logger.info('UpdateDiagnosisNotes', { visitId, userId: req.user.userId });

    const { onChain, clinical } = await getVisitWithContent(req.contract, visitId);
    clinical.diagnosisNotes = req.body.notes;
    clinical.forwardingLog.push({
      action: 'DIAGNOSIS_NOTES_UPDATED', from: req.user.userId, fromRole: 'doctor',
      to: '', toRole: '', notes: req.body.notes, timestamp: new Date().toISOString(),
    });
    clinical.updatedAt = new Date().toISOString();
    const newCID = await pinJSON(clinical, `visit-${visitId}-diagnosis.json`);

    const result = await req.contract.submitTransaction(
      'ClinicalContract:UpdateDiagnosisNotes', visitId, newCID
    );
    emit('AGENT_EXECUTION_COMPLETED', {
      source: 'peer1-api', org: 'HospitalMSP', severity: 'INFO',
      payload: { agentId: 'doctor-agent', status: 'COMPLETED', durationMs: 45, model: 'clinical-agent' }
    });
    return res.json({ success: true, data: parseResult(result) });
  })
);

// ── PUT /doctor/visits/:id/prescription ──────────────────────
// Append new prescription version to IPFS JSON → repin → UpdatePrescription(newCID)
router.put('/visits/:id/prescription',
  ...asDoctor,
  [
    param('id').trim().notEmpty(),
    body('medications').isArray({ min: 1 }).withMessage('medications must be non-empty array'),
    body('medications.*').isString().trim().notEmpty(),
    body('instructions').optional().isString(),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const visitId = req.params.id;
    const { medications, instructions = '' } = req.body;
    logger.info('UpdatePrescription', { visitId, userId: req.user.userId });

    const { onChain, clinical } = await getVisitWithContent(req.contract, visitId);
    const version = (clinical.prescriptions?.length || 0) + 1;
    clinical.prescriptions = clinical.prescriptions || [];
    clinical.prescriptions.push({
      version, medications, instructions,
      prescribedBy: req.user.userId, prescribedAt: new Date().toISOString(),
    });
    clinical.forwardingLog.push({
      action: 'PRESCRIPTION_UPDATED', from: req.user.userId, fromRole: 'doctor',
      to: '', toRole: '', notes: `v${version}: ${medications.join(', ')}`,
      timestamp: new Date().toISOString(),
    });
    clinical.updatedAt = new Date().toISOString();
    const newCID = await pinJSON(clinical, `visit-${visitId}-rx-v${version}.json`);

    const result = await req.contract.submitTransaction(
      'ClinicalContract:UpdatePrescription', visitId, newCID
    );
    return res.json({ success: true, data: parseResult(result) });
  })
);

// ── PUT /doctor/visits/:id/forward/nurse ─────────────────────
router.put('/visits/:id/forward/nurse',
  ...asDoctor,
  [
    param('id').trim().notEmpty(),
    body('instructions').optional().isString(),
  ],
  wrap(async (req, res) => {
    const visitId = req.params.id;
    const { instructions = '' } = req.body;
    logger.info('ForwardToNurse', { visitId, userId: req.user.userId });

    const { onChain, clinical } = await getVisitWithContent(req.contract, visitId);
    clinical.forwardingLog.push({
      action: 'FORWARD_TO_NURSE', from: req.user.userId, fromRole: 'doctor',
      to: onChain.assignedNurse, toRole: 'nurse', notes: instructions,
      timestamp: new Date().toISOString(),
    });
    clinical.updatedAt = new Date().toISOString();
    const newCID = await pinJSON(clinical, `visit-${visitId}-fwd-nurse.json`);

    const result = await req.contract.submitTransaction(
      'ForwardContract:ForwardToNurse', visitId, newCID
    );
    return res.json({ success: true, data: parseResult(result) });
  })
);

// ── PUT /doctor/visits/:id/forward/lab ───────────────────────
// Add lab request entry to IPFS JSON → repin → ForwardToLab(labRequestId, newCID)
router.put('/visits/:id/forward/lab',
  ...asDoctor,
  [
    param('id').trim().notEmpty(),
    body('tests').isArray({ min: 1 }).withMessage('tests must be non-empty array'),
    body('tests.*').isString().trim().notEmpty(),
    body('instructions').optional().isString(),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const visitId = req.params.id;
    const { tests, instructions = '' } = req.body;
    logger.info('ForwardToLab', { visitId, tests, userId: req.user.userId });

    const { onChain, clinical } = await getVisitWithContent(req.contract, visitId);

    // Generate labRequestId using same pattern as chaincode: visitId-L{n}
    clinical.labRequests = clinical.labRequests || [];
    const labReqNum = clinical.labRequests.length + 1;
    const labRequestId = `${visitId}-L${labReqNum}`;

    clinical.labRequests.push({
      labRequestId, tests, instructions,
      requestedBy: req.user.userId, requestedAt: new Date().toISOString(),
      status: 'REQUESTED',
      acknowledgedBy: '', acknowledgedAt: '',
      submittedBy: '',    submittedAt: '',
      results: {},        resultsHash: '',
      approvedBy: '',     approvedAt: '',
    });
    clinical.forwardingLog.push({
      action: 'FORWARD_TO_LAB', from: req.user.userId, fromRole: 'doctor',
      to: 'lab', toRole: 'lab', notes: `Tests: ${tests.join(', ')}. ${instructions}`,
      labRequestId, timestamp: new Date().toISOString(),
    });
    clinical.updatedAt = new Date().toISOString();
    const newCID = await pinJSON(clinical, `visit-${visitId}-lab-${labReqNum}.json`);

    const result = await req.contract.submitTransaction(
      'ForwardContract:ForwardToLab', visitId, labRequestId, newCID
    );
    return res.json({ success: true, data: parseResult(result) });
  })
);

// ── GET /doctor/visits/:id/lab/:reqId/attachments/:cid ───────
// A file attached to a lab report on this visit.
router.get('/visits/:id/lab/:reqId/attachments/:cid', ...asDoctor, wrap(async (req, res) => {
  const { clinical } = await getVisitWithContent(req.contract, req.params.id);
  if (!lab.findAttachment(clinical, req.params.reqId, req.params.cid)) {
    return res.status(404).json({ success: false, error: 'Attachment not found on this lab request' });
  }
  return lab.sendAttachment(res, await fetchByCID(req.params.cid));
}));

// ── Disease code (ICD-10) ─────────────────────────────────────
// GET  /doctor/codes?q=            search the published template
// GET  /doctor/visits/:id/disease-code   current code, full history, AI cross-reference
// PUT  /doctor/visits/:id/disease-code   confirm (same code) or change (reason required)
const ipfs = { fetchByCID, pinJSON };

router.get('/codes', ...asDoctor, wrap(async (req, res) => {
  const template = await codes.loadTemplate(req.contract, ipfs);
  return res.json({
    success: true,
    data: {
      template: { cid: template.cid, version: template.version, codeSystem: template.codeSystem },
      codes: codes.searchCodes(template.document, req.query.q),
    },
  });
}));

router.get('/visits/:id/disease-code', ...asDoctor, wrap(async (req, res) => {
  const { onChain } = await getVisitWithContent(req.contract, req.params.id);
  const record = parseResult(await req.contract.evaluateTransaction('CodeContract:GetDiseaseCode', onChain.patientId));

  // The analysis that belongs to this visit if there is one, otherwise the latest.
  const provisional = (record.history || []).filter(h => h.action === 'PROVISIONAL' && h.analysisCid);
  const entry = provisional.filter(h => h.visitId === req.params.id).pop() || provisional[provisional.length - 1];
  let analysis = null;
  let analysisError = null;
  if (entry) {
    try {
      const doc = await fetchByCID(entry.analysisCid);
      analysis = {
        cid: entry.analysisCid, symptoms: doc.symptoms, recordedAt: doc.recordedAt,
        templateMatch: doc.templateMatch, aiAnalysis: doc.aiAnalysis,
      };
    } catch (err) {
      analysisError = 'The stored analysis could not be loaded from IPFS';
      logger.error('Analysis fetch failed', { cid: entry.analysisCid, error: err.message });
    }
  }
  return res.json({ success: true, data: { patientId: onChain.patientId, ...record, analysis, analysisError } });
}));

router.put('/visits/:id/disease-code', ...asDoctor,
  [
    param('id').trim().notEmpty(),
    body('code').trim().notEmpty().withMessage('code is required'),
    body('reason').optional().isString().isLength({ max: 500 }),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array().map(e => e.msg).join('; ') });

    const { onChain } = await getVisitWithContent(req.contract, req.params.id);
    const template = await codes.loadTemplate(req.contract, ipfs);
    const chosen = codes.findCode(template.document, req.body.code);
    if (!chosen) {
      return res.status(400).json({ success: false, error: `Code ${req.body.code} is not in the published template (version ${template.version})` });
    }
    const result = await req.contract.submitTransaction(
      'CodeContract:UpdateDiseaseCode',
      onChain.patientId, chosen.code, chosen.name, String(req.body.reason || '').trim(), req.params.id
    );
    emit('AGENT_EXECUTION_COMPLETED', {
      source: 'peer1-api', org: 'HospitalMSP', severity: 'INFO',
      payload: { agentId: 'doctor-agent', status: 'COMPLETED', durationMs: 50, model: 'clinical-agent' }
    });
    logger.info('Disease code updated', { visitId: req.params.id, code: chosen.code, userId: req.user.userId });
    return res.json({ success: true, data: parseResult(result) });
  })
);

// ── Patient timeline (DID → CIDs → documents) ────────────────
router.get('/visits/:id/timeline', ...asDoctor, wrap(async (req, res) => {
  const { onChain } = await getVisitWithContent(req.contract, req.params.id);
  return res.json({ success: true, data: await timeline.getTimeline(req.contract, onChain.patientId) });
}));

router.get('/visits/:id/timeline/:seq', ...asDoctor, [param('seq').isInt({ min: 1 })], wrap(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, error: 'Entry number must be a positive integer' });
  const { onChain } = await getVisitWithContent(req.contract, req.params.id);
  return res.json({ success: true, data: await timeline.getTimelineDocument(req.contract, fetchByCID, onChain.patientId, req.params.seq) });
}));

// ── PUT /doctor/visits/:id/finalize — FinalizeVisit ──────────
router.put('/visits/:id/finalize',
  ...asDoctor,
  [
    param('id').trim().notEmpty(),
    body('finalDiagnosis').trim().notEmpty().withMessage('finalDiagnosis required'),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const visitId = req.params.id;
    logger.info('FinalizeVisit', { visitId, userId: req.user.userId });

    const { onChain, clinical } = await getVisitWithContent(req.contract, visitId);
    clinical.finalDiagnosis = req.body.finalDiagnosis;
    clinical.finalizedBy    = req.user.userId;
    clinical.finalizedAt    = new Date().toISOString();
    clinical.forwardingLog.push({
      action: 'VISIT_FINALIZED', from: req.user.userId, fromRole: 'doctor',
      to: '', toRole: '', notes: req.body.finalDiagnosis, timestamp: new Date().toISOString(),
    });
    clinical.updatedAt = new Date().toISOString();
    const newCID = await pinJSON(clinical, `visit-${visitId}-finalized.json`);

    const result = await req.contract.submitTransaction(
      'VisitContract:FinalizeVisit', visitId, newCID
    );
    emit('AGENT_EXECUTION_COMPLETED', {
      source: 'peer1-api', org: 'HospitalMSP', severity: 'INFO',
      payload: { agentId: 'doctor-agent', status: 'COMPLETED', durationMs: 40, model: 'clinical-agent' }
    });
    return res.json({ success: true, data: parseResult(result) });
  })
);

// ── PUT /doctor/visits/:id/assign/nurse ──────────────────────
router.put('/visits/:id/assign/nurse',
  ...asDoctor,
  [
    param('id').trim().notEmpty(),
    body('nurseId').trim().notEmpty().withMessage('nurseId required'),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const visitId = req.params.id;
    const { nurseId } = req.body;
    logger.info('AssignNurse (doctor)', { visitId, userId: req.user.userId });

    const { onChain, clinical } = await getVisitWithContent(req.contract, visitId);
    clinical.assignedNurse = nurseId;
    clinical.forwardingLog.push({
      action: 'NURSE_ASSIGNED', from: req.user.userId, fromRole: 'doctor',
      to: nurseId, toRole: 'nurse', notes: '', timestamp: new Date().toISOString(),
    });
    clinical.updatedAt = new Date().toISOString();
    const newCID = await pinJSON(clinical, `visit-${visitId}-nurse.json`);

    const result = await req.contract.submitTransaction(
      'VisitContract:AssignNurse', visitId, nurseId, newCID
    );
    return res.json({ success: true, data: parseResult(result) });
  })
);

// ── PUT /doctor/visits/:id/ehr — UpdateEHR section ───────────
// Doctor updates a section of the patient's persistent EHR
// Body: { section: 'allergies'|'chronicConditions'|..., data: [...] }
router.put('/visits/:id/ehr',
  ...asDoctor,
  [
    param('id').trim().notEmpty(),
    body('section').trim().notEmpty().withMessage('section required'),
    body('data').exists().withMessage('data required'),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const visitId = req.params.id;
    const { section, data } = req.body;

    const ALLOWED_SECTIONS = [
      'allergies', 'chronicConditions', 'ongoingMedications',
      'surgicalHistory', 'familyHistory', 'immunizations', 'lifestyle', 'medicalHistory'
    ];
    if (!ALLOWED_SECTIONS.includes(section)) {
      return res.status(400).json({ success: false, error: `Invalid section. Allowed: ${ALLOWED_SECTIONS.join(', ')}` });
    }

    // Get patientId from visit
    const visitOnChain = parseResult(await req.contract.evaluateTransaction('VisitContract:GetVisit', visitId));
    const patientId = visitOnChain.patientId;

    // Fetch current EHR
    const cidResult = parseResult(await req.contract.evaluateTransaction('EhrContract:GetCurrentCID', patientId));
    const ehr = await fetchByCID(cidResult.currentCID);

    // Update the section
    ehr[section] = data;
    ehr.updatedAt = new Date().toISOString();
    ehr.updatedBy = `doctor:${req.user.userId}`;

    // Pin updated EHR
    const newCID = await pinJSON(ehr, `ehr-${patientId}-${section}.json`);

    // Store new CID on chain
    await req.contract.submitTransaction(
      'EhrContract:UpdateEHRCID', patientId, newCID, section, `Updated by doctor ${req.user.userId}`
    );

    logger.info('Doctor updated EHR', { visitId, patientId, section, newCID, userId: req.user.userId });
    return res.json({ success: true, data: { patientId, section, cid: newCID } });
  })
);

// ── POST /doctor/visits/:id/request-access ────────────────────
// Doctor requests EHR access for the patient of a given visit.
// The request appears as PENDING in the patient's Access Control portal.
// Body: { sections: ["ehr","visits"], reason: "Clinical consultation" }
router.post('/visits/:id/request-access',
  ...asDoctor,
  [
    param('id').trim().notEmpty(),
    body('sections').isArray({ min: 1 }).withMessage('sections must be a non-empty array'),
    body('reason').optional().isString(),
  ],
  wrap(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const visitId = req.params.id;
    const { sections, reason = '' } = req.body;

    const onChain = parseResult(
      await req.contract.evaluateTransaction('VisitContract:GetVisit', visitId)
    );
    if (!onChain) return res.status(404).json({ success: false, error: 'Visit not found' });

    const patientId = onChain.patientId;

    const result = await req.contract.submitTransaction(
      'AccessContract:RequestAccess',
      patientId,
      JSON.stringify(sections),
      reason
    );

    const request = parseResult(result);
    logger.info('Doctor requested EHR access', { visitId, patientId, sections, userId: req.user.userId });
    return res.status(201).json({ success: true, data: request });
  })
);

module.exports = router;
