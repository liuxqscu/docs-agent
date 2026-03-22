@echo off
setlocal EnableExtensions EnableDelayedExpansion

chcp 65001 >nul

set "APP_DIR=%USERPROFILE%\.docsagent"
set "KEYSTORE=%APP_DIR%\keystore.p12"
set "CERT_FILE=%APP_DIR%\docsagent-localhost.cer"
set "ALIAS=docsagent-localhost"
set "STOREPASS=%KEYSTORE_PASSWORD%"
if "%STOREPASS%"=="" set "STOREPASS=123456"

echo [信息] DocPulse 本机证书初始化开始
echo [信息] 目标目录: %APP_DIR%

where keytool >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 keytool。请安装 JDK 17+ 并确保 keytool 在 PATH 中。
    exit /b 1
)

if not exist "%APP_DIR%" (
    mkdir "%APP_DIR%"
    if errorlevel 1 (
        echo [错误] 无法创建目录: %APP_DIR%
        exit /b 1
    )
)

if not exist "%KEYSTORE%" (
    echo [信息] 正在生成本机证书与 keystore...
    keytool -genkeypair ^
      -alias "%ALIAS%" ^
      -keyalg RSA ^
      -keysize 2048 ^
      -validity 3650 ^
      -storetype PKCS12 ^
      -keystore "%KEYSTORE%" ^
      -storepass "%STOREPASS%" ^
      -keypass "%STOREPASS%" ^
    -dname "CN=localhost, OU=DocPulse, O=DocPulse, L=Local, ST=Local, C=CN" ^
      -ext "SAN=dns:localhost,ip:127.0.0.1"

    if errorlevel 1 (
        echo [错误] 生成 keystore 失败。
        exit /b 1
    )
) else (
    echo [信息] 已存在 keystore，跳过生成: %KEYSTORE%
)

echo [信息] 正在导出证书...
keytool -exportcert ^
  -alias "%ALIAS%" ^
  -keystore "%KEYSTORE%" ^
  -storepass "%STOREPASS%" ^
  -rfc ^
  -file "%CERT_FILE%"

if errorlevel 1 (
    echo [错误] 导出证书失败。
    exit /b 1
)

echo [信息] 正在导入系统受信任根证书库（需要管理员权限）...
certutil -addstore -f Root "%CERT_FILE%" >nul 2>&1
if errorlevel 1 (
    echo [警告] 导入系统根证书失败，可能是管理员权限不足。
    echo [提示] 请以管理员身份重新运行本脚本完成信任导入。
    echo [提示] 已生成 keystore，可通过浏览器手动信任证书后继续使用。
) else (
    echo [成功] 证书已导入系统受信任根证书库。
)

echo.
echo [完成] 初始化结果:
echo   KEYSTORE_PATH=file:%KEYSTORE%
echo   KEYSTORE_PASSWORD=%STOREPASS%
echo.
echo [下一步] 启动 DocPulse 后访问: https://localhost:18080

exit /b 0
