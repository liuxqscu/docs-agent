# DocPulse (docs-agent)

DocPulse 是一个本地优先的 Word AI 协作编辑工具：
- 后端使用 Spring Boot 提供 API 与本地 HTTPS 服务。
- 前端是静态页面（Office.js 场景），运行在 `https://localhost:18080`。
- 通过 Word Add-in Manifest 将侧边栏挂载到 Word。

本项目目标是让开发者在本机快速复现：拉代码 -> 启动服务 -> 导入 Manifest -> 在 Word 里使用。

## 版本兼容说明

为避免安装后才发现环境不匹配，请先确认：

1. 操作系统：当前发布包面向 Windows 桌面环境（推荐 Windows 10/11）。
2. Word 版本：推荐桌面版 Word（Office 2019 / Office 2021 / Microsoft 365）。
3. 加载方式：推荐使用“共享文件夹 + 受信任的加载项目录”导入 Manifest。
4. 首次启动：setup 包默认自动生成本地证书和 Manifest；手动脚本仅作为兜底。
5. 浏览器访问：本地页面固定地址为 `https://localhost:18080/index.html`。

## 先看这里（5 分钟上手）

如果你是第一次使用，只看这一段就可以完成安装和接入 Word：

1. 从 Releases 下载并安装 `DocPulse-<version>-setup.exe`（推荐安装包）。
2. 启动 DocPulse。
3. 等待自动初始化完成（默认会自动生成本地 HTTPS 证书和 Word Manifest，无需手动执行脚本）。
4. 浏览器访问 `https://localhost:18080/index.html`，确认页面能打开。
5. 在系统托盘右键 DocPulse 图标，点击 `Open Manifest Folder`。
6. 在打开的目录中确认路径类似：`C:\Users\<你的用户名>\.docsagent\manifest`。
7. 将这个 `manifest` 文件夹设置为共享文件夹。
8. 复制该共享目录的网络地址（UNC），示例：`\\DESKTOP-LFTMTJH\Users\Lenovo\.docsagent\manifest`。
9. 打开 Word，进入：文件 -> 选项 -> 信任中心 -> 信任中心设置 -> 受信任的加载项目录。
10. 在“目录 URL”中粘贴第 8 步 UNC 地址，点击“添加目录”，并勾选“在菜单中显示”。
11. 点击“确定”并完全重启 Word。
12. 重启后进入：插入 -> 我的加载项 -> 共享文件夹，找到 DocPulse，点击“添加”。
13. 右侧侧边栏打开后，点击右上角“设置”，填写并保存：`API Key`、`Base URL`、`Model Name`。

常见卡点（开头就处理）：

1. 不知道设备名：在命令行运行 `hostname`。
2. Word 里看不到共享目录：先在资源管理器确认 UNC 地址能直接打开，再重启 Word。
3. 浏览器提示证书不受信任：这通常是本机证书信任未完成。先重启 DocPulse 试一次；仍失败再运行 `scripts\init-local-cert.bat`（兜底）并重启 DocPulse 和 Word。
4. 侧边栏能打开但无法调用模型：检查 `API Key`、`Base URL`、`Model Name` 是否填写并保存。

后续章节主要是开发、打包和技术细节说明。

## 下载入口（给使用者）

- 最新版本下载页：https://github.com/liuxqscu/docs-agent/releases/latest
- v1.0.0 发布页：https://github.com/liuxqscu/docs-agent/releases/tag/v1.0.0

推荐下载顺序：
1. 普通用户优先下载 `DocPulse-<version>-setup.exe`（Inno 安装器）
2. 备用下载 `DocPulse-<version>.exe`（jpackage 安装器）
3. 若安装器暂不可用，则下载 `DocPulse-<version>-app-image.zip`，解压后运行 `DocPulse.exe`

## 版本与发布状态

| 项目 | 当前值 |
| --- | --- |
| 当前发布标签 | v1.0.0 |
| 推荐安装资产 | DocPulse-1.0.0-setup.exe |
| 备用安装资产 | DocPulse-1.0.0.exe |
| 默认本地地址 | https://localhost:18080 |

维护建议：每次发布后，只需更新本表中的版本号与资产文件名。

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
- jpackage（生成 app-image / 备用 exe）
- Inno Setup（推荐安装器 `*-setup.exe`）
- WiX Toolset（jpackage `--type exe` 需要）

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

## 4. 开发与发布（给开发者）

前面的“先看这里（5 分钟上手）”已经覆盖普通用户完整操作。
本章仅保留开发、打包和发布维护信息。

### 4.1 本地开发启动

1. 环境准备：安装 JDK 17+（需包含 `keytool`、`jpackage`）与 Microsoft Word。
2. 编译项目：

```powershell
.\mvnw.cmd -DskipTests compile
```

3. 开发模式启动：

```powershell
.\mvnw.cmd spring-boot:run
```

4. 打包模式启动：

```powershell
scripts\build-release.bat
scripts\start-docsagent.bat
```

停止服务：

