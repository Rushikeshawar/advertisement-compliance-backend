 
const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Import all routes
const authRoutes = require('./auth');
const userRoutes = require('./users');
const taskRoutes = require('./tasks');
const reportRoutes = require('./reports');
const notificationRoutes = require('./notifications');
const auditRoutes = require('./audit');
const uploadRoutes = require('./upload');

// Public routes (no authentication required)
router.use('/auth', authRoutes);

// Protected routes (authentication required)
router.use('/users', authenticateToken, userRoutes);
router.use('/tasks', authenticateToken, taskRoutes);
router.use('/reports', authenticateToken, reportRoutes);
router.use('/notifications', authenticateToken, notificationRoutes);
router.use('/audit', authenticateToken, auditRoutes);
router.use('/upload', authenticateToken, uploadRoutes);

// API Info route
router.get('/', (req, res) => {
  res.json({
    message: 'Advertisement Compliance Tool API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      tasks: '/api/tasks',
      reports: '/api/reports',
      notifications: '/api/notifications',
      audit: '/api/audit',
      upload: '/api/upload'
    },
    documentation: '/api/docs'
  });
});

// API status route
router.get('/status', (req, res) => {
  res.json({
    api: 'Advertisement Compliance Tool',
    status: 'running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    node_version: process.version,
    platform: process.platform,
    architecture: process.arch
  });
});

// 404 handler for API routes
router.use('*', (req, res) => {
  res.status(404).json({
    message: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;