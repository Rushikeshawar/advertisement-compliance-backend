// lib/documentdb.js
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

class DocumentDBConnection {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      if (this.isConnected && this.client) {
        return this.client;
      }

      const uri = process.env.DATABASE_URL;
      
      // Ensure SSL certificate exists
      const certPath = path.join(process.cwd(), 'global-bundle.pem');
      if (!fs.existsSync(certPath)) {
        console.error('SSL certificate not found. Please run: wget https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem');
        throw new Error('SSL certificate required for DocumentDB connection');
      }

      const options = {
        tls: true,
        tlsCAFile: certPath,
        retryWrites: false,
        readPreference: 'secondaryPreferred',
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      };

      this.client = new MongoClient(uri, options);
      await this.client.connect();
      
      // Test connection
      await this.client.db('advertisement_compliance').command({ ping: 1 });
      
      this.isConnected = true;
      console.log('✅ Connected to DocumentDB successfully');
      
      return this.client;
    } catch (error) {
      console.error('❌ DocumentDB connection failed:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      console.log('📴 Disconnected from DocumentDB');
    }
  }

  getClient() {
    if (!this.isConnected || !this.client) {
      throw new Error('DocumentDB not connected. Call connect() first.');
    }
    return this.client;
  }

  async testConnection() {
    try {
      await this.connect();
      const db = this.client.db('advertisement_compliance');
      
      // Test basic operations
      const testCollection = db.collection('connection_test');
      
      // Insert test document
      const insertResult = await testCollection.insertOne({ 
        test: true, 
        timestamp: new Date(),
        message: 'DocumentDB connection test'
      });
      
      // Find test document
      const findResult = await testCollection.findOne({ _id: insertResult.insertedId });
      
      // Delete test document
      await testCollection.deleteOne({ _id: insertResult.insertedId });
      
      console.log('✅ DocumentDB connection test passed');
      return {
        success: true,
        message: 'DocumentDB connection successful',
        testData: findResult
      };
    } catch (error) {
      console.error('❌ DocumentDB connection test failed:', error);
      return {
        success: false,
        message: 'DocumentDB connection failed',
        error: error.message
      };
    }
  }
}

// Create singleton instance
const documentDB = new DocumentDBConnection();

// Handle process termination
process.on('SIGINT', async () => {
  await documentDB.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await documentDB.disconnect();
  process.exit(0);
});

module.exports = documentDB;