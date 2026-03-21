#!/bin/bash

echo "=========================================="
echo "  Docs-Agent SSL 证书生成工具"
echo "=========================================="
echo ""
echo "此工具将生成自签名 SSL 证书，用于 Word 加载项开发测试"
echo ""
echo "注意："
echo "1. 生成的证书仅用于开发和测试环境"
echo "2. 生产环境请使用正式 CA 颁发的证书"
echo "3. 浏览器会提示\"不安全\"，需手动信任证书"
echo ""
read -p "按回车键继续..."

# 检查 JAVA_HOME
if [ -z "$JAVA_HOME" ]; then
    echo "[错误] 未找到 JAVA_HOME 环境变量"
    echo "请确保已安装 JDK 8 或更高版本"
    exit 1
fi

echo ""
echo "[信息] 正在生成证书..."
echo ""

# 删除旧证书
if [ -f keystore.p12 ]; then
    echo "[警告] 发现已有证书，将被覆盖"
    rm -f keystore.p12
fi

# 生成自签名证书
"$JAVA_HOME/bin/keytool" -genkeypair \
    -alias docsagent \
    -storetype PKCS12 \
    -keyalg RSA \
    -keysize 2048 \
    -storepass 123456 \
    -keypass 123456 \
    -validity 3650 \
    -dname "CN=DocsAgent, OU=Development, O=YourCompany, L=Beijing, ST=Beijing, C=CN" \
    -keystore keystore.p12

if [ $? -ne 0 ]; then
    echo ""
    echo "[错误] 证书生成失败！"
    exit 1
fi

echo ""
echo "=========================================="
echo "[成功] 证书已生成！"
echo "=========================================="
echo ""
echo "证书文件：keystore.p12"
echo "证书密码：123456"
echo "有效期：3650 天（约 10 年）"
echo ""
echo "下一步操作："
echo "1. 启动 Docs-Agent 服务"
echo "2. 在浏览器中访问 https://localhost:18080"
echo "3. 点击\"高级\" → \"继续前往 localhost(不安全)\""
echo "4. Word 加载项即可正常连接"
echo ""
echo "如何信任此证书（可选）："
echo "Mac:"
echo "1. 双击 keystore.p12 文件打开钥匙串访问"
echo "2. 在\"系统\"钥匙串中找到证书"
echo "3. 双击证书，展开\"信任\""
echo "4. 设置\"使用此证书时\"为\"始终信任\""
echo "5. 关闭钥匙串访问"
echo ""
echo "Linux:"
echo "1. 将证书复制到 /usr/local/share/ca-certificates/"
echo "2. 运行 sudo update-ca-certificates"
echo ""
echo "=========================================="