```powershell
scripts\stop-docsagent.bat
```

### 4.2 GitHub Releases 资产建议

当前建议在 Release 中至少提供：

- `DocPulse-<version>-setup.exe`（推荐主安装包，Inno Setup 产出）
- `DocPulse-<version>.exe`（备用安装包，jpackage 产出）
- `DocPulse-<version>-app-image.zip`（便携兜底，`scripts/build-release.bat` 自动压缩生成）

可将下面内容放到 Release 描述中：

```markdown
## DocPulse Windows 安装说明

### 下载哪个文件？

- 普通用户（推荐）：下载 `DocPulse-<version>-setup.exe`
   - 安装流程更完整，目录选择体验更好
   - 适合不需要源码和构建环境的用户

- 备用安装器：下载 `DocPulse-<version>.exe`
   - 由 jpackage 直接生成
   - 可用于排查 Inno 安装器环境差异

- 通用兜底：下载并解压 `DocPulse-<version>-app-image.zip`
   - 解压后运行 `DocPulse.exe`
   - 适合便携运行或调试启动参数

### 首次启动

1. 启动 DocPulse
2. 浏览器访问 `https://localhost:18080`
3. 在 Word 中导入 Manifest：
    `%USERPROFILE%\\.docsagent\\manifest\\DocPulse-manifest.xml`

### Windows 安装安全提示说明

- 当前部分版本可能为未签名安装包，Windows 可能显示“未知发布者”或 SmartScreen 提示。
- 这是操作系统对未签名软件的常见保护机制，不代表安装包损坏。
- 若你信任下载来源，可在提示页点击“更多信息” -> “仍要运行”继续安装。

### 常见问题

- 证书提示不受信任：通常自动初始化即可；如失败再运行证书初始化脚本（兜底）
- 18080 端口被占用：关闭占用进程后重试
```

---

## 5. 配置说明

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

## 6. 调试指南（本地复现最常见问题）

### 6.1 端口 18080 被占用

```powershell
netstat -ano | findstr :18080
```

如果是历史进程，执行：

```powershell
scripts\stop-docsagent.bat
```

必要时使用管理员权限终端。

### 6.2 Manifest 打开后仍连不上

1. 确认服务地址可访问：`https://localhost:18080/index.html`
2. 打开 `%USERPROFILE%\\.docsagent\\manifest\\DocPulse-manifest.xml`，检查 `SourceLocation` 是否匹配当前端口
3. 若你改了端口，需重启应用以重新生成 Manifest，然后在 Word 中重新导入

### 6.3 托盘不显示

- 某些环境不支持 `SystemTray`，应用会退化为控制窗（可打开状态/退出）。
- 控制台运行时可直接看日志判断启动状态。

### 6.4 打包 exe 失败

- `app-image` 成功但 `exe` 失败，通常是缺 WiX Toolset。
- 安装 WiX 后重跑 `scripts\build-release.bat`。

### 6.5 安装后启动报错 `Failed to launch JVM`

这通常不是业务代码报错，而是安装包运行时环境未正确展开或被安全软件拦截。

建议按顺序排查：

1. 先验证兜底包是否可运行：
   - 下载并解压 `DocPulse-<version>-app-image.zip`
   - 直接运行解压目录中的 `DocPulse.exe`
2. 检查安装目录是否存在关键文件（若缺失通常会触发该错误）：
   - `runtime\\bin\\server\\jvm.dll`
   - `app\\DocPulse.cfg`
3. 若是安装版 exe 失败但 app-image 正常：
   - 卸载后重新安装到纯英文路径（例如 `C:\DocPulse`）
   - 临时关闭安全软件实时防护后重试安装
4. 若仍失败，请优先使用 app-image 版本，并在 issue 中附上系统版本与安装路径。

### 6.6 Windows 安全弹窗、图标与发行方信息

如果安装时出现“未知发布者”或默认 Java 图标，通常是因为安装包未签名或未提供自定义图标。

当前 `scripts/build-release.bat` 已支持以下规范化能力：

1. 安装器元信息：`vendor`、`description`、`copyright`
2. 自定义图标：默认读取 `scripts/assets/DocPulse.ico`
3. 可选代码签名：通过环境变量配置

签名前置环境变量（在打包前设置）：

```powershell
$env:DOCPULSE_SIGN_PFX="C:\path\to\codesign.pfx"
$env:DOCPULSE_SIGN_PFX_PASSWORD="your_password"
scripts\build-release.bat
```

说明：

1. 未签名安装包在 Windows 上通常会显示“未知发布者”，这是系统安全策略行为。
2. 配置代码签名证书后，弹窗将显示你的证书主体信息（发行方）。
3. 如果 `scripts/assets/DocPulse.ico` 不存在，会回退为默认图标。

---

## 7. 核心 API（节选）

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

## 8. 开发建议

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

## 9. 许可证

本项目采用 MIT License，详见 `LICENSE`。

贡献流程与提交规范见 `CONTRIBUTING.md`。
