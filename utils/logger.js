 
const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logsDir = path.join(process.cwd(), 'logs');
    this.ensureLogsDirectory();
  }

  ensureLogsDirectory() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  getLogFileName(type = 'app') {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logsDir, `${type}-${date}.log`);
  }

  formatMessage(level, message, meta = null) {
    const timestamp = new Date().toISOString();
    let formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    if (meta) {
      formattedMessage += ` | Meta: ${JSON.stringify(meta)}`;
    }
    
    return formattedMessage + '\n';
  }

  writeToFile(filename, message) {
    try {
      fs.appendFileSync(filename, message, 'utf8');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  info(message, meta = null) {
    const formattedMessage = this.formatMessage('INFO', message, meta);
    console.log(`ℹ️  ${message}`, meta ? meta : '');
    this.writeToFile(this.getLogFileName('app'), formattedMessage);
  }

  error(message, error = null, meta = null) {
    const errorMeta = {
      ...meta,
      ...(error && {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        }
      })
    };
    
    const formattedMessage = this.formatMessage('ERROR', message, errorMeta);
    console.error(`❌ ${message}`, error || '', meta || '');
    this.writeToFile(this.getLogFileName('error'), formattedMessage);
  }

  warn(message, meta = null) {
    const formattedMessage = this.formatMessage('WARN', message, meta);
    console.warn(`⚠️  ${message}`, meta ? meta : '');
    this.writeToFile(this.getLogFileName('app'), formattedMessage);
  }

  debug(message, meta = null) {
    if (process.env.NODE_ENV === 'development') {
      const formattedMessage = this.formatMessage('DEBUG', message, meta);
      console.log(`🐛 ${message}`, meta ? meta : '');
      this.writeToFile(this.getLogFileName('debug'), formattedMessage);
    }
  }

  http(req, res, responseTime) {
    const message = `${req.method} ${req.originalUrl} - ${res.statusCode} - ${responseTime}ms`;
    const meta = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      userId: req.user ? req.user.id : null
    };

    const formattedMessage = this.formatMessage('HTTP', message, meta);
    
    // Color code based on status
    if (res.statusCode >= 500) {
      console.error(`🔴 ${message}`);
    } else if (res.statusCode >= 400) {
      console.warn(`🟡 ${message}`);
    } else {
      console.log(`🟢 ${message}`);
    }
    
    this.writeToFile(this.getLogFileName('access'), formattedMessage);
  }

  audit(action, details, userId, meta = null) {
    const message = `AUDIT: ${action} - ${details}`;
    const auditMeta = {
      action,
      details,
      userId,
      timestamp: new Date().toISOString(),
      ...meta
    };

    const formattedMessage = this.formatMessage('AUDIT', message, auditMeta);
    console.log(`📋 ${message}`);
    this.writeToFile(this.getLogFileName('audit'), formattedMessage);
  }

  security(event, details, meta = null) {
    const message = `SECURITY: ${event} - ${details}`;
    const securityMeta = {
      event,
      details,
      timestamp: new Date().toISOString(),
      ...meta
    };

    const formattedMessage = this.formatMessage('SECURITY', message, securityMeta);
    console.warn(`🔒 ${message}`);
    this.writeToFile(this.getLogFileName('security'), formattedMessage);
  }

  database(operation, table, details, meta = null) {
    const message = `DB: ${operation} on ${table} - ${details}`;
    const dbMeta = {
      operation,
      table,
      details,
      timestamp: new Date().toISOString(),
      ...meta
    };

    const formattedMessage = this.formatMessage('DATABASE', message, dbMeta);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`🗄️  ${message}`);
    }
    
    this.writeToFile(this.getLogFileName('database'), formattedMessage);
  }

  performance(operation, duration, meta = null) {
    const message = `PERF: ${operation} took ${duration}ms`;
    const perfMeta = {
      operation,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      ...meta
    };

    const formattedMessage = this.formatMessage('PERFORMANCE', message, perfMeta);
    
    // Warn if operation took too long
    if (duration > 1000) {
      console.warn(`⚡ SLOW: ${message}`);
    } else if (process.env.NODE_ENV === 'development') {
      console.log(`⚡ ${message}`);
    }
    
    this.writeToFile(this.getLogFileName('performance'), formattedMessage);
  }

  // Clean up old log files (called by cron job)
  cleanupOldLogs(daysToKeep = 30) {
    try {
      const files = fs.readdirSync(this.logsDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      let deletedCount = 0;

      files.forEach(file => {
        if (file.endsWith('.log')) {
          const filePath = path.join(this.logsDir, file);
          const stats = fs.statSync(filePath);
          
          if (stats.mtime < cutoffDate) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        }
      });

      this.info(`Log cleanup completed: ${deletedCount} files deleted`);
      return deletedCount;
    } catch (error) {
      this.error('Log cleanup failed', error);
      return 0;
    }
  }

  // Get log file content
  getLogFile(type, date = null) {
    try {
      const fileName = date 
        ? path.join(this.logsDir, `${type}-${date}.log`)
        : this.getLogFileName(type);

      if (fs.existsSync(fileName)) {
        return fs.readFileSync(fileName, 'utf8');
      }
      return null;
    } catch (error) {
      this.error('Failed to read log file', error);
      return null;
    }
  }

  // Get available log files
  getLogFiles() {
    try {
      const files = fs.readdirSync(this.logsDir);
      return files
        .filter(file => file.endsWith('.log'))
        .map(file => {
          const filePath = path.join(this.logsDir, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            size: stats.size,
            modified: stats.mtime,
            type: file.split('-')[0]
          };
        })
        .sort((a, b) => b.modified - a.modified);
    } catch (error) {
      this.error('Failed to get log files', error);
      return [];
    }
  }
}

// Create singleton instance
const logger = new Logger();

// Express middleware for HTTP logging
const httpLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.http(req, res, duration);
  });
  
  next();
};

module.exports = {
  logger,
  httpLogger
};