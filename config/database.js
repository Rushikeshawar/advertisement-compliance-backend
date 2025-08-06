 
const { PrismaClient } = require('@prisma/client');

let prisma;

// Singleton pattern for Prisma client
if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    });
  }
  prisma = global.__prisma;
}

// Database connection test
async function connectDB() {
  try {
    await prisma.$connect();
    console.log('📊 Database connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

// Graceful disconnect
async function disconnectDB() {
  try {
    await prisma.$disconnect();
    console.log('📊 Database disconnected');
  } catch (error) {
    console.error('❌ Database disconnect error:', error);
  }
}

// Database health check
async function healthCheck() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy', timestamp: new Date() };
  } catch (error) {
    return { 
      status: 'unhealthy', 
      error: error.message, 
      timestamp: new Date() 
    };
  }
}

module.exports = {
  prisma,
  connectDB,
  disconnectDB,
  healthCheck
};