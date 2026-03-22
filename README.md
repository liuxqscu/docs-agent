# DocPulse (docs-agent)

DocPulse 是一个本地优先的 Word AI 协作编辑工具：
- 后端使用 Spring Boot 提供 API 与本地 HTTPS 服务。
- 前端是静态页面（Office.js 场景），运行在 `https://localhost:18080`。
- 通过 Word Add-in Manifest 将侧边栏挂载到 Word。

本项目目标是让开发者在本机快速复现：拉代码 -> 启动服务 -> 导入 Manifest -> 在 Word 里使用。

---

## 1. 当前状态（对开源使用者）

### 已完成能力

- 段落级审阅流：`update / insert_after / delete / ai_selection`。
- 单条与批量审阅：`accept / reject / accept-all / reject-all`。
- `ai_selection` 多段映射策略统一到后端（避免前后端规则漂移）。
- 结构性变更（insert/delete）后触发状态刷新，减少段落映射陈旧问题。
- 本地证书自动生成（首次启动自动准备 `keystore`）。
- Manifest 自动生成（按当前端口生成 `SourceLocation`）。
- Windows 桌面托盘菜单与退出机制（无托盘环境有控制窗兜底）。

### 已知边界

- Office.js 的最终行为仍需在真实 Word 宿主验证（浏览器里无法完全替代）。
- 重复段落文本场景下，`insert_after` 锚点匹配仍建议做人工抽样验证。

当前 README 已包含面向开源复现所需的核心背景与操作信息。

---

## 2. 技术栈

### 后端

- Java 17+
- Spring Boot 4.0.3 (`spring-boot-starter-webmvc`)
- Lombok
- Apache POI（Word 文档处理）
- PDFBox（参考资料解析）
- LangChain4j（LLM 接入）

### 前端

- 原生 HTML/CSS/JavaScript（静态资源由 Spring Boot 托管）
- Office.js（Word Add-in 场景）

### 打包与桌面运行

- Maven Wrapper（`mvnw` / `mvnw.cmd`）
- jpackage（生成 app-image / exe）
- WiX Toolset（仅 Windows `--type exe` 需要）

---

## 3. 项目架构

```text
src/main/java/com/example/docs_agent
├─ controller
│  └─ DocAgentController.java         # /api/* 入口
├─ service
│  ├─ DocumentContext.java            # 文档块内存态（block map + index map）
│  ├─ BatchChangeService.java         # 批量审阅
│  ├─ AiSelectionSyncService.java     # ai_selection 映射规则（后端统一）
│  └─ ...
└─ config
   ├─ LocalCertificateProvisioningConfig.java  # 启动前证书自动准备
   ├─ ManifestProvisioningService.java         # 启动后自动生成/更新 Manifest
   └─ DesktopTrayManager.java                  # 托盘/控制窗

src/main/resources
├─ application.properties              # 端口、SSL、AI 参数
└─ static
   ├─ index.html
   └─ js
      ├─ document.js                   # 文档交互主逻辑
      ├─ chat.js / ui.js / features.js
      └─ paragraph
         ├─ id-parser.js
         ├─ paragraph-store.js
         └─ paragraph-orchestrator.js
```

### 运行时数据目录（用户目录）

默认写入 `%USERPROFILE%\\.docsagent`：
- `keystore.p12`
- `docpulse-localhost.cer`（或脚本导出的 `docsagent-localhost.cer`）
- `manifest/DocPulse-manifest.xml`
- `docsagent.pid`

---

## 4. 快速开始（Windows）

### 4.1 环境准备

1. 安装 JDK 17+（需包含 `keytool`、`jpackage`）
2. 安装 Microsoft Word（桌面版）
3. 可选：安装 WiX Toolset（仅打包 exe 需要）

如果你只是使用已构建好的安装包（`DocPulse-*.exe`），可以跳过 JDK 与 Maven 环境准备。

### 4.2 拉取并编译

```powershell
# 在项目根目录
.\mvnw.cmd -DskipTests compile
```

### 4.3 启动方式 A：开发模式（推荐先验证）

```powershell
.\mvnw.cmd spring-boot:run
```

启动后访问：
- `https://localhost:18080`
- `https://localhost:18080/index.html`

### 4.4 启动方式 B：打包后运行（面向最终用户）

```powershell
scripts\build-release.bat
scripts\start-docsagent.bat
```

停止：

```powershell
scripts\stop-docsagent.bat
```

### 4.5 启动方式 C：直接使用 exe（给非开发者）

适用场景：你已经从发布页或他人处拿到 Windows 安装包（`DocPulse-*.exe`）。

当前仓库若还没有 GitHub Releases，请先让维护者执行 `scripts\build-release.bat` 产出安装包，再通过网盘/IM/企业制品库分发给非开发者。

1. 双击安装包完成安装。
2. 从开始菜单或桌面快捷方式启动 DocPulse。
3. 首次启动后，打开浏览器访问 `https://localhost:18080`，确认服务可用。
4. 在 Word 中导入 Manifest 文件：
   - `%USERPROFILE%\\.docsagent\\manifest\\DocPulse-manifest.xml`
5. 若浏览器提示证书不受信任，按第 6 章完成证书初始化与信任导入。

说明：
- exe 运行模式不依赖你本机安装 Maven。
- 若安装后无法启动，可先退出托盘中的 DocPulse，再重新启动一次。

### 4.6 GitHub Releases 下载说明（可选）

当你创建首个 GitHub Release 后，可将下面内容放到 Release 描述中：

