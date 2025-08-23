 
const express = require('express');
const { query, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authorize } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get audit logs
router.get('/', [
  authorize('COMPLIANCE_ADMIN', 'SENIOR_MANAGER', 'ADMIN'),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  query('performedBy').optional().isString(),
  query('action').optional().isString(),
  query('taskId').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      page = 1,
      limit = 50,
      dateFrom,
      dateTo,
      performedBy,
      action,
      taskId
    } = req.query;

    let whereClause = {};

    // Apply filters
    if (dateFrom || dateTo) {
      whereClause.timestamp = {};
      if (dateFrom) whereClause.timestamp.gte = new Date(dateFrom);
      if (dateTo) whereClause.timestamp.lte = new Date(dateTo);
    }

    if (performedBy) whereClause.performedById = performedBy;
    if (action) whereClause.action = { contains: action, mode: 'insensitive' };
    if (taskId) whereClause.taskId = taskId;

    const [auditLogs, totalCount] = await Promise.all([
      prisma.auditLog.findMany({
        where: whereClause,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          performedBy: {
            select: {
              fullName: true,
              username: true,
              role: true
            }
          },
          task: {
            select: {
              uin: true,
              title: true,
              status: true
            }
          }
        }
      }),
      prisma.auditLog.count({ where: whereClause })
    ]);

    const formattedLogs = auditLogs.map(log => ({
      id: log.id,
      timestamp: log.timestamp,
      action: log.action,
      details: log.details,
      performedBy: {
        name: log.performedBy.fullName,
        username: log.performedBy.username,
        role: log.performedBy.role
      },
      task: log.task ? {
        uin: log.task.uin,
        title: log.task.title,
        status: log.task.status
      } : null
    }));

    res.json({
      auditLogs: formattedLogs,
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
    console.error('Get audit logs error:', error);
    res.status(500).json({ message: 'Failed to fetch audit logs' });
  }
});

// Get audit logs for specific task
router.get('/task/:taskId', [
  authorize('COMPLIANCE_ADMIN', 'SENIOR_MANAGER', 'ADMIN'),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      page = 1,
      limit = 50
    } = req.query;

    const taskId = req.params.taskId;

    // Verify task exists
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { uin: true, title: true }
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const [auditLogs, totalCount] = await Promise.all([
      prisma.auditLog.findMany({
        where: { taskId },
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          performedBy: {
            select: {
              fullName: true,
              username: true,
              role: true
            }
          }
        }
      }),
      prisma.auditLog.count({ where: { taskId } })
    ]);

    const formattedLogs = auditLogs.map(log => ({
      id: log.id,
      timestamp: log.timestamp,
      action: log.action,
      details: log.details,
      performedBy: {
        name: log.performedBy.fullName,
        username: log.performedBy.username,
        role: log.performedBy.role
      }
    }));

    res.json({
      task: {
        uin: task.uin,
        title: task.title
      },
      auditLogs: formattedLogs,
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
    console.error('Get task audit logs error:', error);
    res.status(500).json({ message: 'Failed to fetch task audit logs' });
  }
});

// Get audit logs by user
router.get('/user/:userId', [
  authorize('COMPLIANCE_ADMIN', 'SENIOR_MANAGER', 'ADMIN'),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      page = 1,
      limit = 50,
      dateFrom,
      dateTo
    } = req.query;

    const userId = req.params.userId;

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, username: true, role: true }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let whereClause = { performedById: userId };

    // Apply date filter
    if (dateFrom || dateTo) {
      whereClause.timestamp = {};
      if (dateFrom) whereClause.timestamp.gte = new Date(dateFrom);
      if (dateTo) whereClause.timestamp.lte = new Date(dateTo);
    }

    const [auditLogs, totalCount] = await Promise.all([
      prisma.auditLog.findMany({
        where: whereClause,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          task: {
            select: {
              uin: true,
              title: true,
              status: true
            }
          }
        }
      }),
      prisma.auditLog.count({ where: whereClause })
    ]);

    const formattedLogs = auditLogs.map(log => ({
      id: log.id,
      timestamp: log.timestamp,
      action: log.action,
      details: log.details,
      task: log.task ? {
        uin: log.task.uin,
        title: log.task.title,
        status: log.task.status
      } : null
    }));

    res.json({
      user: {
        name: user.fullName,
        username: user.username,
        role: user.role
      },
      auditLogs: formattedLogs,
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
    console.error('Get user audit logs error:', error);
    res.status(500).json({ message: 'Failed to fetch user audit logs' });
  }
});

