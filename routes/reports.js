const express = require('express');
const { query, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authorize } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Internal Tasks Report
router.get('/internal-tasks', [
  authorize('PRODUCT_ADMIN', 'COMPLIANCE_ADMIN', 'SENIOR_MANAGER', 'ADMIN'),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  query('status').optional().isIn(['OPEN', 'COMPLIANCE_REVIEW', 'PRODUCT_REVIEW', 'APPROVED', 'PUBLISHED', 'CLOSED_INTERNAL', 'CLOSED_EXCHANGE', 'EXPIRED']),
  query('createdBy').optional().isString(),
  query('assignedTo').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      dateFrom,
      dateTo,
      status,
      createdBy,
      assignedTo
    } = req.query;

    let whereClause = {
      OR: [
        { taskType: 'INTERNAL' },
        { taskType: null } // Include tasks where type hasn't been set yet
      ]
    };

    // Apply filters
    if (dateFrom || dateTo) {
      whereClause.createdAt = {};
      if (dateFrom) whereClause.createdAt.gte = new Date(dateFrom);
      if (dateTo) whereClause.createdAt.lte = new Date(dateTo);
    }

    if (status) whereClause.status = status;
    if (createdBy) whereClause.createdBy = createdBy;
    if (assignedTo) whereClause.assignedProductIds = { has: assignedTo };

    const tasks = await prisma.task.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { fullName: true, username: true } },
        assignedProducts: { select: { fullName: true, username: true } },
        assignedCompliance: { select: { fullName: true, username: true } },
        _count: { select: { versions: true, comments: true } }
      }
    });

    // Calculate durations and metrics
    const reportData = tasks.map(task => {
      const createdDate = new Date(task.createdAt);
      const approvedDate = task.approvalDate ? new Date(task.approvalDate) : null;
      const publishedDate = task.publishDate ? new Date(task.publishDate) : null;

      // Calculate durations in days
      const daysToApproval = approvedDate ? 
        Math.ceil((approvedDate - createdDate) / (1000 * 60 * 60 * 24)) : null;
      
      const daysToPublish = publishedDate ? 
        Math.ceil((publishedDate - createdDate) / (1000 * 60 * 60 * 24)) : null;

      return {
        uin: task.uin,
        title: task.title,
        createdBy: task.creator.fullName,
        assignedProducts: task.assignedProducts.map(p => p.fullName).join(', '),
        assignedCompliance: task.assignedCompliance?.fullName || 'Not assigned',
        status: task.status,
        createdAt: task.createdAt,
        approvalDate: task.approvalDate,
        publishDate: task.publishDate,
        daysToApproval,
        daysToPublish,
        versionCount: task._count.versions,
        commentCount: task._count.comments,
        expiryDate: task.expiryDate,
        isExpiringSoon: task.expiryDate && 
          new Date(task.expiryDate) <= new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) // 15 days
      };
    });

    // Summary metrics
    const summary = {
      totalTasks: reportData.length,
      tasksByStatus: {},
      avgDaysToApproval: 0,
      avgDaysToPublish: 0,
      expiringSoon: reportData.filter(t => t.isExpiringSoon).length
    };

    // Calculate status distribution
    reportData.forEach(task => {
      summary.tasksByStatus[task.status] = (summary.tasksByStatus[task.status] || 0) + 1;
    });

    // Calculate averages
    const approvedTasks = reportData.filter(t => t.daysToApproval !== null);
    const publishedTasks = reportData.filter(t => t.daysToPublish !== null);

    if (approvedTasks.length > 0) {
      summary.avgDaysToApproval = Math.round(
        approvedTasks.reduce((sum, t) => sum + t.daysToApproval, 0) / approvedTasks.length
      );
    }

    if (publishedTasks.length > 0) {
      summary.avgDaysToPublish = Math.round(
        publishedTasks.reduce((sum, t) => sum + t.daysToPublish, 0) / publishedTasks.length
      );
    }

    res.json({
      summary,
      data: reportData
    });

  } catch (error) {
    console.error('Internal tasks report error:', error);
    res.status(500).json({ message: 'Failed to generate internal tasks report' });
  }
});

