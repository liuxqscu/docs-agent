# Paragraph Logic Refactor Plan

## 1. Problem Statement

Current paragraph logic supports update, delete, insert, and selection-based edits, but responsibilities are mixed across UI, state synchronization, and Word operations. This makes behavior hard to reason about and increases risk of position mismatch, stale mapping, and duplicated business logic.

Key constraints:
- Paragraph key uses blockId, typically p_i where i is original Word paragraph index (0-based).
- Empty paragraphs are skipped during sync, so IDs may be non-contiguous.
- ai_selection is a virtual block for locked selections.
- insert_after_xxx and delete_xxx are change IDs, not normal paragraph IDs.
- Paragraph formatting in Word must be preserved after content update.

## 2. Refactor Goals

1. Separate source-of-truth paragraph state from review-pending change state.
2. Unify ID semantics and parsing to avoid blockId/changeId confusion.
3. Make sync and apply flow deterministic with explicit stage transitions.
4. Keep Word formatting stable for update/delete/insert operations.
5. Remove duplicated mapping policy between frontend and backend.
6. Enable fast onboarding for future AI sessions and new contributors.

## 3. Current State Mapping

Frontend state (scattered):
- localDocState: current paragraph snapshot
- changePool: pending changes
- initialDocState: baseline snapshot
- selectionTargetMap + aiSelectionTargetBlocks: selection mapping helpers

Backend state:
- DocumentContext.blocks: authoritative in-memory paragraph map
- DocumentContext.blockToParaIndex: blockId to Word paragraph index mapping
- Block: content + optional targetBlockId/targetBlockIds

## 4. Target Architecture

### 4.1 State Domains

A. ParagraphStore (authoritative client-side view)
- byId: Map<blockId, Paragraph>
- order: string[]
- Paragraph fields:
  - blockId
  - content
  - sourceIndex (Word original paragraph index)
  - kind (normal or virtual)

B. ChangeStore (review workflow only)
- byChangeId: Map<changeId, Change>
- pendingIds: string[]
- Change fields:
  - changeId
  - type (update/insert/delete)
  - targetBlockIds
  - oldContent
  - newContent
  - status (pending/accepted/rejected)

C. SelectionStore (selection workflow only)
- selectionId (usually ai_selection)
- selectedText
- targetBlockIds
- initialSelectionContent
- createdAt

### 4.2 Word Adapter Layer

Introduce a dedicated Word adapter module for all Word API interactions:
- scanParagraphsFromWord(): returns normalized paragraph list with sourceIndex
- applyUpdateWithFormatPreserved(blockId, newContent)
- applyDeleteWithFormatPreserved(blockId)
- applyInsertAfterWithFormatPreserved(targetBlockId, content)
- clearAiMarkers() and showReviewMarkers(changes)

Only this layer can access Word.run. UI and state modules do not call Word APIs directly.

### 4.3 Unified ID Policy

One parser module handles all identifiers:
- parseBlockId()
- parseInsertChangeId()
- parseDeleteChangeId()
- isVirtualBlockId()
- isChangeId()

Hard rule:
- blockId identifies paragraph entities.
- changeId identifies proposed edits.
- Conversion between them must go through parser functions only.

### 4.4 Sync and Apply State Machine

Standardize the frontend document lifecycle:
- idle
- scanning_word
- posting_init
- reloading_state
- ready
- failed

Any failure moves to failed with explicit reason and retry action.

## 5. Business Rule Ownership

Move mapping rules to backend as authoritative logic:
- ai_selection multi-target strategy (1:1 map, single-to-first, mismatch-merge-to-first)
- change acceptance side effects
- final paragraph state updates

Frontend responsibility:
- render state
- collect user intent
- send structured requests
- refresh and display resulting state

## 6. Formatting Preservation Strategy

For Word updates:
1. Read target paragraph format attributes before text replacement.
2. Replace text only in target range.
3. Reapply captured format attributes.
4. Avoid style reset from temporary markers.

