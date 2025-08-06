 
const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authorize, checkTaskAccess } = require('../middleware/auth');
const { generateUIN } = require('../utils/helpers');
const auditService = require('../services/auditService');
const notificationService = require('../services/notificationService');

const router = express.Router();
const prisma = new PrismaClient();

// Get dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let whereClause = {};
    
    // Filter based on user role
    if (['PRODUCT_USER', 'PRODUCT_ADMIN'].includes(userRole)) {
      whereClause = {
        OR: [
          { createdBy: userId },
          { assignedProductIds: { has: userId } }
        ]
      };
    } else if (userRole === 'COMPLIANCE_USER') {
      whereClause = { assignedComplianceId: userId };
    } else if (!['ADMIN', 'SENIOR_MANAGER', 'COMPLIANCE_ADMIN'].includes(userRole)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get counts
    const [
      approvedNotPublished,
      productReviewRequired,
      complianceReviewRequired,
      totalTasks
    ] = await Promise.all([
      prisma.task.count({
        where: { ...whereClause, status: 'APPROVED' }
      }),
      prisma.task.count({
        where: { ...whereClause, status: 'PRODUCT_REVIEW' }
      }),
      prisma.task.count({
        where: { ...whereClause, status: 'COMPLIANCE_REVIEW' }
      }),
      prisma.task.count({ where: whereClause })
    ]);

    // Get recent tasks
    const recentTasks = await prisma.task.findMany({
      where: whereClause,
      orderBy: { updatedAt: 'desc' },
      take: 10,
      include: {
        creator: { select: { fullName: true, username: true } },
        assignedProducts: { select: { fullName: true, username: true } },
        assignedCompliance: { select: { fullName: true, username: true } },
        _count: { select: { versions: true, comments: true } }
      }
    });

    res.json({
      metrics: {
        approvedNotPublished,
        productReviewRequired,
        complianceReviewRequired,
        totalTasks
      },
      recentTasks
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ message: 'Failed to fetch dashboard data' });
  }
});

// Get all tasks with filters
router.get('/', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().isString().trim(),
  query('status').optional().isIn(['OPEN', 'COMPLIANCE_REVIEW', 'PRODUCT_REVIEW', 'APPROVED', 'PUBLISHED', 'CLOSED_INTERNAL', 'CLOSED_EXCHANGE', 'EXPIRED']),
  query('taskType').optional().isIn(['INTERNAL', 'EXCHANGE'])
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
      status,
      taskType,
      createdBy,
      assignedTo,
      dateFrom,
      dateTo,
      expiryFrom,
      expiryTo
    } = req.query;

    const userId = req.user.id;
    const userRole = req.user.role;

    let whereClause = {};

    // Role-based filtering
    if (['PRODUCT_USER', 'PRODUCT_ADMIN'].includes(userRole)) {
      whereClause.OR = [
        { createdBy: userId },
        { assignedProductIds: { has: userId } }
      ];
    } else if (userRole === 'COMPLIANCE_USER') {
      whereClause.assignedComplianceId = userId;
    }
    // ADMIN, SENIOR_MANAGER, COMPLIANCE_ADMIN can see all tasks

    // Apply filters
    if (search) {
      whereClause.OR = [
        ...(whereClause.OR || []),
        { title: { contains: search, mode: 'insensitive' } },
        { uin: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (status) whereClause.status = status;
    if (taskType) whereClause.taskType = taskType;
    if (createdBy) whereClause.createdBy = createdBy;
    
    if (dateFrom || dateTo) {
      whereClause.createdAt = {};
      if (dateFrom) whereClause.createdAt.gte = new Date(dateFrom);
      if (dateTo) whereClause.createdAt.lte = new Date(dateTo);
    }

    if (expiryFrom || expiryTo) {
      whereClause.expiryDate = {};
      if (expiryFrom) whereClause.expiryDate.gte = new Date(expiryFrom);
      if (expiryTo) whereClause.expiryDate.lte = new Date(expiryTo);
    }

    const [tasks, totalCount] = await Promise.all([
      prisma.task.findMany({
        where: whereClause,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          creator: { select: { fullName: true, username: true } },
          assignedProducts: { select: { fullName: true, username: true } },
          assignedCompliance: { select: { fullName: true, username: true } },
          exchangeApprovals: {
            select: { exchangeName: true, referenceNumber: true, approvalStatus: true }
          },
          _count: { select: { versions: true, comments: true } }
        }
      }),
      prisma.task.count({ where: whereClause })
    ]);

    res.json({
      tasks,
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
    console.error('Get tasks error:', error);
    res.status(500).json({ message: 'Failed to fetch tasks' });
  }
});

// Get task by ID
router.get('/:taskId', checkTaskAccess, async (req, res) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.taskId },
      include: {
        creator: { select: { fullName: true, username: true, email: true } },
        assignedProducts: { select: { id: true, fullName: true, username: true, email: true } },
        assignedCompliance: { select: { id: true, fullName: true, username: true, email: true } },
        versions: {
          orderBy: { uploadedAt: 'desc' },
          include: {
            uploadedBy: { select: { fullName: true, username: true } },
            comments: {
              orderBy: { createdAt: 'desc' },
              include: {
                author: { select: { fullName: true, username: true, role: true } }
              }
            }
          }
        },
        comments: {
          where: { isGlobal: true },
          orderBy: { createdAt: 'desc' },
          include: {
            author: { select: { fullName: true, username: true, role: true } }
          }
        },
        exchangeApprovals: {
          orderBy: { createdAt: 'asc' },
          include: {
            updatedBy: { select: { fullName: true, username: true } }
          }
        }
      }
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    res.json(task);

  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ message: 'Failed to fetch task' });
  }
});