// Exchange Tasks Report
router.get('/exchange-tasks', [
  authorize('COMPLIANCE_ADMIN', 'SENIOR_MANAGER', 'ADMIN'),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  query('exchangeName').optional().isIn(['NSE', 'BSE', 'MCX', 'NCDEX']),
  query('approvalStatus').optional().isIn(['APPROVED', 'PENDING', 'REJECTED', 'NOT_SENT'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      dateFrom,
      dateTo,
      exchangeName,
      approvalStatus
    } = req.query;

    let whereClause = { taskType: 'EXCHANGE' };

    // Apply date filters
    if (dateFrom || dateTo) {
      whereClause.createdAt = {};
      if (dateFrom) whereClause.createdAt.gte = new Date(dateFrom);
      if (dateTo) whereClause.createdAt.lte = new Date(dateTo);
    }

    const tasks = await prisma.task.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { fullName: true, username: true } },
        assignedProducts: { select: { fullName: true, username: true } },
        assignedCompliance: { select: { fullName: true, username: true } },
        exchangeApprovals: {
          where: {
            ...(exchangeName && { exchangeName }),
            ...(approvalStatus && { approvalStatus })
          },
          include: {
            updatedBy: { select: { fullName: true, username: true } }
          }
        }
      }
    });

    // Flatten exchange approvals for report
    const reportData = [];
    
    tasks.forEach(task => {
      if (task.exchangeApprovals.length === 0) {
        // Include task even if no exchange approvals yet
        reportData.push({
          uin: task.uin,
          title: task.title,
          createdBy: task.creator.fullName,
          assignedProducts: task.assignedProducts.map(p => p.fullName).join(', '),
          assignedCompliance: task.assignedCompliance?.fullName || 'Not assigned',
          taskStatus: task.status,
          createdAt: task.createdAt,
          exchangeName: 'Not added',
          typeOfContent: 'Not specified',
          approvalStatus: 'NOT_SENT',
          approvalDate: null,
          expiryDate: null,
          referenceNumber: null,
          updatedBy: null
        });
      } else {
        task.exchangeApprovals.forEach(approval => {
          reportData.push({
            uin: task.uin,
            title: task.title,
            createdBy: task.creator.fullName,
            assignedProducts: task.assignedProducts.map(p => p.fullName).join(', '),
            assignedCompliance: task.assignedCompliance?.fullName || 'Not assigned',
            taskStatus: task.status,
            createdAt: task.createdAt,
            exchangeName: approval.exchangeName,
            typeOfContent: approval.typeOfContent,
            approvalStatus: approval.approvalStatus,
            approvalDate: approval.approvalDate,
            expiryDate: approval.expiryDate,
            referenceNumber: approval.referenceNumber,
            updatedBy: approval.updatedBy?.fullName || null,
            isExpiringSoon: approval.expiryDate && 
              new Date(approval.expiryDate) <= new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
          });
        });
      }
    });

    // Summary metrics
    const summary = {
      totalTasks: tasks.length,
      totalExchangeEntries: reportData.length,
      approvalStatusDistribution: {},
      exchangeDistribution: {},
      expiringSoon: reportData.filter(r => r.isExpiringSoon).length
    };

    // Calculate distributions
    reportData.forEach(entry => {
      // Approval status distribution
      summary.approvalStatusDistribution[entry.approvalStatus] = 
        (summary.approvalStatusDistribution[entry.approvalStatus] || 0) + 1;
      
      // Exchange distribution
      summary.exchangeDistribution[entry.exchangeName] = 
        (summary.exchangeDistribution[entry.exchangeName] || 0) + 1;
    });

    res.json({
      summary,
      data: reportData
    });

  } catch (error) {
    console.error('Exchange tasks report error:', error);
    res.status(500).json({ message: 'Failed to generate exchange tasks report' });
  }
});

