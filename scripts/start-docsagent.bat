@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT_DIR=%~dp0.."
set "APP_EXE=%ROOT_DIR%\dist\DocPulse\DocPulse.exe"
set "PID_DIR=%USERPROFILE%\.docsagent"
set "PID_FILE=%PID_DIR%\docsagent.pid"
set "PORT=18080"

if not exist "%APP_EXE%" (
  echo [ERROR] Not found: %APP_EXE%
  echo [HINT] Run scripts\build-release.bat first.
  exit /b 1
)

if not exist "%PID_DIR%" mkdir "%PID_DIR%" >nul 2>&1

set "PORT_OWNER="
for /f "usebackq tokens=*" %%R in (`powershell -NoProfile -Command "$line = netstat -ano ^| Select-String ':18080' ^| Where-Object { $_ -match 'LISTENING' } ^| Select-Object -First 1; if($line){ $parts = (($line.ToString() -replace '\s+',' ').Trim().Split(' ')); $pp = $parts[$parts.Length-1]; try { $pn=(Get-Process -Id $pp -ErrorAction Stop).ProcessName } catch { $pn='Unknown' }; Write-Output ($pp + ',' + $pn) }"`) do set "PORT_OWNER=%%R"

if not "%PORT_OWNER%"=="" (
  for /f "tokens=1,2 delims=," %%A in ("%PORT_OWNER%") do (
    echo [ERROR] Port %PORT% is already in use. PID=%%A Process=%%B
  )
  echo [HINT] Please stop the existing process first: scripts\stop-docsagent.bat
  echo [HINT] If stop fails due to permission, run terminal as Administrator and retry.
  exit /b 1
)

echo [INFO] Starting DocPulse...
for /f %%P in ('powershell -NoProfile -Command "$p = Start-Process -FilePath '%APP_EXE%' -PassThru; $p.Id"') do set "APP_PID=%%P"

if "%APP_PID%"=="" (
  echo [ERROR] Failed to start DocPulse.
  exit /b 1
)

set "LISTEN_PID="
for /l %%I in (1,1,15) do (
  for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
    if "!LISTEN_PID!"=="" set "LISTEN_PID=%%P"
  )
  if not "!LISTEN_PID!"=="" goto :BOUND
  timeout /t 1 >nul
)

:BOUND

if "%LISTEN_PID%"=="" (
  echo [ERROR] DocPulse did not bind port %PORT%.
  echo [HINT] Run dist\DocPulse\DocPulse.exe in terminal to view detailed errors.
  if exist "%PID_FILE%" del /f /q "%PID_FILE%" >nul 2>&1
  exit /b 1
)

echo %LISTEN_PID%>"%PID_FILE%"
echo [OK] DocPulse started. PID=%LISTEN_PID% (listening on %PORT%)
echo [INFO] Stop command: scripts\stop-docsagent.bat
exit /b 0
