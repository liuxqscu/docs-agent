@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0.."
pushd "%ROOT_DIR%" >nul

set "APP_NAME=DocPulse"
set "APP_VERSION=1.0.0"
set "JAR_NAME=docs-agent-0.0.1-SNAPSHOT.jar"
set "DIST_DIR=dist"
set "APP_IMAGE_DIR=%DIST_DIR%\%APP_NAME%"
set "CERT_PATH=%USERPROFILE%\.docsagent\keystore.p12"

echo [INFO] Root directory: %CD%
echo [INFO] Building %APP_NAME% version %APP_VERSION%

echo [STEP 1/7] Stopping running processes...
taskkill /F /IM %APP_NAME%.exe >nul 2>&1
taskkill /F /IM java.exe >nul 2>&1
taskkill /F /IM javaw.exe >nul 2>&1

echo [STEP 2/7] Checking required tools...
where jpackage >nul 2>&1
if errorlevel 1 (
  echo [ERROR] jpackage not found. Please install JDK 17+ and add it to PATH.
  popd >nul
  exit /b 1
)

echo [STEP 3/7] Packaging Spring Boot jar...
call .\mvnw.cmd clean package -DskipTests
if errorlevel 1 (
  echo [ERROR] Maven package failed.
  popd >nul
  exit /b 1
)

if not exist "target\%JAR_NAME%" (
  echo [ERROR] target\%JAR_NAME% not found.
  popd >nul
  exit /b 1
)

echo [STEP 4/7] Cleaning old dist artifacts...
if exist "%APP_IMAGE_DIR%" rmdir /S /Q "%APP_IMAGE_DIR%"

echo [STEP 5/7] Building app-image...
jpackage --type app-image --name %APP_NAME% --input target --main-jar %JAR_NAME% --main-class org.springframework.boot.loader.launch.JarLauncher --dest %DIST_DIR% --app-version %APP_VERSION% --java-options "-Djava.awt.headless=false"
if errorlevel 1 (
  echo [ERROR] app-image build failed.
  popd >nul
  exit /b 1
)

echo [STEP 6/7] Building exe installer...
jpackage --type exe --name %APP_NAME% --input target --main-jar %JAR_NAME% --main-class org.springframework.boot.loader.launch.JarLauncher --dest %DIST_DIR% --win-menu --win-shortcut --app-version %APP_VERSION% --java-options "-Djava.awt.headless=false"
if errorlevel 1 (
  echo [ERROR] exe build failed. If this is a WiX related error, install WiX Toolset and retry.
  popd >nul
  exit /b 1
)

echo [STEP 7/7] Checking local certificate status...
if exist "%CERT_PATH%" (
  echo [OK] Local certificate exists: %CERT_PATH%
) else (
  echo [WARN] Local certificate not found: %CERT_PATH%
  echo [WARN] Run scripts\init-local-cert.bat before first launch.
)

echo.
echo [DONE] Build artifacts:
echo   - %APP_IMAGE_DIR%
dir /B "%DIST_DIR%\*.exe" 2>nul
echo.
echo [RUN] Start: scripts\start-docsagent.bat
echo [RUN] Stop : scripts\stop-docsagent.bat
echo.
echo [NEXT] Validate app launch and open https://localhost:18080

popd >nul
exit /b 0
