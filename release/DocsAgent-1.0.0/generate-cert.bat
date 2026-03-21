@echo off
chcp 65001 >nul
title 生成 SSL 证书 - DocsAgent

echo ==========================================
echo   Docs-Agent SSL 证书生成工具
echo ==========================================
echo.
echo 此工具将生成自签名 SSL 证书，用于 Word 加载项开发测试
echo.
echo 注意：
echo 1. 生成的证书仅用于开发和测试环境
echo 2. 生产环境请使用正式 CA 颁发的证书
echo 3. 浏览器会提示"不安全"，需手动信任证书
echo.
pause

REM 检查 JAVA_HOME
if "%JAVA_HOME%"=="" (
    echo [错误] 未找到 JAVA_HOME 环境变量
    echo 请确保已安装 JDK 8 或更高版本
    pause
    exit /b 1
)

echo.
echo [信息] 正在生成证书...
echo.

REM 删除旧证书
if exist keystore.p12 (
    echo [警告] 发现已有证书，将被覆盖
    del /f /q keystore.p12
)

REM 生成自签名证书
"%JAVA_HOME%\bin\keytool.exe" -genkeypair ^
    -alias docsagent ^
    -storetype PKCS12 ^
    -keyalg RSA ^
    -keysize 2048 ^
    -storepass 123456 ^
    -keypass 123456 ^
    -validity 3650 ^
    -dname "CN=DocsAgent, OU=Development, O=YourCompany, L=Beijing, ST=Beijing, C=CN" ^
    -keystore keystore.p12

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [错误] 证书生成失败！
    pause
    exit /b 1
)

echo.
echo ==========================================
echo [成功] 证书已生成！
echo ==========================================
echo.
echo 证书文件：keystore.p12
echo 证书密码：123456
echo 有效期：3650 天（约 10 年）
echo.
echo 下一步操作：
echo 1. 启动 Docs-Agent 服务
echo 2. 在浏览器中访问 https://localhost:18080
echo 3. 点击"高级" → "继续前往 localhost(不安全)"
echo 4. Word 加载项即可正常连接
echo.
echo 如何信任此证书（可选）：
echo 1. 双击 keystore.p12 文件
echo 2. 点击"安装证书"
echo 3. 选择"本地计算机" → "下一步"
echo 4. 选择"将所有证书放入以下存储"
echo 5. 点击"浏览" → "受信任的根证书颁发机构"
echo 6. 完成导入后重启浏览器
echo.
echo ==========================================
pause
