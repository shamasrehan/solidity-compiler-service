// utils/resourceTracker.js
const fs = require('fs-extra');
const path = require('path');
const config = require('./config');

/**
 * Resource Tracker for managing temporary files and directories
 * Ensures all created resources are properly tracked and cleaned up
 */
class ResourceTracker {
  constructor() {
    // Set to store all tracked resources
    this.trackedResources = new Set();
    
    // Flag to indicate if the tracker is being shutdown
    this.isShuttingDown = false;
    
    // Setup cleanup handlers
    this._setupCleanupHandlers();
    
    // Statistics
    this.stats = {
      created: 0,
      cleaned: 0,
      failed: 0
    };
  }
  
  /**
   * Setup cleanup handlers for process exit events
   */
  _setupCleanupHandlers() {
    // Handle normal exit
    process.on('exit', () => {
      this.cleanupAllResources('Process Exit');
    });
    
    // Handle CTRL+C and other termination signals
    process.on('SIGINT', () => {
      console.log('Received SIGINT, cleaning up resources...');
      this.cleanupAllResources('SIGINT');
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      console.log('Received SIGTERM, cleaning up resources...');
      this.cleanupAllResources('SIGTERM');
      process.exit(0);
    });
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      this.cleanupAllResources('Uncaught Exception');
      process.exit(1);
    });
  }
  
  /**
   * Track a resource for cleanup
   * @param {string|Array<string>} resourcePath - Path(s) to track
   * @param {string} context - Context for logging
   * @returns {string|Array<string>} The resource path(s) for chaining
   */
  track(resourcePath, context = 'Unknown') {
    if (Array.isArray(resourcePath)) {
      resourcePath.forEach(path => this._trackSingleResource(path, context));
      return resourcePath;
    } else {
      return this._trackSingleResource(resourcePath, context);
    }
  }
  
  /**
   * Track a single resource
   * @param {string} resourcePath - Path to track
   * @param {string} context - Context for logging
   * @returns {string} The resource path for chaining
   */
  _trackSingleResource(resourcePath, context) {
    if (!resourcePath || this.isShuttingDown) return resourcePath;
    
    this.trackedResources.add(resourcePath);
    this.stats.created++;
    
    if (config.NODE_ENV === 'development') {
      console.log(`[RESOURCE][${context}] Tracking: ${resourcePath}`);
    }
    
    return resourcePath;
  }
  
  /**
   * Create a temporary file with tracking
   * @param {string} filename - Filename in the temp directory
   * @param {string|Buffer|Object} content - Content to write
   * @param {string} context - Context for logging
   * @returns {string} Path to the created file
   */
  createTempFile(filename, content, context = 'TempFile') {
    const tempPath = path.join(config.TEMP_DIR, filename);
    
    try {
      // Create parent directory if it doesn't exist
      const dir = path.dirname(tempPath);
      fs.ensureDirSync(dir);
      
      // Write content based on type
      if (typeof content === 'object' && !Buffer.isBuffer(content)) {
        fs.writeFileSync(tempPath, JSON.stringify(content, null, 2));
      } else {
        fs.writeFileSync(tempPath, content);
      }
      
      // Track the file
      return this.track(tempPath, context);
    } catch (error) {
      console.error(`[RESOURCE][${context}] Failed to create temp file ${filename}:`, error.message);
      return null;
    }
  }
  
  /**
   * Create a temporary directory with tracking
   * @param {string} dirname - Directory name in the temp directory
   * @param {string} context - Context for logging
   * @returns {string} Path to the created directory
   */
  createTempDir(dirname, context = 'TempDir') {
    const tempPath = path.join(config.TEMP_DIR, dirname);
    
    try {
      fs.ensureDirSync(tempPath);
      return this.track(tempPath, context);
    } catch (error) {
      console.error(`[RESOURCE][${context}] Failed to create temp directory ${dirname}:`, error.message);
      return null;
    }
  }
  
  /**
   * Create a unique temporary directory with tracking
   * @param {string} prefix - Prefix for the directory name
   * @param {string} context - Context for logging
   * @returns {string} Path to the created directory
   */
  createUniqueTempDir(prefix = 'compile-', context = 'UniqueTempDir') {
    const uniqueId = require('crypto').randomBytes(8).toString('hex');
    return this.createTempDir(`${prefix}${uniqueId}`, context);
  }
  
  /**
   * Cleanup a specific resource
   * @param {string} resourcePath - Path to clean up
   * @param {string} context - Context for logging
   * @returns {boolean} Whether cleanup was successful
   */
  cleanup(resourcePath, context = 'Cleanup') {
    if (!resourcePath || !this.trackedResources.has(resourcePath)) {
      return false;
    }
    
    try {
      if (fs.existsSync(resourcePath)) {
        const stats = fs.statSync(resourcePath);
        
        if (stats.isDirectory()) {
          fs.removeSync(resourcePath);
          if (config.NODE_ENV === 'development') {
            console.log(`[RESOURCE][${context}] Removed directory: ${resourcePath}`);
          }
        } else {
          fs.unlinkSync(resourcePath);
          if (config.NODE_ENV === 'development') {
            console.log(`[RESOURCE][${context}] Removed file: ${resourcePath}`);
          }
        }
      }
      
      this.trackedResources.delete(resourcePath);
      this.stats.cleaned++;
      return true;
    } catch (error) {
      console.error(`[RESOURCE][${context}] Failed to clean up ${resourcePath}:`, error.message);
      this.stats.failed++;
      return false;
    }
  }
  
  /**
   * Cleanup multiple resources
   * @param {Array<string>} resources - Array of resource paths
   * @param {string} context - Context for logging
   */
  cleanupMultiple(resources, context = 'CleanupMultiple') {
    if (!Array.isArray(resources) || resources.length === 0) {
      return;
    }
    
    let successCount = 0;
    
    for (const resource of resources) {
      if (this.cleanup(resource, context)) {
        successCount++;
      }
    }
    
    if (config.NODE_ENV === 'development') {
      console.log(`[RESOURCE][${context}] Cleaned up ${successCount}/${resources.length} resources`);
    }
  }
  
  /**
   * Cleanup all tracked resources
   * @param {string} context - Context for logging
   */
  cleanupAllResources(context = 'CleanupAll') {
    // Skip cleanup if explicitly disabled or not in automatic cleanup mode
    if (!config.CLEANUP_TEMP_FILES) {
      console.log(`[RESOURCE][${context}] Skipping resource cleanup (disabled in config)`);
      return;
    }
    
    this.isShuttingDown = true;
    
    const resources = [...this.trackedResources];
    console.log(`[RESOURCE][${context}] Cleaning up ${resources.length} tracked resources...`);
    
    let successCount = 0;
    
    for (const resource of resources) {
      if (this.cleanup(resource, context)) {
        successCount++;
      }
    }
    
    console.log(`[RESOURCE][${context}] Resource cleanup complete: ${successCount}/${resources.length} resources cleaned up`);
    console.log(`[RESOURCE][${context}] Total stats: Created=${this.stats.created}, Cleaned=${this.stats.cleaned}, Failed=${this.stats.failed}`);
  }
  
  /**
   * Get current resource stats
   * @returns {Object} Resource statistics
   */
  getStats() {
    return {
      ...this.stats,
      active: this.trackedResources.size
    };
  }
}

// Create and export a singleton instance
const resourceTracker = new ResourceTracker();
module.exports = resourceTracker;