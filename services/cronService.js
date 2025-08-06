 
const cron = require('cron');
const { PrismaClient } = require('@prisma/client');
const notificationService = require('./notificationService');
const auditService = require('./auditService');

const prisma = new PrismaClient();

class CronService {
  constructor() {
    this.jobs = [];
  }

  // Start all cron services
  startExpiryNotifications() {
    this.startExpiryWarningJob();
    this.startTaskExpirationJob();
    this.startNotificationCleanupJob();
    this.startAuditCleanupJob();
    console.log('✅ All cron jobs started');
  }

  // Send expiry warnings (runs daily at 9 AM)
  startExpiryWarningJob() {
    const job = new cron.CronJob('0 9 * * *', async () => {
      console.log('🔔 Running expiry warning job...');
      
      try {
        const now = new Date();
        
        // Find tasks expiring in 15, 7, and 1 days
        const warningPeriods = [15, 7, 1];
        
        for (const days of warningPeriods) {
          const targetDate = new Date(now);
          targetDate.setDate(targetDate.getDate() + days);
          
          // Set time range for the target date (entire day)
          const startOfDay = new Date(targetDate);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(targetDate);
          endOfDay.setHours(23, 59, 59, 999);

          // Find tasks expiring on this specific day
          const expiringTasks = await prisma.task.findMany({
            where: {
              expiryDate: {
                gte: startOfDay,
                lte: endOfDay
              },
              status: { in: ['APPROVED', 'PUBLISHED'] }
            },
            include: {
              creator: { select: { id: true, fullName: true, email: true } },
              assignedProducts: { select: { id: true, fullName: true, email: true } },
              assignedCompliance: { select: { id: true, fullName: true, email: true } }
            }
          });

          // Send notifications for each task
          for (const task of expiringTasks) {
            const notifyUsers = [
              task.creator.id,
              ...task.assignedProducts.map(p => p.id),
              ...(task.assignedCompliance ? [task.assignedCompliance.id] : [])
            ];

            // Remove duplicates
            const uniqueUsers = [...new Set(notifyUsers)];

            await notificationService.sendExpiryWarningNotification(
              uniqueUsers,
              task.id,
              task.title,
              days
            );

            // Log the notification
            await auditService.logExpiryNotificationSent(task.id, task.title, days);
          }

          console.log(`📤 Sent expiry warnings for ${expiringTasks.length} tasks (${days} days)`);
        }
      } catch (error) {
        console.error('❌ Expiry warning job failed:', error);
      }
    });

    job.start();
    this.jobs.push(job);
    console.log('⏰ Expiry warning job scheduled (daily at 9 AM)');
  }

  // Mark expired tasks (runs daily at midnight)
  startTaskExpirationJob() {
    const job = new cron.CronJob('0 0 * * *', async () => {
      console.log('⏰ Running task expiration job...');
      
      try {
        const now = new Date();
        
        // Find tasks that have expired
        const expiredTasks = await prisma.task.findMany({
          where: {
            expiryDate: {
              lt: now
            },
            status: { in: ['APPROVED', 'PUBLISHED'] }
          }
        });

        // Update expired tasks
        for (const task of expiredTasks) {
          await prisma.task.update({
            where: { id: task.id },
            data: { 
              status: 'EXPIRED',
              closureDate: now,
              closureComments: 'Automatically expired due to expiry date'
            }
          });

          // Log the expiration
          await auditService.logTaskExpired(task.id, task.title);
        }

        console.log(`🔒 Marked ${expiredTasks.length} tasks as expired`);
      } catch (error) {
        console.error('❌ Task expiration job failed:', error);
      }
    });

    job.start();
    this.jobs.push(job);
    console.log('⏰ Task expiration job scheduled (daily at midnight)');
  }

  // Clean up old notifications (runs weekly on Sunday at 2 AM)
  startNotificationCleanupJob() {
    const job = new cron.CronJob('0 2 * * 0', async () => {
      console.log('🧹 Running notification cleanup job...');
      
      try {
        const deletedCount = await notificationService.cleanupOldNotifications(90);
        console.log(`🗑️ Cleaned up ${deletedCount} old notifications`);
        
        await auditService.log({
          action: 'NOTIFICATION_CLEANUP',
          details: `Cleaned up ${deletedCount} old notifications`,
          performedBy: 'SYSTEM'
        });
      } catch (error) {
        console.error('❌ Notification cleanup job failed:', error);
      }
    });

    job.start();
    this.jobs.push(job);
    console.log('⏰ Notification cleanup job scheduled (weekly on Sunday at 2 AM)');
  }

  // Clean up old audit logs (runs monthly on 1st at 3 AM)
  startAuditCleanupJob() {
    const job = new cron.CronJob('0 3 1 * *', async () => {
      console.log('🧹 Running audit log cleanup job...');
      
      try {
        const deletedCount = await auditService.cleanupOldLogs(365); // Keep 1 year
        console.log(`🗑️ Cleaned up ${deletedCount} old audit logs`);
      } catch (error) {
        console.error('❌ Audit cleanup job failed:', error);
      }
    });

    job.start();
    this.jobs.push(job);
    console.log('⏰ Audit cleanup job scheduled (monthly on 1st at 3 AM)');
  }

