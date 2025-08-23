const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authorize, checkTaskAccess } = require('../middleware/auth');
const { generateUIN } = require('../utils/helpers');
const auditService = require('../services/auditService');
const notificationService = require('../services/notificationService');

const router = express.Router();
const prisma = new PrismaClient();

// Helper function to validate MongoDB ObjectId
const isValidObjectId = (id) => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

// Debug middleware to log all requests
router.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - Params:`, req.params, 'Query:', req.query);
  next();
});

// ObjectId validation middleware
const validateObjectId = (paramName) => {
  return (req, res, next) => {
    const id = req.params[paramName];
    console.log(`Validating ${paramName}: "${id}"`);
    
    if (!id) {
      return res.status(400).json({
        message: `Missing ${paramName} parameter`,
        path: req.path,
        params: req.params
      });
    }
    
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        message: `Invalid ${paramName}. Must be a valid MongoDB ObjectId (24 hex characters).`,
        received: id,
        length: id.length,
        example: "507f1f77bcf86cd799439011"
      });
    }
    
    next();
  };
};

// Helper function to get assigned products for a task
const getAssignedProducts = async (assignedProductIds) => {
  if (!assignedProductIds || assignedProductIds.length === 0) return [];
  
  return await prisma.user.findMany({
    where: {
      id: { in: assignedProductIds }
    },
    select: {
      id: true,
      fullName: true,
      username: true,
      email: true
    }
  });
};

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
        assignedCompliance: { select: { fullName: true, username: true } },
        _count: { select: { versions: true, comments: true } }
      }
    });

    // Add assigned products manually
    const tasksWithProducts = await Promise.all(
      recentTasks.map(async (task) => {
        const assignedProducts = await getAssignedProducts(task.assignedProductIds);
        return {
          ...task,
          assignedProducts
        };
      })
    );

    res.json({
      metrics: {
        approvedNotPublished,
        productReviewRequired,
        complianceReviewRequired,
        totalTasks
      },
      recentTasks: tasksWithProducts
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
          assignedCompliance: { select: { fullName: true, username: true } },
          exchangeApprovals: {
            select: { exchangeName: true, referenceNumber: true, approvalStatus: true }
          },
          _count: { select: { versions: true, comments: true } }
        }
      }),
      prisma.task.count({ where: whereClause })
    ]);

    // Add assigned products manually
    const tasksWithProducts = await Promise.all(
      tasks.map(async (task) => {
        const assignedProducts = await getAssignedProducts(task.assignedProductIds);
        return {
          ...task,
          assignedProducts
        };
      })
    );

    res.json({
      tasks: tasksWithProducts,
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
router.get('/:taskId', 
  validateObjectId('taskId'),
  async (req, res) => {
    try {
      const taskId = req.params.taskId;
      const userId = req.user.id;
      const userRole = req.user.role;

      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          creator: { select: { fullName: true, username: true, email: true } },
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

      // Check access
      let hasAccess = false;
      if (['ADMIN', 'SENIOR_MANAGER'].includes(userRole)) {
        hasAccess = true;
      } else if (['PRODUCT_USER', 'PRODUCT_ADMIN'].includes(userRole)) {
        hasAccess = task.createdBy === userId || task.assignedProductIds.includes(userId);
      } else if (['COMPLIANCE_USER', 'COMPLIANCE_ADMIN'].includes(userRole)) {
        hasAccess = task.assignedComplianceId === userId || userRole === 'COMPLIANCE_ADMIN';
      }

      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied to this task' });
      }

      // Add assigned products manually
      const assignedProducts = await getAssignedProducts(task.assignedProductIds);

      res.json({
        ...task,
        assignedProducts
      });

    } catch (error) {
      console.error('Get task error:', error);
      res.status(500).json({ message: 'Failed to fetch task' });
    }
  }
);

// Create new task
router.post('/', [
  authorize('PRODUCT_USER', 'PRODUCT_ADMIN', 'ADMIN'),
  body('title')
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 200 })
    .withMessage('Title must not exceed 200 characters'),
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description must not exceed 1000 characters'),
  body('assignedProductIds')
    .isArray()
    .withMessage('Assigned products must be an array')
    .custom((value) => {
      if (!Array.isArray(value)) return false;
      const invalidIds = value.filter(id => !isValidObjectId(id));
      if (invalidIds.length > 0) {
        throw new Error(`Invalid ObjectIds in assignedProductIds: ${invalidIds.join(', ')}`);
      }
      return true;
    }),
  body('expectedPublishDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid expected publish date'),
  body('platform')
    .optional()
    .isString()
    .trim(),
  body('category')
    .optional()
    .isString()
    .trim(),
  body('remarks')
    .optional()
    .isString()
    .trim()
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
        assignedCompliance: { select: { fullName: true, username: true } }
      }
    });

    // Add assigned products manually
    const assignedProducts = await getAssignedProducts(task.assignedProductIds);

    // Create audit log
    await auditService.logTaskCreated(task.id, title, req.user.id);

    // Send notification to assigned compliance user
    await notificationService.sendTaskAssignedNotification(
      assignedCompliance.id,
      task.id,
      task.title
    );

    res.status(201).json({
      message: 'Task created successfully',
      task: {
        ...task,
        assignedProducts
      }
    });

  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ message: 'Failed to create task' });
  }
});

// Update task
router.put('/:taskId', [
  validateObjectId('taskId'),
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

    // Check access
    let hasAccess = false;
    if (['ADMIN', 'SENIOR_MANAGER'].includes(userRole)) {
      hasAccess = true;
    } else if (['PRODUCT_USER', 'PRODUCT_ADMIN'].includes(userRole)) {
      hasAccess = currentTask.createdBy === userId || currentTask.assignedProductIds.includes(userId);
    } else if (['COMPLIANCE_USER', 'COMPLIANCE_ADMIN'].includes(userRole)) {
      hasAccess = currentTask.assignedComplianceId === userId || userRole === 'COMPLIANCE_ADMIN';
    }

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this task' });
    }

    const updateData = { ...req.body };
    
    // Role-based update restrictions
    if (['PRODUCT_USER', 'PRODUCT_ADMIN'].includes(userRole)) {
      const allowedFields = ['description'];
      const filteredData = {};
      allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          filteredData[field] = updateData[field];
        }
      });
      Object.assign(updateData, filteredData);
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
        assignedCompliance: { select: { fullName: true, username: true } }
      }
    });

    // Add assigned products manually
    const assignedProducts = await getAssignedProducts(updatedTask.assignedProductIds);

    // Create audit log
    await auditService.logTaskUpdated(taskId, updatedTask.title, Object.keys(updateData), userId);

    res.json({
      message: 'Task updated successfully',
      task: {
        ...updatedTask,
        assignedProducts
      }
    });

  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ message: 'Failed to update task' });
  }
});

// Upload new version
router.post('/:taskId/versions', [
  validateObjectId('taskId'),
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

    // Check access
    const hasAccess = task.createdBy === userId || task.assignedProductIds.includes(userId) || req.user.role === 'ADMIN';
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
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
    await auditService.logVersionUploaded(taskId, task.title, versionNumber, fileUrls.length, userId);

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
  validateObjectId('taskId'),
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

    // Check if task exists and user has access
    const task = await prisma.task.findUnique({
      where: { id: taskId }
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Check access
    const userRole = req.user.role;
    let hasAccess = false;
    if (['ADMIN', 'SENIOR_MANAGER'].includes(userRole)) {
      hasAccess = true;
    } else if (['PRODUCT_USER', 'PRODUCT_ADMIN'].includes(userRole)) {
      hasAccess = task.createdBy === userId || task.assignedProductIds.includes(userId);
    } else if (['COMPLIANCE_USER', 'COMPLIANCE_ADMIN'].includes(userRole)) {
      hasAccess = task.assignedComplianceId === userId || userRole === 'COMPLIANCE_ADMIN';
    }

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

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
      if (task.status === 'COMPLIANCE_REVIEW') {
        await prisma.task.update({
          where: { id: taskId },
          data: { status: 'PRODUCT_REVIEW' }
        });

        // Notify assigned product users
        for (const productId of task.assignedProductIds) {
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
    await auditService.logCommentAdded(taskId, task.title, isGlobal, comment.version?.versionNumber, userId);

    res.status(201).json({
      message: 'Comment added successfully',
      comment
    });

  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ message: 'Failed to add comment' });
  }
});

// Exchange approval management - CREATE (POST)
router.post('/:taskId/exchange-approvals', [
  validateObjectId('taskId'),
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

    console.log('Creating exchange approval for task:', taskId);

    // Verify task type is EXCHANGE
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

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
    if (auditService.logExchangeApprovalAdded) {
      await auditService.logExchangeApprovalAdded(taskId, task.title, exchangeName, userId);
    }

    res.status(201).json({
      message: 'Exchange approval entry added successfully',
      exchangeApproval
    });

  } catch (error) {
    console.error('Add exchange approval error:', error);
    res.status(500).json({ 
      message: 'Failed to add exchange approval entry',
      error: error.message 
    });
  }
});

// Exchange approval management - UPDATE (PUT)
// Manual parameter extraction to fix the route parsing issue
router.put('/:taskId/exchange-approvals/:approvalId', async (req, res) => {
  try {
    // Manual parameter extraction and validation
    const taskId = req.params.taskId;
    const approvalId = req.params.approvalId;
    
    console.log('=== EXCHANGE APPROVAL UPDATE ===');
    console.log('Raw URL:', req.originalUrl);
    console.log('Path:', req.path);
    console.log('Params object:', req.params);
    console.log('TaskId extracted:', taskId);
    console.log('ApprovalId extracted:', approvalId);
    
    // Validate taskId
    if (!taskId || !isValidObjectId(taskId)) {
      return res.status(400).json({
        message: 'Invalid taskId. Must be a valid MongoDB ObjectId.',
        received: taskId,
        path: req.path
      });
    }
    
    // Validate approvalId
    if (!approvalId || !isValidObjectId(approvalId)) {
      return res.status(400).json({
        message: 'Invalid approvalId. Must be a valid MongoDB ObjectId.',
        received: approvalId,
        path: req.path
      });
    }

    // Check authorization
    if (!['COMPLIANCE_USER', 'COMPLIANCE_ADMIN', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    // Validate request body
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;

    // Verify the exchange approval exists and belongs to the task
    console.log('Looking for exchange approval with ID:', approvalId, 'for task:', taskId);
    
    const existingApproval = await prisma.exchangeApproval.findFirst({
      where: {
        id: approvalId,
        taskId: taskId
      },
      include: {
        task: { select: { title: true, taskType: true } }
      }
    });

    if (!existingApproval) {
      console.log('Exchange approval not found');
      return res.status(404).json({ message: 'Exchange approval not found' });
    }

    console.log('Found existing approval:', existingApproval.id);

    if (existingApproval.task.taskType !== 'EXCHANGE') {
      return res.status(400).json({ message: 'Task must be of type EXCHANGE' });
    }

    // Validation for APPROVED status
    if (req.body.approvalStatus === 'APPROVED') {
      if (!req.body.approvalDate || !req.body.referenceNumber) {
        return res.status(400).json({ 
          message: 'Approval date and reference number are required for approved status' 
        });
      }
    }

    // Prepare update data
    const updateData = { ...req.body };
    updateData.updatedById = userId;

    // Remove undefined fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    console.log('Update data:', updateData);

    // Update exchange approval
    const exchangeApproval = await prisma.exchangeApproval.update({
      where: { id: approvalId },
      data: updateData,
      include: {
        updatedBy: { select: { fullName: true, username: true } },
        task: { select: { title: true } }
      }
    });

    console.log('Exchange approval updated successfully');

    // Create audit log
    if (auditService.logExchangeApprovalUpdated) {
      await auditService.logExchangeApprovalUpdated(
        taskId, 
        exchangeApproval.task.title, 
        exchangeApproval.exchangeName, 
        Object.keys(updateData), 
        userId
      );
    }

    res.json({
      message: 'Exchange approval updated successfully',
      exchangeApproval
    });

  } catch (error) {
    console.error('Update exchange approval error:', error);
    res.status(500).json({ 
      message: 'Failed to update exchange approval',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Add body validation middleware for the PUT route (applied after the route handler)
router.use('/:taskId/exchange-approvals/:approvalId', [
  body('approvalStatus')
    .optional()
    .isIn(['APPROVED', 'PENDING', 'REJECTED', 'NOT_SENT'])
    .withMessage('Invalid approval status'),
  body('approvalDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid approval date'),
  body('expiryDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid expiry date'),
  body('referenceNumber')
    .optional()
    .isString()
    .trim(),
  body('approvalEmailUrl')
    .optional()
    .isString()
    .trim()
]);

module.exports = router;