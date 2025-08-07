// routes/users.js - Fixed with proper route ordering
const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult, query } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authorize } = require('../middleware/auth');
const auditService = require('../services/auditService');

const router = express.Router();
const prisma = new PrismaClient();

// Helper function to validate MongoDB ObjectId
const isValidObjectId = (id) => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

// Middleware to validate ObjectId parameters
const validateObjectIdParam = (paramName) => {
  return (req, res, next) => {
    const id = req.params[paramName];
    console.log(`Validating ${paramName}:`, id); // Debug log
    
    if (!id || !isValidObjectId(id)) {
      return res.status(400).json({
        message: `Invalid ${paramName}. Must be a valid MongoDB ObjectId (24 hex characters).`,
        received: id,
        example: "507f1f77bcf86cd799439011"
      });
    }
    next();
  };
};

// **IMPORTANT: Place specific routes BEFORE parameterized routes**

// Get user profile (own profile) - specific route first
router.get('/profile/me', async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        team: true,
        lastLogin: true,
        createdAt: true,
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

    res.json(user);

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
});

// Update user profile (own profile) - specific route
router.put('/profile/me', [
  body('email').optional().isEmail(),
  body('fullName').optional().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const { email, fullName } = req.body;

    const updateData = {};
    if (email) updateData.email = email;
    if (fullName) updateData.fullName = fullName;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    // Check email uniqueness if updating email
    if (email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email,
          id: { not: userId }
        }
      });
      
      if (existingUser) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        team: true,
        updatedAt: true
      }
    });

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

// ABSENCE MANAGEMENT ROUTES - All specific routes
// Get absences - specific route
router.get('/absences', [
  authorize('COMPLIANCE_ADMIN', 'ADMIN')
], async (req, res) => {
  try {
    console.log('Getting absences...'); // Debug log
    
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

// Add absence - specific route
router.post('/absences', [
  authorize('COMPLIANCE_ADMIN', 'ADMIN'),
  body('userId')
    .notEmpty()
    .withMessage('User ID is required')
    .custom((value) => {
      if (!isValidObjectId(value)) {
        throw new Error('Invalid user ID format');
      }
      return true;
    }),
  body('fromDate')
    .isISO8601()
    .withMessage('Valid from date is required'),
  body('toDate')
    .isISO8601()
    .withMessage('Valid to date is required'),
  body('reason')
    .optional()
    .isString()
    .trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId, fromDate, toDate, reason } = req.body;
    
    console.log('Adding absence for user:', userId); // Debug log

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
    if (auditService.log) {
      await auditService.log({
        action: 'ABSENCE_CREATED',
        details: `Absence marked for ${user.fullName} from ${fromDate} to ${toDate}`,
        performedBy: req.user.id
      });
    }

    res.status(201).json({
      message: 'Absence recorded successfully',
      absence
    });

  } catch (error) {
    console.error('Add absence error:', error);
    res.status(500).json({ 
      message: 'Failed to add absence',
      error: error.message 
    });
  }
});

// Delete absence - specific route with ObjectId validation
router.delete('/absences/:absenceId', 
  validateObjectIdParam('absenceId'),
  authorize('COMPLIANCE_ADMIN', 'ADMIN'),
  async (req, res) => {
    try {
      const absenceId = req.params.absenceId;
      
      console.log('Deleting absence:', absenceId); // Debug log

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
      if (auditService.log) {
        await auditService.log({
          action: 'ABSENCE_DELETED',
          details: `Absence deleted for ${absence.user.fullName}`,
          performedBy: req.user.id
        });
      }

      res.json({ message: 'Absence deleted successfully' });

    } catch (error) {
      console.error('Delete absence error:', error);
      res.status(500).json({ 
        message: 'Failed to delete absence',
        error: error.message 
      });
    }
  }
);

// Get all users (with role-based filtering)
router.get('/', [
  authorize('PRODUCT_ADMIN', 'COMPLIANCE_ADMIN', 'SENIOR_MANAGER', 'ADMIN'),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().isString().trim(),
  query('role').optional().isIn(['PRODUCT_USER', 'PRODUCT_ADMIN', 'COMPLIANCE_USER', 'COMPLIANCE_ADMIN', 'SENIOR_MANAGER', 'ADMIN']),
  query('isActive').optional().isBoolean().toBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      page = 1,
      limit = 20,
      search,
      role,
      isActive,
      team
    } = req.query;

    const userRole = req.user.role;
    let whereClause = {};

    // Role-based filtering
    if (userRole === 'PRODUCT_ADMIN') {
      whereClause.role = { in: ['PRODUCT_USER', 'PRODUCT_ADMIN'] };
      if (req.user.team) {
        whereClause.team = req.user.team;
      }
    } else if (userRole === 'COMPLIANCE_ADMIN') {
      whereClause.role = { in: ['COMPLIANCE_USER', 'COMPLIANCE_ADMIN'] };
    }
    // ADMIN and SENIOR_MANAGER can see all users

    // Apply filters
    if (search) {
      whereClause.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (role) whereClause.role = role;
    if (typeof isActive === 'boolean') whereClause.isActive = isActive;
    if (team) whereClause.team = team;

    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
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
          _count: {
            select: {
              createdTasks: true,
              complianceTasks: true
            }
          }
        }
      }),
      prisma.user.count({ where: whereClause })
    ]);

    res.json({
      users,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNext: page * limit < totalCount,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// Get user by ID - MUST be last parameterized route
router.get('/:userId', 
  validateObjectIdParam('userId'),
  authorize('PRODUCT_ADMIN', 'COMPLIANCE_ADMIN', 'SENIOR_MANAGER', 'ADMIN'),
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const requestingUserRole = req.user.role;
      
      console.log('Getting user by ID:', userId); // Debug log

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
      res.status(500).json({ 
        message: 'Failed to fetch user',
        error: error.message 
      });
    }
  }
);