  // Send daily summary emails (runs daily at 8 AM)
  startDailySummaryJob() {
    const job = new cron.CronJob('0 8 * * *', async () => {
      console.log('📊 Running daily summary job...');
      
      try {
        // Get all active users who want daily summaries
        const users = await prisma.user.findMany({
          where: {
            isActive: true,
            // Add a preference field in future for users who want summaries
          },
          select: { id: true, role: true }
        });

        // Send summary to managers and admins only (to avoid spam)
        const managerRoles = ['PRODUCT_ADMIN', 'COMPLIANCE_ADMIN', 'SENIOR_MANAGER', 'ADMIN'];
        const managementUsers = users.filter(user => managerRoles.includes(user.role));

        for (const user of managementUsers) {
          try {
            await notificationService.sendDailySummaryEmail(user.id);
          } catch (error) {
            console.error(`Failed to send daily summary to user ${user.id}:`, error);
          }
        }

        console.log(`📤 Sent daily summaries to ${managementUsers.length} users`);
      } catch (error) {
        console.error('❌ Daily summary job failed:', error);
      }
    });

    // Uncomment to enable daily summaries
    // job.start();
    // this.jobs.push(job);
    // console.log('⏰ Daily summary job scheduled (daily at 8 AM)');
  }

  // Check for stale tasks (tasks stuck in same status for too long)
  startStaleTaskCheckJob() {
    const job = new cron.CronJob('0 10 * * 1', async () => { // Monday at 10 AM
      console.log('🔍 Running stale task check job...');
      
      try {
        const staleCutoff = new Date();
        staleCutoff.setDate(staleCutoff.getDate() - 7); // 7 days without update

        const staleTasks = await prisma.task.findMany({
          where: {
            updatedAt: {
              lt: staleCutoff
            },
            status: { in: ['OPEN', 'COMPLIANCE_REVIEW', 'PRODUCT_REVIEW'] }
          },
          include: {
            creator: { select: { id: true } },
            assignedProducts: { select: { id: true } },
            assignedCompliance: { select: { id: true } }
          }
        });

        // Send follow-up notifications
        for (const task of staleTasks) {
          const notifyUsers = [
            task.creator.id,
            ...task.assignedProducts.map(p => p.id),
            ...(task.assignedCompliance ? [task.assignedCompliance.id] : [])
          ];

          const uniqueUsers = [...new Set(notifyUsers)];

          await notificationService.sendBulkNotification({
            userIds: uniqueUsers,
            title: 'Task Requires Attention',
            message: `Task "${task.title}" has been inactive for over 7 days. Please review and take action.`,
            type: 'FOLLOW_UP',
            taskId: task.id,
            sendEmail: true
          });
        }

        console.log(`👀 Found and notified about ${staleTasks.length} stale tasks`);
      } catch (error) {
        console.error('❌ Stale task check job failed:', error);
      }
    });

    job.start();
    this.jobs.push(job);
    console.log('⏰ Stale task check job scheduled (weekly on Monday at 10 AM)');
  }

  // Auto-reassign tasks from absent users (runs daily at 6 AM)
  startAbsenceReassignmentJob() {
    const job = new cron.CronJob('0 6 * * *', async () => {
      console.log('👤 Running absence reassignment job...');
      
      try {
        const today = new Date();
        
        // Find users who are absent today
        const absentUsers = await prisma.absence.findMany({
          where: {
            fromDate: { lte: today },
            toDate: { gte: today }
          },
          include: {
            user: { 
              select: { 
                id: true, 
                fullName: true, 
                role: true 
              } 
            }
          }
        });

        for (const absence of absentUsers) {
          if (!['COMPLIANCE_USER', 'COMPLIANCE_ADMIN'].includes(absence.user.role)) {
            continue; // Only reassign compliance tasks
          }

          // Find active tasks assigned to this absent user
          const activeTasks = await prisma.task.findMany({
            where: {
              assignedComplianceId: absence.user.id,
              status: { in: ['OPEN', 'COMPLIANCE_REVIEW'] }
            }
          });

          if (activeTasks.length === 0) continue;

          // Find available compliance users
          const availableUsers = await prisma.user.findMany({
            where: {
              role: { in: ['COMPLIANCE_USER', 'COMPLIANCE_ADMIN'] },
              isActive: true,
              id: { not: absence.user.id },
              NOT: {
                absences: {
                  some: {
                    fromDate: { lte: today },
                    toDate: { gte: today }
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

          if (availableUsers.length === 0) continue;

          // Select user with least workload
          const targetUser = availableUsers.reduce((prev, current) =>
            (prev.complianceTasks.length < current.complianceTasks.length) ? prev : current
          );

          // Reassign tasks
          for (const task of activeTasks) {
            await prisma.task.update({
              where: { id: task.id },
              data: { assignedComplianceId: targetUser.id }
            });

            // Notify the new assignee
            await notificationService.sendNotification({
              userId: targetUser.id,
              title: 'Task Reassigned Due to Absence',
              message: `Task "${task.title}" has been reassigned to you due to ${absence.user.fullName}'s absence`,
              type: 'TASK_ASSIGNED',
              taskId: task.id,
              sendEmail: true
            });

            // Log the reassignment
            await auditService.logTaskReassigned(
              task.id,
              task.title,
              absence.user.fullName,
              targetUser.fullName,
              'SYSTEM'
            );
          }

          console.log(`↔️ Reassigned ${activeTasks.length} tasks from ${absence.user.fullName} to ${targetUser.fullName}`);
        }
      } catch (error) {
        console.error('❌ Absence reassignment job failed:', error);
      }
    });

    job.start();
    this.jobs.push(job);
    console.log('⏰ Absence reassignment job scheduled (daily at 6 AM)');
  }

  // Stop all cron jobs
  stopAllJobs() {
    this.jobs.forEach(job => {
      job.stop();
    });
    this.jobs = [];
    console.log('⏹️ All cron jobs stopped');
  }

  // Get job status
  getJobStatus() {
    return {
      totalJobs: this.jobs.length,
      runningJobs: this.jobs.filter(job => job.running).length
    };
  }
}

module.exports = new CronService();