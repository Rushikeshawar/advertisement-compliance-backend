const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const taskRoutes = require('./routes/tasks');
const reportRoutes = require('./routes/reports');
const notificationRoutes = require('./routes/notifications');
const auditRoutes = require('./routes/audit');
const uploadRoutes = require('./routes/upload');

// Import middleware
const { authenticateToken } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

// Import services
const notificationService = require('./services/notificationService');
const cronService = require('./services/cronService');

const app = express();

// DocumentDB-specific Prisma configuration
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error']
});

// Security middleware
app.use(helmet());
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// MongoDB ObjectId validation middleware
const validateObjectId = (paramName) => {
  return (req, res, next) => {
    const id = req.params[paramName];
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({ 
        message: `Invalid ${paramName} format. Must be a valid MongoDB ObjectId (24 hex characters).`,
        example: "507f1f77bcf86cd799439011"
      });
    }
    next();
  };
};

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    res.status(200).json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'DocumentDB',
      environment: process.env.NODE_ENV
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      database: 'DocumentDB - Connection Test Failed',
      error: error.message
    });
  }
});

// DocumentDB connection test endpoint
app.get('/api/test-db', async (req, res) => {
  try {
    // Test basic connection without querying data
    await prisma.$connect();
    
    res.json({
      success: true,
      message: 'DocumentDB connection successful',
      database: 'DocumentDB',
      cluster: 'advertisement-compliance.cluster-czwqu2g268xr.eu-north-1.docdb.amazonaws.com',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'DocumentDB connection test failed',
      error: error.message,
      troubleshooting: {
        checkSecurityGroup: 'Ensure DocumentDB security group allows port 27017 from your IP',
        checkVPC: 'Verify DocumentDB is in correct VPC/subnet configuration',
        checkSSL: 'Confirm global-bundle.pem certificate is present'
      }
    });
  }
});

// Test endpoint that tries a simple query
app.get('/api/test-db-query', async (req, res) => {
  try {
    await prisma.$connect();
    
    // Try a simple count query
    const userCount = await prisma.user.count();
    
    res.json({
      success: true,
      message: 'DocumentDB query successful',
      userCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'DocumentDB query failed',
      error: error.message
    });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/tasks', authenticateToken, taskRoutes);
app.use('/api/reports', authenticateToken, reportRoutes);
app.use('/api/notifications', authenticateToken, notificationRoutes);
app.use('/api/audit', authenticateToken, auditRoutes);
app.use('/api/upload', authenticateToken, uploadRoutes);

// Default route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Advertisement Compliance Tool API',
    version: '1.0.0',
    database: 'Amazon DocumentDB',
    documentation: '/api/docs',
    endpoints: {
      health: '/health',
      'test-db': '/api/test-db',
      'test-db-query': '/api/test-db-query',
      auth: '/api/auth',
      tasks: '/api/tasks',
      users: '/api/users',
      reports: '/api/reports',
      notifications: '/api/notifications',
      audit: '/api/audit',
      upload: '/api/upload'
    }
  });
});

// API info route
app.get('/api', (req, res) => {
  res.json({
    message: 'Advertisement Compliance Tool API',
    version: '1.0.0',
    database: 'Amazon DocumentDB',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/auth',
      users: '/api/users', 
      tasks: '/api/tasks',
      reports: '/api/reports',
      notifications: '/api/notifications',
      audit: '/api/audit',
      upload: '/api/upload'
    }
  });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`Received ${signal}. Graceful shutdown...`);
  
  try {
    // Stop cron services
    if (cronService && cronService.stopAllJobs) {
      cronService.stopAllJobs();
      console.log('📅 Cron services stopped');
    }

    // Disconnect from DocumentDB
    await prisma.$disconnect();
    console.log('🔌 DocumentDB disconnected');

    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

const PORT = process.env.PORT || 5000;

// Start server without database validation
const startServer = async () => {
  try {
    console.log('🚀 Starting Advertisement Compliance API Server...');
    console.log(`📊 Environment: ${process.env.NODE_ENV}`);
    console.log(`💾 Database: Amazon DocumentDB`);
    
    // Check if SSL certificate exists
    const certPath = path.join(process.cwd(), 'global-bundle.pem');
    if (fs.existsSync(certPath)) {
      console.log('✅ SSL certificate found');
    } else {
      console.log('⚠️ SSL certificate not found - this may cause connection issues');
    }
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`🧪 DB test: http://localhost:${PORT}/api/test-db`);
      console.log(`📊 API info: http://localhost:${PORT}/api`);
      
      // Start cron services (with error handling)
      try {
        cronService.startExpiryNotifications();
        console.log('📅 Cron services started');
      } catch (cronError) {
        console.error('⚠️ Warning: Cron services failed to start:', cronError.message);
      }
      
      console.log('\n📝 Next steps:');
      console.log('1. Test connection: http://localhost:5000/api/test-db');
      console.log('2. If connection fails, check DocumentDB security group settings');
      console.log('3. Ensure port 27017 is open for your IP address');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;