 
const { Prisma } = require('@prisma/client');

const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  // Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return res.status(400).json({
          message: 'Duplicate entry',
          field: err.meta?.target?.[0] || 'unknown'
        });
      case 'P2025':
        return res.status(404).json({
          message: 'Record not found'
        });
      case 'P2003':
        return res.status(400).json({
          message: 'Foreign key constraint failed'
        });
      default:
        return res.status(400).json({
          message: 'Database operation failed',
          code: err.code
        });
    }
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      message: 'Validation failed',
      errors
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      message: 'Invalid token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      message: 'Token expired'
    });
  }

  // Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      message: 'File too large',
      limit: process.env.MAX_FILE_SIZE || '50MB'
    });
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      message: 'Too many files',
      limit: process.env.MAX_FILES_PER_UPLOAD || 5
    });
  }

  // Default error
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;