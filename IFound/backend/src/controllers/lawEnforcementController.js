/**
 * Law Enforcement Controller
 *
 * Handles all law enforcement portal operations including:
 * - Agency registration and verification
 * - Officer authentication
 * - Bulk case import
 * - Priority case flagging
 * - Compliance reporting
 */

const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  LawEnforcementAgency,
  LawEnforcementOfficer,
  Case,
  Photo,
  AuditLog,
  User,
} = require('../models');
const logger = require('../config/logger');
const { sequelize } = require('../config/database');

// ==========================================
// AGENCY MANAGEMENT
// ==========================================

/**
 * Register a new law enforcement agency
 * @route POST /api/v1/law-enforcement/agency/register
 */
const registerAgency = asyncHandler(async (req, res) => {
  const {
    name,
    agency_type,
    jurisdiction,
    badge_number_prefix,
    address,
    city,
    state,
    zip_code,
    country,
    phone,
    email,
    website,
    primary_contact_name,
    primary_contact_email,
    primary_contact_phone,
  } = req.body;

  // Check if agency already exists
  const existingAgency = await LawEnforcementAgency.findOne({
    where: {
      [Op.or]: [
        { email },
        { name, city, state },
      ],
    },
  });

  if (existingAgency) {
    return res.status(400).json({
      success: false,
      message: 'An agency with this email or name already exists in this location',
    });
  }

  // Create agency
  const agency = await LawEnforcementAgency.create({
    name,
    agency_type,
    jurisdiction,
    badge_number_prefix,
    address,
    city,
    state,
    zip_code,
    country: country || 'United States',
    phone,
    email,
    website,
    notes: `Primary Contact: ${primary_contact_name}, ${primary_contact_email}, ${primary_contact_phone}`,
  });

  logger.info('Law enforcement agency registered', {
    agencyId: agency.id,
    name: agency.name,
    city: agency.city,
    state: agency.state,
  });

  res.status(201).json({
    success: true,
    message: 'Agency registration submitted. Verification pending.',
    data: {
      agency: {
        id: agency.id,
        name: agency.name,
        verification_status: agency.verification_status,
      },
    },
  });
});

/**
 * Get agency details
 * @route GET /api/v1/law-enforcement/agency/:id
 */
const getAgency = asyncHandler(async (req, res) => {
  const agency = await LawEnforcementAgency.findByPk(req.params.id, {
    include: [{
      model: LawEnforcementOfficer,
      as: 'officers',
      where: { is_active: true },
      required: false,
      attributes: ['id', 'first_name', 'last_name', 'badge_number', 'rank', 'role'],
    }],
  });

  if (!agency) {
    return res.status(404).json({
      success: false,
      message: 'Agency not found',
    });
  }

  res.json({
    success: true,
    data: { agency },
  });
});

/**
 * Verify an agency (Admin only)
 * @route POST /api/v1/law-enforcement/agency/:id/verify
 */
const verifyAgency = asyncHandler(async (req, res) => {
  const { status, notes, permissions } = req.body;

  const agency = await LawEnforcementAgency.findByPk(req.params.id);

  if (!agency) {
    return res.status(404).json({
      success: false,
      message: 'Agency not found',
    });
  }

  // Generate API key if approving
  let apiKey = null;
  if (status === 'verified') {
    apiKey = crypto.randomBytes(32).toString('hex');
    agency.api_key = apiKey;
    agency.api_key_expires_at = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
    agency.verified_at = new Date();
    agency.verified_by = req.user.id;

    if (permissions) {
      agency.can_bulk_import = permissions.can_bulk_import || false;
      agency.can_flag_priority = permissions.can_flag_priority || false;
      agency.monthly_case_limit = permissions.monthly_case_limit || 100;
    }
  }

  agency.verification_status = status;
  if (notes) agency.notes = (agency.notes || '') + '\n' + notes;

  await agency.save();

  logger.info('Agency verification updated', {
    agencyId: agency.id,
    status,
    verifiedBy: req.user.id,
  });

  res.json({
    success: true,
    message: `Agency ${status}`,
    data: {
      agency: {
        id: agency.id,
        name: agency.name,
        verification_status: agency.verification_status,
        api_key: apiKey, // Only returned once
      },
    },
  });
});

// ==========================================
// OFFICER AUTHENTICATION
// ==========================================

/**
 * Register a new officer
 * @route POST /api/v1/law-enforcement/officer/register
 */
