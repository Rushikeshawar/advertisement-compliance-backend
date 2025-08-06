 
const express = require('express');
const { query, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// Get user notifications
router.get('/', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('isRead').optional().isBoolean().toBoolean(),
  query('type').optional().isIn(['TASK_ASSIGNED', 'COMMENT_ADDED', 'VERSION_UPLOADED', 'TASK_APPROVED', 'TASK_REJECTED', 'TASK_PUBLISHED', 'EXPIRY_WARNING', 'FOLLOW_UP'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      page = 1,
      limit = 20,
      isRead,
      type
    } = req.query;

    const userId = req.user.id;

    let whereClause = { userId };

    // Apply filters
    if (typeof isRead === 'boolean') {
      whereClause.isRead = isRead;
    }
    
    if (type) {
      whereClause.type = type;
    }

    const [notifications, totalCount, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
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
      prisma.notification.count({ where: whereClause }),
      prisma.notification.count({ 
        where: { userId, isRead: false } 
      })
    ]);

    res.json({
      notifications,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNext: page * limit < totalCount,
        hasPrev: page > 1
      },
      unreadCount
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
});

// Get unread count
router.get('/unread-count', async (req, res) => {
  try {
    const userId = req.user.id;

    const unreadCount = await prisma.notification.count({
      where: { userId, isRead: false }
    });

    res.json({ unreadCount });

  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ message: 'Failed to get unread count' });
  }
});

// Mark notification as read
router.patch('/:notificationId/read', async (req, res) => {
  try {
    const notificationId = req.params.notificationId;
    const userId = req.user.id;

    // Verify notification belongs to user
    const notification = await prisma.notification.findFirst({
      where: { 
        id: notificationId,
        userId 
      }
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    if (notification.isRead) {
      return res.json({ message: 'Notification already marked as read' });
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true }
    });

    res.json({ message: 'Notification marked as read' });

  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ message: 'Failed to mark notification as read' });
  }
});

// Mark notification as unread
router.patch('/:notificationId/unread', async (req, res) => {
  try {
    const notificationId = req.params.notificationId;
    const userId = req.user.id;

    // Verify notification belongs to user
    const notification = await prisma.notification.findFirst({
      where: { 
        id: notificationId,
        userId 
      }
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    if (!notification.isRead) {
      return res.json({ message: 'Notification already marked as unread' });
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: false }
    });

    res.json({ message: 'Notification marked as unread' });

  } catch (error) {
    console.error('Mark notification as unread error:', error);
    res.status(500).json({ message: 'Failed to mark notification as unread' });
  }
});

// Mark all notifications as read
router.patch('/mark-all-read', async (req, res) => {
  try {
    const userId = req.user.id;

    const updateResult = await prisma.notification.updateMany({
      where: { 
        userId,
        isRead: false 
      },
      data: { isRead: true }
    });

    res.json({ 
      message: 'All notifications marked as read',
      count: updateResult.count
    });

  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({ message: 'Failed to mark all notifications as read' });
  }
});

// Delete notification
router.delete('/:notificationId', async (req, res) => {
  try {
    const notificationId = req.params.notificationId;
    const userId = req.user.id;

    // Verify notification belongs to user
    const notification = await prisma.notification.findFirst({
      where: { 
        id: notificationId,
        userId 
      }
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    await prisma.notification.delete({
      where: { id: notificationId }
    });

    res.json({ message: 'Notification deleted successfully' });

  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ message: 'Failed to delete notification' });
  }
});

// Delete all read notifications
router.delete('/read/all', async (req, res) => {
  try {
    const userId = req.user.id;

    const deleteResult = await prisma.notification.deleteMany({
      where: { 
        userId,
        isRead: true 
      }
    });

    res.json({ 
      message: 'All read notifications deleted',
      count: deleteResult.count
    });

  } catch (error) {
    console.error('Delete read notifications error:', error);
    res.status(500).json({ message: 'Failed to delete read notifications' });
  }
});

module.exports = router;