/**
 * Pre-request Helper Scripts for Journey Auth Module
 *
 * This file contains reusable pre-request scripts that can be used
 * across multiple requests in the collection.
 */

/**
 * Generate unique test email with timestamp
 * Usage: Add this to pre-request script and call generateTestEmail()
 */
function generateTestEmail(prefix = 'test.user') {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const testEmail = `${prefix}.${timestamp}.${randomSuffix}@example.com`;
    pm.environment.set('testEmail', testEmail);
    console.log(`Generated test email: ${testEmail}`);
    return testEmail;
}

/**
 * Generate test user data with random values
 */
function generateTestUser(roleLevel = 'JUNIOR') {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);

    const testUser = {
        name: `Test User ${randomId}`,
        email: `test.user.${timestamp}.${randomId}@example.com`,
        password: 'TestPass@123',
        acceptTerms: true
    };

    // Store in environment for reuse
    pm.environment.set('testUserName', testUser.name);
    pm.environment.set('testEmail', testUser.email);
    pm.environment.set('testPassword', testUser.password);
    pm.environment.set('testRole', roleLevel);

    console.log('Generated test user:', testUser);
    return testUser;
}

/**
 * Validate environment variables are set
 */
function validateEnvironment(requiredVars = []) {
    const missing = [];

    requiredVars.forEach(varName => {
        if (!pm.environment.get(varName)) {
            missing.push(varName);
        }
    });

    if (missing.length > 0) {
        console.error(`Missing required environment variables: ${missing.join(', ')}`);
        throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }

    console.log('Environment validation passed');
    return true;
}

/**
 * Check if user is authenticated (has valid tokens)
 */
function isAuthenticated() {
    const accessToken = pm.environment.get('accessToken');
    const refreshToken = pm.environment.get('refreshToken');

    if (!accessToken || !refreshToken) {
        console.log('User is not authenticated - missing tokens');
        return false;
    }

    // Basic JWT format validation
    if (accessToken.split('.').length !== 3) {
        console.log('Invalid access token format');
        return false;
    }

    console.log('User appears to be authenticated');
    return true;
}

/**
 * Clear authentication data from environment
 */
function clearAuthData() {
    pm.environment.unset('accessToken');
    pm.environment.unset('refreshToken');
    pm.environment.unset('userId');
    console.log('Authentication data cleared from environment');
}

/**
 * Set default headers for requests
 */
function setDefaultHeaders() {
    if (!pm.request.headers.has('Content-Type')) {
        pm.request.headers.add({
            key: 'Content-Type',
            value: 'application/json'
        });
    }

    if (!pm.request.headers.has('User-Agent')) {
        pm.request.headers.add({
            key: 'User-Agent',
            value: 'PostmanRuntime/Postman Journey Tests'
        });
    }

    // Add environment identifier if available
    const environment = pm.environment.get('environment');
    if (environment) {
        pm.request.headers.add({
            key: 'X-Test-Environment',
            value: environment
        });
    }
}

/**
 * Add authentication header if token exists
 */
function addAuthHeader() {
    const accessToken = pm.environment.get('accessToken');
    if (accessToken && !pm.request.headers.has('Authorization')) {
        pm.request.headers.add({
            key: 'Authorization',
            value: `Bearer ${accessToken}`
        });
        console.log('Added Authorization header');
    }
}

/**
 * Log request details for debugging
 */
function logRequestDetails() {
    if (pm.environment.get('debugMode') === 'true') {
        console.log('=== REQUEST DEBUG ===');
        console.log(`Method: ${pm.request.method}`);
        console.log(`URL: ${pm.request.url}`);
        console.log(`Headers: ${JSON.stringify(pm.request.headers, null, 2)}`);

        if (pm.request.body && pm.request.body.mode === 'raw') {
            console.log(`Body: ${pm.request.body.raw}`);
        }
        console.log('=== END DEBUG ===');
    }
}

/**
 * Add rate limiting delay if configured
 */
function addRateLimit() {
    const delay = pm.environment.get('rateLimitDelay');
    if (delay && parseInt(delay) > 0) {
        const delayMs = parseInt(delay);
        console.log(`Adding rate limit delay: ${delayMs}ms`);
        setTimeout(() => {}, delayMs);
    }
}

/**
 * Validate SSL certificate if required
 */
function configureSSL() {
    const sslVerification = pm.environment.get('sslVerification');
    if (sslVerification === 'false') {
        pm.settings.set('sslCertificates', false);
        console.log('SSL verification disabled for this request');
    }
}

/**
 * Generate request correlation ID
 */
function generateCorrelationId() {
    const correlationId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    pm.request.headers.add({
        key: 'X-Correlation-ID',
        value: correlationId
    });
    pm.environment.set('lastCorrelationId', correlationId);
    console.log(`Generated correlation ID: ${correlationId}`);
    return correlationId;
}

/**
 * Main pre-request function to call in scripts
 * Usage: Add this line to your pre-request script: executePreRequest(['baseUrl']);
 */
function executePreRequest(requiredVars = [], options = {}) {
    try {
        console.log(`=== PRE-REQUEST: ${pm.info.requestName} ===`);

        // Validate environment
        if (requiredVars.length > 0) {
            validateEnvironment(requiredVars);
        }

        // Configure SSL
        configureSSL();

        // Set default headers
        setDefaultHeaders();

        // Add auth header if needed
        if (options.requireAuth) {
            if (!isAuthenticated()) {
                throw new Error('Authentication required but user is not authenticated');
            }
            addAuthHeader();
        }

        // Generate correlation ID
        if (options.addCorrelationId !== false) {
            generateCorrelationId();
        }

        // Add rate limiting
        addRateLimit();

        // Log details if debug mode
        logRequestDetails();

        console.log('Pre-request setup completed successfully');

    } catch (error) {
        console.error('Pre-request setup failed:', error.message);
        throw error;
    }
}

// Export functions for use in collection scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateTestEmail,
        generateTestUser,
        validateEnvironment,
        isAuthenticated,
        clearAuthData,
        setDefaultHeaders,
        addAuthHeader,
        logRequestDetails,
        addRateLimit,
        configureSSL,
        generateCorrelationId,
        executePreRequest
    };
}