const registerOfficer = asyncHandler(async (req, res) => {
  const {
    agency_id,
    email,
    password,
    first_name,
    last_name,
    badge_number,
    rank,
    department,
    phone,
  } = req.body;

  // Verify agency exists and is verified
  const agency = await LawEnforcementAgency.findByPk(agency_id);

  if (!agency) {
    return res.status(404).json({
      success: false,
      message: 'Agency not found',
    });
  }

  if (agency.verification_status !== 'verified') {
    return res.status(400).json({
      success: false,
      message: 'Agency is not verified. Please wait for verification.',
    });
  }

  // Check if officer already exists
  const existingOfficer = await LawEnforcementOfficer.findOne({
    where: { email },
  });

  if (existingOfficer) {
    return res.status(400).json({
      success: false,
      message: 'An officer with this email already exists',
    });
  }

  // Create officer
  const officer = await LawEnforcementOfficer.create({
    agency_id,
    email,
    password_hash: password, // Will be hashed by hook
    first_name,
    last_name,
    badge_number,
    rank,
    department,
    phone,
  });

  logger.info('Law enforcement officer registered', {
    officerId: officer.id,
    agencyId: agency_id,
    email,
  });

  res.status(201).json({
    success: true,
    message: 'Officer registration submitted. Awaiting verification.',
    data: {
      officer: {
        id: officer.id,
        email: officer.email,
        verification_status: officer.verification_status,
      },
    },
  });
});

/**
 * Officer login
 * @route POST /api/v1/law-enforcement/officer/login
 */
const officerLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const officer = await LawEnforcementOfficer.findOne({
    where: { email },
    include: [{
      model: LawEnforcementAgency,
      as: 'agency',
    }],
  });

  if (!officer) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials',
    });
  }

  // Check if locked
  if (officer.isLocked()) {
    return res.status(401).json({
      success: false,
      message: 'Account is temporarily locked. Please try again later.',
    });
  }

  // Verify password
  const isValid = await officer.comparePassword(password);

  if (!isValid) {
    await officer.recordFailedLogin();
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials',
    });
  }

  // Check verification status
  if (officer.verification_status !== 'verified') {
    return res.status(401).json({
      success: false,
      message: 'Your account is pending verification',
    });
  }

  // Check if agency is still active
  if (!officer.agency.is_active || officer.agency.verification_status !== 'verified') {
    return res.status(401).json({
      success: false,
      message: 'Your agency account is not active',
    });
  }

  // Record successful login
  await officer.recordLogin();

  // Generate token
  const token = jwt.sign(
    {
      id: officer.id,
      type: 'law_enforcement',
      agency_id: officer.agency_id,
      role: officer.role,
      permissions: officer.permissions,
    },
    process.env.JWT_SECRET,
    { expiresIn: '8h' } // Shorter expiry for security
  );

  logger.info('Law enforcement officer logged in', {
    officerId: officer.id,
    agencyId: officer.agency_id,
  });

  res.json({
    success: true,
    data: {
      token,
      officer: {
        id: officer.id,
        email: officer.email,
        first_name: officer.first_name,
        last_name: officer.last_name,
        badge_number: officer.badge_number,
        role: officer.role,
        permissions: officer.permissions,
        require_password_change: officer.require_password_change,
      },
      agency: {
        id: officer.agency.id,
        name: officer.agency.name,
        agency_type: officer.agency.agency_type,
      },
    },
  });
});

/**
 * Verify an officer (Agency admin or Platform admin)
 * @route POST /api/v1/law-enforcement/officer/:id/verify
 */
const verifyOfficer = asyncHandler(async (req, res) => {
  const { status, permissions } = req.body;

  const officer = await LawEnforcementOfficer.findByPk(req.params.id);

  if (!officer) {
    return res.status(404).json({
      success: false,
      message: 'Officer not found',
    });
  }

  // Check authorization
  if (req.leOfficer) {
    // Agency admin verifying their own officers
    if (req.leOfficer.agency_id !== officer.agency_id || req.leOfficer.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to verify this officer',
      });
    }
  }

  officer.verification_status = status;
  if (status === 'verified') {
    officer.verified_at = new Date();
    officer.verified_by = req.leOfficer?.id || req.user?.id;

    if (permissions) {
      officer.permissions = { ...officer.permissions, ...permissions };
    }
  }

  await officer.save();

  logger.info('Officer verification updated', {
    officerId: officer.id,
    status,
    verifiedBy: req.leOfficer?.id || req.user?.id,
  });

  res.json({
    success: true,
    message: `Officer ${status}`,
    data: { officer },
  });
});

// ==========================================
// BULK CASE IMPORT
// ==========================================

/**
 * Bulk import cases
 * @route POST /api/v1/law-enforcement/cases/bulk-import
 */
