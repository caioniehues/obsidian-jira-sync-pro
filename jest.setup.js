// Jest setup file to configure environment for tests

// Configure CA certificates for Zscaler or other corporate proxies
if (process.env.NODE_EXTRA_CA_CERTS) {
  const fs = require('fs');
  const https = require('https');
  
  try {
    const caCert = fs.readFileSync(process.env.NODE_EXTRA_CA_CERTS);
    
    // Create a new agent with the CA certificate
    const agent = new https.Agent({
      ca: caCert,
      rejectUnauthorized: true // Keep SSL verification enabled
    });
    
    // Store the agent globally for use in tests
    global.httpsAgent = agent;
    
    console.log(`✓ Configured CA certificate from: ${process.env.NODE_EXTRA_CA_CERTS}`);
  } catch (error) {
    console.warn(`⚠ Failed to load CA certificate: ${error.message}`);
  }
}

// Configure fetch and axios if they're used in the project
if (typeof global.fetch !== 'undefined') {
  const originalFetch = global.fetch;
  global.fetch = (url, options = {}) => {
    if (global.httpsAgent && url.toString().startsWith('https://')) {
      options.agent = global.httpsAgent;
    }
    return originalFetch(url, options);
  };
}

// Set NODE_TLS_REJECT_UNAUTHORIZED if not set (for development only)
// Note: This should only be used in test environments, never in production
if (process.env.NODE_ENV === 'test' && !process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
  // Keep it enabled by default, only disable if explicitly needed
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
}

// Configure timezone for consistent test results
process.env.TZ = 'UTC';