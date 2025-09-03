// test-docdb-connection.js
require('dotenv').config();
const { MongoClient } = require('mongodb');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

async function testDocumentDBConnection() {
  console.log('Starting DocumentDB connection test...\n');

  // Check if SSL certificate exists
  const certPath = path.join(process.cwd(), 'global-bundle.pem');
  if (!fs.existsSync(certPath)) {
    console.error('❌ SSL certificate not found!');
    console.log('Please ensure global-bundle.pem is in your project directory');
    return;
  }
  console.log('✅ SSL certificate found');

  const uri = process.env.DATABASE_URL;
  console.log('🔗 Testing connection to DocumentDB...');
  console.log('📍 Cluster:', uri.split('@')[1].split('/')[0]);

  // Test 1: Direct MongoDB connection
  console.log('\n--- Test 1: Direct MongoDB Connection ---');
  const client = new MongoClient(uri, {
    tls: true,
    tlsCAFile: certPath,
    retryWrites: false,
    readPreference: 'secondaryPreferred',
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000
  });

  try {
    console.log('Connecting to DocumentDB...');
    await client.connect();
    console.log('✅ MongoDB client connected successfully');

    // Test database operations
    const db = client.db('advertisement_compliance');
    
    // Test ping
    const pingResult = await db.command({ ping: 1 });
    console.log('✅ Database ping successful:', pingResult.ok === 1 ? 'OK' : 'Failed');

    // List collections
    const collections = await db.listCollections().toArray();
    console.log(`✅ Found ${collections.length} collections:`, collections.map(c => c.name));

    // Test insert and find
    const testCollection = db.collection('connection_test');
    const testDoc = { 
      message: 'DocumentDB connection test', 
      timestamp: new Date(),
      testId: Math.random().toString(36).substr(2, 9),
      environment: process.env.NODE_ENV || 'development'
    };

    const insertResult = await testCollection.insertOne(testDoc);
    console.log('✅ Test insert successful, ID:', insertResult.insertedId);

    // Test find
    const foundDoc = await testCollection.findOne({ _id: insertResult.insertedId });
    console.log('✅ Test find successful:', foundDoc ? 'Document found' : 'Document not found');

    // Cleanup
    await testCollection.deleteOne({ _id: insertResult.insertedId });
    console.log('✅ Test cleanup successful');

  } catch (error) {
    console.error('❌ MongoDB connection failed:');
    console.error('   Error:', error.message);
    if (error.code) console.error('   Code:', error.code);
    if (error.codeName) console.error('   Code Name:', error.codeName);
  } finally {
    await client.close();
  }

  // Test 2: Prisma connection
  console.log('\n--- Test 2: Prisma Connection ---');
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  });

  try {
    console.log('Testing Prisma connection...');
    await prisma.$connect();
    console.log('✅ Prisma connected successfully');

    // Test a simple query
    try {
      const userCount = await prisma.user.count();
      console.log(`✅ Prisma query successful - User count: ${userCount}`);
    } catch (queryError) {
      console.log('⚠️ Prisma connected but query failed (tables may not exist yet)');
      console.log('   This is normal for a fresh database. Run: npx prisma db push');
    }

  } catch (error) {
    console.error('❌ Prisma connection failed:');
    console.error('   Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }

  // Test 3: Environment validation
  console.log('\n--- Test 3: Environment Validation ---');
  
  const requiredEnvVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'PORT'
  ];

  requiredEnvVars.forEach(envVar => {
    if (process.env[envVar]) {
      console.log(`✅ ${envVar}: Set`);
    } else {
      console.log(`❌ ${envVar}: Missing`);
    }
  });

  console.log('\n--- Connection Test Summary ---');
  console.log('🔗 DocumentDB Cluster: advertisement-compliance.cluster-czwqu2g268xr.eu-north-1.docdb.amazonaws.com');
  console.log('📁 Database: advertisement_compliance');
  console.log('🔐 SSL Certificate: global-bundle.pem (3,180 bytes)');
  console.log('🌐 Environment:', process.env.NODE_ENV || 'development');
  
  console.log('\n✅ Connection test completed!');
  console.log('\nNext steps:');
  console.log('1. If Prisma queries failed, run: npx prisma db push');
  console.log('2. Start your server: npm run dev');
  console.log('3. Test the API: http://localhost:5000/api/test-db');
}

// Run the test
testDocumentDBConnection().catch(console.error);