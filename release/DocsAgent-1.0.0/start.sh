#!/bin/bash

echo "=========================================="
echo "  Docs-Agent AI 文档助手"
echo "=========================================="
echo ""

# 检查证书文件
if [ ! -f keystore.p12 ]; then
    echo "[警告] 未找到 SSL 证书：keystore.p12"
    echo ""
    echo "Word 加载项必须使用 HTTPS 协议，需要 SSL 证书！"
    echo ""
    read -p "是否现在生成自签名证书？(y/n): " choice
    if [ "$choice" = "y" ]; then
        if [ -f generate-cert.sh ]; then
            chmod +x generate-cert.sh
            ./generate-cert.sh
        else
            echo "[错误] 未找到证书生成脚本：generate-cert.sh"
            exit 1
        fi
        
        if [ ! -f keystore.p12 ]; then
            echo "[错误] 证书生成失败！"
            exit 1
        fi
    else
        echo "[提示] 您可以稍后手动运行 ./generate-cert.sh 生成证书"
        exit 1
    fi
fi

echo "[信息] 检测到 SSL 证书：keystore.p12"
echo ""

# 检查是否使用捆绑的 JRE
if [ -f "./runtime/bin/java" ]; then
    JAVA_CMD="./runtime/bin/java"
    echo "[信息] 使用捆绑的 Java 运行时"
else
    JAVA_CMD="java"
    echo "[信息] 使用系统 Java 运行时"
fi

# 检查 Java 版本
if ! command -v $JAVA_CMD &> /dev/null; then
    echo ""
    echo "[错误] 未找到 Java 运行时环境！"
    echo ""
    echo "解决方案："
    echo "1. 安装 Java 17 或更高版本"
    echo "2. 或将 JRE 复制到 runtime 文件夹"
    echo ""
    exit 1
fi

echo ""
echo "[信息] 正在启动 Docs-Agent..."
echo "[信息] HTTPS 服务地址：https://localhost:18080"
echo "[信息] Word 加载项连接地址：https://localhost:18080"
echo "[信息] 请稍候..."
echo ""

# 启动应用
$JAVA_CMD -Xms256m -Xmx1024m \
    -Dfile.encoding=UTF-8 \
    -jar docs-agent-0.0.1-SNAPSHOT.jar

if [ $? -ne 0 ]; then
    echo ""
    echo "[错误] 应用启动失败！"
fi
