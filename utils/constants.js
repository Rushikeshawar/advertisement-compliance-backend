 
// User Roles
const USER_ROLES = {
  PRODUCT_USER: 'PRODUCT_USER',
  PRODUCT_ADMIN: 'PRODUCT_ADMIN',
  COMPLIANCE_USER: 'COMPLIANCE_USER',
  COMPLIANCE_ADMIN: 'COMPLIANCE_ADMIN',
  SENIOR_MANAGER: 'SENIOR_MANAGER',
  ADMIN: 'ADMIN'
};

// Task Types
const TASK_TYPES = {
  INTERNAL: 'INTERNAL',
  EXCHANGE: 'EXCHANGE'
};

// Task Status
const TASK_STATUS = {
  OPEN: 'OPEN',
  COMPLIANCE_REVIEW: 'COMPLIANCE_REVIEW',
  PRODUCT_REVIEW: 'PRODUCT_REVIEW',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  CLOSED_INTERNAL: 'CLOSED_INTERNAL',
  CLOSED_EXCHANGE: 'CLOSED_EXCHANGE',
  EXPIRED: 'EXPIRED'
};

// Exchange Approval Status
const EXCHANGE_APPROVAL_STATUS = {
  APPROVED: 'APPROVED',
  PENDING: 'PENDING',
  REJECTED: 'REJECTED',
  NOT_SENT: 'NOT_SENT'
};

// Exchange Names
const EXCHANGE_NAMES = {
  NSE: 'NSE',
  BSE: 'BSE',
  MCX: 'MCX',
  NCDEX: 'NCDEX'
};

// Notification Types
const NOTIFICATION_TYPES = {
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  COMMENT_ADDED: 'COMMENT_ADDED',
  VERSION_UPLOADED: 'VERSION_UPLOADED',
  TASK_APPROVED: 'TASK_APPROVED',
  TASK_REJECTED: 'TASK_REJECTED',
  TASK_PUBLISHED: 'TASK_PUBLISHED',
  EXPIRY_WARNING: 'EXPIRY_WARNING',
  FOLLOW_UP: 'FOLLOW_UP'
};

// Audit Actions
const AUDIT_ACTIONS = {
  TASK_CREATED: 'TASK_CREATED',
  TASK_UPDATED: 'TASK_UPDATED',
  TASK_STATUS_CHANGED: 'TASK_STATUS_CHANGED',
  VERSION_UPLOADED: 'VERSION_UPLOADED',
  COMMENT_ADDED: 'COMMENT_ADDED',
  TASK_APPROVED: 'TASK_APPROVED',
  TASK_PUBLISHED: 'TASK_PUBLISHED',
  TASK_CLOSED: 'TASK_CLOSED',
  EXCHANGE_APPROVAL_ADDED: 'EXCHANGE_APPROVAL_ADDED',
  EXCHANGE_APPROVAL_UPDATED: 'EXCHANGE_APPROVAL_UPDATED',
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  ABSENCE_CREATED: 'ABSENCE_CREATED',
  ABSENCE_DELETED: 'ABSENCE_DELETED',
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT'
};

// File Upload Constants
const FILE_UPLOAD = {
  MAX_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_FILES: 5,
  ALLOWED_TYPES: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'video/mp4',
    'video/avi',
    'video/quicktime',
    'video/x-ms-wmv'
  ],
  ALLOWED_EXTENSIONS: [
    'jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx', 
    'xls', 'xlsx', 'ppt', 'pptx', 'txt', 
    'mp4', 'avi', 'mov', 'wmv'
  ]
};

// API Response Messages
const RESPONSE_MESSAGES = {
  SUCCESS: 'Operation completed successfully',
  CREATED: 'Resource created successfully',
  UPDATED: 'Resource updated successfully',
  DELETED: 'Resource deleted successfully',
  NOT_FOUND: 'Resource not found',
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Access forbidden',
  VALIDATION_ERROR: 'Validation failed',
  SERVER_ERROR: 'Internal server error',
  DUPLICATE_ENTRY: 'Resource already exists'
};

// HTTP Status Codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  INTERNAL_SERVER_ERROR: 500
};

// Date Formats
const DATE_FORMATS = {
  ISO: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
  DATE_ONLY: 'YYYY-MM-DD',
  DISPLAY: 'MMM DD, YYYY',
  DISPLAY_WITH_TIME: 'MMM DD, YYYY HH:mm',
  FILENAME: 'YYYYMMDD_HHmmss'
};

// Pagination Defaults
const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100
};

// Rate Limiting
const RATE_LIMITS = {
  GENERAL: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 100
  },
  AUTH: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 5
  },
  FILE_UPLOAD: {
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
    MAX_REQUESTS: 50
  }
};

// Email Templates
const EMAIL_TEMPLATES = {
  TASK_ASSIGNED: 'task-assigned',
  TASK_APPROVED: 'task-approved',
  TASK_REJECTED: 'task-rejected',
  EXPIRY_WARNING: 'expiry-warning',
  DAILY_SUMMARY: 'daily-summary'
};

// System Configuration
const SYSTEM_CONFIG = {
  UIN_PREFIX: 'ACT',
  DEFAULT_TIMEZONE: 'Asia/Kolkata',
  EXPIRY_WARNING_DAYS: [15, 7, 1],
  STALE_TASK_DAYS: 7,
  AUDIT_RETENTION_DAYS: 365,
  NOTIFICATION_RETENTION_DAYS: 90
};

// Validation Rules
const VALIDATION_RULES = {
  USERNAME: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 30,
    PATTERN: /^[a-zA-Z0-9_]+$/
  },
  PASSWORD: {
    MIN_LENGTH: 6,
    MAX_LENGTH: 128
  },
  TASK_TITLE: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 200
  },
  DESCRIPTION: {
    MAX_LENGTH: 1000
  },
  COMMENT: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 2000
  }
};

// Status Colors (for frontend)
const STATUS_COLORS = {
  [TASK_STATUS.OPEN]: '#6c757d',
  [TASK_STATUS.COMPLIANCE_REVIEW]: '#007bff',
  [TASK_STATUS.PRODUCT_REVIEW]: '#6f42c1',
  [TASK_STATUS.APPROVED]: '#28a745',
  [TASK_STATUS.PUBLISHED]: '#17a2b8',
  [TASK_STATUS.CLOSED_INTERNAL]: '#dc3545',
  [TASK_STATUS.CLOSED_EXCHANGE]: '#dc3545',
  [TASK_STATUS.EXPIRED]: '#fd7e14'
};

// Priority Levels
const PRIORITY_LEVELS = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT'
};

module.exports = {
  USER_ROLES,
  TASK_TYPES,
  TASK_STATUS,
  EXCHANGE_APPROVAL_STATUS,
  EXCHANGE_NAMES,
  NOTIFICATION_TYPES,
  AUDIT_ACTIONS,
  FILE_UPLOAD,
  RESPONSE_MESSAGES,
  HTTP_STATUS,
  DATE_FORMATS,
  PAGINATION,
  RATE_LIMITS,
  EMAIL_TEMPLATES,
  SYSTEM_CONFIG,
  VALIDATION_RULES,
  STATUS_COLORS,
  PRIORITY_LEVELS
};