// Create new user
router.post('/', [
  authorize('PRODUCT_ADMIN', 'COMPLIANCE_ADMIN', 'ADMIN'),
  body('username').isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('fullName').notEmpty().withMessage('Full name is required'),
  body('role').isIn(['PRODUCT_USER', 'PRODUCT_ADMIN', 'COMPLIANCE_USER', 'COMPLIANCE_ADMIN', 'SENIOR_MANAGER', 'ADMIN'])
    .withMessage('Invalid role'),
  body('team').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, fullName, role, team } = req.body;
    const requestingUserRole = req.user.role;

    // Role-based creation restrictions
    if (requestingUserRole === 'PRODUCT_ADMIN') {
      if (!['PRODUCT_USER', 'PRODUCT_ADMIN'].includes(role)) {
        return res.status(403).json({ message: 'Can only create product users' });
      }
    } else if (requestingUserRole === 'COMPLIANCE_ADMIN') {
      if (!['COMPLIANCE_USER', 'COMPLIANCE_ADMIN'].includes(role)) {
        return res.status(403).json({ message: 'Can only create compliance users' });
      }
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          { email }
        ]
      }
    });

    if (existingUser) {
      return res.status(400).json({ 
        message: 'User already exists',
        field: existingUser.username === username ? 'username' : 'email'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        fullName,
        role,
        team: team || null
      },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        team: true,
        createdAt: true
      }
    });

    // Create audit log
    if (auditService.log) {
      await auditService.log({
        action: 'USER_CREATED',
        details: `User "${username}" created with role ${role}`,
        performedBy: req.user.id
      });
    }

    res.status(201).json({
      message: 'User created successfully',
      user
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Failed to create user' });
  }
});

// Update user - parameterized route
router.put('/:userId', 
  validateObjectIdParam('userId'),
  authorize('PRODUCT_ADMIN', 'COMPLIANCE_ADMIN', 'ADMIN'),
  [
    body('email').optional().isEmail(),
    body('fullName').optional().notEmpty(),
    body('role').optional().isIn(['PRODUCT_USER', 'PRODUCT_ADMIN', 'COMPLIANCE_USER', 'COMPLIANCE_ADMIN', 'SENIOR_MANAGER', 'ADMIN']),
    body('isActive').optional().isBoolean(),
    body('team').optional().isString()
  ], 
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.params.userId;
      const requestingUserRole = req.user.role;
      const updateData = { ...req.body };

      // Get current user data
      const currentUser = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!currentUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Role-based update restrictions
      if (requestingUserRole === 'PRODUCT_ADMIN') {
        if (!['PRODUCT_USER', 'PRODUCT_ADMIN'].includes(currentUser.role)) {
          return res.status(403).json({ message: 'Can only update product users' });
        }
        if (updateData.role && !['PRODUCT_USER', 'PRODUCT_ADMIN'].includes(updateData.role)) {
          return res.status(403).json({ message: 'Can only assign product roles' });
        }
      } else if (requestingUserRole === 'COMPLIANCE_ADMIN') {
        if (!['COMPLIANCE_USER', 'COMPLIANCE_ADMIN'].includes(currentUser.role)) {
          return res.status(403).json({ message: 'Can only update compliance users' });
        }
        if (updateData.role && !['COMPLIANCE_USER', 'COMPLIANCE_ADMIN'].includes(updateData.role)) {
          return res.status(403).json({ message: 'Can only assign compliance roles' });
        }
      }

      // Remove undefined fields
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      // Update user
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          username: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          team: true,
          updatedAt: true
        }
      });

      // Create audit log
      if (auditService.log) {
        await auditService.log({
          action: 'USER_UPDATED',
          details: `User "${currentUser.username}" updated: ${Object.keys(updateData).join(', ')}`,
          performedBy: req.user.id
        });
      }

      res.json({
        message: 'User updated successfully',
        user: updatedUser
      });

    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({ message: 'Failed to update user' });
    }
  }
);

// Reset user password
router.post('/:userId/reset-password', 
  validateObjectIdParam('userId'),
  authorize('ADMIN'),
  [
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  ], 
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.params.userId;
      const { newPassword } = req.body;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true }
      });

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Update password
      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword }
      });

      // Create audit log
      if (auditService.log) {
        await auditService.log({
          action: 'PASSWORD_RESET',
          details: `Password reset for user "${user.username}"`,
          performedBy: req.user.id
        });
      }

      res.json({ message: 'Password reset successfully' });

    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ message: 'Failed to reset password' });
    }
  }
);

module.exports = router;