```markdown
## DocPulse Windows 安装说明

### 下载哪个文件？

- 普通用户（推荐）：下载 `DocPulse-<version>.exe`
   - 双击安装即可使用
   - 适合不需要源码和构建环境的用户

- 高级用户：下载并解压 `DocPulse-<version>-app-image.zip`（如果本次发布提供）
   - 解压后运行 `DocPulse.exe`
   - 适合便携运行或调试启动参数

### 首次启动

1. 启动 DocPulse
2. 浏览器访问 `https://localhost:18080`
3. 在 Word 中导入 Manifest：
    `%USERPROFILE%\\.docsagent\\manifest\\DocPulse-manifest.xml`

### 常见问题

- 证书提示不受信任：以管理员身份运行证书初始化脚本，或手动信任本机证书
- 18080 端口被占用：关闭占用进程后重试
```

---

## 5. Word Add-in（Manifest）复现流程

### 5.1 Manifest 自动生成

应用启动后会自动生成（或更新）Manifest：

`%USERPROFILE%\\.docsagent\\manifest\\DocPulse-manifest.xml`

其 `SourceLocation` 默认指向：

`https://localhost:18080/index.html`

### 5.2 导入到 Word

在 Word 的加载项管理界面中导入上面的 Manifest 文件（不同 Office 版本入口名称略有差异，例如“我的加载项/共享文件夹/上传我的加载项”）。

导入成功后，打开任务窗格即可加载 DocPulse 页面。

---

## 6. 证书配置与调试

### 6.1 自动机制（默认）

- 启动时若未检测到 `server.ssl.key-store` 指向的文件，会自动调用 `keytool` 生成。
- Windows 下会尝试调用 `certutil` 导入到系统受信任根证书。

### 6.2 手动初始化（推荐首装执行一次）

```powershell
scripts\init-local-cert.bat
```

脚本会：
- 生成 `%USERPROFILE%\\.docsagent\\keystore.p12`
- 导出证书到 `%USERPROFILE%\\.docsagent\\docsagent-localhost.cer`
- 尝试导入系统根证书（可能需要管理员终端）

### 6.3 常见证书问题

1. 浏览器提示不受信任：
   - 先执行 `scripts\init-local-cert.bat`
   - 若导入失败，用管理员权限重跑脚本
2. 启动时报 keystore 不存在：
   - 检查 `application.properties` 的 `server.ssl.key-store`
   - 检查 `%USERPROFILE%\\.docsagent` 是否可写

---

## 7. 配置说明

核心配置在 `src/main/resources/application.properties`：

- 固定端口：`server.port=18080`
- 端口自动回退：`docpulse.server.port.auto-fallback=false`（关闭）
- SSL keystore：`server.ssl.key-store`
- AI 接口：
  - `ai.model.api-key`
  - `ai.model.base-url`
  - `ai.model.model-name`
  - `ai.model.timeout-seconds`
  - `ai.model.summary-timeout-seconds`

可通过环境变量覆盖（示例）：

```powershell
$env:AI_API_KEY="your_key"
$env:AI_BASE_URL="https://api.siliconflow.cn/v1"
$env:AI_MODEL_NAME="Qwen/Qwen3.5-397B-A17B"
.\mvnw.cmd spring-boot:run
```

---

## 8. 调试指南（本地复现最常见问题）

### 8.1 端口 18080 被占用

```powershell
netstat -ano | findstr :18080
```

如果是历史进程，执行：

```powershell
scripts\stop-docsagent.bat
```

必要时使用管理员权限终端。

### 8.2 Manifest 打开后仍连不上

1. 确认服务地址可访问：`https://localhost:18080/index.html`
2. 打开 `%USERPROFILE%\\.docsagent\\manifest\\DocPulse-manifest.xml`，检查 `SourceLocation` 是否匹配当前端口
3. 若你改了端口，需重启应用以重新生成 Manifest，然后在 Word 中重新导入

### 8.3 托盘不显示

- 某些环境不支持 `SystemTray`，应用会退化为控制窗（可打开状态/退出）。
- 控制台运行时可直接看日志判断启动状态。

### 8.4 打包 exe 失败

- `app-image` 成功但 `exe` 失败，通常是缺 WiX Toolset。
- 安装 WiX 后重跑 `scripts\build-release.bat`。

---

## 9. 核心 API（节选）

基础路径：`/api`

- `GET /api/document`
- `POST /api/init-document`
- `POST /api/lock-selection`
- `POST /api/accept`
- `POST /api/reject`
- `POST /api/batch-accept`
- `POST /api/batch-reject`
- `POST /api/accept-all`
- `POST /api/reject-all`
- `POST /api/chat`
- `POST /api/summarize`
- `POST /api/references/upload`

---

## 10. 开发建议

1. 提交 PR 前至少执行：

```powershell
.\mvnw.cmd -DskipTests compile
```

2. 涉及段落审阅逻辑修改时，请同时更新：
- `src/main/resources/static/js/paragraph/*`
- `src/main/resources/static/js/document.js`
- 后端 `AiSelectionSyncService` / `BatchChangeService` 相关逻辑

3. 请优先保持以下约束不变：
- `blockId` 与 `changeId` 语义分离
- `ai_selection` 映射规则由后端统一
- 结构性操作后要有状态刷新

---

## 11. 许可证

本项目采用 MIT License，详见 `LICENSE`。

贡献流程与提交规范见 `CONTRIBUTING.md`。
