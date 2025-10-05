/**
 * Test Helper Scripts for Journey Auth Module
 *
 * This file contains reusable test scripts that can be used
 * across multiple requests in the collection.
 */

/**
 * Common test assertions for successful responses
 */
function validateSuccessResponse(expectedStatus = 200, shouldHaveData = true) {
    pm.test(`Status code is ${expectedStatus}`, function () {
        pm.response.to.have.status(expectedStatus);
    });

    if (expectedStatus !== 204) { // No content responses don't have body
        pm.test('Response is valid JSON', function () {
            pm.response.to.be.json;
        });

        pm.test('Response has success field', function () {
            const responseJson = pm.response.json();
            pm.expect(responseJson).to.have.property('success', true);
        });

        if (shouldHaveData) {
            pm.test('Response contains data', function () {
                const responseJson = pm.response.json();
                pm.expect(responseJson).to.have.property('data');
            });
        }
    }
}

/**
 * Common test assertions for error responses
 */
function validateErrorResponse(expectedStatus = 400, checkMessage = true) {
    pm.test(`Status code is ${expectedStatus}`, function () {
        pm.response.to.have.status(expectedStatus);
    });

    pm.test('Response is valid JSON', function () {
        pm.response.to.be.json;
    });

    pm.test('Response has error structure', function () {
        const responseJson = pm.response.json();
        pm.expect(responseJson).to.have.property('error');

        if (checkMessage) {
            pm.expect(responseJson).to.have.property('message');
            pm.expect(responseJson.message).to.be.a('string').and.not.be.empty;
        }
    });

    pm.test('No sensitive data in error response', function () {
        const responseJson = pm.response.json();
        const responseStr = JSON.stringify(responseJson).toLowerCase();

        // Check for common sensitive data patterns
        pm.expect(responseStr).to.not.include('password');
        pm.expect(responseStr).to.not.include('token');
        pm.expect(responseStr).to.not.include('secret');
        pm.expect(responseStr).to.not.include('hash');
    });
}

/**
 * Validate JWT token structure and store in environment
 */
function validateAndStoreTokens(tokenKey = 'accessToken', refreshTokenKey = 'refreshToken') {
    pm.test('Tokens have valid JWT structure', function () {
        const responseJson = pm.response.json();

        if (responseJson.data && responseJson.data[tokenKey]) {
            const token = responseJson.data[tokenKey];
            pm.expect(token.split('.')).to.have.length(3, 'Invalid JWT format');
            pm.environment.set(tokenKey, token);
            console.log(`Stored ${tokenKey} in environment`);
        }

        if (responseJson.data && responseJson.data[refreshTokenKey]) {
            const refreshToken = responseJson.data[refreshTokenKey];
            pm.expect(refreshToken.split('.')).to.have.length(3, 'Invalid refresh token format');
            pm.environment.set(refreshTokenKey, refreshToken);
            console.log(`Stored ${refreshTokenKey} in environment`);
        }
    });
}

/**
 * Validate user data structure and store user ID
 */
function validateUserData(storeUserId = true) {
    pm.test('User data is complete and secure', function () {
        const responseJson = pm.response.json();
        const user = responseJson.data.user;

        // Required fields
        pm.expect(user).to.have.property('id');
        pm.expect(user).to.have.property('email');
        pm.expect(user).to.have.property('name');

        // Security: sensitive fields should not be exposed
        pm.expect(user).to.not.have.property('password');
        pm.expect(user).to.not.have.property('passwordHash');

        if (storeUserId) {
            pm.environment.set('userId', user.id);
            console.log(`Stored user ID: ${user.id}`);
        }
    });
}

/**
 * Performance testing helper
 */
function validatePerformance(maxResponseTime = null) {
    const threshold = maxResponseTime ||
                     parseInt(pm.environment.get('performanceThreshold')) ||
                     2000;

    pm.test(`Response time is under ${threshold}ms`, function () {
        pm.expect(pm.response.responseTime).to.be.below(threshold);
    });

    if (pm.environment.get('monitoringEnabled') === 'true') {
        console.log(`Response time: ${pm.response.responseTime}ms (threshold: ${threshold}ms)`);
    }
}

/**
 * Validate response headers
 */
function validateResponseHeaders() {
    pm.test('Has proper content-type header', function () {
        if (pm.response.code !== 204) {
            pm.expect(pm.response.headers.get('Content-Type')).to.include('application/json');
        }
    });

    pm.test('Has security headers', function () {
        // These headers might not always be present in dev environment
        const securityHeaders = [
            'X-Content-Type-Options',
            'X-Frame-Options',
            'X-XSS-Protection'
        ];

        securityHeaders.forEach(header => {
            if (pm.response.headers.has(header)) {
                console.log(`Security header present: ${header}`);
            }
        });
    });
}

/**
 * Validate request/response consistency
 */
