==========================================
Docs-Agent AI 文档助手 - Word 加载项后端服务
==========================================

【快速开始】

1. 生成 SSL 证书（首次运行必需）
   
   Windows:
   双击运行：generate-cert.bat
   
   Linux/Mac:
   chmod +x generate-cert.sh
   ./generate-cert.sh

2. 启动服务
   
   Windows:
   双击运行：启动 DocsAgent.bat
   
   Linux/Mac:
   chmod +x start.sh
   ./start.sh

3. 验证服务
   
   打开浏览器访问：https://localhost:18080
   如果看到"不安全"提示，点击"高级" → "继续前往"即可

4. 在 Word 中使用
   
   打开 Word → 插入 → 获取加载项 → 我的加载项
   选择 Docs-Agent 加载项清单文件

==========================================
【文件说明】
==========================================

核心文件：
- docs-agent-0.0.1-SNAPSHOT.jar    主程序
- keystore.p12                     SSL 证书（必需）
- application.properties           配置文件

工具脚本：
- generate-cert.bat                证书生成工具（Windows）
- generate-cert.sh                 证书生成工具（Linux/Mac）
- 启动 DocsAgent.bat               启动脚本（Windows）
- start.sh                         启动脚本（Linux/Mac）

文档：
- README.txt                       本文件
- SSL 证书配置指南.md               SSL 证书详细配置说明

==========================================
【系统要求】
==========================================

- 操作系统：Windows 10/11, macOS 10.15+, Linux
- Java 版本：JDK 17 或更高版本
- 内存：至少 4GB RAM
- 磁盘空间：至少 500MB
- 端口：8080（HTTPS）

==========================================
【SSL 证书说明】
==========================================

为什么需要证书？
Word 加载项强制要求使用 HTTPS 协议，这是 Microsoft 的安全要求。

证书方案：

1. 自签名证书（开发/测试）
   - 运行 generate-cert.bat 自动生成
   - 免费、快速、适合开发环境
   - 浏览器会提示"不安全"，需手动信任

2. 正式 CA 证书（生产环境）
   - 从 DigiCert、Let's Encrypt 等购买
   - 安全可信、适合正式发布
   - 需要域名和年费

详细说明请查看：SSL 证书配置指南.md

==========================================
【配置说明】
==========================================

默认配置：
- HTTPS 端口：8080
- 证书密码：123456
- 证书路径：./keystore.p12

自定义配置（可选）：

方法 1：修改 application.properties
方法 2：使用环境变量

Windows PowerShell:
$env:KEYSTORE_PATH="C:\certs\my-cert.p12"
$env:KEYSTORE_PASSWORD="mypassword"
java -jar docs-agent.jar

Linux/Mac:
export KEYSTORE_PATH=/etc/certs/my-cert.p12
export KEYSTORE_PASSWORD=mypassword
java -jar docs-agent.jar

==========================================
【常见问题】
==========================================

Q: 提示找不到 SSL 证书？
A: 运行 generate-cert.bat 生成证书

Q: 浏览器提示"您的连接不是私密连接"？
A: 这是正常的，因为是自签名证书。点击"高级" → "继续前往 localhost(不安全)"

Q: 如何信任自签名证书？
A: 
   Windows: 双击 keystore.p12 → 安装证书 → 选择"受信任的根证书颁发机构"
   Mac: 双击 keystore.p12 → 钥匙串访问 → 设置"始终信任"

Q: Word 加载项无法连接？
A: 
   1. 确认服务已启动（访问 https://localhost:18080）
   2. 检查防火墙是否允许 18080 端口
   3. 确保证书有效且未过期

Q: 如何停止服务？
A: 关闭命令行窗口即可

Q: 端口被占用怎么办？
A: 修改 application.properties 中的 server.port=18080 为其他端口

==========================================
【技术支持】
==========================================

项目文档：查看 dist 目录下的相关文档
问题反馈：联系开发团队

==========================================
【版本信息】
==========================================

版本：1.0.0
发布日期：2026-03-17
Java 版本：17
Spring Boot 版本：4.0.3

==========================================
