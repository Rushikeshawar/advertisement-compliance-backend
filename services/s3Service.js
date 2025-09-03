// services/s3Service.js
const { S3Client, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

class S3Service {
  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
    
    this.bucketName = process.env.AWS_S3_BUCKET_NAME;
    
    if (!this.bucketName) {
      throw new Error('AWS_S3_BUCKET_NAME environment variable is required');
    }
  }

  // Generate signed URL for secure file access
  async getSignedUrl(s3Key, expiresIn = 3600) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
      return signedUrl;
    } catch (error) {
      console.error('Error generating signed URL:', error);
      throw error;
    }
  }

  // Get file metadata
  async getFileMetadata(s3Key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key
      });

      const response = await this.s3Client.send(command);
      
      return {
        contentLength: response.ContentLength,
        contentType: response.ContentType,
        lastModified: response.LastModified,
        etag: response.ETag,
        metadata: response.Metadata || {}
      };
    } catch (error) {
      if (error.name === 'NotFound') {
        return null;
      }
      throw error;
    }
  }

  // Delete file from S3
  async deleteFile(s3Key) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key
      });

      await this.s3Client.send(command);
      return { success: true };
    } catch (error) {
      console.error('Error deleting file from S3:', error);
      throw error;
    }
  }

  // Delete multiple files
  async deleteMultipleFiles(s3Keys) {
    const results = [];
    
    for (const key of s3Keys) {
      try {
        await this.deleteFile(key);
        results.push({ key, success: true });
      } catch (error) {
        results.push({ key, success: false, error: error.message });
      }
    }
    
    return results;
  }

  // List files with prefix
  async listFiles(prefix = '', maxKeys = 1000) {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys
      });

      const response = await this.s3Client.send(command);
      
      return {
        files: response.Contents || [],
        isTruncated: response.IsTruncated,
        nextContinuationToken: response.NextContinuationToken
      };
    } catch (error) {
      console.error('Error listing files:', error);
      throw error;
    }
  }

  // Generate public URL (for public buckets)
  getPublicUrl(s3Key) {
    return `https://${this.bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;
  }

  // Check if file exists
  async fileExists(s3Key) {
    try {
      await this.getFileMetadata(s3Key);
      return true;
    } catch (error) {
      return false;
    }
  }

  // Get file size in human readable format
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Health check
  async healthCheck() {
    try {
      // Try to list objects to check connection
      await this.listFiles('', 1);
      return {
        status: 'healthy',
        service: 'AWS S3',
        bucket: this.bucketName,
        region: process.env.AWS_REGION || 'us-east-1',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        service: 'AWS S3',
        bucket: this.bucketName,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Clean up old files (for maintenance)
  async cleanupOldFiles(prefix, olderThanDays) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const { files } = await this.listFiles(prefix);
      
      const oldFiles = files.filter(file => 
        new Date(file.LastModified) < cutoffDate
      );

      if (oldFiles.length === 0) {
        return { deletedCount: 0, message: 'No old files found' };
      }

      const deleteResults = await this.deleteMultipleFiles(
        oldFiles.map(file => file.Key)
      );

      const deletedCount = deleteResults.filter(result => result.success).length;
      
      return {
        deletedCount,
        totalScanned: files.length,
        oldFilesFound: oldFiles.length,
        message: `Cleaned up ${deletedCount} old files`
      };
    } catch (error) {
      console.error('Error cleaning up old files:', error);
      return {
        deletedCount: 0,
        error: error.message
      };
    }
  }
}

// Create singleton instance
const s3Service = new S3Service();

module.exports = s3Service;