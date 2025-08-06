const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class AuditService {
  
  // Generic audit logging method
  async log({ action, details, performedBy, taskId = null }) {
    try {
      await prisma.auditLog.create({
        data: {
          action,
          details,
          performedBy,
          taskId
        }
      });
      
      console.log(`📋 AUDIT: ${action} - ${details}`);
    } catch (error) {
      console.error('Audit log error:', error);
      // Don't throw error to avoid breaking main functionality
    }
  }

  // Task-related audit logs
  async logTaskCreated(taskId, taskTitle, performedBy) {
    await this.log({
      action: 'TASK_CREATED',
      details: `Task "${taskTitle}" created`,
      performedBy,
      taskId
    });
  }

  async logTaskUpdated(taskId, taskTitle, updatedFields, performedBy) {
    await this.log({
      action: 'TASK_UPDATED',
      details: `Task "${taskTitle}" updated: ${updatedFields.join(', ')}`,
      performedBy,
      taskId
    });
  }

  async logTaskStatusChanged(taskId, taskTitle, oldStatus, newStatus, performedBy) {
    await this.log({
      action: 'TASK_STATUS_CHANGED',
      details: `Task "${taskTitle}" status changed from ${oldStatus} to ${newStatus}`,
      performedBy,
      taskId
    });
  }

  async logTaskApproved(taskId, taskTitle, approvalType, performedBy) {
    await this.log({
      action: 'TASK_APPROVED',
      details: `Task "${taskTitle}" approved (${approvalType})`,
      performedBy,
      taskId
    });
  }

  async logTaskRejected(taskId, taskTitle, rejectionReason, performedBy) {
    await this.log({
      action: 'TASK_REJECTED',
      details: `Task "${taskTitle}" rejected: ${rejectionReason}`,
      performedBy,
      taskId
    });
  }

  async logTaskPublished(taskId, taskTitle, publishDate, performedBy) {
    await this.log({
      action: 'TASK_PUBLISHED',
      details: `Task "${taskTitle}" published on ${publishDate}`,
      performedBy,
      taskId
    });
  }

  async logTaskClosed(taskId, taskTitle, closureReason, performedBy) {
    await this.log({
      action: 'TASK_CLOSED',
      details: `Task "${taskTitle}" closed: ${closureReason}`,
      performedBy,
      taskId
    });
  }

  async logTaskExpired(taskId, taskTitle) {
    await this.log({
      action: 'TASK_EXPIRED',
      details: `Task "${taskTitle}" has expired`,
      performedBy: 'SYSTEM',
      taskId
    });
  }

  async logTaskReassigned(taskId, taskTitle, fromUser, toUser, performedBy) {
    await this.log({
      action: 'TASK_REASSIGNED',
      details: `Task "${taskTitle}" reassigned from ${fromUser} to ${toUser}`,
      performedBy,
      taskId
    });
  }

  async logTaskReopened(taskId, taskTitle, reason, performedBy) {
    await this.log({
      action: 'TASK_REOPENED',
      details: `Task "${taskTitle}" reopened: ${reason}`,
      performedBy,
      taskId
    });
  }

  // Version-related audit logs
  async logVersionUploaded(taskId, taskTitle, versionNumber, fileCount, performedBy) {
    await this.log({
      action: 'VERSION_UPLOADED',
      details: `Version ${versionNumber} uploaded for task "${taskTitle}" with ${fileCount} files`,
      performedBy,
      taskId
    });
  }

  async logVersionDeleted(taskId, taskTitle, versionNumber, performedBy) {
    await this.log({
      action: 'VERSION_DELETED',
      details: `Version ${versionNumber} deleted from task "${taskTitle}"`,
      performedBy,
      taskId
    });
  }

  // Comment-related audit logs
  async logCommentAdded(taskId, taskTitle, isGlobal, versionNumber, performedBy) {
    const commentType = isGlobal ? 'global comment' : `comment on version ${versionNumber}`;
    await this.log({
      action: 'COMMENT_ADDED',
      details: `${commentType} added to task "${taskTitle}"`,
      performedBy,
      taskId
    });
  }

  async logCommentUpdated(taskId, taskTitle, commentId, performedBy) {
    await this.log({
      action: 'COMMENT_UPDATED',
      details: `Comment updated on task "${taskTitle}"`,
      performedBy,
      taskId
    });
  }

  async logCommentDeleted(taskId, taskTitle, commentId, performedBy) {
    await this.log({
      action: 'COMMENT_DELETED',
      details: `Comment deleted from task "${taskTitle}"`,
      performedBy,
      taskId
    });
  }

  // Exchange approval audit logs
  async logExchangeApprovalAdded(taskId, taskTitle, exchangeName, performedBy) {
    await this.log({
      action: 'EXCHANGE_APPROVAL_ADDED',
      details: `Exchange approval entry added for ${exchangeName} on task "${taskTitle}"`,
      performedBy,
      taskId
    });
  }

  async logExchangeApprovalUpdated(taskId, taskTitle, exchangeName, updatedFields, performedBy) {
    await this.log({
      action: 'EXCHANGE_APPROVAL_UPDATED',
      details: `Exchange approval for ${exchangeName} updated on task "${taskTitle}": ${updatedFields.join(', ')}`,
      performedBy,
      taskId
    });
  }

  async logExchangeApprovalDeleted(taskId, taskTitle, exchangeName, performedBy) {
    await this.log({
      action: 'EXCHANGE_APPROVAL_DELETED',
      details: `Exchange approval for ${exchangeName} deleted from task "${taskTitle}"`,
      performedBy,
      taskId
    });
  }

  async logExchangeStatusChanged(taskId, taskTitle, exchangeName, oldStatus, newStatus, performedBy) {
    await this.log({
      action: 'EXCHANGE_STATUS_CHANGED',
      details: `Exchange ${exchangeName} status changed from ${oldStatus} to ${newStatus} for task "${taskTitle}"`,
      performedBy,
      taskId
    });
  }

  // User management audit logs
  async logUserCreated(username, role, performedBy) {
    await this.log({
      action: 'USER_CREATED',
      details: `User "${username}" created with role ${role}`,
      performedBy
    });
  }

  async logUserUpdated(username, updatedFields, performedBy) {
    await this.log({
      action: 'USER_UPDATED',
      details: `User "${username}" updated: ${updatedFields.join(', ')}`,
      performedBy
    });
  }

  async logUserRoleChanged(username, oldRole, newRole, performedBy) {
    await this.log({
      action: 'USER_ROLE_CHANGED',
      details: `User "${username}" role changed from ${oldRole} to ${newRole}`,
      performedBy
    });
  }

  async logUserDeactivated(username, performedBy) {
    await this.log({
      action: 'USER_DEACTIVATED',
      details: `User "${username}" deactivated`,
      performedBy
    });
  }

  async logUserReactivated(username, performedBy) {
    await this.log({
      action: 'USER_REACTIVATED',
      details: `User "${username}" reactivated`,
      performedBy
    });
  }

  async logUserDeleted(username, performedBy) {
    await this.log({
      action: 'USER_DELETED',
      details: `User "${username}" deleted`,
      performedBy
    });
  }

  // Authentication audit logs
  async logPasswordReset(username, performedBy) {
    await this.log({
      action: 'PASSWORD_RESET',
      details: `Password reset for user "${username}"`,
      performedBy
    });
  }

  async logPasswordChanged(username, performedBy) {
    await this.log({
      action: 'PASSWORD_CHANGED',
      details: `Password changed for user "${username}"`,
      performedBy
    });
  }

  async logLogin(username, ipAddress = null, userAgent = null) {
    await this.log({
      action: 'USER_LOGIN',
      details: `User "${username}" logged in${ipAddress ? ` from ${ipAddress}` : ''}${userAgent ? ` using ${userAgent}` : ''}`,
      performedBy: username // This will need to be resolved to user ID
    });
  }

  async logLogout(username, performedBy) {
    await this.log({
      action: 'USER_LOGOUT',
      details: `User "${username}" logged out`,
      performedBy
    });
  }

  async logFailedLogin(username, ipAddress = null, reason = 'Invalid credentials') {
    await this.log({
      action: 'LOGIN_FAILED',
      details: `Failed login attempt for "${username}"${ipAddress ? ` from ${ipAddress}` : ''}: ${reason}`,
      performedBy: 'SYSTEM'
    });
  }

  async logAccountLocked(username, performedBy = 'SYSTEM') {
    await this.log({
      action: 'ACCOUNT_LOCKED',
      details: `Account locked for user "${username}"`,
      performedBy
    });
  }

  async logAccountUnlocked(username, performedBy) {
    await this.log({
      action: 'ACCOUNT_UNLOCKED',
      details: `Account unlocked for user "${username}"`,
      performedBy
    });
  }

  // Absence management audit logs
  async logAbsenceCreated(userName, fromDate, toDate, reason, performedBy) {
    await this.log({
      action: 'ABSENCE_CREATED',
      details: `Absence marked for ${userName} from ${fromDate} to ${toDate}${reason ? `: ${reason}` : ''}`,
      performedBy
    });
  }

  async logAbsenceUpdated(userName, updatedFields, performedBy) {
    await this.log({
      action: 'ABSENCE_UPDATED',
      details: `Absence updated for ${userName}: ${updatedFields.join(', ')}`,
      performedBy
    });
  }

  async logAbsenceDeleted(userName, performedBy) {
    await this.log({
      action: 'ABSENCE_DELETED',
      details: `Absence deleted for ${userName}`,
      performedBy
    });
  }

  // File management audit logs
  async logFileUploaded(fileName, fileSize, uploadType, uploadedBy, taskId = null) {
    await this.log({
      action: 'FILE_UPLOADED',
      details: `File "${fileName}" uploaded (${Math.round(fileSize / 1024)}KB) - ${uploadType}`,
      performedBy: uploadedBy,
      taskId
    });
  }

  async logFileDeleted(fileName, deletedBy, taskId = null) {
    await this.log({
      action: 'FILE_DELETED',
      details: `File "${fileName}" deleted`,
      performedBy: deletedBy,
      taskId
    });
  }

  async logFileDownloaded(fileName, downloadedBy, taskId = null) {
    await this.log({
      action: 'FILE_DOWNLOADED',
      details: `File "${fileName}" downloaded`,
      performedBy: downloadedBy,
      taskId
    });
  }

  // Notification audit logs
  async logNotificationSent(notificationType, recipientCount, details, performedBy = 'SYSTEM') {
    await this.log({
      action: 'NOTIFICATION_SENT',
      details: `${notificationType} notification sent to ${recipientCount} users: ${details}`,
      performedBy
    });
  }

  async logEmailSent(emailType, recipient, subject, performedBy = 'SYSTEM') {
    await this.log({
      action: 'EMAIL_SENT',
      details: `${emailType} email sent to ${recipient}: "${subject}"`,
      performedBy
    });
  }

  async logEmailFailed(emailType, recipient, error, performedBy = 'SYSTEM') {
    await this.log({
      action: 'EMAIL_FAILED',
      details: `Failed to send ${emailType} email to ${recipient}: ${error}`,
      performedBy
    });
  }

  // System audit logs
  async logExpiryNotificationSent(taskId, taskTitle, daysUntilExpiry) {
    await this.log({
      action: 'EXPIRY_NOTIFICATION_SENT',
      details: `Expiry notification sent for task "${taskTitle}" (${daysUntilExpiry} days remaining)`,
      performedBy: 'SYSTEM',
      taskId
    });
  }

  async logSystemBackup(backupType, status, details, performedBy = 'SYSTEM') {
    await this.log({
      action: 'SYSTEM_BACKUP',
      details: `${backupType} backup ${status}: ${details}`,
      performedBy
    });
  }

  async logSystemMaintenance(maintenanceType, status, details, performedBy = 'SYSTEM') {
    await this.log({
      action: 'SYSTEM_MAINTENANCE',
      details: `${maintenanceType} maintenance ${status}: ${details}`,
      performedBy
    });
  }

  async logDatabaseMigration(migrationName, status, performedBy = 'SYSTEM') {
    await this.log({
      action: 'DATABASE_MIGRATION',
      details: `Database migration "${migrationName}" ${status}`,
      performedBy
    });
  }

  async logCronJobExecuted(jobName, status, details, performedBy = 'SYSTEM') {
    await this.log({
      action: 'CRON_JOB_EXECUTED',
      details: `Cron job "${jobName}" ${status}: ${details}`,
      performedBy
    });
  }

  // Bulk operations audit logs
  async logBulkAction(action, affectedCount, criteria, performedBy) {
    await this.log({
      action: `BULK_${action.toUpperCase()}`,
      details: `Bulk ${action}: ${affectedCount} items affected with criteria: ${criteria}`,
      performedBy
    });
  }

  async logBulkExport(exportType, recordCount, format, performedBy) {
    await this.log({
      action: 'BULK_EXPORT',
      details: `Exported ${recordCount} ${exportType} records in ${format} format`,
      performedBy
    });
  }

  async logBulkImport(importType, recordCount, status, performedBy) {
    await this.log({
      action: 'BULK_IMPORT',
      details: `Imported ${recordCount} ${importType} records - ${status}`,
      performedBy
    });
  }

  // Report generation audit logs
  async logReportGenerated(reportType, parameters, recordCount, performedBy) {
    await this.log({
      action: 'REPORT_GENERATED',
      details: `${reportType} report generated with ${recordCount} records. Parameters: ${JSON.stringify(parameters)}`,
      performedBy
    });
  }

  async logReportExported(reportType, format, performedBy) {
    await this.log({
      action: 'REPORT_EXPORTED',
      details: `${reportType} report exported in ${format} format`,
      performedBy
    });
  }

  // Security audit logs
  async logSecurityEvent(eventType, details, severity = 'INFO', ipAddress = null, performedBy = 'SYSTEM') {
    await this.log({
      action: `SECURITY_${eventType.toUpperCase()}`,
      details: `[${severity}] ${details}${ipAddress ? ` from ${ipAddress}` : ''}`,
      performedBy
    });
  }

  async logPermissionDenied(action, resource, reason, performedBy) {
    await this.log({
      action: 'PERMISSION_DENIED',
      details: `Access denied for ${action} on ${resource}: ${reason}`,
      performedBy
    });
  }

  async logSuspiciousActivity(activityType, details, ipAddress, performedBy = 'SYSTEM') {
    await this.log({
      action: 'SUSPICIOUS_ACTIVITY',
      details: `${activityType}: ${details} from ${ipAddress}`,
      performedBy
    });
  }

  // API audit logs
  async logApiRequest(method, endpoint, statusCode, responseTime, performedBy) {
    await this.log({
      action: 'API_REQUEST',
      details: `${method} ${endpoint} - ${statusCode} (${responseTime}ms)`,
      performedBy
    });
  }

  async logApiRateLimit(endpoint, ipAddress, performedBy = 'SYSTEM') {
    await this.log({
      action: 'API_RATE_LIMIT',
      details: `Rate limit exceeded for ${endpoint} from ${ipAddress}`,
      performedBy
    });
  }

  async logApiError(method, endpoint, error, performedBy) {
    await this.log({
      action: 'API_ERROR',
      details: `${method} ${endpoint} failed: ${error}`,
      performedBy
    });
  }

  // Cleanup and maintenance audit logs
  async logDataCleanup(cleanupType, deletedCount, criteria, performedBy = 'SYSTEM') {
    await this.log({
      action: 'DATA_CLEANUP',
      details: `${cleanupType} cleanup: ${deletedCount} records deleted with criteria: ${criteria}`,
      performedBy
    });
  }

  async logAuditCleanup(deletedCount, performedBy = 'SYSTEM') {
    await this.log({
      action: 'AUDIT_CLEANUP',
      details: `Cleaned up ${deletedCount} old audit logs`,
      performedBy
    });
  }

  async logNotificationCleanup(deletedCount, performedBy = 'SYSTEM') {
    await this.log({
      action: 'NOTIFICATION_CLEANUP',
      details: `Cleaned up ${deletedCount} old notifications`,
      performedBy
    });
  }

  // Configuration audit logs
  async logConfigurationChanged(configType, oldValue, newValue, performedBy) {
    await this.log({
      action: 'CONFIGURATION_CHANGED',
      details: `${configType} changed from "${oldValue}" to "${newValue}"`,
      performedBy
    });
  }

  async logFeatureToggled(featureName, status, performedBy) {
    await this.log({
      action: 'FEATURE_TOGGLED',
      details: `Feature "${featureName}" ${status ? 'enabled' : 'disabled'}`,
      performedBy
    });
  }

  // Query methods for retrieving audit data

  // Get audit trail for a specific task
  async getTaskAuditTrail(taskId, limit = 50) {
    try {
      return await prisma.auditLog.findMany({
        where: { taskId },
        orderBy: { timestamp: 'desc' },
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
      });
    } catch (error) {
      console.error('Get task audit trail error:', error);
      return [];
    }
  }

  // Get user activity summary
  async getUserActivitySummary(userId, dateFrom, dateTo) {
    try {
      const whereClause = {
        performedBy: userId,
        ...(dateFrom && { timestamp: { gte: new Date(dateFrom) } }),
        ...(dateTo && { timestamp: { lte: new Date(dateTo) } })
      };

      const [logs, actionCounts] = await Promise.all([
        prisma.auditLog.findMany({
          where: whereClause,
          orderBy: { timestamp: 'desc' },
          take: 100
        }),
        prisma.auditLog.groupBy({
          by: ['action'],
          where: whereClause,
          _count: {
            action: true
          }
        })
      ]);

      return {
        totalActions: logs.length,
        actionBreakdown: actionCounts.reduce((acc, item) => {
          acc[item.action] = item._count.action;
          return acc;
        }, {}),
        recentActivity: logs.slice(0, 20)
      };
    } catch (error) {
      console.error('Get user activity summary error:', error);
      return {
        totalActions: 0,
        actionBreakdown: {},
        recentActivity: []
      };
    }
  }

  // Get system activity summary
  async getSystemActivitySummary(dateFrom, dateTo) {
    try {
      const whereClause = {
        ...(dateFrom && { timestamp: { gte: new Date(dateFrom) } }),
        ...(dateTo && { timestamp: { lte: new Date(dateTo) } })
      };

      const [
        totalLogs,
        actionDistribution,
        userActivity,
        systemActivity
      ] = await Promise.all([
        prisma.auditLog.count({ where: whereClause }),
        prisma.auditLog.groupBy({
          by: ['action'],
          where: whereClause,
          _count: { action: true },
          orderBy: { _count: { action: 'desc' } },
          take: 10
        }),
        prisma.auditLog.groupBy({
          by: ['performedBy'],
          where: { ...whereClause, performedBy: { not: 'SYSTEM' } },
          _count: { performedBy: true },
          orderBy: { _count: { performedBy: 'desc' } },
          take: 10
        }),
        prisma.auditLog.count({
          where: { ...whereClause, performedBy: 'SYSTEM' }
        })
      ]);

      return {
        totalLogs,
        actionDistribution,
        topActiveUsers: userActivity,
        systemActivityCount: systemActivity
      };
    } catch (error) {
      console.error('Get system activity summary error:', error);
      return {
        totalLogs: 0,
        actionDistribution: [],
        topActiveUsers: [],
        systemActivityCount: 0
      };
    }
  }

  // Get audit logs with filters
  async getAuditLogs(filters = {}, pagination = {}) {
    try {
      const {
        action,
        performedBy,
        taskId,
        dateFrom,
        dateTo
      } = filters;

      const {
        page = 1,
        limit = 50
      } = pagination;

      const whereClause = {};

      if (action) whereClause.action = action;
      if (performedBy) whereClause.performedBy = performedBy;
      if (taskId) whereClause.taskId = taskId;
      
      if (dateFrom || dateTo) {
        whereClause.timestamp = {};
        if (dateFrom) whereClause.timestamp.gte = new Date(dateFrom);
        if (dateTo) whereClause.timestamp.lte = new Date(dateTo);
      }

      const [logs, totalCount] = await Promise.all([
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

      return {
        logs,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasNext: page * limit < totalCount,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      console.error('Get audit logs error:', error);
      return {
        logs: [],
        pagination: {
          page: 1,
          limit: 50,
          totalCount: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false
        }
      };
    }
  }

  // Clean up old audit logs (for maintenance)
  async cleanupOldLogs(daysToKeep = 365) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const deleteResult = await prisma.auditLog.deleteMany({
        where: {
          timestamp: {
            lt: cutoffDate
          }
        }
      });

      await this.log({
        action: 'AUDIT_CLEANUP',
        details: `Cleaned up ${deleteResult.count} audit logs older than ${daysToKeep} days`,
        performedBy: 'SYSTEM'
      });

      return deleteResult.count;
    } catch (error) {
      console.error('Cleanup old logs error:', error);
      return 0;
    }
  }

  // Get audit statistics
  async getAuditStatistics(dateFrom, dateTo) {
    try {
      const whereClause = {};
      
      if (dateFrom || dateTo) {
        whereClause.timestamp = {};
        if (dateFrom) whereClause.timestamp.gte = new Date(dateFrom);
        if (dateTo) whereClause.timestamp.lte = new Date(dateTo);
      }

      const [
        totalLogs,
        uniqueUsers,
        uniqueTasks,
        topActions,
        dailyActivity
      ] = await Promise.all([
        prisma.auditLog.count({ where: whereClause }),
        prisma.auditLog.findMany({
          where: { ...whereClause, performedBy: { not: 'SYSTEM' } },
          distinct: ['performedBy']
        }),
        prisma.auditLog.findMany({
          where: { ...whereClause, taskId: { not: null } },
          distinct: ['taskId']
        }),
        prisma.auditLog.groupBy({
          by: ['action'],
          where: whereClause,
          _count: { action: true },
          orderBy: { _count: { action: 'desc' } },
          take: 10
        }),
        this.getDailyActivityStats(dateFrom, dateTo)
      ]);

      return {
        totalLogs,
        uniqueUsers: uniqueUsers.length,
        uniqueTasks: uniqueTasks.length,
        topActions,
        dailyActivity
      };
    } catch (error) {
      console.error('Get audit statistics error:', error);
      return {
        totalLogs: 0,
        uniqueUsers: 0,
        uniqueTasks: 0,
        topActions: [],
        dailyActivity: []
      };
    }
  }

  // Get daily activity statistics
  async getDailyActivityStats(dateFrom, dateTo) {
    try {
      const startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default 30 days
      const endDate = dateTo ? new Date(dateTo) : new Date();

      const dailyStats = [];
      const currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        const dayStart = new Date(currentDate);
        dayStart.setHours(0, 0, 0, 0);
        
        const dayEnd = new Date(currentDate);
        dayEnd.setHours(23, 59, 59, 999);

        const count = await prisma.auditLog.count({
          where: {
            timestamp: {
              gte: dayStart,
              lte: dayEnd
            }
          }
        });

        dailyStats.push({
          date: currentDate.toISOString().split('T')[0],
          count
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }

      return dailyStats;
    } catch (error) {
      console.error('Get daily activity stats error:', error);
      return [];
    }
  }

  // Export audit logs for compliance
  async exportAuditLogs(filters = {}, format = 'JSON') {
    try {
      const logs = await this.getAuditLogs(filters, { page: 1, limit: 10000 });

      if (format.toUpperCase() === 'CSV') {
        return this.convertLogsToCSV(logs.logs);
      }

      return {
        format: 'JSON',
        exportDate: new Date().toISOString(),
        filters,
        totalRecords: logs.pagination.totalCount,
        data: logs.logs
      };
    } catch (error) {
      console.error('Export audit logs error:', error);
      return null;
    }
  }

  // Convert logs to CSV format
  convertLogsToCSV(logs) {
    const headers = [
      'Timestamp',
      'Action',
      'Details',
      'Performed By',
      'User Role',
      'Task UIN',
      'Task Title'
    ];

    const csvData = logs.map(log => [
      log.timestamp.toISOString(),
      log.action,
      log.details,
      log.performedBy.fullName || log.performedBy,
      log.performedBy.role || 'N/A',
      log.task?.uin || '',
      log.task?.title || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(field => `"${field}"`).join(','))
    ].join('\n');

    return {
      format: 'CSV',
      content: csvContent,
      filename: `audit_logs_${new Date().toISOString().split('T')[0]}.csv`
    };
  }
}

module.exports = new AuditService();