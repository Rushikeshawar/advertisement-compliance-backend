const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

// Initialize Prisma with DocumentDB-specific settings
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
});

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Fetch user from database to ensure they're still active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        team: true
      }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'User not found or inactive' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ message: 'Invalid token' });
    }
    return res.status(500).json({ message: 'Token verification failed' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: 'Insufficient permissions',
        required: roles,
        current: req.user.role
      });
    }

    next();
  };
};

const checkTaskAccess = async (req, res, next) => {
  try {
    const taskId = req.params.taskId || req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Admin and Senior Manager have full access
    if (['ADMIN', 'SENIOR_MANAGER'].includes(userRole)) {
      return next();
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        createdBy: true,
        assignedProductIds: true,
        assignedComplianceId: true
      }
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Check access based on role
    let hasAccess = false;

    if (userRole === 'PRODUCT_USER' || userRole === 'PRODUCT_ADMIN') {
      // Product users can only access their own or team tasks
      hasAccess = task.createdBy === userId || 
                  task.assignedProductIds.includes(userId);
    } else if (userRole === 'COMPLIANCE_USER' || userRole === 'COMPLIANCE_ADMIN') {
      // Compliance users can access assigned tasks or all tasks (for admin)
      hasAccess = task.assignedComplianceId === userId || 
                  userRole === 'COMPLIANCE_ADMIN';
    }

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this task' });
    }

    req.task = task;
    next();
  } catch (error) {
    console.error('Task access check error:', error);
    res.status(500).json({ message: 'Error checking task access' });
  }
};

module.exports = {
  authenticateToken,
  authorize,
  checkTaskAccess
};