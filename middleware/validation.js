 
const { validationResult } = require('express-validator');
const { VALIDATION_RULES, HTTP_STATUS } = require('../utils/constants');

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.param,
      message: error.msg,
      value: error.value,
      location: error.location
    }));

    return res.status(HTTP_STATUS.VALIDATION_ERROR).json({
      message: 'Validation failed',
      errors: formattedErrors,
      timestamp: new Date().toISOString()
    });
  }
  
  next();
};

// Custom validation functions
const customValidations = {
  // Check if username is available
  isUsernameAvailable: async (value) => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    const user = await prisma.user.findUnique({
      where: { username: value }
    });
    
    if (user) {
      throw new Error('Username is already taken');
    }
    
    return true;
  },

  // Check if email is available
  isEmailAvailable: async (value) => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    const user = await prisma.user.findUnique({
      where: { email: value }
    });
    
    if (user) {
      throw new Error('Email is already registered');
    }
    
    return true;
  },

  // Check if task exists
  taskExists: async (value) => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    const task = await prisma.task.findUnique({
      where: { id: value }
    });
    
    if (!task) {
      throw new Error('Task not found');
    }
    
    return true;
  },

  // Check if user exists
  userExists: async (value) => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    const user = await prisma.user.findUnique({
      where: { id: value }
    });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    return true;
  },

  // Validate password strength
  isStrongPassword: (value) => {
    const minLength = VALIDATION_RULES.PASSWORD.MIN_LENGTH;
    
    if (value.length < minLength) {
      throw new Error(`Password must be at least ${minLength} characters long`);
    }
    
    // Check for at least one number
    if (!/\d/.test(value)) {
      throw new Error('Password must contain at least one number');
    }
    
    // Check for at least one letter
    if (!/[a-zA-Z]/.test(value)) {
      throw new Error('Password must contain at least one letter');
    }
    
    return true;
  },

  // Validate Indian phone number
  isValidIndianPhone: (value) => {
    const phoneRegex = /^[6-9]\d{9}$/;
    const cleanedPhone = value.replace(/\D/g, '');
    
    if (!phoneRegex.test(cleanedPhone)) {
      throw new Error('Please enter a valid Indian phone number');
    }
    
    return true;
  },

  // Validate file type
  isValidFileType: (value) => {
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'];
    const extension = value.split('.').pop().toLowerCase();
    
    if (!allowedExtensions.includes(extension)) {
      throw new Error('File type not allowed');
    }
    
    return true;
  },

  // Validate date range
  isValidDateRange: (endDate, { req }) => {
    const startDate = req.body.startDate || req.body.fromDate;
    
    if (startDate && new Date(endDate) <= new Date(startDate)) {
      throw new Error('End date must be after start date');
    }
    
    return true;
  },

  // Validate future date
  isFutureDate: (value) => {
    if (new Date(value) <= new Date()) {
      throw new Error('Date must be in the future');
    }
    
    return true;
  },

  // Validate past date
  isPastDate: (value) => {
    if (new Date(value) >= new Date()) {
      throw new Error('Date must be in the past');
    }
    
    return true;
  },

  // Validate UIN format
  isValidUIN: (value) => {
    const uinRegex = /^ACT\d{4}\d{3}$/; // ACT + year + 3 digits
    
    if (!uinRegex.test(value)) {
      throw new Error('Invalid UIN format');
    }
    
    return true;
  },

  // Validate exchange reference number
  isValidExchangeRef: (value) => {
    if (value && value.length < 3) {
      throw new Error('Exchange reference number must be at least 3 characters');
    }
    
    return true;
  },

  // Check if array is not empty
  isNonEmptyArray: (value) => {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error('At least one item must be selected');
    }
    
    return true;
  },

  // Validate MongoDB ObjectId
  isValidObjectId: (value) => {
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    
    if (!objectIdRegex.test(value)) {
      throw new Error('Invalid ID format');
    }
    
    return true;
  }
};

// Sanitization functions
const sanitizeInput = {
  // Trim and escape HTML
  cleanString: (value) => {
    if (typeof value !== 'string') return value;
    
    return value
      .trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  },

  // Clean filename
  cleanFilename: (value) => {
    if (typeof value !== 'string') return value;
    
    return value
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase();
  },

  // Normalize email
  normalizeEmail: (value) => {
    if (typeof value !== 'string') return value;
    
    return value.toLowerCase().trim();
  },

  // Clean phone number
  cleanPhone: (value) => {
    if (typeof value !== 'string') return value;
    
    return value.replace(/\D/g, '');
  }
};

// Request body sanitization middleware
const sanitizeBody = (fields = []) => {
  return (req, res, next) => {
    fields.forEach(field => {
      if (req.body[field]) {
        req.body[field] = sanitizeInput.cleanString(req.body[field]);
      }
    });
    next();
  };
};

// Query parameter sanitization middleware
const sanitizeQuery = (fields = []) => {
  return (req, res, next) => {
    fields.forEach(field => {
      if (req.query[field]) {
        req.query[field] = sanitizeInput.cleanString(req.query[field]);
      }
    });
    next();
  };
};

// Validation chain helper
const createValidationChain = (validations) => {
  return [...validations, handleValidationErrors];
};

module.exports = {
  handleValidationErrors,
  customValidations,
  sanitizeInput,
  sanitizeBody,
  sanitizeQuery,
  createValidationChain
};