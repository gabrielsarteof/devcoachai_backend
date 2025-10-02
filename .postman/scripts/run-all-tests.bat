@echo off
REM ==============================================================================
REM DevCoach AI - Run All Postman Tests (Windows)
REM ==============================================================================
REM This script runs all Postman collections using Newman in the correct order
REM with proper error handling and reporting.
REM
REM Usage:
REM   run-all-tests.bat [environment]
REM
REM Arguments:
REM   environment - Optional. Values: dev (default), staging, production
REM
REM Examples:
REM   run-all-tests.bat              Uses development environment
REM   run-all-tests.bat staging      Uses staging environment
REM ==============================================================================

setlocal enabledelayedexpansion

REM Configuration
set "ENVIRONMENT=%~1"
if "%ENVIRONMENT%"=="" set "ENVIRONMENT=dev"

set "BASE_DIR=%~dp0.."
set "COLLECTIONS_DIR=%BASE_DIR%\collections"
set "ENVIRONMENTS_DIR=%BASE_DIR%\environments"
set "REPORTS_DIR=%BASE_DIR%\reports"

REM Generate timestamp
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set "TIMESTAMP=%datetime:~0,8%_%datetime:~8,6%"

REM Environment file mapping
if /i "%ENVIRONMENT%"=="dev" (
    set "ENV_FILE=%ENVIRONMENTS_DIR%\global-environment.json"
) else if /i "%ENVIRONMENT%"=="development" (
    set "ENV_FILE=%ENVIRONMENTS_DIR%\global-environment.json"
) else if /i "%ENVIRONMENT%"=="staging" (
    set "ENV_FILE=%ENVIRONMENTS_DIR%\global-environment-staging.json"
) else if /i "%ENVIRONMENT%"=="prod" (
    set "ENV_FILE=%ENVIRONMENTS_DIR%\global-environment-production.json"
) else if /i "%ENVIRONMENT%"=="production" (
    set "ENV_FILE=%ENVIRONMENTS_DIR%\global-environment-production.json"
) else (
    echo [ERROR] Invalid environment: %ENVIRONMENT%
    echo Valid options: dev, staging, production
    exit /b 1
)

REM Check if Newman is installed
where newman >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Newman is not installed
    echo Install it with: npm install -g newman newman-reporter-htmlextra
    exit /b 1
)

REM Create reports directory
if not exist "%REPORTS_DIR%\%TIMESTAMP%" mkdir "%REPORTS_DIR%\%TIMESTAMP%"

echo ╔════════════════════════════════════════════════════════════════╗
echo ║        DevCoach AI - API Test Suite (Newman)                  ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo Environment: %ENVIRONMENT%
echo Environment File: %ENV_FILE%
echo Reports Directory: %REPORTS_DIR%\%TIMESTAMP%
echo.

REM Check if environment file exists
if not exist "%ENV_FILE%" (
    echo [ERROR] Environment file not found: %ENV_FILE%
    exit /b 1
)

REM Track overall status
set TOTAL_TESTS=0
set FAILED_TESTS=0

REM Run Master Collection
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Running: All Tests (Master Collection)
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

newman run "%COLLECTIONS_DIR%\all-tests-collection.json" ^
    -e "%ENV_FILE%" ^
    --reporters cli,json,htmlextra ^
    --reporter-json-export "%REPORTS_DIR%\%TIMESTAMP%\all-tests-report.json" ^
    --reporter-htmlextra-export "%REPORTS_DIR%\%TIMESTAMP%\all-tests-report.html" ^
    --reporter-htmlextra-title "All Tests (Master Collection)" ^
    --reporter-htmlextra-logs ^
    --color on ^
    --delay-request 100

if %errorlevel% equ 0 (
    echo [PASSED] All Tests (Master Collection)
) else (
    echo [FAILED] All Tests (Master Collection)
    set /a FAILED_TESTS+=1
)
set /a TOTAL_TESTS+=1

echo.
echo Running individual module collections...
echo.

REM Run Auth Collection
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Running: Authentication Module
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

newman run "%COLLECTIONS_DIR%\auth-collection.json" ^
    -e "%ENV_FILE%" ^
    --reporters cli,json,htmlextra ^
    --reporter-json-export "%REPORTS_DIR%\%TIMESTAMP%\auth-report.json" ^
    --reporter-htmlextra-export "%REPORTS_DIR%\%TIMESTAMP%\auth-report.html" ^
    --reporter-htmlextra-title "Authentication Module" ^
    --color on ^
    --delay-request 100

if %errorlevel% equ 0 (
    echo [PASSED] Authentication Module
) else (
    echo [FAILED] Authentication Module
    set /a FAILED_TESTS+=1
)
set /a TOTAL_TESTS+=1

REM Run Challenges Collection
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Running: Challenges Module
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

newman run "%COLLECTIONS_DIR%\challenges-collection.json" ^
    -e "%ENV_FILE%" ^
    --reporters cli,json,htmlextra ^
    --reporter-json-export "%REPORTS_DIR%\%TIMESTAMP%\challenges-report.json" ^
    --reporter-htmlextra-export "%REPORTS_DIR%\%TIMESTAMP%\challenges-report.html" ^
    --reporter-htmlextra-title "Challenges Module" ^
    --color on ^
    --delay-request 100

if %errorlevel% equ 0 (
    echo [PASSED] Challenges Module
) else (
    echo [FAILED] Challenges Module
    set /a FAILED_TESTS+=1
)
set /a TOTAL_TESTS+=1

REM Run Metrics Collection
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Running: Metrics Module
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

newman run "%COLLECTIONS_DIR%\metrics-collection.json" ^
    -e "%ENV_FILE%" ^
    --reporters cli,json,htmlextra ^
    --reporter-json-export "%REPORTS_DIR%\%TIMESTAMP%\metrics-report.json" ^
    --reporter-htmlextra-export "%REPORTS_DIR%\%TIMESTAMP%\metrics-report.html" ^
    --reporter-htmlextra-title "Metrics Module" ^
    --color on ^
    --delay-request 100

if %errorlevel% equ 0 (
    echo [PASSED] Metrics Module
) else (
    echo [FAILED] Metrics Module
    set /a FAILED_TESTS+=1
)
set /a TOTAL_TESTS+=1

REM Generate summary
echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                    Test Execution Summary                     ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo Total Collections Run: %TOTAL_TESTS%
set /a PASSED_TESTS=%TOTAL_TESTS%-%FAILED_TESTS%
echo Passed: %PASSED_TESTS%
echo Failed: %FAILED_TESTS%
echo.
echo Reports saved to: %REPORTS_DIR%\%TIMESTAMP%\
echo.

REM Open HTML report in browser
start "" "%REPORTS_DIR%\%TIMESTAMP%\all-tests-report.html"

REM Exit with appropriate code
if %FAILED_TESTS% gtr 0 (
    echo ╔════════════════════════════════════════════════════════════════╗
    echo ║  Some tests FAILED - Please review the reports above          ║
    echo ╚════════════════════════════════════════════════════════════════╝
    exit /b 1
) else (
    echo ╔════════════════════════════════════════════════════════════════╗
    echo ║  All tests PASSED successfully!                                ║
    echo ╚════════════════════════════════════════════════════════════════╝
    exit /b 0
)