// User-wise Compliance Report
router.get('/compliance-users', [
  authorize('COMPLIANCE_ADMIN', 'SENIOR_MANAGER', 'ADMIN'),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { dateFrom, dateTo } = req.query;

    // Get all compliance users
    const complianceUsers = await prisma.user.findMany({
      where: {
        role: { in: ['COMPLIANCE_USER', 'COMPLIANCE_ADMIN'] },
        isActive: true
      },
      select: {
        id: true,
        fullName: true,
        username: true,
        role: true
      }
    });

    const reportData = [];

    for (const user of complianceUsers) {
      let taskFilter = { assignedComplianceId: user.id };
      
      // Apply date filter if provided
      if (dateFrom || dateTo) {
        taskFilter.createdAt = {};
        if (dateFrom) taskFilter.createdAt.gte = new Date(dateFrom);
        if (dateTo) taskFilter.createdAt.lte = new Date(dateTo);
      }

      // Get user's task statistics
      const [
        totalAssigned,
        pending,
        approved,
        rejected,
        avgApprovalTime,
        absenceDays
      ] = await Promise.all([
        prisma.task.count({
          where: taskFilter
        }),
        prisma.task.count({
          where: {
            ...taskFilter,
            status: { in: ['OPEN', 'COMPLIANCE_REVIEW'] }
          }
        }),
        prisma.task.count({
          where: {
            ...taskFilter,
            status: { in: ['APPROVED', 'PUBLISHED'] }
          }
        }),
        prisma.task.count({
          where: {
            ...taskFilter,
            status: { in: ['CLOSED_INTERNAL', 'CLOSED_EXCHANGE'] }
          }
        }),
        // Calculate average approval time
        prisma.task.findMany({
          where: {
            ...taskFilter,
            approvalDate: { not: null }
          },
          select: {
            createdAt: true,
            approvalDate: true
          }
        }),
        // Get absence days in the period
        prisma.absence.findMany({
          where: {
            userId: user.id,
            ...(dateFrom && { toDate: { gte: new Date(dateFrom) } }),
            ...(dateTo && { fromDate: { lte: new Date(dateTo) } })
          },
          select: {
            fromDate: true,
            toDate: true
          }
        })
      ]);

      // Calculate average approval time in days
      let avgApprovalTimeDays = 0;
      if (avgApprovalTime.length > 0) {
        const totalDays = avgApprovalTime.reduce((sum, task) => {
          const days = Math.ceil((new Date(task.approvalDate) - new Date(task.createdAt)) / (1000 * 60 * 60 * 24));
          return sum + days;
        }, 0);
        avgApprovalTimeDays = Math.round(totalDays / avgApprovalTime.length);
      }

      // Calculate total absence days
      let totalAbsenceDays = 0;
      absenceDays.forEach(absence => {
        const start = dateFrom ? Math.max(new Date(absence.fromDate), new Date(dateFrom)) : new Date(absence.fromDate);
        const end = dateTo ? Math.min(new Date(absence.toDate), new Date(dateTo)) : new Date(absence.toDate);
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        totalAbsenceDays += Math.max(0, days);
      });

      reportData.push({
        userId: user.id,
        fullName: user.fullName,
        username: user.username,
        role: user.role,
        totalAssigned,
        pending,
        approved,
        rejected,
        avgApprovalTimeDays,
        absenceDays: totalAbsenceDays,
        productivityScore: totalAssigned > 0 ? Math.round((approved / totalAssigned) * 100) : 0
      });
    }

    // Sort by productivity score
    reportData.sort((a, b) => b.productivityScore - a.productivityScore);

    const summary = {
      totalUsers: reportData.length,
      totalTasksAssigned: reportData.reduce((sum, user) => sum + user.totalAssigned, 0),
      totalPending: reportData.reduce((sum, user) => sum + user.pending, 0),
      totalApproved: reportData.reduce((sum, user) => sum + user.approved, 0),
      avgProductivity: Math.round(reportData.reduce((sum, user) => sum + user.productivityScore, 0) / reportData.length)
    };

    res.json({
      summary,
      data: reportData
    });

  } catch (error) {
    console.error('Compliance users report error:', error);
    res.status(500).json({ message: 'Failed to generate compliance users report' });
  }
});

