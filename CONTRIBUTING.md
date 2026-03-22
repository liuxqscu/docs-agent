# Contributing to DocPulse

Thanks for contributing to DocPulse.

## 1. Development Environment

- JDK 17 or newer (must include `keytool` and `jpackage`)
- Maven Wrapper (`mvnw` or `mvnw.cmd`)
- Microsoft Word desktop client for Office.js host validation
- Optional on Windows: WiX Toolset (required for `jpackage --type exe`)

## 2. Run Locally

```powershell
# compile only
.\mvnw.cmd -DskipTests compile

# run backend + static frontend
.\mvnw.cmd spring-boot:run
```

Open:
- `https://localhost:18080`
- `https://localhost:18080/index.html`

## 3. Certificate and Manifest

For first run on Windows:

```powershell
scripts\init-local-cert.bat
```

On startup, DocPulse auto-generates manifest file:

`%USERPROFILE%\\.docsagent\\manifest\\DocPulse-manifest.xml`

Import this manifest in Word Add-in management UI.

## 4. Branch and Commit Rules

- Branch naming:
  - `feat/<short-topic>`
  - `fix/<short-topic>`
  - `chore/<short-topic>`
- Commit message style:
  - `feat: ...`
  - `fix: ...`
  - `chore: ...`
  - `docs: ...`

## 5. Pull Request Checklist

Before opening a PR, make sure:

1. Build passes:
   ```powershell
   .\mvnw.cmd -DskipTests compile
   ```
2. If paragraph review logic changed, validate accept/reject behavior for:
   - `ai_selection`
   - `insert_after`
   - `delete_`
3. If API contract changed, update related docs in README.
4. If startup, cert, or manifest behavior changed, test first-run flow on a clean local profile.
5. Keep scope focused and avoid unrelated formatting-only changes.

## 6. Code Areas and Ownership Hints

- Backend API entry: `src/main/java/com/example/docs_agent/controller/DocAgentController.java`
- Review flow services: `src/main/java/com/example/docs_agent/service`
- Startup provisioning: `src/main/java/com/example/docs_agent/config`
- Frontend orchestration: `src/main/resources/static/js/document.js`
- Paragraph modules: `src/main/resources/static/js/paragraph`

## 7. Reporting Issues

Please include:

- Operating system and Java version
- Repro steps and expected result
- Actual result and logs
- Whether this occurs in Maven run, packaged app-image, or packaged exe

Thanks again for helping improve DocPulse.