// Create new task
router.post('/', [
  authorize('PRODUCT_USER', 'PRODUCT_ADMIN', 'ADMIN'),
  body('title').notEmpty().withMessage('Title is required').isLength({ max: 200 }),
  body('description').optional().isLength({ max: 1000 }),
  body('assignedProductIds').isArray().withMessage('Assigned products must be an array'),
  body('expectedPublishDate').optional().isISO8601(),
  body('platform').optional().isString(),
  body('category').optional().isString(),
  body('remarks').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      title,
      description,
      assignedProductIds,
      expectedPublishDate,
      platform,
      category,
      remarks
    } = req.body;

    // Verify assigned users exist and are product users
    if (assignedProductIds.length > 0) {
      const assignedUsers = await prisma.user.findMany({
        where: {
          id: { in: assignedProductIds },
          role: { in: ['PRODUCT_USER', 'PRODUCT_ADMIN'] },
          isActive: true
        }
      });

      if (assignedUsers.length !== assignedProductIds.length) {
        return res.status(400).json({ message: 'Invalid assigned product users' });
      }
    }

    // Auto-assign to a compliance user (round-robin)
    const availableComplianceUsers = await prisma.user.findMany({
      where: {
        role: { in: ['COMPLIANCE_USER', 'COMPLIANCE_ADMIN'] },
        isActive: true,
        NOT: {
          absences: {
            some: {
              AND: [
                { fromDate: { lte: new Date() } },
                { toDate: { gte: new Date() } }
              ]
            }
          }
        }
      },
      include: {
        complianceTasks: {
          where: { status: { in: ['OPEN', 'COMPLIANCE_REVIEW'] } }
        }
      }
    });

    if (availableComplianceUsers.length === 0) {
      return res.status(400).json({ message: 'No available compliance users' });
    }

    // Select user with least pending tasks
    const assignedCompliance = availableComplianceUsers.reduce((prev, current) =>
      (prev.complianceTasks.length < current.complianceTasks.length) ? prev : current
    );

    // Generate UIN
    const uin = await generateUIN();

    // Create task
    const task = await prisma.task.create({
      data: {
        uin,
        title,
        description,
        expectedPublishDate: expectedPublishDate ? new Date(expectedPublishDate) : null,
        platform,
        category,
        remarks,
        createdBy: req.user.id,
        assignedProductIds,
        assignedComplianceId: assignedCompliance.id
      },
      include: {
        creator: { select: { fullName: true, username: true } },
        assignedProducts: { select: { fullName: true, username: true } },
        assignedCompliance: { select: { fullName: true, username: true } }
      }
    });

    // Create audit log
    await auditService.log({
      action: 'TASK_CREATED',
      details: `Task "${title}" created with UIN: ${uin}`,
      performedBy: req.user.id,
      taskId: task.id
    });

    // Send notification to assigned compliance user
    await notificationService.sendTaskAssignedNotification(
      assignedCompliance.id,
      task.id,
      task.title
    );

    res.status(201).json({
      message: 'Task created successfully',
      task
    });

  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ message: 'Failed to create task' });
  }
});

