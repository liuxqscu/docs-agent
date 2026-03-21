@echo off
setlocal

echo [1/2] Running semantic matrix checks...
node scripts\semantic-matrix-check.js
if errorlevel 1 (
  echo Semantic matrix checks FAILED.
  exit /b 1
)

echo [2/2] Compiling project...
mvn -DskipTests compile
if errorlevel 1 (
  echo Maven compile FAILED.
  exit /b 1
)

echo All checks passed.
exit /b 0
