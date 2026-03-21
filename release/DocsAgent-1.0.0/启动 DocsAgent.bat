@echo off
chcp 65001 >nul
title Docs-Agent AI文档助手
echo ==========================================
echo    Docs-Agent AI文档助手
echo ==========================================
echo.

REM 检查证书文件
if not exist keystore.p12 (
    echo [警告] 未找到 SSL 证书：keystore.p12
    echo.
    echo Word 加载项必须使用 HTTPS 协议，需要 SSL 证书！
    echo.
    choice /C YN /M "是否现在生成自签名证书"
    if errorlevel 2 (
        echo.
        echo [提示] 您可以稍后手动运行 generate-cert.bat 生成证书
        pause
        exit /b 1
    )
    
    REM 生成证书
    if exist generate-cert.bat (
        call generate-cert.bat
    ) else (
        echo [错误] 未找到证书生成脚本：generate-cert.bat
        pause
        exit /b 1
    )
    
    if not exist keystore.p12 (
        echo [错误] 证书生成失败！
        pause
        exit /b 1
    )
)

echo [信息] 检测到 SSL 证书：keystore.p12
echo.

REM 检查是否使用捆绑的 JRE
if exist "runtime\bin\java.exe" (
    set JAVA_CMD=runtime\bin\java.exe
    echo [信息] 使用捆绑的 Java 运行时
) else (
    set JAVA_CMD=java
    echo [信息] 使用系统 Java 运行时
)

REM 检查 Java 版本
"%JAVA_CMD%" -version 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [错误] 未找到 Java 运行时环境！
    echo.
    echo 解决方案：
    echo 1. 安装 Java 17 或更高版本
    echo 2. 或将 JRE 复制到 runtime 文件夹
    echo.
    pause
    exit /b 1
)

echo.
echo [信息] 正在启动 Docs-Agent...
echo [信息] HTTPS 服务地址：https://localhost:18080
echo [信息] Word 加载项连接地址：https://localhost:18080
echo [信息] 请稍候...
echo.

REM 启动应用
"%JAVA_CMD%" -Xms256m -Xmx1024m ^
    -Dfile.encoding=UTF-8 ^
    -Dsun.stdout.encoding=GBK ^
    -Dsun.stderr.encoding=GBK ^
    -jar docs-agent-0.0.1-SNAPSHOT.jar

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [错误] 应用启动失败！
    pause
)