// Update task
router.put('/:taskId', [
  checkTaskAccess,
  body('title').optional().isLength({ max: 200 }),
  body('description').optional().isLength({ max: 1000 }),
  body('taskType').optional().isIn(['INTERNAL', 'EXCHANGE']),
  body('status').optional().isIn(['OPEN', 'COMPLIANCE_REVIEW', 'PRODUCT_REVIEW', 'APPROVED', 'PUBLISHED', 'CLOSED_INTERNAL', 'CLOSED_EXCHANGE']),
  body('approvalDate').optional().isISO8601(),
  body('expiryDate').optional().isISO8601(),
  body('publishDate').optional().isISO8601(),
  body('closureComments').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const taskId = req.params.taskId;
    const userId = req.user.id;
    const userRole = req.user.role;
    
    const currentTask = await prisma.task.findUnique({
      where: { id: taskId }
    });

    if (!currentTask) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const updateData = { ...req.body };
    
    // Role-based update restrictions
    if (['PRODUCT_USER', 'PRODUCT_ADMIN'].includes(userRole)) {
      // Product users can only update description and status to limited values
      const allowedFields = ['description'];
      updateData = Object.fromEntries(
        Object.entries(updateData).filter(([key]) => allowedFields.includes(key))
      );
    }

    // Handle status changes
    if (req.body.status && req.body.status !== currentTask.status) {
      const oldStatus = currentTask.status;
      const newStatus = req.body.status;

      // Validate status transitions
      const validTransitions = {
        'OPEN': ['COMPLIANCE_REVIEW', 'CLOSED_INTERNAL', 'CLOSED_EXCHANGE'],
        'COMPLIANCE_REVIEW': ['PRODUCT_REVIEW', 'APPROVED', 'CLOSED_INTERNAL', 'CLOSED_EXCHANGE'],
        'PRODUCT_REVIEW': ['COMPLIANCE_REVIEW', 'CLOSED_INTERNAL', 'CLOSED_EXCHANGE'],
        'APPROVED': ['PUBLISHED', 'CLOSED_INTERNAL', 'CLOSED_EXCHANGE'],
        'PUBLISHED': ['CLOSED_INTERNAL', 'CLOSED_EXCHANGE']
      };

      if (!validTransitions[oldStatus]?.includes(newStatus)) {
        return res.status(400).json({ 
          message: `Invalid status transition from ${oldStatus} to ${newStatus}` 
        });
      }

      // Mandatory fields for certain statuses
      if (newStatus === 'APPROVED') {
        if (!req.body.approvalDate || !req.body.expiryDate) {
          return res.status(400).json({ 
            message: 'Approval date and expiry date are required when marking as approved' 
          });
        }
      }

      if (newStatus === 'PUBLISHED') {
        if (!req.body.publishDate) {
          return res.status(400).json({ 
            message: 'Publish date is required when marking as published' 
          });
        }
      }

      if (['CLOSED_INTERNAL', 'CLOSED_EXCHANGE'].includes(newStatus)) {
        if (!req.body.closureComments) {
          return res.status(400).json({ 
            message: 'Closure comments are required when closing task' 
          });
        }
        updateData.closureDate = new Date();
      }

      // Send notifications on status change
      if (newStatus === 'PRODUCT_REVIEW') {
        // Notify assigned product users
        for (const productId of currentTask.assignedProductIds) {
          await notificationService.sendNotification({
            userId: productId,
            title: 'Task Review Required',
            message: `Task "${currentTask.title}" requires your review`,
            type: 'TASK_ASSIGNED',
            taskId: currentTask.id
          });
        }
      } else if (newStatus === 'COMPLIANCE_REVIEW') {
        // Notify compliance user
        if (currentTask.assignedComplianceId) {
          await notificationService.sendNotification({
            userId: currentTask.assignedComplianceId,
            title: 'New Version Uploaded',
            message: `New version uploaded for task "${currentTask.title}"`,
            type: 'VERSION_UPLOADED',
            taskId: currentTask.id
          });
        }
      }
    }

    // Update task
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: {
        creator: { select: { fullName: true, username: true } },
        assignedProducts: { select: { fullName: true, username: true } },
        assignedCompliance: { select: { fullName: true, username: true } }
      }
    });

    // Create audit log
    await auditService.log({
      action: 'TASK_UPDATED',
      details: `Task updated: ${Object.keys(updateData).join(', ')}`,
      performedBy: userId,
      taskId
    });

    res.json({
      message: 'Task updated successfully',
      task: updatedTask
    });

  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ message: 'Failed to update task' });
  }
});

