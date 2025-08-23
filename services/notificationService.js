const { PrismaClient } = require('@prisma/client');
const nodemailer = require('nodemailer');

const prisma = new PrismaClient();

class NotificationService {
  constructor() {
    // Configure email transporter
    this.emailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  // Create notification in database
  async createNotification({ userId, title, message, type, taskId = null }) {
    try {
      const notification = await prisma.notification.create({
        data: {
          userId,
          title,
          message,
          type,
          taskId
        }
      });
      return notification;
    } catch (error) {
      console.error('Create notification error:', error);
      throw error;
    }
  }

  // Send notification (in-app + optional email)
  async sendNotification({ userId, title, message, type, taskId = null, sendEmail = false }) {
    try {
      // Create in-app notification
      const notification = await this.createNotification({
        userId,
        title,
        message,
        type,
        taskId
      });

      // Send email if requested
      if (sendEmail) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, fullName: true }
        });

        if (user) {
          await this.sendEmailNotification({
            to: user.email,
            name: user.fullName,
            title,
            message,
            taskId
          });
        }
      }

      return notification;
    } catch (error) {
      console.error('Send notification error:', error);
      throw error;
    }
  }

  // Send email notification
  async sendEmailNotification({ to, name, title, message, taskId = null }) {
    try {
      const taskLink = taskId ? `${process.env.FRONTEND_URL}/tasks/${taskId}` : null;
      
      const mailOptions = {
        from: process.env.SMTP_USER,
        to,
        subject: `[Advertisement Compliance] ${title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">${title}</h2>
            <p>Hi ${name},</p>
            <p>${message}</p>
            ${taskLink ? `<p><a href="${taskLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">View Task</a></p>` : ''}
            <hr>
            <p style="color: #666; font-size: 12px;">
              This is an automated notification from the Advertisement Compliance System.
            </p>
          </div>
        `
      };

      await this.emailTransporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Send email notification error:', error);
      // Don't throw error to avoid breaking main functionality
    }
  }

  // Task assigned notification
  async sendTaskAssignedNotification(userId, taskId, taskTitle) {
    return this.sendNotification({
      userId,
      title: 'New Task Assigned',
      message: `You have been assigned a new task: "${taskTitle}"`,
      type: 'TASK_ASSIGNED',
      taskId,
      sendEmail: true
    });
  }

  // Comment added notification
  async sendCommentAddedNotification(userId, taskId, taskTitle, commenterName) {
    return this.sendNotification({
      userId,
      title: 'New Comment Added',
      message: `${commenterName} added a comment to task: "${taskTitle}"`,
      type: 'COMMENT_ADDED',
      taskId,
      sendEmail: false // Usually too frequent for email
    });
  }

  // Version uploaded notification
  async sendVersionUploadedNotification(userId, taskId, taskTitle, versionNumber) {
    return this.sendNotification({
      userId,
      title: 'New Version Uploaded',
      message: `Version ${versionNumber} has been uploaded for task: "${taskTitle}"`,
      type: 'VERSION_UPLOADED',
      taskId,
      sendEmail: true
    });
  }

  // Task approved notification
  async sendTaskApprovedNotification(userIds, taskId, taskTitle) {
    const notifications = [];
    
    for (const userId of userIds) {
      const notification = await this.sendNotification({
        userId,
        title: 'Task Approved',
        message: `Task "${taskTitle}" has been approved and is ready for publishing`,
        type: 'TASK_APPROVED',
        taskId,
        sendEmail: true
      });
      notifications.push(notification);
    }
    
    return notifications;
  }

  // Task rejected notification
  async sendTaskRejectedNotification(userIds, taskId, taskTitle, reason = '') {
    const notifications = [];
    
    for (const userId of userIds) {
      const notification = await this.sendNotification({
        userId,
        title: 'Task Rejected',
        message: `Task "${taskTitle}" has been rejected${reason ? `: ${reason}` : ''}`,
        type: 'TASK_REJECTED',
        taskId,
        sendEmail: true
      });
      notifications.push(notification);
    }
    
    return notifications;
  }

  // Task published notification
  async sendTaskPublishedNotification(userIds, taskId, taskTitle) {
    const notifications = [];
    
    for (const userId of userIds) {
      const notification = await this.sendNotification({
        userId,
        title: 'Task Published',
        message: `Task "${taskTitle}" has been successfully published`,
        type: 'TASK_PUBLISHED',
        taskId,
        sendEmail: false
      });
      notifications.push(notification);
    }
    
    return notifications;
  }

  // Expiry warning notification
  async sendExpiryWarningNotification(userIds, taskId, taskTitle, daysUntilExpiry) {
    const notifications = [];
    const urgency = daysUntilExpiry <= 3 ? 'URGENT' : daysUntilExpiry <= 7 ? 'HIGH' : 'MEDIUM';
    
    for (const userId of userIds) {
      const notification = await this.sendNotification({
        userId,
        title: `${urgency}: Task Expiring Soon`,
        message: `Task "${taskTitle}" will expire in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}`,
        type: 'EXPIRY_WARNING',
        taskId,
        sendEmail: daysUntilExpiry <= 7 // Email for urgent warnings
      });
      notifications.push(notification);
    }
    
    return notifications;
  }

  // Follow-up notification
  async sendFollowUpNotification(userId, taskId, taskTitle, followUpMessage) {
    return this.sendNotification({
      userId,
      title: 'Follow-up Required',
      message: `Follow-up on task "${taskTitle}": ${followUpMessage}`,
      type: 'FOLLOW_UP',
      taskId,
      sendEmail: true
    });
  }

  // Bulk notification for multiple users
  async sendBulkNotification({ userIds, title, message, type, taskId = null, sendEmail = false }) {
    const notifications = [];
    
    for (const userId of userIds) {
      try {
        const notification = await this.sendNotification({
          userId,
          title,
          message,
          type,
          taskId,
          sendEmail
        });
        notifications.push(notification);
      } catch (error) {
        console.error(`Failed to send notification to user ${userId}:`, error);
      }
    }
    
    return notifications;
  }

  // System notification (for all users with specific roles)
  async sendSystemNotification({ roles, title, message, type, sendEmail = false }) {
    try {
      const users = await prisma.user.findMany({
        where: {
          role: { in: roles },
          isActive: true
        },
        select: { id: true }
      });

      const userIds = users.map(user => user.id);
      
      return this.sendBulkNotification({
        userIds,
        title,
        message,
        type,
        sendEmail
      });
    } catch (error) {
      console.error('Send system notification error:', error);
      throw error;
    }
  }

  // Mark notification as read
  async markAsRead(notificationId, userId) {
    try {
      return await prisma.notification.updateMany({
        where: {
          id: notificationId,
          userId
        },
        data: {
          isRead: true
        }
      });
    } catch (error) {
      console.error('Mark notification as read error:', error);
      throw error;
    }
  }

  // Mark all notifications as read for a user
  async markAllAsRead(userId) {
    try {
      return await prisma.notification.updateMany({
        where: {
          userId,
          isRead: false
        },
        data: {
          isRead: true
        }
      });
    } catch (error) {
      console.error('Mark all notifications as read error:', error);
      throw error;
    }
  }

  // Get unread count for a user
  async getUnreadCount(userId) {
    try {
      return await prisma.notification.count({
        where: {
          userId,
          isRead: false
        }
      });
    } catch (error) {
      console.error('Get unread count error:', error);
      return 0;
    }
  }

  // Clean up old notifications
  async cleanupOldNotifications(daysToKeep = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const deleteResult = await prisma.notification.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate
          },
          isRead: true
        }
      });

      return deleteResult.count;
    } catch (error) {
      console.error('Cleanup old notifications error:', error);
      return 0;
    }
  }

  // Send daily summary email
  async sendDailySummaryEmail(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, fullName: true, role: true }
      });

      if (!user) return;

      // Get today's statistics based on user role
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      let summary = {};

      if (['COMPLIANCE_USER', 'COMPLIANCE_ADMIN'].includes(user.role)) {
        // Compliance user summary
        const [pendingTasks, approvedTasks, newComments] = await Promise.all([
          prisma.task.count({
            where: {
              assignedComplianceId: userId,
              status: { in: ['OPEN', 'COMPLIANCE_REVIEW'] }
            }
          }),
          prisma.task.count({
            where: {
              assignedComplianceId: userId,
              updatedAt: { gte: today, lt: tomorrow },
              status: 'APPROVED'
            }
          }),
          prisma.comment.count({
            where: {
              task: { assignedComplianceId: userId },
              createdAt: { gte: today, lt: tomorrow }
            }
          })
        ]);

        summary = {
          pendingTasks,
          approvedTasks,
          newComments
        };
      } else if (['PRODUCT_USER', 'PRODUCT_ADMIN'].includes(user.role)) {
        // Product user summary
        const [tasksCreated, pendingReview, versionsUploaded] = await Promise.all([
          prisma.task.count({
            where: {
              createdBy: userId,
              createdAt: { gte: today, lt: tomorrow }
            }
          }),
          prisma.task.count({
            where: {
              OR: [
                { createdBy: userId },
                { assignedProductIds: { has: userId } }
              ],
              status: 'PRODUCT_REVIEW'
            }
          }),
          prisma.version.count({
            where: {
              uploadedById: userId,
              uploadedAt: { gte: today, lt: tomorrow }
            }
          })
        ]);

        summary = {
          tasksCreated,
          pendingReview,
          versionsUploaded
        };
      }

      // Send email with summary
      const mailOptions = {
        from: process.env.SMTP_USER,
        to: user.email,
        subject: '[Advertisement Compliance] Daily Summary',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Daily Summary - ${today.toDateString()}</h2>
            <p>Hi ${user.fullName},</p>
            <p>Here's your daily summary:</p>
            <ul>
              ${Object.entries(summary).map(([key, value]) => 
                `<li><strong>${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</strong> ${value}</li>`
              ).join('')}
            </ul>
            <p><a href="${process.env.FRONTEND_URL}/dashboard" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Go to Dashboard</a></p>
            <hr>
            <p style="color: #666; font-size: 12px;">
              You can disable daily summaries in your notification preferences.
            </p>
          </div>
        `
      };

      await this.emailTransporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Send daily summary email error:', error);
    }
  }
}

module.exports = new NotificationService();