// Get audit log statistics
router.get('/stats', [
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

    let whereClause = {};

    // Apply date filter
    if (dateFrom || dateTo) {
      whereClause.timestamp = {};
      if (dateFrom) whereClause.timestamp.gte = new Date(dateFrom);
      if (dateTo) whereClause.timestamp.lte = new Date(dateTo);
    }

    // Get action distribution
    const actionStats = await prisma.auditLog.groupBy({
      by: ['action'],
      where: whereClause,
      _count: {
        action: true
      },
      orderBy: {
        _count: {
          action: 'desc'
        }
      }
    });

    // Get user activity stats
    const userStats = await prisma.auditLog.groupBy({
      by: ['performedById'],
      where: whereClause,
      _count: {
        performedById: true
      },
      orderBy: {
        _count: {
          performedById: 'desc'
        }
      },
      take: 10 // Top 10 most active users
    });

    // Get user details for top active users
    const userIds = userStats.map(stat => stat.performedById);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        fullName: true,
        username: true,
        role: true
      }
    });

    const userActivityMap = userStats.map(stat => {
      const user = users.find(u => u.id === stat.performedById);
      return {
        user: user ? {
          name: user.fullName,
          username: user.username,
          role: user.role
        } : null,
        activityCount: stat._count.performedById
      };
    });

    // Get daily activity (last 7 days)
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const count = await prisma.auditLog.count({
        where: {
          timestamp: {
            gte: date,
            lt: nextDate
          }
        }
      });
      
      last7Days.push({
        date: date.toISOString().split('T')[0],
        count
      });
    }

    // Get total counts
    const [totalLogs, totalUsers, totalTasks] = await Promise.all([
      prisma.auditLog.count({ where: whereClause }),
      prisma.auditLog.findMany({
        where: whereClause,
        distinct: ['performedById']
      }).then(logs => logs.length),
      prisma.auditLog.findMany({
        where: { ...whereClause, taskId: { not: null } },
        distinct: ['taskId']
      }).then(logs => logs.length)
    ]);

    res.json({
      summary: {
        totalLogs,
        uniqueUsers: totalUsers,
        tasksAffected: totalTasks,
        dateRange: {
          from: dateFrom || null,
          to: dateTo || null
        }
      },
      actionDistribution: actionStats.map(stat => ({
        action: stat.action,
        count: stat._count.action
      })),
      topActiveUsers: userActivityMap,
      dailyActivity: last7Days
    });

  } catch (error) {
    console.error('Get audit stats error:', error);
    res.status(500).json({ message: 'Failed to fetch audit statistics' });
  }
});

// Export audit logs (CSV format data)
router.get('/export', [
  authorize('COMPLIANCE_ADMIN', 'ADMIN'),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  query('performedBy').optional().isString(),
  query('action').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      dateFrom,
      dateTo,
      performedBy,
      action
    } = req.query;

    let whereClause = {};

    // Apply filters
    if (dateFrom || dateTo) {
      whereClause.timestamp = {};
      if (dateFrom) whereClause.timestamp.gte = new Date(dateFrom);
      if (dateTo) whereClause.timestamp.lte = new Date(dateTo);
    }

    if (performedBy) whereClause.performedById = performedBy;
    if (action) whereClause.action = { contains: action, mode: 'insensitive' };

    const auditLogs = await prisma.auditLog.findMany({
      where: whereClause,
      orderBy: { timestamp: 'desc' },
      take: 10000, // Limit to prevent huge exports
      include: {
        performedBy: {
          select: {
            fullName: true,
            username: true,
            role: true
          }
        },
        task: {
          select: {
            uin: true,
            title: true,
            status: true
          }
        }
      }
    });

    // Format data for export
    const exportData = auditLogs.map(log => ({
      timestamp: log.timestamp.toISOString(),
      action: log.action,
      details: log.details,
      performedBy: log.performedBy.fullName,
      username: log.performedBy.username,
      role: log.performedBy.role,
      taskUIN: log.task?.uin || '',
      taskTitle: log.task?.title || '',
      taskStatus: log.task?.status || ''
    }));

    res.json({
      message: 'Audit logs export data',
      count: exportData.length,
      data: exportData
    });

  } catch (error) {
    console.error('Export audit logs error:', error);
    res.status(500).json({ message: 'Failed to export audit logs' });
  }
});

module.exports = router;