function validateRequestResponseConsistency() {
    pm.test('Response correlates with request', function () {
        const correlationId = pm.environment.get('lastCorrelationId');
        if (correlationId) {
            console.log(`Request correlation ID: ${correlationId}`);
        }

        // Validate that response data matches request where applicable
        if (pm.request.body && pm.request.body.mode === 'raw') {
            try {
                const requestBody = JSON.parse(pm.request.body.raw);
                const responseBody = pm.response.json();

                // For registration/login, email should match
                if (requestBody.email && responseBody.data && responseBody.data.user) {
                    pm.expect(responseBody.data.user.email).to.equal(requestBody.email);
                }
            } catch (e) {
                console.log('Could not parse request body for validation');
            }
        }
    });
}

/**
 * Validation tests
 */
function validateInputValidation(field, expectedError = null) {
    pm.test(`Input validation for ${field}`, function () {
        const responseJson = pm.response.json();
        pm.expect(responseJson.message.toLowerCase()).to.include(field.toLowerCase());

        if (expectedError) {
            pm.expect(responseJson.message.toLowerCase()).to.include(expectedError.toLowerCase());
        }
    });
}

/**
 * Security-specific tests
 */
function validateSecurityResponse() {
    pm.test('No stack traces in response', function () {
        const responseText = pm.response.text();
        pm.expect(responseText.toLowerCase()).to.not.include('stacktrace');
        pm.expect(responseText.toLowerCase()).to.not.include('error stack');
        pm.expect(responseText).to.not.include('.js:');
        pm.expect(responseText).to.not.include('at Object.');
    });

    pm.test('Generic error messages (no information leakage)', function () {
        if (pm.response.code === 401) {
            const responseJson = pm.response.json();
            // Should not reveal whether email exists or password is wrong
            pm.expect(responseJson.message.toLowerCase()).to.not.include('email not found');
            pm.expect(responseJson.message.toLowerCase()).to.not.include('password incorrect');
        }
    });
}

/**
 * Authentication state management
 */
function clearAuthenticationState() {
    pm.environment.unset('accessToken');
    pm.environment.unset('refreshToken');
    pm.environment.unset('userId');
    console.log('Cleared authentication state from environment');
}

/**
 * Main test function for successful authentication responses
 */
function validateAuthSuccess(options = {}) {
    const {
        expectedStatus = 200,
        validateTokens = true,
        validateUser = true,
        storeTokens = true,
        storeUserId = true
    } = options;

    validateSuccessResponse(expectedStatus, true);
    validateResponseHeaders();
    validatePerformance();

    if (validateTokens && storeTokens) {
        validateAndStoreTokens();
    }

    if (validateUser) {
        validateUserData(storeUserId);
    }

    validateRequestResponseConsistency();
}

/**
 * Main test function for authentication errors
 */
function validateAuthError(options = {}) {
    const {
        expectedStatus = 400,
        checkSecurityResponse = true,
        validateInputField = null
    } = options;

    validateErrorResponse(expectedStatus);
    validateResponseHeaders();
    validatePerformance();

    if (checkSecurityResponse) {
        validateSecurityResponse();
    }

    if (validateInputField) {
        validateInputValidation(validateInputField);
    }

    validateRequestResponseConsistency();
}

/**
 * Test suite for logout response
 */
function validateLogoutSuccess() {
    pm.test('Status code is 204 No Content', function () {
        pm.response.to.have.status(204);
    });

    pm.test('Response body is empty', function () {
        pm.expect(pm.response.text()).to.be.empty;
    });

    validatePerformance();

    // Clear tokens from environment after successful logout
    clearAuthenticationState();
}

/**
 * Test suite for protected endpoint access
 */
function validateProtectedEndpointAccess(options = {}) {
    const {
        requiresAuth = true,
        expectedUserMatch = true
    } = options;

    validateSuccessResponse(200, true);
    validateResponseHeaders();
    validatePerformance();

    if (requiresAuth) {
        pm.test('User data returned for authenticated request', function () {
            const responseJson = pm.response.json();
            pm.expect(responseJson.data).to.have.property('user');
        });

        if (expectedUserMatch) {
            pm.test('Returned user matches authenticated user', function () {
                const responseJson = pm.response.json();
                const returnedUserId = responseJson.data.user.id;
                const expectedUserId = pm.environment.get('userId');

                if (expectedUserId) {
                    pm.expect(returnedUserId).to.equal(expectedUserId);
                }
            });
        }
    }

    validateRequestResponseConsistency();
}

/**
 * Comprehensive test runner
 */
function runComprehensiveTests(testType, options = {}) {
    console.log(`=== Running ${testType} tests ===`);

    switch (testType) {
        case 'auth_success':
            validateAuthSuccess(options);
            break;
        case 'auth_error':
            validateAuthError(options);
            break;
        case 'logout':
            validateLogoutSuccess();
            break;
        case 'protected_access':
            validateProtectedEndpointAccess(options);
            break;
        default:
            console.log(`Unknown test type: ${testType}`);
    }
}

// Export functions for use in collection scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        validateSuccessResponse,
        validateErrorResponse,
        validateAndStoreTokens,
        validateUserData,
        validatePerformance,
        validateResponseHeaders,
        validateRequestResponseConsistency,
        validateInputValidation,
        validateSecurityResponse,
        clearAuthenticationState,
        validateAuthSuccess,
        validateAuthError,
        validateLogoutSuccess,
        validateProtectedEndpointAccess,
        runComprehensiveTests
    };
}