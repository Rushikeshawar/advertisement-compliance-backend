 
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Generate unique UIN (Unique Identification Number)
const generateUIN = async () => {
  const currentYear = new Date().getFullYear();
  const prefix = `ACT${currentYear}`;
  
  // Get the last UIN for this year
  const lastTask = await prisma.task.findFirst({
    where: {
      uin: {
        startsWith: prefix
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  let nextNumber = 1;
  if (lastTask) {
    // Extract number from UIN (e.g., ACT2024001 -> 001)
    const lastNumber = parseInt(lastTask.uin.slice(-3));
    nextNumber = lastNumber + 1;
  }

  // Format with leading zeros (e.g., 001, 002, etc.)
  const formattedNumber = nextNumber.toString().padStart(3, '0');
  
  return `${prefix}${formattedNumber}`;
};

// Validate email format
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Format date to readable string
const formatDate = (date, includeTime = false) => {
  if (!date) return '';
  
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(includeTime && {
      hour: '2-digit',
      minute: '2-digit'
    })
  };
  
  return new Date(date).toLocaleDateString('en-US', options);
};

// Calculate days between dates
const daysBetween = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Check if date is within range
const isDateInRange = (date, startDate, endDate) => {
  const checkDate = new Date(date);
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  return checkDate >= start && checkDate <= end;
};

// Sanitize filename for safe storage
const sanitizeFilename = (filename) => {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
};

// Get file extension
const getFileExtension = (filename) => {
  return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2);
};

// Format file size
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Validate task status transition
const isValidStatusTransition = (currentStatus, newStatus) => {
  const validTransitions = {
    'OPEN': ['COMPLIANCE_REVIEW', 'CLOSED_INTERNAL', 'CLOSED_EXCHANGE'],
    'COMPLIANCE_REVIEW': ['PRODUCT_REVIEW', 'APPROVED', 'CLOSED_INTERNAL', 'CLOSED_EXCHANGE'],
    'PRODUCT_REVIEW': ['COMPLIANCE_REVIEW', 'CLOSED_INTERNAL', 'CLOSED_EXCHANGE'],
    'APPROVED': ['PUBLISHED', 'CLOSED_INTERNAL', 'CLOSED_EXCHANGE'],
    'PUBLISHED': ['CLOSED_INTERNAL', 'CLOSED_EXCHANGE'],
    'EXPIRED': [], // Cannot transition from expired
    'CLOSED_INTERNAL': [], // Cannot transition from closed
    'CLOSED_EXCHANGE': [] // Cannot transition from closed
  };

  return validTransitions[currentStatus]?.includes(newStatus) || false;
};

// Get next version number
const getNextVersionNumber = (currentVersion) => {
  if (!currentVersion) return '1.0';
  
  const [major, minor] = currentVersion.split('.').map(Number);
  return `${major}.${minor + 1}`;
};

// Check if user has permission for action
const hasPermission = (userRole, action, resourceType) => {
  const permissions = {
    'ADMIN': ['*'], // Admin has all permissions
    'SENIOR_MANAGER': ['view_all', 'comment', 'export'],
    'COMPLIANCE_ADMIN': [
      'view_compliance', 'manage_compliance_users', 'approve_tasks',
      'manage_exchange', 'view_reports', 'export', 'audit_logs'
    ],
    'COMPLIANCE_USER': [
      'view_assigned', 'comment', 'approve_tasks', 'manage_exchange'
    ],
    'PRODUCT_ADMIN': [
      'view_team', 'create_tasks', 'manage_product_users', 'upload_versions',
      'view_team_reports', 'export'
    ],
    'PRODUCT_USER': [
      'view_own', 'create_tasks', 'upload_versions', 'comment'
    ]
  };

  const userPermissions = permissions[userRole] || [];
  
  // Admin has all permissions
  if (userPermissions.includes('*')) return true;
  
  // Check specific permission
  return userPermissions.includes(action);
};

// Generate random string
const generateRandomString = (length = 10) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return result;
};

// Deep clone object
const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  
  const clonedObj = {};
  for (let key in obj) {
    if (obj.hasOwnProperty(key)) {
      clonedObj[key] = deepClone(obj[key]);
    }
  }
  
  return clonedObj;
};

// Remove sensitive fields from user object
const sanitizeUser = (user) => {
  const sensitiveFields = ['password'];
  const sanitized = { ...user };
  
  sensitiveFields.forEach(field => {
    delete sanitized[field];
  });
  
  return sanitized;
};

// Validate Indian phone number
const isValidIndianPhone = (phone) => {
  const phoneRegex = /^[6-9]\d{9}$/;
  return phoneRegex.test(phone.replace(/\D/g, ''));
};