const bulkImportCases = asyncHandler(async (req, res) => {
  const { cases: casesToImport } = req.body;

  if (!Array.isArray(casesToImport) || casesToImport.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Cases array is required',
    });
  }

  const officer = req.leOfficer;
  const agency = await LawEnforcementAgency.findByPk(officer.agency_id);

  // Check permission
  if (!agency.can_bulk_import || !officer.hasPermission('bulk_import')) {
    return res.status(403).json({
      success: false,
      message: 'Bulk import permission not granted',
    });
  }

  // Check monthly limit
  if (agency.cases_created_this_month + casesToImport.length > agency.monthly_case_limit) {
    return res.status(400).json({
      success: false,
      message: `Monthly case limit exceeded. Remaining: ${agency.monthly_case_limit - agency.cases_created_this_month}`,
    });
  }

  // Import cases in transaction
  const results = { imported: [], failed: [] };

  const transaction = await sequelize.transaction();

  try {
    for (const caseData of casesToImport) {
      try {
        // Check for duplicate by external ID
        const existing = await Case.findOne({
          where: {
            external_case_id: caseData.external_case_id,
            law_enforcement_agency_id: agency.id,
          },
          transaction,
        });

        if (existing) {
          results.failed.push({
            external_case_id: caseData.external_case_id,
            error: 'Case already imported',
          });
          continue;
        }

        // Create a system user reference for LE cases
        // In production, you'd have a dedicated LE system user
        const systemUserId = process.env.LE_SYSTEM_USER_ID || caseData.poster_id;

        const newCase = await Case.create({
          poster_id: systemUserId,
          case_type: caseData.case_type || 'missing_person',
          title: caseData.title,
          description: caseData.description,
          status: 'active',
          priority_level: caseData.priority_level || 'medium',
          bounty_amount: caseData.bounty_amount || 0,
          subject_name: caseData.subject_name,
          subject_age: caseData.subject_age,
          subject_dob: caseData.subject_dob,
          physical_description: caseData.physical_description,
          last_seen_location: caseData.last_seen_location,
          last_seen_date: caseData.last_seen_date,
          medical_conditions: caseData.medical_conditions,
          special_circumstances: caseData.special_circumstances,
          contact_info: caseData.contact_info || {
            agency_name: agency.name,
            phone: agency.phone,
          },
          // Law enforcement specific
          law_enforcement_agency_id: agency.id,
          law_enforcement_officer_id: officer.id,
          external_case_id: caseData.external_case_id,
          is_law_enforcement_case: true,
          ncic_number: caseData.ncic_number,
          namus_id: caseData.namus_id,
          amber_alert: caseData.amber_alert || false,
          silver_alert: caseData.silver_alert || false,
        }, { transaction });

        results.imported.push({
          id: newCase.id,
          external_case_id: caseData.external_case_id,
          title: newCase.title,
        });
      } catch (error) {
        results.failed.push({
          external_case_id: caseData.external_case_id,
          error: error.message,
        });
      }
    }

    // Update agency case count
    agency.cases_created_this_month += results.imported.length;
    await agency.save({ transaction });

    await transaction.commit();

    logger.info('Bulk case import completed', {
      agencyId: agency.id,
      officerId: officer.id,
      imported: results.imported.length,
      failed: results.failed.length,
    });

    res.json({
      success: true,
      message: `Imported ${results.imported.length} cases, ${results.failed.length} failed`,
      data: results,
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
});

// ==========================================
// PRIORITY FLAGGING
// ==========================================

/**
 * Flag a case as priority
 * @route POST /api/v1/law-enforcement/cases/:id/flag-priority
 */
const flagPriority = asyncHandler(async (req, res) => {
  const { reason, priority_level, amber_alert, silver_alert } = req.body;

  const officer = req.leOfficer;
  const agency = await LawEnforcementAgency.findByPk(officer.agency_id);

  // Check permission
  if (!agency.can_flag_priority || !officer.hasPermission('flag_priority')) {
    return res.status(403).json({
      success: false,
      message: 'Priority flagging permission not granted',
    });
  }

  const caseRecord = await Case.findByPk(req.params.id);

  if (!caseRecord) {
    return res.status(404).json({
      success: false,
      message: 'Case not found',
    });
  }

  caseRecord.is_priority_flagged = true;
  caseRecord.priority_flagged_by = officer.id;
  caseRecord.priority_flagged_at = new Date();
  caseRecord.priority_flag_reason = reason;

  if (priority_level) {
    caseRecord.priority_level = priority_level;
  }

  if (amber_alert !== undefined) {
    caseRecord.amber_alert = amber_alert;
  }

  if (silver_alert !== undefined) {
    caseRecord.silver_alert = silver_alert;
  }

  await caseRecord.save();

  // Log audit
  await AuditLog.create({
    user_id: officer.id,
    user_type: 'law_enforcement',
    action: 'priority_flag',
    resource_type: 'case',
    resource_id: caseRecord.id,
    details: {
      reason,
      priority_level: caseRecord.priority_level,
      amber_alert: caseRecord.amber_alert,
      silver_alert: caseRecord.silver_alert,
    },
  });

  logger.info('Case flagged as priority', {
    caseId: caseRecord.id,
    officerId: officer.id,
    agencyId: agency.id,
    reason,
  });

  res.json({
    success: true,
    message: 'Case flagged as priority',
    data: { case: caseRecord },
  });
});

/**
 * Remove priority flag
 * @route DELETE /api/v1/law-enforcement/cases/:id/flag-priority
 */
const removePriorityFlag = asyncHandler(async (req, res) => {
  const officer = req.leOfficer;

  const caseRecord = await Case.findByPk(req.params.id);

  if (!caseRecord) {
    return res.status(404).json({
      success: false,
      message: 'Case not found',
    });
  }

  caseRecord.is_priority_flagged = false;
  caseRecord.priority_flagged_by = null;
  caseRecord.priority_flagged_at = null;
  caseRecord.priority_flag_reason = null;
  caseRecord.amber_alert = false;
  caseRecord.silver_alert = false;

  await caseRecord.save();

  logger.info('Priority flag removed', {
    caseId: caseRecord.id,
    officerId: officer.id,
  });

  res.json({
    success: true,
    message: 'Priority flag removed',
  });
});

// ==========================================
// CASE ACCESS
// ==========================================

/**
 * Get cases for law enforcement
 * @route GET /api/v1/law-enforcement/cases
 */
const getLECases = asyncHandler(async (req, res) => {
  const {
    status,
    case_type,
    priority_flagged,
    amber_alert,
    agency_only,
    page = 1,
    limit = 20,
  } = req.query;

  const officer = req.leOfficer;

  const where = {};

  if (status) where.status = status;
  if (case_type) where.case_type = case_type;
  if (priority_flagged === 'true') where.is_priority_flagged = true;
  if (amber_alert === 'true') where.amber_alert = true;

  // Filter by agency's allowed case types
  const agency = await LawEnforcementAgency.findByPk(officer.agency_id);
  if (agency.allowed_case_types && agency.allowed_case_types.length > 0) {
    where.case_type = { [Op.in]: agency.allowed_case_types };
  }

  // Optionally filter to agency's own cases
  if (agency_only === 'true') {
    where.law_enforcement_agency_id = officer.agency_id;
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows: cases } = await Case.findAndCountAll({
    where,
    include: [
      {
        model: Photo,
        as: 'photos',
        limit: 1,
        where: { is_primary: true },
        required: false,
      },
    ],
    order: [
      ['is_priority_flagged', 'DESC'],
      ['amber_alert', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    limit: parseInt(limit),
    offset,
  });

  res.json({
    success: true,
    data: {
      cases,
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(count / parseInt(limit)),
    },
  });
});

/**
 * Get single case details for law enforcement
 * @route GET /api/v1/law-enforcement/cases/:id
 */
const getLECaseDetail = asyncHandler(async (req, res) => {
  const caseRecord = await Case.findByPk(req.params.id, {
    include: [
      { model: Photo, as: 'photos' },
      { model: User, as: 'poster', attributes: ['id', 'first_name', 'last_name', 'phone'] },
      {
        model: LawEnforcementAgency,
        as: 'law_enforcement_agency',
        required: false,
      },
    ],
  });

  if (!caseRecord) {
    return res.status(404).json({
      success: false,
      message: 'Case not found',
    });
  }

  // Log access
  await AuditLog.create({
    user_id: req.leOfficer.id,
    user_type: 'law_enforcement',
    action: 'view',
    resource_type: 'case',
    resource_id: caseRecord.id,
    details: { agency_id: req.leOfficer.agency_id },
  });

  res.json({
    success: true,
    data: { case: caseRecord },
  });
});

// ==========================================
// COMPLIANCE REPORTING
// ==========================================

/**
 * Generate compliance report
 * @route GET /api/v1/law-enforcement/reports/compliance
 */
const getComplianceReport = asyncHandler(async (req, res) => {
  const { start_date, end_date, report_type = 'summary' } = req.query;

  const officer = req.leOfficer;

  if (!officer.hasPermission('generate_reports')) {
    return res.status(403).json({
      success: false,
      message: 'Report generation permission not granted',
    });
  }

  const startDate = start_date ? new Date(start_date) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const endDate = end_date ? new Date(end_date) : new Date();

  const agency = await LawEnforcementAgency.findByPk(officer.agency_id);

  // Get case statistics
  const caseStats = await Case.findAll({
    where: {
      law_enforcement_agency_id: agency.id,
      createdAt: { [Op.between]: [startDate, endDate] },
    },
    attributes: [
      'status',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
    ],
    group: ['status'],
  });

  // Get resolution statistics
  const resolutionStats = await Case.findAll({
    where: {
      law_enforcement_agency_id: agency.id,
      resolved_at: { [Op.between]: [startDate, endDate] },
    },
    attributes: [
      'case_type',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('AVG',
        sequelize.fn('EXTRACT', sequelize.literal("EPOCH FROM (resolved_at - \"createdAt\")"))
      ), 'avg_resolution_seconds'],
    ],
    group: ['case_type'],
  });

  // Get officer activity
  const officerActivity = await AuditLog.findAll({
    where: {
      user_type: 'law_enforcement',
      user_id: { [Op.in]: sequelize.literal(`(SELECT id FROM law_enforcement_officers WHERE agency_id = '${agency.id}')`) },
      createdAt: { [Op.between]: [startDate, endDate] },
    },
    attributes: [
      'action',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
    ],
    group: ['action'],
  });

  // Get priority flags issued
  const priorityFlags = await Case.count({
    where: {
      priority_flagged_by: { [Op.in]: sequelize.literal(`(SELECT id FROM law_enforcement_officers WHERE agency_id = '${agency.id}')`) },
      priority_flagged_at: { [Op.between]: [startDate, endDate] },
    },
  });

  const report = {
    agency: {
      id: agency.id,
      name: agency.name,
      jurisdiction: agency.jurisdiction,
    },
    period: {
      start: startDate,
      end: endDate,
    },
    statistics: {
      cases_by_status: caseStats.reduce((acc, s) => {
        acc[s.status] = parseInt(s.dataValues.count);
        return acc;
      }, {}),
      resolutions: resolutionStats.map(s => ({
        case_type: s.case_type,
        count: parseInt(s.dataValues.count),
        avg_resolution_days: s.dataValues.avg_resolution_seconds
          ? (parseFloat(s.dataValues.avg_resolution_seconds) / 86400).toFixed(1)
          : null,
      })),
      officer_activity: officerActivity.reduce((acc, a) => {
        acc[a.action] = parseInt(a.dataValues.count);
        return acc;
      }, {}),
      priority_flags_issued: priorityFlags,
    },
    generated_at: new Date(),
    generated_by: {
      officer_id: officer.id,
      name: `${officer.first_name} ${officer.last_name}`,
    },
  };

  // Log report generation
  await AuditLog.create({
    user_id: officer.id,
    user_type: 'law_enforcement',
    action: 'generate_report',
    resource_type: 'compliance_report',
    resource_id: agency.id,
    details: { period: { start: startDate, end: endDate } },
  });

  res.json({
    success: true,
    data: { report },
  });
});

/**
 * Get activity report for an agency
 * @route GET /api/v1/law-enforcement/reports/activity
 */
const getActivityReport = asyncHandler(async (req, res) => {
  const { start_date, end_date, officer_id } = req.query;

  const officerReq = req.leOfficer;

  if (!officerReq.hasPermission('view_reports')) {
    return res.status(403).json({
      success: false,
      message: 'Report viewing permission not granted',
    });
  }

  const startDate = start_date ? new Date(start_date) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const endDate = end_date ? new Date(end_date) : new Date();

  const where = {
    user_type: 'law_enforcement',
    createdAt: { [Op.between]: [startDate, endDate] },
  };

  if (officer_id) {
    where.user_id = officer_id;
  } else {
    // Get all officers in agency
    const officers = await LawEnforcementOfficer.findAll({
      where: { agency_id: officerReq.agency_id },
      attributes: ['id'],
    });
    where.user_id = { [Op.in]: officers.map(o => o.id) };
  }

  const activities = await AuditLog.findAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: 500,
  });

  res.json({
    success: true,
    data: {
      activities,
      period: { start: startDate, end: endDate },
    },
  });
});

module.exports = {
  // Agency management
  registerAgency,
  getAgency,
  verifyAgency,
  // Officer authentication
  registerOfficer,
  officerLogin,
  verifyOfficer,
  // Case operations
  bulkImportCases,
  flagPriority,
  removePriorityFlag,
  getLECases,
  getLECaseDetail,
  // Reporting
  getComplianceReport,
  getActivityReport,
};