// Upload new version
router.post('/:taskId/versions', [
  checkTaskAccess,
  authorize('PRODUCT_USER', 'PRODUCT_ADMIN', 'ADMIN'),
  body('fileUrls').isArray().withMessage('File URLs must be an array'),
  body('remarks').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const taskId = req.params.taskId;
    const { fileUrls, remarks } = req.body;
    const userId = req.user.id;

    // Get current task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { versions: { orderBy: { uploadedAt: 'desc' }, take: 1 } }
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Generate next version number
    let versionNumber = '1.0';
    if (task.versions.length > 0) {
      const lastVersion = task.versions[0].versionNumber;
      const [major, minor] = lastVersion.split('.').map(Number);
      versionNumber = `${major}.${minor + 1}`;
    }

    // Create version
    const version = await prisma.version.create({
      data: {
        versionNumber,
        fileUrls,
        remarks,
        taskId,
        uploadedById: userId
      },
      include: {
        uploadedBy: { select: { fullName: true, username: true } }
      }
    });

    // Update task status to COMPLIANCE_REVIEW
    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'COMPLIANCE_REVIEW' }
    });

    // Create audit log
    await auditService.log({
      action: 'VERSION_UPLOADED',
      details: `Version ${versionNumber} uploaded with ${fileUrls.length} files`,
      performedBy: userId,
      taskId
    });

    // Notify compliance user
    if (task.assignedComplianceId) {
      await notificationService.sendNotification({
        userId: task.assignedComplianceId,
        title: 'New Version Uploaded',
        message: `Version ${versionNumber} uploaded for task "${task.title}"`,
        type: 'VERSION_UPLOADED',
        taskId
      });
    }

    res.status(201).json({
      message: 'Version uploaded successfully',
      version
    });

  } catch (error) {
    console.error('Upload version error:', error);
    res.status(500).json({ message: 'Failed to upload version' });
  }
});

// Add comment
router.post('/:taskId/comments', [
  checkTaskAccess,
  body('content').notEmpty().withMessage('Comment content is required'),
  body('versionId').optional().isString(),
  body('isGlobal').optional().isBoolean(),
  body('attachments').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const taskId = req.params.taskId;
    const { content, versionId, isGlobal = false, attachments = [] } = req.body;
    const userId = req.user.id;

    // Verify version exists if provided
    if (versionId) {
      const version = await prisma.version.findFirst({
        where: { id: versionId, taskId }
      });
      if (!version) {
        return res.status(400).json({ message: 'Version not found' });
      }
    }

    // Create comment
    const comment = await prisma.comment.create({
      data: {
        content,
        attachments,
        isGlobal,
        taskId,
        versionId: versionId || null,
        authorId: userId
      },
      include: {
        author: { select: { fullName: true, username: true, role: true } },
        version: { select: { versionNumber: true } }
      }
    });

    // Update task status if compliance user is commenting
    if (['COMPLIANCE_USER', 'COMPLIANCE_ADMIN'].includes(req.user.role)) {
      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (task.status === 'COMPLIANCE_REVIEW') {
        await prisma.task.update({
          where: { id: taskId },
          data: { status: 'PRODUCT_REVIEW' }
        });

        // Notify assigned product users
        const taskWithAssignments = await prisma.task.findUnique({
          where: { id: taskId }
        });
        
        for (const productId of taskWithAssignments.assignedProductIds) {
          await notificationService.sendNotification({
            userId: productId,
            title: 'Comment Added',
            message: `New comment added to task "${task.title}"`,
            type: 'COMMENT_ADDED',
            taskId
          });
        }
      }
    }

    // Create audit log
    await auditService.log({
      action: 'COMMENT_ADDED',
      details: `Comment added${versionId ? ` to version ${comment.version?.versionNumber}` : ' as global comment'}`,
      performedBy: userId,
      taskId
    });

    res.status(201).json({
      message: 'Comment added successfully',
      comment
    });

  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ message: 'Failed to add comment' });
  }
});

