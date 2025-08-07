// middleware/validation.js - Enhanced ObjectID validation
const { body, param, query, validationResult } = require('express-validator');

// MongoDB ObjectId validation middleware
const validateObjectId = (paramName) => {
  return param(paramName)
    .isMongoId()
    .withMessage(`Invalid ${paramName}. Must be a valid MongoDB ObjectId (24 hex characters).`)
    .bail();
};

// Validate multiple ObjectIds in array
const validateObjectIdArray = (fieldName) => {
  return body(fieldName)
    .isArray()
    .withMessage(`${fieldName} must be an array`)
    .custom((value) => {
      if (!Array.isArray(value)) return false;
      
      const invalidIds = value.filter(id => !/^[0-9a-fA-F]{24}$/.test(id));
      if (invalidIds.length > 0) {
        throw new Error(`Invalid ObjectIds in ${fieldName}: ${invalidIds.join(', ')}`);
      }
      return true;
    });
};

// Enhanced validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.param || error.path,
      message: error.msg,
      value: error.value,
      location: error.location
    }));

    console.error('Validation errors:', formattedErrors);
    
    return res.status(400).json({
      message: 'Validation failed',
      errors: formattedErrors,
      timestamp: new Date().toISOString()
    });
  }
  
  next();
};

module.exports = {
  validateObjectId,
  validateObjectIdArray,
  handleValidationErrors
};

// routes/users.js - Fixed user routes
const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult, query } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authorize } = require('../middleware/auth');
const { validateObjectId, handleValidationErrors } = require('../middleware/validation');
const auditService = require('../services/auditService');

const router = express.Router();
const prisma = new PrismaClient();

// Get user by ID - Fixed route with validation
router.get('/:userId', [
  validateObjectId('userId'),
  handleValidationErrors,
  authorize('PRODUCT_ADMIN', 'COMPLIANCE_ADMIN', 'SENIOR_MANAGER', 'ADMIN')
], async (req, res) => {
  try {
    const userId = req.params.userId;
    const requestingUserRole = req.user.role;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        team: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            createdTasks: true,
            complianceTasks: true,
            comments: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Role-based access control
    if (requestingUserRole === 'PRODUCT_ADMIN') {
      if (!['PRODUCT_USER', 'PRODUCT_ADMIN'].includes(user.role)) {
        return res.status(403).json({ message: 'Access denied' });
      }
    } else if (requestingUserRole === 'COMPLIANCE_ADMIN') {
      if (!['COMPLIANCE_USER', 'COMPLIANCE_ADMIN'].includes(user.role)) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    res.json(user);

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Failed to fetch user' });
  }
});

// Get absences - Fixed route
router.get('/absences', [
  authorize('COMPLIANCE_ADMIN', 'ADMIN')
], async (req, res) => {
  try {
    const absences = await prisma.absence.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { fullName: true, username: true } },
        createdBy: { select: { fullName: true, username: true } }
      }
    });

    res.json(absences);

  } catch (error) {
    console.error('Get absences error:', error);
    res.status(500).json({ message: 'Failed to fetch absences' });
  }
});

// Add absence - Fixed validation
router.post('/absences', [
  authorize('COMPLIANCE_ADMIN', 'ADMIN'),
  body('userId')
    .isMongoId()
    .withMessage('Valid user ID is required'),
  body('fromDate')
    .isISO8601()
    .withMessage('Valid from date is required'),
  body('toDate')
    .isISO8601()
    .withMessage('Valid to date is required'),
  body('reason')
    .optional()
    .isString()
    .trim(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { userId, fromDate, toDate, reason } = req.body;

    // Verify user exists and is compliance user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, fullName: true, username: true }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!['COMPLIANCE_USER', 'COMPLIANCE_ADMIN'].includes(user.role)) {
      return res.status(400).json({ message: 'Can only mark compliance users as absent' });
    }

    // Validate date range
    if (new Date(fromDate) >= new Date(toDate)) {
      return res.status(400).json({ message: 'From date must be before to date' });
    }

    // Check for overlapping absences
    const overlappingAbsence = await prisma.absence.findFirst({
      where: {
        userId,
        OR: [
          {
            AND: [
              { fromDate: { lte: new Date(fromDate) } },
              { toDate: { gte: new Date(fromDate) } }
            ]
          },
          {
            AND: [
              { fromDate: { lte: new Date(toDate) } },
              { toDate: { gte: new Date(toDate) } }
            ]
          }
        ]
      }
    });

    if (overlappingAbsence) {
      return res.status(400).json({ message: 'Overlapping absence period exists' });
    }

    const absence = await prisma.absence.create({
      data: {
        userId,
        fromDate: new Date(fromDate),
        toDate: new Date(toDate),
        reason,
        createdById: req.user.id
      },
      include: {
        user: { select: { fullName: true, username: true } },
        createdBy: { select: { fullName: true, username: true } }
      }
    });

    // Create audit log
    await auditService.log({
      action: 'ABSENCE_CREATED',
      details: `Absence marked for ${user.fullName} from ${fromDate} to ${toDate}`,
      performedBy: req.user.id
    });

    res.status(201).json({
      message: 'Absence recorded successfully',
      absence
    });

  } catch (error) {
    console.error('Add absence error:', error);
    res.status(500).json({ message: 'Failed to add absence' });
  }
});

// Delete absence - Fixed validation
router.delete('/absences/:absenceId', [
  validateObjectId('absenceId'),
  handleValidationErrors,
  authorize('COMPLIANCE_ADMIN', 'ADMIN')
], async (req, res) => {
  try {
    const absenceId = req.params.absenceId;

    const absence = await prisma.absence.findUnique({
      where: { id: absenceId },
      include: {
        user: { select: { fullName: true } }
      }
    });

    if (!absence) {
      return res.status(404).json({ message: 'Absence not found' });
    }

    await prisma.absence.delete({
      where: { id: absenceId }
    });

    // Create audit log
    await auditService.log({
      action: 'ABSENCE_DELETED',
      details: `Absence deleted for ${absence.user.fullName}`,
      performedBy: req.user.id
    });

    res.json({ message: 'Absence deleted successfully' });

  } catch (error) {
    console.error('Delete absence error:', error);
    res.status(500).json({ message: 'Failed to delete absence' });
  }
});

module.exports = router;