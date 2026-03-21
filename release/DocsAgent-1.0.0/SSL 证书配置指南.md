# Docs-Agent SSL 证书配置指南

## 📋 目录

- [为什么需要 SSL 证书](#为什么需要 ssl 证书)
- [方案一：生成自签名证书（推荐用于开发）](#方案一生成自签名证书推荐用于开发)
- [方案二：使用正式 CA 证书（推荐用于生产）](#方案二使用正式 ca 证书推荐用于生产)
- [方案三：使用环境变量配置](#方案三使用环境变量配置)
- [常见问题](#常见问题)

---

## 🔒 为什么需要 SSL 证书？

Word 加载项强制要求使用 HTTPS 协议，这是 Microsoft 的安全要求。因此，Docs-Agent 必须配置 SSL 证书才能与 Word 加载项通信。

---

## ✅ 方案一：生成自签名证书（推荐用于开发）

### 适用场景
- ✅ 开发和测试环境
- ✅ 个人使用
- ✅ 内部演示

### 快速生成

**Windows:**
```bash
双击运行：generate-cert.bat
```

**Linux/Mac:**
```bash
chmod +x generate-cert.sh
./generate-cert.sh
```

### 手动生成（如果脚本失败）

```bash
keytool -genkeypair \
    -alias docsagent \
    -storetype PKCS12 \
    -keyalg RSA \
    -keysize 2048 \
    -storepass 123456 \
    -keypass 123456 \
    -validity 3650 \
    -dname "CN=DocsAgent, OU=Development, O=YourCompany, L=Beijing, ST=Beijing, C=CN" \
    -keystore keystore.p12
```

### 信任自签名证书（可选）

为了避免浏览器每次提示"不安全"，可以将证书添加到受信任的根证书颁发机构：

**Windows:**
1. 双击 `keystore.p12` 文件
2. 点击"安装证书"
3. 选择"本地计算机" → "下一步"
4. 选择"将所有证书放入以下存储"
5. 点击"浏览" → 选择"受信任的根证书颁发机构"
6. "下一步" → "完成"
7. 重启浏览器

**Mac:**
1. 双击 `keystore.p12` 打开钥匙串访问
2. 在"系统"钥匙串中找到证书
3. 双击证书，展开"信任"
4. 设置"使用此证书时"为"始终信任"
5. 关闭钥匙串访问

### 验证

启动服务后访问：https://localhost:18080

浏览器会提示"您的连接不是私密连接"，这是正常的。点击"高级" → "继续前往 localhost(不安全)"即可。

---

## 🏢 方案二：使用正式 CA 证书（推荐用于生产）

### 适用场景
- ✅ 生产环境部署
- ✅ 企业正式发布
- ✅ 需要长期稳定运行

### 获取正式证书

1. **从 CA 机构购买**
   - DigiCert、Let's Encrypt、GlobalSign 等
   - 申请域名证书（如：docs-agent.yourcompany.com）

2. **转换为 PKCS12 格式**
   
   如果获得的是 PEM 格式证书（.crt + .key），需要转换：
   
   ```bash
   openssl pkcs12 -export \
       -in your-domain.crt \
       -inkey your-domain.key \
       -out keystore.p12 \
       -name docsagent \
       -CAfile your-domain.crt \
       -caname root
   ```

3. **配置证书**
   
   将生成的 `keystore.p12` 放在应用启动目录，修改密码：
   
   ```bash
   # Windows PowerShell
   $env:KEYSTORE_PATH="C:\certs\keystore.p12"
   $env:KEYSTORE_PASSWORD="your-password"
   java -jar docs-agent.jar
   
   # Linux/Mac
   export KEYSTORE_PATH=/etc/certs/keystore.p12
   export KEYSTORE_PASSWORD="your-password"
   java -jar docs-agent.jar
   ```

---

## ⚙️ 方案三：使用环境变量配置

### 通过环境变量指定证书路径

**Windows PowerShell:**
```powershell
$env:KEYSTORE_PATH="C:\certs\my-cert.p12"
$env:KEYSTORE_PASSWORD="mypassword"
java -jar docs-agent.jar
```

**Linux/Mac Bash:**
```bash
export KEYSTORE_PATH=/etc/certs/my-cert.p12
export KEYSTORE_PASSWORD=mypassword
java -jar docs-agent.jar
```

**Docker:**
```bash
docker run -e KEYSTORE_PATH=/certs/app.p12 \
           -e KEYSTORE_PASSWORD=secret \
           -v /host/certs:/certs \
           docs-agent
```

### 配置文件优先级

应用会按以下顺序查找证书：

1. 环境变量 `KEYSTORE_PATH` 指定的路径
2. 应用目录下的 `keystore.p12`
3. JAR 包内的默认证书（如果有）

---

## ❓ 常见问题

### Q1: 证书密码可以修改吗？

**A:** 可以！修改 `application.properties` 或使用环境变量：

```properties
server.ssl.key-store-password=${KEYSTORE_PASSWORD:123456}
```

### Q2: 证书有效期是多久？

**A:** 
- 自签名证书：默认 3650 天（10 年）
- 正式 CA 证书：通常 1-2 年，需续费

### Q3: 如何更新证书？

**A:** 
1. 停止服务
2. 替换 `keystore.p12` 文件
3. 重启服务

### Q4: Word 加载项仍然无法连接怎么办？

**A:** 检查以下几点：
- ✅ 确保证书有效且未过期
- ✅ 确认服务已启动且端口 8080 未被占用
- ✅ 检查防火墙是否允许 8080 端口
- ✅ Word 加载项清单中的 URL 必须与服务地址完全一致
- ✅ 如果使用自签名证书，确保已信任证书

### Q5: 如何在服务器上部署？

**A:** 
1. 购买正式 SSL 证书（推荐 Let's Encrypt 免费证书）
2. 配置反向代理（Nginx/Apache）
3. 或直接使用证书运行 Spring Boot

**Nginx 配置示例：**
```nginx
server {
    listen 443 ssl;
    server_name docs-agent.yourcompany.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:18080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 📄 证书配置示例

### 开发环境（自签名）
```
应用目录/
├── docs-agent.jar
├── keystore.p12          # 自签名证书
├── generate-cert.bat     # 证书生成工具
└── application.properties
```

### 生产环境（正式证书）
```
/opt/docs-agent/
├── docs-agent.jar
├── /etc/ssl/certs/keystore.p12  # 正式 CA 证书
├── application.properties
└── start.sh
```

---

## 🔗 相关资源

- [Spring Boot SSL 配置](https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/#web.server.ssl)
- [Let's Encrypt 免费证书](https://letsencrypt.org/)
- [Microsoft Office 加载项安全要求](https://docs.microsoft.com/en-us/office/dev/add-ins/concepts/security-for-office-add-ins)
- [Keytool 官方文档](https://docs.oracle.com/en/java/javase/17/tools/keytool.html)

---

## 📞 技术支持

如有问题，请查阅项目文档或联系开发团队。