// Exchange approval management
router.post('/:taskId/exchange-approvals', [
  checkTaskAccess,
  authorize('COMPLIANCE_USER', 'COMPLIANCE_ADMIN', 'ADMIN'),
  body('exchangeName').isIn(['NSE', 'BSE', 'MCX', 'NCDEX']).withMessage('Invalid exchange name'),
  body('typeOfContent').notEmpty().withMessage('Type of content is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const taskId = req.params.taskId;
    const { exchangeName, typeOfContent } = req.body;
    const userId = req.user.id;

    // Verify task type is EXCHANGE
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (task.taskType !== 'EXCHANGE') {
      return res.status(400).json({ message: 'Task must be of type EXCHANGE' });
    }

    // Check if exchange entry already exists
    const existingEntry = await prisma.exchangeApproval.findFirst({
      where: { taskId, exchangeName }
    });

    if (existingEntry) {
      return res.status(400).json({ message: 'Exchange entry already exists' });
    }

    // Create exchange approval entry
    const exchangeApproval = await prisma.exchangeApproval.create({
      data: {
        exchangeName,
        typeOfContent,
        taskId,
        updatedById: userId
      },
      include: {
        updatedBy: { select: { fullName: true, username: true } }
      }
    });

    // Create audit log
    await auditService.log({
      action: 'EXCHANGE_APPROVAL_ADDED',
      details: `Exchange approval entry added for ${exchangeName}`,
      performedBy: userId,
      taskId
    });

    res.status(201).json({
      message: 'Exchange approval entry added successfully',
      exchangeApproval
    });

  } catch (error) {
    console.error('Add exchange approval error:', error);
    res.status(500).json({ message: 'Failed to add exchange approval entry' });
  }
});

// Update exchange approval
router.put('/:taskId/exchange-approvals/:approvalId', [
  checkTaskAccess,
  authorize('COMPLIANCE_USER', 'COMPLIANCE_ADMIN', 'ADMIN'),
  body('approvalStatus').optional().isIn(['APPROVED', 'PENDING', 'REJECTED', 'NOT_SENT']),
  body('approvalDate').optional().isISO8601(),
  body('expiryDate').optional().isISO8601(),
  body('referenceNumber').optional().isString(),
  body('approvalEmailUrl').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { approvalId } = req.params;
    const userId = req.user.id;
    const updateData = { ...req.body, updatedById: userId };

    // Validation for APPROVED status
    if (req.body.approvalStatus === 'APPROVED') {
      if (!req.body.approvalDate || !req.body.referenceNumber) {
        return res.status(400).json({ 
          message: 'Approval date and reference number are required for approved status' 
        });
      }
    }

    // Update exchange approval
    const exchangeApproval = await prisma.exchangeApproval.update({
      where: { id: approvalId },
      data: updateData,
      include: {
        updatedBy: { select: { fullName: true, username: true } }
      }
    });

    // Create audit log
    await auditService.log({
      action: 'EXCHANGE_APPROVAL_UPDATED',
      details: `Exchange approval updated for ${exchangeApproval.exchangeName}`,
      performedBy: userId,
      taskId: req.params.taskId
    });

    res.json({
      message: 'Exchange approval updated successfully',
      exchangeApproval
    });

  } catch (error) {
    console.error('Update exchange approval error:', error);
    res.status(500).json({ message: 'Failed to update exchange approval' });
  }
});

module.exports = router;