// User-wise Product Report
router.get('/product-users', [
  authorize('PRODUCT_ADMIN', 'COMPLIANCE_ADMIN', 'SENIOR_MANAGER', 'ADMIN'),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { dateFrom, dateTo } = req.query;

    // Get all product users
    const productUsers = await prisma.user.findMany({
      where: {
        role: { in: ['PRODUCT_USER', 'PRODUCT_ADMIN'] },
        isActive: true
      },
      select: {
        id: true,
        fullName: true,
        username: true,
        role: true,
        team: true
      }
    });

    const reportData = [];

    for (const user of productUsers) {
      let taskFilter = {
        OR: [
          { createdBy: user.id },
          { assignedProductIds: { has: user.id } }
        ]
      };
      
      // Apply date filter
      if (dateFrom || dateTo) {
        taskFilter.createdAt = {};
        if (dateFrom) taskFilter.createdAt.gte = new Date(dateFrom);
        if (dateTo) taskFilter.createdAt.lte = new Date(dateTo);
      }

      const [
        tasksCreated,
        tasksAssigned,
        versionsUploaded,
        commentsAdded,
        publishedTasks,
        reopenedTasks
      ] = await Promise.all([
        prisma.task.count({
          where: {
            createdBy: user.id,
            ...(dateFrom && { createdAt: { gte: new Date(dateFrom) } }),
            ...(dateTo && { createdAt: { lte: new Date(dateTo) } })
          }
        }),
        prisma.task.count({
          where: {
            assignedProductIds: { has: user.id },
            ...(dateFrom && { createdAt: { gte: new Date(dateFrom) } }),
            ...(dateTo && { createdAt: { lte: new Date(dateTo) } })
          }
        }),
        prisma.version.count({
          where: {
            uploadedById: user.id,
            ...(dateFrom && { uploadedAt: { gte: new Date(dateFrom) } }),
            ...(dateTo && { uploadedAt: { lte: new Date(dateTo) } })
          }
        }),
        prisma.comment.count({
          where: {
            authorId: user.id,
            ...(dateFrom && { createdAt: { gte: new Date(dateFrom) } }),
            ...(dateTo && { createdAt: { lte: new Date(dateTo) } })
          }
        }),
        prisma.task.count({
          where: {
            OR: [
              { createdBy: user.id },
              { assignedProductIds: { has: user.id } }
            ],
            status: 'PUBLISHED',
            ...(dateFrom && { publishDate: { gte: new Date(dateFrom) } }),
            ...(dateTo && { publishDate: { lte: new Date(dateTo) } })
          }
        }),
        // Count tasks that were reopened (simplified - could be more complex)
        prisma.auditLog.count({
          where: {
            performedBy: user.id,
            action: 'TASK_REOPENED',
            ...(dateFrom && { timestamp: { gte: new Date(dateFrom) } }),
            ...(dateTo && { timestamp: { lte: new Date(dateTo) } })
          }
        })
      ]);

      reportData.push({
        userId: user.id,
        fullName: user.fullName,
        username: user.username,
        role: user.role,
        team: user.team,
        tasksCreated,
        tasksAssigned,
        versionsUploaded,
        commentsAdded,
        publishedTasks,
        reopenedTasks,
        activityScore: tasksCreated + versionsUploaded + commentsAdded
      });
    }

    // Sort by activity score
    reportData.sort((a, b) => b.activityScore - a.activityScore);

    const summary = {
      totalUsers: reportData.length,
      totalTasksCreated: reportData.reduce((sum, user) => sum + user.tasksCreated, 0),
      totalVersionsUploaded: reportData.reduce((sum, user) => sum + user.versionsUploaded, 0),
      totalCommentsAdded: reportData.reduce((sum, user) => sum + user.commentsAdded, 0),
      totalPublished: reportData.reduce((sum, user) => sum + user.publishedTasks, 0)
    };

    res.json({
      summary,
      data: reportData
    });

  } catch (error) {
    console.error('Product users report error:', error);
    res.status(500).json({ message: 'Failed to generate product users report' });
  }
});

