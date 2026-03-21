# Phase 2 Semantic Regression Report

Date: 2026-03-20
Project: docs-agent

## Scope

- Keep backend API contract unchanged.
- Keep accept/reject orchestrator single-track flow unchanged.
- Ensure semantic parity for:
  - `ai_selection`
  - `insert_after`
  - `delete_`
  - batch success/failed counting

## Automated Matrix Command

- Windows: `scripts\\run-semantic-matrix.bat`
- Unix-like: `sh scripts/run-semantic-matrix.sh`
- Core checker: `scripts/semantic-matrix-check.js`

## Matrix Results

All matrix cases passed.

1. ai_selection accept: 1:1 mapping -> PASS
2. ai_selection accept: single-to-first -> PASS
3. ai_selection accept: mismatch-merge-to-first -> PASS
4. ai_selection reject restore -> PASS
5. insert_after accept -> PASS
6. insert_after reject -> PASS
7. delete_ accept -> PASS
8. delete_ reject -> PASS
9. batch counting (success/failed) consistency -> PASS

Notes:
- Batch counting case intentionally injects one thrown error to validate failed-count branch.
- Console error output in this case is expected and does not indicate matrix failure.

## Compile Validation

- Command: `mvn -DskipTests compile`
- Result: BUILD SUCCESS

## Changed Files In This Phase-2 Tail Work

- `src/main/resources/static/js/document.js`
- `src/main/resources/static/js/paragraph/paragraph-orchestrator.js`
- `src/main/java/com/example/docs_agent/service/AiSelectionSyncService.java`
- `src/main/java/com/example/docs_agent/controller/DocAgentController.java`
- `src/main/java/com/example/docs_agent/service/BatchChangeService.java`
- `scripts/semantic-matrix-check.js`
- `scripts/run-semantic-matrix.bat`
- `scripts/run-semantic-matrix.sh`

## Additional Phase Progress

### Phase 3 (Backend rule consolidation)

- Added centralized backend mapping service for `ai_selection`:
  - `AiSelectionSyncService.syncToTargets(...)`
  - `AiSelectionSyncService.resolveAiSelectionContent(...)`
- Replaced duplicated `ai_selection` mapping logic in:
  - `/api/accept` flow in `DocAgentController`
  - `batchAccept(...)` in `BatchChangeService`
  - `acceptAll(...)` in `BatchChangeService`

### Phase 4 (Mapping refresh hardening)

- Frontend now forces a state refresh after structural accepts (`insert` / `delete`) to reduce stale block mapping risk.
- `fetchDocumentState` now supports marker toggle to allow refresh without re-rendering Word inline markers.

## Residual Risks

1. Office.js runtime interactions still require real Word host validation; compile and script checks cannot fully cover host behavior.
2. `insert_after` anchor lookup still relies on paragraph text matching, which can be ambiguous for repeated paragraph text.
3. Marker rendering in Word uses runtime paragraph indexing and should be verified on long documents with mixed empty paragraphs.

## Recommended Next Regression

1. Real Word host smoke run for ai_selection 3-strategy cases.
2. Real Word host insert/delete batch run with manual verification of visual markers and final document content.
3. One mixed batch with forced partial failure to confirm user-facing counts and messages.
