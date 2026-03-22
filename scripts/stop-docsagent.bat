@echo off
setlocal EnableExtensions

set "PID_FILE=%USERPROFILE%\.docsagent\docsagent.pid"
set "FOUND=0"
set "ACCESS_DENIED=0"

if exist "%PID_FILE%" (
  set /p PID=<"%PID_FILE%"
  if not "%PID%"=="" (
    taskkill /PID %PID% /F >nul 2>&1
    if not errorlevel 1 (
      echo [OK] Stopped DocPulse by PID: %PID%
      set "FOUND=1"
    ) else (
      set "ACCESS_DENIED=1"
    )
  )
  del /f /q "%PID_FILE%" >nul 2>&1
)

if "%FOUND%"=="0" (
  for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":18080" ^| findstr "LISTENING"') do (
    taskkill /PID %%P /F >nul 2>&1
    if not errorlevel 1 (
      echo [OK] Stopped process listening on 18080. PID=%%P
      set "FOUND=1"
    ) else (
      set "ACCESS_DENIED=1"
      echo [WARN] Found process on 18080 but cannot terminate PID=%%P with current permission.
    )
  )
)

if "%FOUND%"=="0" (
  if "%ACCESS_DENIED%"=="1" (
    echo [WARN] Stop failed due to permission.
    echo [HINT] Re-run this script in an Administrator terminal, or end DocPulse.exe in Task Manager (Admin).
  ) else (
    echo [INFO] No running DocPulse process found.
  )
) else (
  echo [DONE] DocPulse stopped.
)

exit /b 0