// Convert string to title case
const toTitleCase = (str) => {
  return str.replace(/\w\S*/g, (txt) => 
    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
};

// Get user initials for avatar
const getUserInitials = (fullName) => {
  if (!fullName) return 'U';
  
  const names = fullName.trim().split(' ');
  if (names.length === 1) {
    return names[0].charAt(0).toUpperCase();
  }
  
  return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
};

// Check if task is overdue
const isTaskOverdue = (task) => {
  const now = new Date();
  
  // Check if expected publish date is passed and task is not published
  if (task.expectedPublishDate && task.status !== 'PUBLISHED') {
    return new Date(task.expectedPublishDate) < now;
  }
  
  // Check if expiry date is passed
  if (task.expiryDate) {
    return new Date(task.expiryDate) < now;
  }
  
  return false;
};

// Get task priority based on dates and status
const getTaskPriority = (task) => {
  const now = new Date();
  
  // High priority: expiring within 3 days
  if (task.expiryDate) {
    const daysUntilExpiry = daysBetween(now, task.expiryDate);
    if (daysUntilExpiry <= 3) return 'HIGH';
    if (daysUntilExpiry <= 7) return 'MEDIUM';
  }
  
  // Check expected publish date
  if (task.expectedPublishDate && task.status !== 'PUBLISHED') {
    const daysUntilPublish = daysBetween(now, task.expectedPublishDate);
    if (daysUntilPublish <= 1) return 'HIGH';
    if (daysUntilPublish <= 3) return 'MEDIUM';
  }
  
  return 'LOW';
};

// Pagination helper
const getPaginationInfo = (page, limit, totalCount) => {
  const totalPages = Math.ceil(totalCount / limit);
  
  return {
    page,
    limit,
    totalCount,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    offset: (page - 1) * limit
  };
};

// Build filter query for Prisma
const buildFilterQuery = (filters) => {
  const query = {};
  
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      switch (key) {
        case 'search':
          query.OR = [
            { title: { contains: value, mode: 'insensitive' } },
            { uin: { contains: value, mode: 'insensitive' } },
            { description: { contains: value, mode: 'insensitive' } }
          ];
          break;
        case 'dateFrom':
          query.createdAt = { ...query.createdAt, gte: new Date(value) };
          break;
        case 'dateTo':
          query.createdAt = { ...query.createdAt, lte: new Date(value) };
          break;
        case 'status':
          if (Array.isArray(value)) {
            query.status = { in: value };
          } else {
            query.status = value;
          }
          break;
        default:
          query[key] = value;
      }
    }
  });
  
  return query;
};

// Export CSV data helper
const formatDataForCSV = (data, headers) => {
  const csvHeaders = headers.join(',');
  const csvRows = data.map(row => 
    headers.map(header => {
      const value = row[header] || '';
      // Escape commas and quotes
      return typeof value === 'string' && (value.includes(',') || value.includes('"')) 
        ? `"${value.replace(/"/g, '""')}"` 
        : value;
    }).join(',')
  );
  
  return [csvHeaders, ...csvRows].join('\n');
};

// Validate file type
const isValidFileType = (filename, allowedTypes) => {
  const extension = getFileExtension(filename).toLowerCase();
  return allowedTypes.includes(extension);
};

// Get color for status badge
const getStatusColor = (status) => {
  const colors = {
    'OPEN': '#6c757d',
    'COMPLIANCE_REVIEW': '#007bff',
    'PRODUCT_REVIEW': '#6f42c1',
    'APPROVED': '#28a745',
    'PUBLISHED': '#17a2b8',
    'CLOSED_INTERNAL': '#dc3545',
    'CLOSED_EXCHANGE': '#dc3545',
    'EXPIRED': '#fd7e14'
  };
  
  return colors[status] || '#6c757d';
};

// Rate limiting helper
const createRateLimiter = (windowMs, max) => {
  const requests = new Map();
  
  return (identifier) => {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean old entries
    for (const [key, timestamps] of requests.entries()) {
      requests.set(key, timestamps.filter(time => time > windowStart));
      if (requests.get(key).length === 0) {
        requests.delete(key);
      }
    }
    
    // Check current identifier
    const userRequests = requests.get(identifier) || [];
    if (userRequests.length >= max) {
      return false; // Rate limit exceeded
    }
    
    // Add current request
    userRequests.push(now);
    requests.set(identifier, userRequests);
    
    return true; // Request allowed
  };
};

module.exports = {
  generateUIN,
  isValidEmail,
  formatDate,
  daysBetween,
  isDateInRange,
  sanitizeFilename,
  getFileExtension,
  formatFileSize,
  isValidStatusTransition,
  getNextVersionNumber,
  hasPermission,
  generateRandomString,
  deepClone,
  sanitizeUser,
  isValidIndianPhone,
  toTitleCase,
  getUserInitials,
  isTaskOverdue,
  getTaskPriority,
  getPaginationInfo,
  buildFilterQuery,
  formatDataForCSV,
  isValidFileType,
  getStatusColor,
  createRateLimiter
};