// Expiring Soon Report
router.get('/expiring-soon', [
  authorize('COMPLIANCE_ADMIN', 'SENIOR_MANAGER', 'ADMIN'),
  query('days').optional().isInt({ min: 1, max: 90 }).toInt()
], async (req, res) => {
  try {
    const days = req.query.days || 15; // Default 15 days
    const cutoffDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const expiringTasks = await prisma.task.findMany({
      where: {
        expiryDate: {
          lte: cutoffDate,
          gte: new Date() // Not already expired
        },
        status: { in: ['APPROVED', 'PUBLISHED'] }
      },
      orderBy: { expiryDate: 'asc' },
      include: {
        creator: { select: { fullName: true, username: true, email: true } },
        assignedProducts: { select: { fullName: true, username: true, email: true } },
        assignedCompliance: { select: { fullName: true, username: true, email: true } },
        exchangeApprovals: {
          select: {
            exchangeName: true,
            expiryDate: true,
            referenceNumber: true
          }
        }
      }
    });

    const reportData = expiringTasks.map(task => {
      const daysUntilExpiry = Math.ceil((new Date(task.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
      
      return {
        uin: task.uin,
        title: task.title,
        status: task.status,
        expiryDate: task.expiryDate,
        daysUntilExpiry,
        urgency: daysUntilExpiry <= 7 ? 'HIGH' : daysUntilExpiry <= 15 ? 'MEDIUM' : 'LOW',
        createdBy: task.creator.fullName,
        assignedProducts: task.assignedProducts.map(p => ({ name: p.fullName, email: p.email })),
        assignedCompliance: task.assignedCompliance ? {
          name: task.assignedCompliance.fullName,
          email: task.assignedCompliance.email
        } : null,
        exchanges: task.exchangeApprovals.map(ea => ({
          name: ea.exchangeName,
          referenceNumber: ea.referenceNumber
        }))
      };
    });

    const summary = {
      totalExpiring: reportData.length,
      highUrgency: reportData.filter(t => t.urgency === 'HIGH').length,
      mediumUrgency: reportData.filter(t => t.urgency === 'MEDIUM').length,
      lowUrgency: reportData.filter(t => t.urgency === 'LOW').length
    };

    res.json({
      summary,
      data: reportData,
      cutoffDays: days
    });

  } catch (error) {
    console.error('Expiring soon report error:', error);
    res.status(500).json({ message: 'Failed to generate expiring soon report' });
  }
});

// Daily Movement Report
router.get('/daily-movement', [
  authorize('SENIOR_MANAGER', 'ADMIN'),
  query('date').optional().isISO8601()
], async (req, res) => {
  try {
    const targetDate = req.query.date ? new Date(req.query.date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all audit logs for the day that represent status changes
    const movements = await prisma.auditLog.findMany({
      where: {
        timestamp: {
          gte: startOfDay,
          lte: endOfDay
        },
        action: { in: ['TASK_CREATED', 'TASK_UPDATED', 'TASK_APPROVED', 'TASK_PUBLISHED'] }
      },
      include: {
        performedBy: { select: { fullName: true, username: true, role: true } },
        task: {
          select: {
            uin: true,
            title: true,
            status: true,
            taskType: true
          }
        }
      },
      orderBy: { timestamp: 'asc' }
    });

    const summary = {
      date: targetDate.toISOString().split('T')[0],
      totalMovements: movements.length,
      movementsByAction: {},
      movementsByUser: {},
      movementsByHour: {}
    };

    // Process movements for summary
    movements.forEach(movement => {
      // By action
      summary.movementsByAction[movement.action] = 
        (summary.movementsByAction[movement.action] || 0) + 1;
      
      // By user
      const userKey = movement.performedBy.fullName;
      summary.movementsByUser[userKey] = 
        (summary.movementsByUser[userKey] || 0) + 1;
      
      // By hour
      const hour = new Date(movement.timestamp).getHours();
      summary.movementsByHour[hour] = 
        (summary.movementsByHour[hour] || 0) + 1;
    });

    res.json({
      summary,
      movements: movements.map(m => ({
        timestamp: m.timestamp,
        action: m.action,
        details: m.details,
        performedBy: m.performedBy.fullName,
        userRole: m.performedBy.role,
        task: m.task ? {
          uin: m.task.uin,
          title: m.task.title,
          status: m.task.status,
          type: m.task.taskType
        } : null
      }))
    });

  } catch (error) {
    console.error('Daily movement report error:', error);
    res.status(500).json({ message: 'Failed to generate daily movement report' });
  }
});

// Rejected Tasks Report
router.get('/rejected-tasks', [
  authorize('COMPLIANCE_ADMIN', 'SENIOR_MANAGER', 'ADMIN'),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { dateFrom, dateTo } = req.query;

    let whereClause = {
      status: { in: ['CLOSED_INTERNAL', 'CLOSED_EXCHANGE'] }
    };

    // Apply date filter
    if (dateFrom || dateTo) {
      whereClause.closureDate = {};
      if (dateFrom) whereClause.closureDate.gte = new Date(dateFrom);
      if (dateTo) whereClause.closureDate.lte = new Date(dateTo);
    }

    const rejectedTasks = await prisma.task.findMany({
      where: whereClause,
      orderBy: { closureDate: 'desc' },
      include: {
        creator: { select: { fullName: true, username: true } },
        assignedProducts: { select: { fullName: true, username: true } },
        assignedCompliance: { select: { fullName: true, username: true } }
      }
    });

    const reportData = rejectedTasks.map(task => ({
      uin: task.uin,
      title: task.title,
      createdBy: task.creator.fullName,
      assignedProducts: task.assignedProducts.map(p => p.fullName).join(', '),
      assignedCompliance: task.assignedCompliance?.fullName || 'Not assigned',
      status: task.status,
      createdAt: task.createdAt,
      closureDate: task.closureDate,
      closureComments: task.closureComments,
      daysActive: task.closureDate ? 
        Math.ceil((new Date(task.closureDate) - new Date(task.createdAt)) / (1000 * 60 * 60 * 24)) : null
    }));

    const summary = {
      totalRejected: reportData.length,
      avgDaysActive: reportData.length > 0 ? 
        Math.round(reportData.reduce((sum, task) => sum + (task.daysActive || 0), 0) / reportData.length) : 0
    };

    res.json({
      summary,
      data: reportData
    });

  } catch (error) {
    console.error('Rejected tasks report error:', error);
    res.status(500).json({ message: 'Failed to generate rejected tasks report' });
  }
});

module.exports = router;