For inserts:
1. Identify insertion anchor block.
2. Insert new paragraph after anchor.
3. Optionally copy anchor-level paragraph style when needed.

For deletes:
1. Prefer content clear/paragraph remove based on policy.
2. Ensure subsequent block-to-Word mapping is refreshed after operation.

## 7. Migration Plan (Low-Risk)

Phase 0: Baseline and guardrails
- Add diagnostic logs for blockId/changeId transitions.
- Add assertion checks for invalid IDs and missing targets.
- Freeze API response schema to avoid moving contracts during refactor.

Phase 1: Extract modules without behavior change
- Extract id-parser module.
- Extract paragraph-store module.
- Extract change-store module.
- Extract word-adapter module.
- Keep existing endpoints and UI behavior unchanged.

Phase 2: Centralize state transitions
- Introduce a single reducer/service for store updates.
- Route all accept/reject/sync flows through one orchestration function.
- Remove duplicated inline update logic from scattered handlers.

Phase 3: Backend rule consolidation
- Keep ai_selection mapping strategy only in backend accept flow.
- Frontend stops re-implementing mapping decision logic.
- Frontend refreshes state after backend acknowledgment.

Phase 4: Mapping refresh hardening
- After any accept that changes structure (insert/delete), refresh block-to-Word mapping.
- Ensure sourceIndex and blockId alignment remains valid.

Phase 5: Test and rollout
- Add automated scenario tests (see Section 8).
- Roll out behind feature flag if needed.
- Remove legacy branches after stable run.

## 8. Acceptance Test Matrix

1. Sync with empty paragraphs in between
- Expect non-contiguous IDs but correct content binding.

2. Repeated paragraph text in selection
- Expect unique target matching without duplicate index reuse.

3. Update paragraph content
- Expect content changed and paragraph format preserved.

4. Delete paragraph
- Expect correct target removal and no accidental neighbor corruption.

5. Insert after specific paragraph
- Expect insertion at intended anchor and stable ordering.

6. ai_selection multi-paragraph update
- Validate 1:1, single-to-first, mismatch-merge behavior.

7. Full resync after edits
- Expect stale selection mapping cleared and state rebuilt.

8. Error handling
- init-document failure must not show false success.

## 9. Suggested File Split (Frontend)

- src/main/resources/static/js/paragraph/id-parser.js
- src/main/resources/static/js/paragraph/paragraph-store.js
- src/main/resources/static/js/paragraph/change-store.js
- src/main/resources/static/js/paragraph/selection-store.js
- src/main/resources/static/js/paragraph/paragraph-orchestrator.js
- src/main/resources/static/js/word/word-adapter.js

Current document.js becomes orchestration + UI binding only.

## 10. Suggested API Evolution (Optional)

Keep backward compatibility first, then introduce optional structured DTOs:
- Sync response includes explicit sourceIndex metadata.
- Accept response includes updated block summary for fast client refresh.
- Dedicated endpoint to refresh block-to-Word mapping if needed.

## 11. Fast Handover Prompt For New Chat

Use this brief in a new conversation:

Project: docs-agent (Spring Boot + Office.js).
Paragraph key: blockId (p_i from original Word paragraph index, 0-based, non-contiguous allowed because empty paragraphs are skipped).
Virtual IDs: ai_selection block, insert_after_xxx/delete_xxx change IDs.
Need: refactor paragraph logic with separated stores (ParagraphStore/ChangeStore/SelectionStore), centralized ID parser, Word adapter layer, backend-owned mapping rules, and format-preserving apply operations.
Reference design file: PARAGRAPH_REFACTOR_PLAN.md.
Please implement Phase 1 first (module extraction without behavior change), then Phase 2 (central orchestration), with compile-safe incremental commits.

## 12. Done Criteria

- Paragraph and change semantics are unambiguous.
- No duplicated mapping strategy across frontend/backend.
- Word formatting remains stable after operations.
- Full sync and accept/reject flows are deterministic and test-covered.
- New AI session can continue implementation from this file alone.
