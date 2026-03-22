@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT_DIR=%~dp0.."
pushd "%ROOT_DIR%" >nul

set "APP_NAME=DocPulse"
set "APP_VERSION=1.0.0"
set "APP_VENDOR=DocPulse"
set "APP_DESCRIPTION=DocPulse Local Word AI Assistant"
set "APP_COPYRIGHT=Copyright (c) 2026 DocPulse contributors"
set "JAR_NAME=docs-agent-0.0.1-SNAPSHOT.jar"
set "DIST_DIR=dist"
set "APP_IMAGE_DIR=%DIST_DIR%\%APP_NAME%"
set "APP_IMAGE_ZIP=%DIST_DIR%\%APP_NAME%-%APP_VERSION%-app-image.zip"
set "PACKAGE_INPUT_DIR=%DIST_DIR%\package-input"
set "CERT_PATH=%USERPROFILE%\.docsagent\keystore.p12"
set "ICON_PATH=%ROOT_DIR%\scripts\assets\DocPulse.ico"
set "JLINK_OPTIONS=--strip-debug --no-header-files --no-man-pages --compress=zip-6 --include-locales=en,zh-CN"
set "INNO_SCRIPT=%ROOT_DIR%\scripts\installer\DocPulse.iss"
set "INNO_EXE="

REM Optional signing inputs (set via environment variables before running script):
REM   DOCPULSE_SIGN_PFX=C:\path\to\codesign.pfx
REM   DOCPULSE_SIGN_PFX_PASSWORD=your_password
set "SIGN_PFX=%DOCPULSE_SIGN_PFX%"
set "SIGN_PFX_PASSWORD=%DOCPULSE_SIGN_PFX_PASSWORD%"

echo [INFO] Root directory: %CD%
echo [INFO] Building %APP_NAME% version %APP_VERSION%
echo [INFO] Vendor: %APP_VENDOR%
echo [INFO] jlink options: %JLINK_OPTIONS%

if exist "%ICON_PATH%" (
  echo [INFO] Custom icon: %ICON_PATH%
) else (
  echo [WARN] Custom icon not found: %ICON_PATH%
  echo [WARN] Packaging will use default Java icon.
)

echo [STEP 1/8] Stopping running processes...
taskkill /F /IM %APP_NAME%.exe >nul 2>&1
taskkill /F /IM java.exe >nul 2>&1
taskkill /F /IM javaw.exe >nul 2>&1

echo [STEP 2/8] Checking required tools...
where jpackage >nul 2>&1
if errorlevel 1 (
  echo [ERROR] jpackage not found. Please install JDK 17+ and add it to PATH.
  popd >nul
  exit /b 1
)

echo [STEP 3/8] Packaging Spring Boot jar...
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

echo [STEP 4/8] Cleaning old dist artifacts...
if exist "%APP_IMAGE_DIR%" rmdir /S /Q "%APP_IMAGE_DIR%"
if exist "%PACKAGE_INPUT_DIR%" rmdir /S /Q "%PACKAGE_INPUT_DIR%"

echo [STEP 5/8] Preparing minimal jpackage input...
mkdir "%PACKAGE_INPUT_DIR%" >nul 2>&1
copy /Y "target\%JAR_NAME%" "%PACKAGE_INPUT_DIR%\%JAR_NAME%" >nul
if errorlevel 1 (
  echo [ERROR] Failed to prepare jpackage input jar.
  popd >nul
  exit /b 1
)

echo [STEP 6/10] Building app-image...
if exist "%ICON_PATH%" (
  jpackage --type app-image --name %APP_NAME% --input "%PACKAGE_INPUT_DIR%" --main-jar %JAR_NAME% --main-class org.springframework.boot.loader.launch.JarLauncher --dest %DIST_DIR% --app-version %APP_VERSION% --vendor "%APP_VENDOR%" --description "%APP_DESCRIPTION%" --copyright "%APP_COPYRIGHT%" --icon "%ICON_PATH%" --jlink-options "%JLINK_OPTIONS%" --java-options "-Djava.awt.headless=false"
) else (
  jpackage --type app-image --name %APP_NAME% --input "%PACKAGE_INPUT_DIR%" --main-jar %JAR_NAME% --main-class org.springframework.boot.loader.launch.JarLauncher --dest %DIST_DIR% --app-version %APP_VERSION% --vendor "%APP_VENDOR%" --description "%APP_DESCRIPTION%" --copyright "%APP_COPYRIGHT%" --jlink-options "%JLINK_OPTIONS%" --java-options "-Djava.awt.headless=false"
)
if errorlevel 1 (
  echo [ERROR] app-image build failed.
  popd >nul
  exit /b 1
)

echo [STEP 7/10] Building installer...
if not exist "%APP_IMAGE_DIR%\%APP_NAME%.exe" (
  echo [ERROR] app-image launcher not found: %APP_IMAGE_DIR%\%APP_NAME%.exe
  echo [ERROR] Skip exe packaging because app-image is incomplete.
  popd >nul
  exit /b 1
)

set "INSTALLER_FILE="
where iscc >nul 2>&1
if not errorlevel 1 (
  set "INNO_EXE=iscc"
) else (
  if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" (
    set "INNO_EXE=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
  ) else if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" (
    set "INNO_EXE=%ProgramFiles%\Inno Setup 6\ISCC.exe"
  ) else if exist "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" (
    set "INNO_EXE=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
  )
)

