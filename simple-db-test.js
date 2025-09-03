// simple-db-test.js
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testBasicOperations() {
  try {
    console.log('Testing basic DocumentDB operations...');
    
    // Test connection
    await prisma.$connect();
    console.log('✅ Connected to DocumentDB');

    // Try to create a user (this will create the collection if it doesn't exist)
    try {
      const testUser = await prisma.user.create({
        data: {
          username: 'testadmin',
          email: 'admin@test.com',
          password: '$2a$12$hashed_password_here',
          fullName: 'Test Administrator',
          role: 'ADMIN'
        }
      });
      console.log('✅ User created successfully:', testUser.id);

      // Try to find the user
      const foundUser = await prisma.user.findUnique({
        where: { id: testUser.id }
      });
      console.log('✅ User found:', foundUser.username);

      // Clean up - delete the test user
      await prisma.user.delete({
        where: { id: testUser.id }
      });
      console.log('✅ Test user deleted');

    } catch (userError) {
      console.log('⚠️ User operations failed (collections may need manual creation)');
      console.log('Error:', userError.message);
    }

  } catch (error) {
    console.error('❌ Database test failed:', error.message);
  } finally {
    await prisma.$disconnect();
    console.log('🔌 Disconnected from DocumentDB');
  }
}

testBasicOperations();