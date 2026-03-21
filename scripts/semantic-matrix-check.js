const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = process.cwd();
const orchestratorPath = path.join(repoRoot, 'src/main/resources/static/js/paragraph/paragraph-orchestrator.js');
const documentJsPath = path.join(repoRoot, 'src/main/resources/static/js/document.js');

function loadOrchestrator() {
    const code = fs.readFileSync(orchestratorPath, 'utf8');
    const sandbox = {
        window: {},
        console
    };
    vm.runInNewContext(code, sandbox, { filename: orchestratorPath });
    return sandbox.window.ParagraphOrchestrator;
}

function extractFunctionSource(fileContent, functionSignature) {
    const start = fileContent.indexOf(functionSignature);
    if (start < 0) {
        throw new Error(`Cannot find function signature: ${functionSignature}`);
    }

    const braceStart = fileContent.indexOf('{', start);
    if (braceStart < 0) {
        throw new Error(`Cannot find opening brace for: ${functionSignature}`);
    }

    let depth = 0;
    for (let i = braceStart; i < fileContent.length; i++) {
        const ch = fileContent[i];
        if (ch === '{') {
            depth++;
        } else if (ch === '}') {
            depth--;
            if (depth === 0) {
                return fileContent.slice(start, i + 1);
            }
        }
    }

    throw new Error(`Cannot find closing brace for: ${functionSignature}`);
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message} | expected=${expected}, actual=${actual}`);
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function runOrchestratorSemanticTests(orchestrator) {
    const results = [];

    // ai_selection accept: 1:1
    {
        const snapshot = orchestrator.buildAcceptedLocalState({
            localDocState: {
                p_0: { content: 'A0' },
                p_1: { content: 'B0' },
                ai_selection: { content: 'OLD' }
            },
            changePool: {
                ai_selection: { type: 'update', status: 'pending' }
            },
            changeId: 'ai_selection',
            change: { type: 'update', newContent: 'A1\nB1' },
            selectionTargetMap: { ai_selection: ['p_0', 'p_1'] },
            aiSelectionInitialContent: 'OLD',
            aiSelectionTargetBlocks: { p_0: 'A0', p_1: 'B0' }
        });

        assertEqual(snapshot.localDocState.p_0.content, 'A1', 'ai_selection 1:1 should map first paragraph');
        assertEqual(snapshot.localDocState.p_1.content, 'B1', 'ai_selection 1:1 should map second paragraph');
        assert(!('ai_selection' in snapshot.localDocState), 'ai_selection virtual block should be removed after accept');
        results.push('ai_selection accept 1:1');
    }

    // ai_selection accept: single-to-first
    {
        const snapshot = orchestrator.buildAcceptedLocalState({
            localDocState: {
                p_0: { content: 'A0' },
                p_1: { content: 'B0' },
                ai_selection: { content: 'OLD' }
            },
            changePool: {
                ai_selection: { type: 'update', status: 'pending' }
            },
            changeId: 'ai_selection',
            change: { type: 'update', newContent: 'ONLY_ONE' },
            selectionTargetMap: { ai_selection: ['p_0', 'p_1'] },
            aiSelectionInitialContent: 'OLD',
            aiSelectionTargetBlocks: { p_0: 'A0', p_1: 'B0' }
        });

        assertEqual(snapshot.localDocState.p_0.content, 'ONLY_ONE', 'ai_selection single paragraph should update first target only');
        assertEqual(snapshot.localDocState.p_1.content, 'B0', 'ai_selection single paragraph should keep second target unchanged');
        results.push('ai_selection accept single-to-first');
    }

    // ai_selection accept: mismatch-merge-to-first
    {
        const mergedContent = 'P1\nP2\nP3';
        const snapshot = orchestrator.buildAcceptedLocalState({
            localDocState: {
                p_0: { content: 'A0' },
                p_1: { content: 'B0' },
                ai_selection: { content: 'OLD' }
            },
            changePool: {
                ai_selection: { type: 'update', status: 'pending' }
            },
            changeId: 'ai_selection',
            change: { type: 'update', newContent: mergedContent },
            selectionTargetMap: { ai_selection: ['p_0', 'p_1'] },
            aiSelectionInitialContent: 'OLD',
            aiSelectionTargetBlocks: { p_0: 'A0', p_1: 'B0' }
        });

        assertEqual(snapshot.localDocState.p_0.content, mergedContent, 'ai_selection mismatch should merge into first target');
        assertEqual(snapshot.localDocState.p_1.content, 'B0', 'ai_selection mismatch should keep second target unchanged');
        results.push('ai_selection accept mismatch-merge-to-first');
    }

    // ai_selection reject
    {
        const snapshot = orchestrator.buildRejectedLocalState({
            localDocState: {
                p_0: { content: 'A_changed' },
                p_1: { content: 'B_changed' },
                ai_selection: { content: 'AI' }
            },
            changePool: {
                ai_selection: { type: 'update', status: 'pending' }
            },
            changeId: 'ai_selection',
            change: { type: 'update' },
            selectionTargetMap: { ai_selection: ['p_0', 'p_1'] },
            aiSelectionTargetBlocks: { p_0: 'A0', p_1: 'B0' }
        });

        assertEqual(snapshot.localDocState.p_0.content, 'A0', 'ai_selection reject should restore first target');
        assertEqual(snapshot.localDocState.p_1.content, 'B0', 'ai_selection reject should restore second target');
        assert(!('ai_selection' in snapshot.localDocState), 'ai_selection virtual block should be removed after reject');
        results.push('ai_selection reject restore');
    }

    // insert_after accept
    {
        const snapshot = orchestrator.buildAcceptedLocalState({
            localDocState: {
                p_0: { content: 'A0' },
                p_1: { content: 'B0' }
            },
            changePool: {
                insert_after_p_0: { type: 'insert', status: 'pending' }
            },
            changeId: 'insert_after_p_0',
            change: { type: 'insert', targetId: 'p_0', newContent: 'NEW' },
            selectionTargetMap: {},
            aiSelectionInitialContent: null,
            aiSelectionTargetBlocks: {}
        });

        const keys = Object.keys(snapshot.localDocState);
        assertEqual(keys.join(','), 'p_0,p_2,p_1', 'insert accept should insert new block after target in object order');
        assertEqual(snapshot.localDocState.p_2.content, 'NEW', 'insert accept should create new block with content');
        results.push('insert_after accept');
    }

    // insert_after reject
    {
        const snapshot = orchestrator.buildRejectedLocalState({
            localDocState: {
                p_0: { content: 'A0' },
                insert_after_p_0: { content: 'VIRTUAL' },
                insert_after_xxx_p_0: { content: 'VIRTUAL2' }
            },
            changePool: {
                insert_after_p_0: { type: 'insert', status: 'pending' }
            },
            changeId: 'insert_after_p_0',
            change: { type: 'insert' },
            selectionTargetMap: {},
            aiSelectionTargetBlocks: {}
        });

        assert(!('insert_after_p_0' in snapshot.localDocState), 'insert reject should remove direct virtual insert block');
        assert(!('insert_after_xxx_p_0' in snapshot.localDocState), 'insert reject should remove related virtual insert blocks');
        results.push('insert_after reject');
    }

    // delete_ accept
    {
        const snapshot = orchestrator.buildAcceptedLocalState({
            localDocState: {
                p_0: { content: 'A0' },
                p_1: { content: 'B0' },
                delete_p_1: { content: '[DELETED_MARKER]' }
            },
            changePool: {
                delete_p_1: { type: 'delete', status: 'pending' }
            },
            changeId: 'delete_p_1',
            change: { type: 'delete', targetId: 'p_1' },
            selectionTargetMap: {},
            aiSelectionInitialContent: null,
            aiSelectionTargetBlocks: {}
        });

        assert(!('p_1' in snapshot.localDocState), 'delete accept should remove target block');
        assert(!('delete_p_1' in snapshot.localDocState), 'delete accept should remove related delete marker block');
        results.push('delete_ accept');
    }

    // delete_ reject
    {
        const snapshot = orchestrator.buildRejectedLocalState({
            localDocState: {
                p_0: { content: 'A0' },
                delete_p_1: { content: '[DELETED_MARKER]' }
            },
            changePool: {
                delete_p_1: { type: 'delete', status: 'pending' }
            },
            changeId: 'delete_p_1',
            change: { type: 'delete', targetId: 'p_1', initialContent: 'B0', oldContent: 'B_prev' },
            selectionTargetMap: {},
            aiSelectionTargetBlocks: {}
        });

        assertEqual(snapshot.localDocState.p_1.content, 'B0', 'delete reject should restore target content');
        assert(!('delete_p_1' in snapshot.localDocState), 'delete reject should remove delete marker block');
        results.push('delete_ reject');
    }

    return results;
}

async function runBatchCountTest() {
    const code = fs.readFileSync(documentJsPath, 'utf8');
    const fnSource = extractFunctionSource(code, 'async function executeBatchReviewAction(options)');

    const messages = [];
    const sandbox = {
        console,
        REVIEW_ACTION: {
            ACCEPT: '接受变更',
            REJECT: '拒绝变更'
        },
        isBatchReviewRunning: false,
        syncDocumentFromWordToBackend: async () => {
            // no-op for unit-level semantic count checks
        },
        changePool: {
            c1: { status: 'pending' },
            c2: { status: 'pending' },
            c3: { status: 'pending' },
            c4: { status: 'accepted' }
        },
        REVIEW_SYSTEM_MESSAGE: {
            NO_PENDING: 'NO_PENDING',
            BATCH_RESULT: (doneLabel, successCount, failedCount) => `${doneLabel}:${successCount}/${failedCount}`
        },
        appendMessage: (role, msg) => {
            messages.push({ role, msg });
        },
        isAcceptedChange: (change) => !!change && change.status === 'accepted',
        getPendingChangeIds: function getPendingChangeIds() {
            return Object.keys(this.changePool || sandbox.changePool).filter((k) => !sandbox.isAcceptedChange(sandbox.changePool[k]));
        }
    };

    vm.runInNewContext(`${fnSource}; this.executeBatchReviewAction = executeBatchReviewAction;`, sandbox, {
        filename: documentJsPath
    });

    const actionResults = {
        c1: true,
        c2: false,
        c3: 'THROW'
    };

    const result = await sandbox.executeBatchReviewAction({
        actionLabel: '接受变更',
        doneLabel: '批量接受完成',
        action: async (changeId) => {
            const val = actionResults[changeId];
            if (val === 'THROW') {
                throw new Error('boom');
            }
            return val;
        }
    });

    assertEqual(result.totalCount, 3, 'batch totalCount should equal number of pending changes');
    assertEqual(result.successCount, 1, 'batch successCount should equal successful executions');
    assertEqual(result.failedCount, 2, 'batch failedCount should equal failed executions');
    assert(messages.length > 0, 'batch should append summary message');
    assert(messages[messages.length - 1].msg.includes('1/2'), 'batch summary message should reflect success/failed count');

    return 'batch 统计：success/failed 与执行结果一致';
}

(async function main() {
    try {
        const orchestrator = loadOrchestrator();
        if (!orchestrator) {
            throw new Error('ParagraphOrchestrator not loaded');
        }

        const matrix = runOrchestratorSemanticTests(orchestrator);
        const batchResult = await runBatchCountTest();

        console.log('=== Semantic Matrix Result ===');
        matrix.forEach((item, idx) => {
            console.log(`${idx + 1}. PASS - ${item}`);
        });
        console.log(`${matrix.length + 1}. PASS - ${batchResult}`);
        console.log('ALL PASS');
    } catch (error) {
        console.error('Semantic matrix failed:', error.message);
        process.exitCode = 1;
    }
})();