if defined INNO_EXE (
  if exist "%INNO_SCRIPT%" (
    echo [INFO] Inno Setup detected: !INNO_EXE!
    echo [INFO] Building installer with Inno script...
    if exist "%ICON_PATH%" (
      "!INNO_EXE!" /Qp /DMyAppName="%APP_NAME%" /DMyAppVersion="%APP_VERSION%" /DMyAppPublisher="%APP_VENDOR%" /DMyAppExe="%APP_NAME%.exe" /DAppImageDir="%CD%\%APP_IMAGE_DIR%" /DOutputDir="%CD%\%DIST_DIR%" /DSetupIconFile="%ICON_PATH%" "%INNO_SCRIPT%"
    ) else (
      "!INNO_EXE!" /Qp /DMyAppName="%APP_NAME%" /DMyAppVersion="%APP_VERSION%" /DMyAppPublisher="%APP_VENDOR%" /DMyAppExe="%APP_NAME%.exe" /DAppImageDir="%CD%\%APP_IMAGE_DIR%" /DOutputDir="%CD%\%DIST_DIR%" "%INNO_SCRIPT%"
    )
    if errorlevel 1 (
      echo [ERROR] Inno Setup build failed.
      popd >nul
      exit /b 1
    )

    set "INSTALLER_FILE=%DIST_DIR%\%APP_NAME%-%APP_VERSION%-setup.exe"
    if not exist "!INSTALLER_FILE!" (
      echo [ERROR] Inno installer not found: !INSTALLER_FILE!
      popd >nul
      exit /b 1
    )
  ) else (
    echo [WARN] Inno script not found: %INNO_SCRIPT%
  )
)

if "!INSTALLER_FILE!"=="" (
  echo [WARN] Inno Setup not available. Fallback to jpackage exe installer.
  if exist "%ICON_PATH%" (
    jpackage --type exe --name %APP_NAME% --app-image "%APP_IMAGE_DIR%" --dest %DIST_DIR% --win-menu --win-shortcut --win-dir-chooser --install-dir "%APP_NAME%" --app-version %APP_VERSION% --vendor "%APP_VENDOR%" --description "%APP_DESCRIPTION%" --copyright "%APP_COPYRIGHT%" --icon "%ICON_PATH%"
  ) else (
    jpackage --type exe --name %APP_NAME% --app-image "%APP_IMAGE_DIR%" --dest %DIST_DIR% --win-menu --win-shortcut --win-dir-chooser --install-dir "%APP_NAME%" --app-version %APP_VERSION% --vendor "%APP_VENDOR%" --description "%APP_DESCRIPTION%" --copyright "%APP_COPYRIGHT%"
  )
  if errorlevel 1 (
    echo [ERROR] jpackage exe build failed.
    popd >nul
    exit /b 1
  )
  set "INSTALLER_FILE=%DIST_DIR%\%APP_NAME%-%APP_VERSION%.exe"
)

echo [STEP 8/10] Packaging app-image zip...
if exist "%APP_IMAGE_ZIP%" del /F /Q "%APP_IMAGE_ZIP%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '%CD%\%APP_IMAGE_DIR%\*' -DestinationPath '%CD%\%APP_IMAGE_ZIP%' -Force"
if errorlevel 1 (
  echo [ERROR] Failed to create app-image zip: %APP_IMAGE_ZIP%
  popd >nul
  exit /b 1
)

echo [STEP 9/10] Optional code signing...
if "!INSTALLER_FILE!"=="" (
  echo [WARN] Installer exe not found for signing.
) else (
  if defined SIGN_PFX (
    if defined SIGN_PFX_PASSWORD (
      where signtool >nul 2>&1
      if errorlevel 1 (
        echo [WARN] signtool not found. Skip signing.
      ) else (
        signtool sign /f "%SIGN_PFX%" /p "%SIGN_PFX_PASSWORD%" /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 "!INSTALLER_FILE!"
        if errorlevel 1 (
          echo [WARN] Code signing failed. Installer remains unsigned.
        ) else (
          echo [OK] Installer signed: !INSTALLER_FILE!
        )
      )
    ) else (
      echo [WARN] DOCPULSE_SIGN_PFX is set but DOCPULSE_SIGN_PFX_PASSWORD is missing. Skip signing.
    )
  ) else (
    echo [INFO] No signing certificate configured. Installer remains unsigned.
    echo [INFO] To enable signing, set DOCPULSE_SIGN_PFX and DOCPULSE_SIGN_PFX_PASSWORD.
  )
)

echo [STEP 10/10] Checking local certificate status...
if exist "%CERT_PATH%" (
  echo [OK] Local certificate exists: %CERT_PATH%
) else (
  echo [WARN] Local certificate not found: %CERT_PATH%
  echo [WARN] Run scripts\init-local-cert.bat before first launch.
)

echo.
echo [DONE] Build artifacts:
echo   - %APP_IMAGE_DIR%
echo   - %APP_IMAGE_ZIP%
dir /B "%DIST_DIR%\*.exe" 2>nul
echo.
echo [RUN] Start: scripts\start-docsagent.bat
echo [RUN] Stop : scripts\stop-docsagent.bat
echo.
echo [NEXT] Validate app launch and open https://localhost:18080

popd >nul
exit /b 0
