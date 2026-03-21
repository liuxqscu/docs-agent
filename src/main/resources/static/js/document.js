/**
 * 文档管理模块
 */

// 文档状态
let localDocState = {};
let changePool = {};
let aiSelectionInitialContent = null;  // 记录ai_selection初始内容（锁定时），用于判断是否有AI修改
let initialDocState = {};  // 记录初始文档状态，用于批量拒绝时恢复
let aiSelectionTargetBlocks = {};  // 记录ai_selection对应的目标段落初始值
const processingChangeIds = new Set(); // 防止同一变更被重复执行（连点/并发触发）
let isBatchReviewRunning = false;

const dmp = new diff_match_patch();
const idParser = window.ParagraphIdParser || {};
const paragraphOrchestrator = window.ParagraphOrchestrator || {};
const wordParagraphAdapter = window.WordParagraphAdapter || {};
const REVIEW_ACTION = Object.freeze({
    ACCEPT: '接受变更',
    REJECT: '拒绝变更'
});
const REVIEW_DONE_LABEL = Object.freeze({
    ACCEPT_ALL: '批量接受完成',
    REJECT_ALL: '批量拒绝完成'
});
const REVIEW_ORCHESTRATOR_METHOD = Object.freeze({
    ACCEPT: 'buildAcceptedLocalState',
    REJECT: 'buildRejectedLocalState'
});
const REVIEW_STATUS = Object.freeze({
    ACCEPTED: 'accepted',
    PENDING: 'pending'
});
const REVIEW_DOC_VIEW_MODE = Object.freeze({
    ALL: 'all',
    CHANGES_ONLY: 'changes-only'
});
const REVIEW_DIFF_VIEW_MODE = Object.freeze({
    FULL: 'full',
    CHANGES: 'changes'
});
const REVIEW_STAGE = Object.freeze({
    ACCEPT_REQUEST: 'accept-request',
    REJECT_RECOVERY: 'reject-recovery'
});
const SPECIAL_BLOCK_ID = Object.freeze({
    AI_SELECTION: 'ai_selection'
});
const CHANGE_ID_PREFIX = Object.freeze({
    INSERT: 'insert_after_',
    DELETE: 'delete_'
});
const REVIEW_SYSTEM_MESSAGE = Object.freeze({
    ACCEPTED: (changeId) => `[✓] 已接受并写入变更：${changeId}`,
    REJECTED: (changeId) => `[x] 已拒绝变更：${changeId}`,
    NO_PENDING: '[!] 没有待处理的变更',
    REVIEW_NEEDED: (count) => `[•] 请审查 ${count} 个建议修改（接受或拒绝）`,
    REVIEW_FAILED: (errorMessage) => `[x] 处理 AI 修改失败：${errorMessage}`,
    ACTION_FAILED: (actionName, errorMessage) => `[x] ${actionName}失败：${errorMessage}`,
    BATCH_RESULT: (doneLabel, successCount, failedCount) => `[✓] ${doneLabel}：成功 ${successCount} 个，失败 ${failedCount} 个`
});
let reviewDocViewMode = REVIEW_DOC_VIEW_MODE.ALL;
let reviewDiffViewMode = REVIEW_DIFF_VIEW_MODE.FULL;

function getParagraphIndexFromBlockId(blockId) {
    if (idParser.parseParagraphIndexFromBlockId) {
        return idParser.parseParagraphIndexFromBlockId(blockId);
    }
    return parseInt(String(blockId).replace('p_', ''), 10);
}

function getInsertTargetBlockId(changeId) {
    if (idParser.parseTargetBlockIdFromInsertChangeId) {
        return idParser.parseTargetBlockIdFromInsertChangeId(changeId);
    }
    const match = String(changeId).match(new RegExp(`${CHANGE_ID_PREFIX.INSERT}(p_\\d+)`));
    return match ? match[1] : null;
}

function getDeleteTargetBlockId(changeId) {
    if (idParser.parseTargetBlockIdFromDeleteChangeId) {
        return idParser.parseTargetBlockIdFromDeleteChangeId(changeId);
    }
    const match = String(changeId).match(new RegExp(`${CHANGE_ID_PREFIX.DELETE}(p_\\d+)`));
    return match ? match[1] : null;
}

function isAiSelectionId(id) {
    return String(id) === SPECIAL_BLOCK_ID.AI_SELECTION;
}

function isInsertChangeId(id) {
    return String(id).startsWith(CHANGE_ID_PREFIX.INSERT);
}

function isDeleteChangeId(id) {
    return String(id).startsWith(CHANGE_ID_PREFIX.DELETE);
}

function isVirtualBlockId(id) {
    return isInsertChangeId(id) || isDeleteChangeId(id) || isAiSelectionId(id);
}

function buildDeleteChangeId(blockId) {
    return `${CHANGE_ID_PREFIX.DELETE}${blockId}`;
}

function stripDeleteChangePrefix(changeId) {
    if (changeId === undefined || changeId === null) {
        return null;
    }

    const normalized = String(changeId);
    if (normalized.startsWith(CHANGE_ID_PREFIX.DELETE)) {
        return normalized.substring(CHANGE_ID_PREFIX.DELETE.length);
    }
    return normalized;
}

function resolveDeleteTargetId(change, fallbackChangeId) {
    return change?.targetId || stripDeleteChangePrefix(fallbackChangeId);
}

function resolveInsertTargetId(change, fallbackChangeId) {
    return change?.targetId || getInsertTargetBlockId(fallbackChangeId);
}

function getLogicalBlockIds(state = localDocState) {
    return Object.keys(state || {}).filter((blockId) => !isVirtualBlockId(blockId));
}

function getAiSelectionTargetBlockIds() {
    const targetBlockIds = selectionTargetMap[SPECIAL_BLOCK_ID.AI_SELECTION];
    return Array.isArray(targetBlockIds) ? targetBlockIds : [];
}

function getBlockContent(block) {
    if (typeof block === 'object' && block !== null) {
        return block.content;
    }
    return block;
}

function captureWordParagraphFormat(paragraph) {
    if (wordParagraphAdapter.captureParagraphFormat) {
        return wordParagraphAdapter.captureParagraphFormat(paragraph);
    }
    return {
        alignment: paragraph.alignment,
        leftIndent: paragraph.leftIndent,
        firstLineIndent: paragraph.firstLineIndent,
        rightIndent: paragraph.rightIndent,
        lineSpacing: paragraph.lineSpacing
    };
}

function restoreWordParagraphFormat(paragraph, format) {
    if (wordParagraphAdapter.restoreParagraphFormat) {
        wordParagraphAdapter.restoreParagraphFormat(paragraph, format);
        return;
    }
    paragraph.alignment = format.alignment;
    paragraph.leftIndent = format.leftIndent;
    paragraph.firstLineIndent = format.firstLineIndent;
    paragraph.rightIndent = format.rightIndent;
    paragraph.lineSpacing = format.lineSpacing;
}

function applyInitSnapshot(serverState) {
    if (paragraphOrchestrator.buildInitState) {
        const snapshot = paragraphOrchestrator.buildInitState(serverState);
        localDocState = snapshot.localDocState;
        initialDocState = snapshot.initialDocState;
        changePool = snapshot.changePool;
        syncRuntimeMirror(snapshot);
        return;
    }

    localDocState = { ...serverState };
    initialDocState = JSON.parse(JSON.stringify(serverState));
    changePool = {};
}

function clearSelectionRuntimeSnapshot() {
    if (paragraphOrchestrator.clearSelectionRuntimeState) {
        const cleared = paragraphOrchestrator.clearSelectionRuntimeState();
        selectionTargetMap = cleared.selectionTargetMap;
        aiSelectionInitialContent = cleared.aiSelectionInitialContent;
        aiSelectionTargetBlocks = cleared.aiSelectionTargetBlocks;
        if (typeof lastLockedSelection !== 'undefined') {
            lastLockedSelection = cleared.lastLockedSelection;
        }
        syncRuntimeMirror(cleared);
        return;
    }

    selectionTargetMap = {};
    aiSelectionInitialContent = null;
    aiSelectionTargetBlocks = {};
    if (typeof lastLockedSelection !== 'undefined') {
        lastLockedSelection = null;
    }
}

function applyOrchestratorSnapshot(snapshot) {
    if (!snapshot) {
        throw new Error('Orchestrator snapshot 为空');
    }

    localDocState = snapshot.localDocState;
    changePool = snapshot.changePool;
    aiSelectionInitialContent = snapshot.aiSelectionInitialContent;
    aiSelectionTargetBlocks = snapshot.aiSelectionTargetBlocks;

    syncRuntimeMirror(snapshot);
}

function syncRuntimeMirror(snapshot) {
    if (paragraphOrchestrator.syncRuntimeMirror) {
        paragraphOrchestrator.syncRuntimeMirror(snapshot);
    }
}

function syncRuntimeMirrorFromCurrentState() {
    syncRuntimeMirror({
        localDocState,
        changePool,
        selectionTargetMap,
        aiSelectionInitialContent,
        aiSelectionTargetBlocks
    });
}

/**
 * 更新文档统计
 */
function updateDocStats(blockCount) {
    document.getElementById('blockCount').textContent = blockCount + ' 段落';
}

function updatePendingStats(pendingCount) {
    const pendingEl = document.getElementById('pendingCount');
    if (pendingEl) {
        pendingEl.textContent = `待处理 ${pendingCount}`;
    }
}

/**
 * 更新同步状态
 */
function setSyncStatus(status, isError = false) {
    const statusEl = document.getElementById('syncStatus');
    if (!statusEl) {
        return;
    }

    statusEl.textContent = status;
    statusEl.classList.remove('is-success', 'is-error', 'is-pending');

    if (isError) {
        statusEl.classList.add('is-error');
        return;
    }

    if (status.includes('中')) {
        statusEl.classList.add('is-pending');
    } else {
        statusEl.classList.add('is-success');
    }
}

/**
 * 从 Word 同步文档到后端
 */
async function syncDocumentFromWordToBackend(options = {}) {
    const {
        silent = false,
        updateStatus = true,
        showWordMarkers = true
    } = options;

    try {
        if (updateStatus) {
            setSyncStatus('同步中...');
        }
        let docBlocks = {};
        await Word.run(async (context) => {
            const paragraphs = context.document.body.paragraphs;
            paragraphs.load("text");
            await context.sync();

            for (let i = 0; i < paragraphs.items.length; i++) {
                const text = paragraphs.items[i].text.trim();
                if (text.length > 0) {
                    docBlocks[`p_${i}`] = text;
                }
            }
        });

        const initResponse = await fetch('/api/init-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(docBlocks)
        });

        if (!initResponse.ok) {
            let errorMsg = `状态码 ${initResponse.status}`;
            try {
                const errJson = await initResponse.json();
                errorMsg = errJson?.message || errJson?.error || errorMsg;
            } catch (_) {
                // ignore parse error and keep status text
            }
            throw new Error(`初始化文档失败：${errorMsg}`);
        }

        // 全量同步后清理旧的选区映射，避免使用过期 blockId
        clearSelectionRuntimeSnapshot();

        if (!silent) {
            appendMessage('system', `[▤] 扫描完成，共加载 ${Object.keys(docBlocks).length} 个有效段落。`);
        }
        await fetchDocumentState(true, showWordMarkers);
        if (updateStatus) {
            setSyncStatus('已同步');
        }
    } catch (error) {
        console.error("[x] 读取 Word 文档失败:", error);
        if (!silent) {
            appendMessage('system', '[x] 读取 Word 文档失败：' + error.message);
        }
        if (updateStatus) {
            setSyncStatus('同步失败', true);
        }
    }
}

/**
 * 锁定选区
 */
async function lockSelection() {
    if (!Office || !Office.context) {
        appendMessage('system', '[!] Office.js 尚未完全加载，请稍后再试。');
        return;
    }

    if (Object.keys(localDocState).length === 0) {
        appendMessage('system', '[!] 文档尚未初始化，请先点击"同步"按钮或等待自动同步完成。');
        return;
    }

    try {
        let selectedText = "";
        let targetBlockId = null;
        let targetBlockIds = [];

        await Word.run(async (context) => {
            const selection = context.document.getSelection();

            // 清理旧的控件
            const oldControls = context.document.contentControls.getByTitle("AI_Target");
            oldControls.load("items");
            await context.sync();
            oldControls.items.forEach(c => c.delete(true));

            // 获取段落信息
            const paragraphs = context.document.body.paragraphs;
            paragraphs.load("text");
            await context.sync();

            const selectionParagraphs = selection.paragraphs;
            selectionParagraphs.load("items");
            await context.sync();

            if (selectionParagraphs.items.length > 0) {
                const matchedDocParagraphIndices = new Set();

                const pendingChanges = getPendingChanges();
                logPendingChanges(pendingChanges);

                for (let j = 0; j < selectionParagraphs.items.length; j++) {
                    selectionParagraphs.items[j].load("text");
                }
                await context.sync();

                for (let j = 0; j < selectionParagraphs.items.length; j++) {
                    const selectedParaText = selectionParagraphs.items[j].text.trim();
                    
                    for (let i = 0; i < paragraphs.items.length; i++) {
                        if (matchedDocParagraphIndices.has(i)) {
                            continue;
                        }
                        const docParaText = paragraphs.items[i].text.trim();
                        if (docParaText.length > 0 && docParaText === selectedParaText) {
                            const foundTargetId = `p_${i}`;
                            targetBlockIds.push(foundTargetId);
                            matchedDocParagraphIndices.add(i);
                            if (!targetBlockId) {
                                targetBlockId = foundTargetId;
                            }
                            break;
                        }
                    }
                }
            }

            // 插入内容控件
            const cc = selection.insertContentControl();
            cc.title = "AI_Target";
            cc.color = "#c586c0";
            cc.appearance = "BoundingBox";

            selection.load("text");
            await context.sync();
            selectedText = selection.text.trim();
        });

        if (!selectedText) {
            appendMessage('system', '[!] 没捕捉到文字！请先在 Word 文档里用鼠标划选一段内容。');
            return;
        }

        const requestBody = {
            "selectedText": selectedText,
            "blockId": SPECIAL_BLOCK_ID.AI_SELECTION
        };

        if (targetBlockIds.length > 0) {
            requestBody.targetBlockId = targetBlockId;
            requestBody.targetBlockIds = targetBlockIds;
        }

        await fetch('/api/lock-selection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        lastLockedSelection = {
            text: selectedText,
            targetBlockId: targetBlockId,
            targetBlockIds: targetBlockIds,
            timestamp: new Date().toISOString()
        };

        selectionTargetMap[SPECIAL_BLOCK_ID.AI_SELECTION] = targetBlockIds;
        aiSelectionInitialContent = selectedText;  // 保存锁定时的初始内容
        
        // 记录目标段落的初始值（用于拒绝变更时恢复）
        aiSelectionTargetBlocks = {};
        if (targetBlockIds && targetBlockIds.length > 0) {
            targetBlockIds.forEach(blockId => {
                const block = localDocState[blockId];
                const content = getBlockContent(block);
                aiSelectionTargetBlocks[blockId] = content;
                console.log(`[•] 记录目标段落初始值 ${blockId}: ${(content || '').substring(0, 30)}...`);
            });
        }

        const msg = targetBlockIds.length > 0
            ? `[◎] 已锁定选区（位于 ${targetBlockIds.join(', ')}）！请下达润色或修改指令。`
            : '[◎] 已精准锁定选中区域！请下达润色或修改指令。';
        
        appendMessage('system', msg);
        await fetchDocumentState(false);

    } catch (error) {
        console.error("锁定选区失败:", error);
        appendMessage('system', '[x] 锁定选区失败：' + error.message);
    }
}

/**
 * 渲染文档视图（同时在 Word 中显示行内联标记）
 */
async function renderDocumentView() {
    await renderDocumentViewInternal(true);
}

/**
 * 渲染文档视图（不显示 Word 行内联标记，用于接受变更后立即刷新）
 */
function renderDocumentViewWithoutMarkers() {
    return renderDocumentViewInternal(false);
}

async function renderDocumentViewInternal(showWordMarkers) {
    const container = document.getElementById('documentContainer');
    clearDocumentContainer(container);

    const pendingCount = getPendingChangeIds().length;
    updatePendingStats(pendingCount);

    // 统计非虚拟的 blockId 数量
    const logicalBlockIds = getLogicalBlockIds(localDocState);
    const logicalBlockCount = logicalBlockIds.length;
    updateDocStats(logicalBlockCount);

    if (logicalBlockCount === 0) {
        renderDocumentEmptyState(container);
        return;
    }

    if (showWordMarkers) {
        // 先在 Word 中显示所有变更的行内联标记
        await showAllChangesInWord();
    }

    renderReviewToolbar(container);

    if (reviewDocViewMode === REVIEW_DOC_VIEW_MODE.CHANGES_ONLY && getPendingChangeIds().length === 0) {
        renderNoPendingChangesHint(container);
        return;
    }

    // 然后渲染右侧预览面板
    renderLogicalBlockCards(container, logicalBlockIds);

    renderVirtualChangeCards(container);
    renderAiSelectionReviewCard(container);
}

function renderVirtualChangeCards(container) {
    getPendingVirtualChanges().forEach(([changeId, change]) => {
        if (!change) {
            return;
        }

        if (change.type === 'insert' && isInsertChangeId(changeId)) {
            renderInsertCard(container, changeId, change.newContent);
        } else if (change.type === 'delete' && isDeleteChangeId(changeId)) {
            const targetId = change.targetId;
            if (targetId && localDocState[targetId]) {
                const deleteContent = getBlockContent(localDocState[targetId]);
                renderDeleteCard(container, targetId, deleteContent, changeId);
            }
        }
    });
}

function getPendingVirtualChanges() {
    return Object.entries(changePool)
        .filter(([changeId, change]) => {
            if (!change) {
                return false;
            }
            return !isAiSelectionId(changeId)
                && !isAcceptedChange(change)
                && (isInsertChangeId(changeId) || isDeleteChangeId(changeId));
        });
}

function renderAiSelectionReviewCard(container) {
    const aiSel = changePool[SPECIAL_BLOCK_ID.AI_SELECTION];
    if (aiSel && !isAcceptedChange(aiSel)) {
        const aiSelContent = aiSel.newContent || '';
        const hasAIModification = aiSelectionInitialContent && aiSelContent !== aiSelectionInitialContent;
        const aiDisabled = !hasAIModification;
        renderDiffCard(container, SPECIAL_BLOCK_ID.AI_SELECTION, aiSelectionInitialContent || '', aiSelContent, aiDisabled);
    }
}

function clearDocumentContainer(container) {
    container.innerHTML = '';
}

function renderReviewToolbar(container) {
    const toolbar = document.createElement('div');
    toolbar.className = 'review-toolbar';
    toolbar.innerHTML = `
        <div class="review-toolbar-actions">
            <div class="review-toggle-group">
                <button class="review-toggle-btn ${reviewDocViewMode === REVIEW_DOC_VIEW_MODE.ALL ? 'active' : ''}" onclick="setReviewDocViewMode('${REVIEW_DOC_VIEW_MODE.ALL}')">全部段落</button>
                <button class="review-toggle-btn ${reviewDocViewMode === REVIEW_DOC_VIEW_MODE.CHANGES_ONLY ? 'active' : ''}" onclick="setReviewDocViewMode('${REVIEW_DOC_VIEW_MODE.CHANGES_ONLY}')">仅看变更</button>
            </div>
            <div class="review-toggle-group">
                <button class="review-toggle-btn ${reviewDiffViewMode === REVIEW_DIFF_VIEW_MODE.FULL ? 'active' : ''}" onclick="setReviewDiffViewMode('${REVIEW_DIFF_VIEW_MODE.FULL}')">完整上下文</button>
                <button class="review-toggle-btn ${reviewDiffViewMode === REVIEW_DIFF_VIEW_MODE.CHANGES ? 'active' : ''}" onclick="setReviewDiffViewMode('${REVIEW_DIFF_VIEW_MODE.CHANGES}')">仅看改动片段</button>
            </div>
        </div>
    `;
    container.appendChild(toolbar);
}

function setReviewDocViewMode(mode) {
    if (!Object.values(REVIEW_DOC_VIEW_MODE).includes(mode)) {
        return;
    }

    if (reviewDocViewMode === mode) {
        return;
    }

    reviewDocViewMode = mode;
    renderDocumentViewWithoutMarkers();
}

function setReviewDiffViewMode(mode) {
    if (!Object.values(REVIEW_DIFF_VIEW_MODE).includes(mode)) {
        return;
    }

    if (reviewDiffViewMode === mode) {
        return;
    }

    reviewDiffViewMode = mode;
    renderDocumentViewWithoutMarkers();
}

function renderNoPendingChangesHint(container) {
    const hint = document.createElement('div');
    hint.className = 'review-empty-hint';
    hint.innerHTML = '当前没有待审查变更，切换到“全部段落”可查看全文。';
    container.appendChild(hint);
}

function renderDocumentEmptyState(container) {
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">📝</div>
            <div class="empty-state-text">暂无文档内容，请先同步 Word 文档</div>
        </div>
    `;
}

function renderLogicalBlockCards(container, logicalBlockIds) {
    const showOnlyChanges = reviewDocViewMode === REVIEW_DOC_VIEW_MODE.CHANGES_ONLY;

    logicalBlockIds.forEach(blockId => {
        const block = localDocState[blockId];
        const currentContent = getBlockContent(block);
        const change = changePool[blockId];
        const deleteChange = changePool[buildDeleteChangeId(blockId)];

        if (isAcceptedChange(change) || isAcceptedChange(deleteChange)) {
            return;
        }

        if (deleteChange) {
            renderDeleteCard(container, blockId, currentContent);
        } else if (change && change.type === 'update') {
            renderDiffCard(container, blockId, change.oldContent, change.newContent);
        } else if (!showOnlyChanges) {
            renderNormalCard(container, blockId, currentContent);
        }
    });
}

/**
 * 在 Word 中显示所有变更的行内联标记
 */
async function showAllChangesInWord() {
    try {
        await Word.run(async (context) => {
            // 先清理旧标记，保证每次都按当前待审变更重绘
            await resetWordMarkersInContext(context);
            await clearOldAIControls(context);
            
            // 为每个变更创建行内联标记（每个都单独处理错误）
            for (const [blockId, change] of Object.entries(changePool)) {
                try {
                    if (!change || isAcceptedChange(change)) {
                        continue;
                    }

                    if (isAiSelectionId(blockId) && change.type === 'update') {
                        await showAiSelectionMarkerInWord(context, change);
                    } else if (change.type === 'update' && change.oldContent && change.newContent) {
                        await showUpdateDiffInWord(context, blockId, change.oldContent, change.newContent);
                    } else if (change.type === 'delete' && change.oldContent) {
                        await showDeleteMarkerInWord(context, change.targetId, change.oldContent);
                    } else if (change.type === 'insert' && change.newContent) {
                        await showInsertMarkerInWord(context, blockId, change.newContent);
                    }
                } catch (markerError) {
                    console.warn(`[!] 为变更 ${blockId} 添加标记失败:`, markerError.message);
                    // 继续处理下一个变更，不中断整个流程
                }
            }
            
            await context.sync();
        });
    } catch (error) {
        console.error('[x] 在 Word 中显示行内联标记失败:', error);
    }
}

async function resetWordMarkersInContext(context) {
    const paragraphs = context.document.body.paragraphs;
    paragraphs.load('items');
    await context.sync();

    paragraphs.items.forEach((paragraph) => {
        try {
            const range = paragraph.getRange();
            range.font.color = '#000000';
            range.font.strikeThrough = false;
            range.font.bold = false;
        } catch (e) {
            // 忽略单段重置失败，继续处理
        }
    });

    await context.sync();
}

async function showAiSelectionMarkerInWord(context, change) {
    const targetBlockIds = getAiSelectionTargetBlockIds();
    if (targetBlockIds.length === 0) {
        return;
    }

    for (const targetBlockId of targetBlockIds) {
        await showUpdateDiffInWord(context, targetBlockId, '', change?.newContent || '');
    }
}

async function getWordParagraphByBlockId(context, blockId) {
    const paragraphIndex = getParagraphIndexFromBlockId(blockId);
    const paragraphs = context.document.body.paragraphs;
    paragraphs.load("items");
    await context.sync();

    if (!isValidParagraphIndex(paragraphIndex, paragraphs)) {
        return null;
    }

    return paragraphs.items[paragraphIndex];
}

/**
 * 在 Word 中标记有修改的段落（用紫色下划线）
 */
async function showUpdateDiffInWord(context, blockId, oldText, newText) {
    const paragraph = await getWordParagraphByBlockId(context, blockId);
    if (!paragraph) {
        return;
    }

    // 使用文字颜色标记而不是改变缩进（避免破坏格式）
    try {
        // 只改变文字颜色为紫色，表示有修改建议
        const range = paragraph.getRange();
        range.font.color = '#6366F1'; // 紫色文字
        
        console.log(`[✓] 已标记更新段落 ${blockId}`);
    } catch(err) {
        console.warn(`[!] 标记更新段落 ${blockId} 失败：`, err.message);
    }
}

/**
 * 在 Word 中标记要删除的段落（红色下划线）
 */
async function showDeleteMarkerInWord(context, blockId, content) {
    const paragraph = await getWordParagraphByBlockId(context, blockId);
    if (!paragraph) {
        return;
    }

    // 使用文字格式标记而不是 contentControl
    try {
        const range = paragraph.getRange();
        range.font.color = '#EF4444'; // 红色文字
        range.font.strikeThrough = true; // 添加删除线
        
        console.log(`[✓] 已标记删除段落 ${blockId}`);
    } catch(err) {
        console.warn(`[!] 标记删除段落 ${blockId} 失败：`, err.message);
    }
}

/**
 * 在 Word 中标记新插入的段落（绿色着色）
 */
async function showInsertMarkerInWord(context, changeId, content) {
    const targetId = getInsertTargetBlockId(changeId);
    if (!targetId) {
        console.warn(`[!] 无法从插入变更ID解析目标段落: ${changeId}`);
        return;
    }

    // 插入类变更在预览阶段不改写 Word 内容，仅在锚点末尾放置“插入点”标签。
    const paragraph = await getWordParagraphByBlockId(context, targetId);
    if (!paragraph) {
        return;
    }

    try {
        const anchorRange = paragraph.getRange(Word.RangeLocation.end);
        const marker = anchorRange.insertContentControl();
        marker.title = `AI_InsertAnchor_${changeId}`;
        marker.tag = 'AI_INSERT_ANCHOR';
        marker.appearance = 'tags';
        marker.color = '#0EA5E9';

        const markerLabel = marker.insertText(' 插入点 ', Word.InsertLocation.replace);
        markerLabel.font.color = '#0EA5E9';
        markerLabel.font.bold = true;

        console.log(`[✓] 已标记插入点（将在 ${targetId} 之后插入，变更 ${changeId}）`);
    } catch (err) {
        console.warn(`[!] 标记插入锚点段落失败 [${changeId}]：`, err.message);
    }
}

/**
 * 渲染正常卡片
 */
function renderNormalCard(container, blockId, content) {
    const card = document.createElement('div');
    card.className = 'block-card confirmed';
    card.innerHTML = `
        <div class="block-id">${blockId}</div>
        <div class="block-text">${escapeHtml(content || '')}</div>
    `;
    container.appendChild(card);
}

function isProcessingActive() {
    return (typeof isProcessing !== 'undefined') ? isProcessing : false;
}

function getDisabledAttr(forceDisabled = false) {
    return (isProcessingActive() || forceDisabled) ? 'disabled' : '';
}

function formatInlineDiffText(text) {
    return escapeHtml(String(text || '')).replace(/\n/g, '<br>');
}

function renderInlineDiffContent(oldContent, newContent) {
    const diffs = dmp.diff_main(String(oldContent || ''), String(newContent || ''));
    dmp.diff_cleanupSemantic(diffs);

    const shouldHideEqual = reviewDiffViewMode === REVIEW_DIFF_VIEW_MODE.CHANGES;

    if (shouldHideEqual) {
        const changeSegments = diffs
            .filter(([op, text]) => op !== 0 && String(text || '').length > 0)
            .map(([op, text]) => {
                const safeText = formatInlineDiffText(text);
                if (op === -1) {
                    return `<span class="diff-token diff-token-del">${safeText}</span>`;
                }
                return `<span class="diff-token diff-token-ins">${safeText}</span>`;
            });

        if (changeSegments.length === 0) {
            return '<span class="diff-token diff-token-eq">无可见改动</span>';
        }

        return changeSegments.join('<span class="diff-gap"> ... </span>');
    }

    return diffs.map(([op, text]) => {
        const safeText = formatInlineDiffText(text);
        if (!safeText) {
            return '';
        }

        if (op === -1) {
            return `<span class="diff-token diff-token-del">${safeText}</span>`;
        }
        if (op === 1) {
            return `<span class="diff-token diff-token-ins">${safeText}</span>`;
        }
        return `<span class="diff-token diff-token-eq">${safeText}</span>`;
    }).join('');
}

function handleAcceptClick(event, changeId) {
    if (event) {
        event.stopPropagation();
    }
    acceptChange(changeId);
}

function handleRejectClick(event, changeId) {
    if (event) {
        event.stopPropagation();
    }
    rejectChange(changeId);
}

function resolveFocusBlockId(changeId) {
    if (isAiSelectionId(changeId)) {
        const targetBlockIds = getAiSelectionTargetBlockIds();
        return targetBlockIds.length > 0 ? targetBlockIds[0] : null;
    }

    if (isInsertChangeId(changeId)) {
        return getInsertTargetBlockId(changeId);
    }

    if (isDeleteChangeId(changeId)) {
        return getDeleteTargetBlockId(changeId);
    }

    return changeId;
}

async function focusWordParagraphByBlockId(blockId) {
    if (!blockId) {
        return;
    }

    if (!Office || !Office.context) {
        return;
    }

    try {
        await Word.run(async (context) => {
            const paragraphIndex = getParagraphIndexFromBlockId(blockId);
            const paragraphs = context.document.body.paragraphs;
            paragraphs.load('items');
            await context.sync();

            if (!isValidParagraphIndex(paragraphIndex, paragraphs)) {
                return;
            }

            paragraphs.items[paragraphIndex].select();
            await context.sync();
        });
    } catch (error) {
        console.warn(`定位 Word 段落失败 [${blockId}]：`, error.message);
    }
}

function bindCardFocus(card, changeId) {
    card.classList.add('review-focusable');
    card.title = '点击定位到 Word 对应段落';
    card.addEventListener('click', () => {
        const focusBlockId = resolveFocusBlockId(changeId);
        focusWordParagraphByBlockId(focusBlockId);
    });
}

/**
 * 渲染 Diff 卡片
 */
function renderDiffCard(container, blockId, oldContent, newContent, forceDisabled = false) {
    const card = document.createElement('div');
    card.className = 'block-card has-diff';
    const btnDisabled = getDisabledAttr(forceDisabled);
    const inlineDiffHtml = renderInlineDiffContent(oldContent, newContent);

    card.innerHTML = `
        <div class="block-id">${blockId}</div>
        <div class="block-text">
            <div class="diff-label">变更预览</div>
            <div class="inline-diff-view">${inlineDiffHtml}</div>
        </div>
        <div class="action-bar">
            <button class="btn-accept" onclick="handleAcceptClick(event, '${blockId}')" ${btnDisabled}>
                <span>✓</span> 接受修改
            </button>
            <button class="btn-reject" onclick="handleRejectClick(event, '${blockId}')" ${btnDisabled}>
                <span>✗</span> 拒绝
            </button>
        </div>
    `;
    bindCardFocus(card, blockId);
    container.appendChild(card);
}

/**
 * 渲染插入卡片
 */
function renderInsertCard(container, changeId, content, forceDisabled = false) {
    const card = document.createElement('div');
    card.className = 'block-card has-diff';
    const btnDisabled = getDisabledAttr(forceDisabled);

    card.innerHTML = `
        <div class="block-id">${changeId} <span class="new-paragraph-label">[新段落]</span></div>
        <div class="inserted-text">${escapeHtml(content || '')}</div>
        <div class="action-bar">
            <button class="btn-accept" onclick="handleAcceptClick(event, '${changeId}')" ${btnDisabled}>
                <span>✓</span> 接受插入
            </button>
            <button class="btn-reject" onclick="handleRejectClick(event, '${changeId}')" ${btnDisabled}>
                <span>✗</span> 丢弃
            </button>
        </div>
    `;
    bindCardFocus(card, changeId);
    container.appendChild(card);
}

/**
 * 渲染删除卡片
 */
function renderDeleteCard(container, blockId, content, changeId = null) {
    const card = document.createElement('div');
    card.className = 'block-card to-delete';
    const btnDisabled = getDisabledAttr(false);

    // 如果提供了 changeId，优先使用；否则使用 blockId 构造
    const actualChangeId = changeId || buildDeleteChangeId(blockId);

    card.innerHTML = `
        <div class="block-id">${blockId}</div>
        <div class="delete-warning">
            <span>⌦</span> AI 建议删除此段落
        </div>
        <div class="deleted-text">${escapeHtml(content || '')}</div>
        <div class="action-bar">
            <button class="btn-accept" onclick="handleAcceptClick(event, '${actualChangeId}')" ${btnDisabled}>
                <span>⌦</span> 确认删除
            </button>
            <button class="btn-reject" onclick="handleRejectClick(event, '${actualChangeId}')" ${btnDisabled}>
                <span>↺</span> 保留
            </button>
        </div>
    `;
    bindCardFocus(card, actualChangeId);
    container.appendChild(card);
}

/**
 * 从后端获取文档状态
 */
async function fetchDocumentState(isInit = false, showWordMarkers = true) {
    try {
        const serverState = await fetchServerDocumentState();

        console.log(`[•] fetchDocumentState: isInit=${isInit}, 服务器 ${Object.keys(serverState).length} 个区块, 本地 ${Object.keys(localDocState).length} 个区块`);

        if (isInit) {
            applyInitSnapshot(serverState);
            console.log(`[✓] 已重置 localDocState (${Object.keys(localDocState).length} 个) 和 changePool`);
        } else {
            console.log(`[~] 同步变更到 changePool...`);
            syncChangesToPool(serverState);
        }

        // 渲染视图（可按需控制是否显示 Word 行内联标记）
        await renderDocumentViewInternal(showWordMarkers);
        
        // 显示当前的 changePool 状态
        const pendingChanges = getPendingChanges();
        logPendingChanges(pendingChanges);
        
    } catch (error) {
        console.error('[x] 获取文档状态失败:', error);
        if (window.showMessage) {
            showMessage('❌ 无法同步文档状态：' + error.message, 'error');
        }
    }
}

/**
 * 同步变更到变更池
 */
function syncChangesToPool(serverState) {
    const snapshot = paragraphOrchestrator.buildChangePoolFromServerState({
        localDocState,
        changePool,
        initialDocState,
        serverState,
        aiSelectionInitialContent,
        selectionTargetMap,
        parseInsertTargetBlockId: getInsertTargetBlockId,
        parseDeleteTargetBlockId: getDeleteTargetBlockId
    });

    changePool = snapshot.changePool;

    console.log('变更池已同步:', changePool);
    syncRuntimeMirrorFromCurrentState();
}

/**
 * 接受变更
 */
async function acceptChange(changeId) {
    const change = getChangeFromPool(changeId, { warnIfMissing: true });
    if (!change) return false;

    const config = getApiConfig();
    console.log(`[~] 开始处理变更: ${changeId}`, change);

    return executeReviewAction(buildAcceptReviewActionOptions(changeId, change, config));
}

function buildAcceptRequestData(changeId, change) {
    let blockId = changeId;
    let targetBlockId = null;

    if (change.type === 'insert') {
        blockId = changeId;
        targetBlockId = resolveInsertTargetId(change, changeId);
        console.log(`[•] 插入操作: blockId=${blockId}, targetBlockId=${targetBlockId}`);
    } else {
        blockId = resolveDeleteTargetId(change, changeId);
    }

    const requestData = {
        blockId,
        newText: change.newContent || '',
        changeType: change.type
    };

    if (targetBlockId) {
        requestData.targetBlockId = targetBlockId;
    }

    if (isAiSelectionId(changeId)) {
        const targetBlockIds = getAiSelectionTargetBlockIds();
        if (targetBlockIds.length > 0) {
            requestData.targetBlockId = targetBlockIds[0];
            requestData.targetBlockIds = targetBlockIds;
            console.log(`[•] ai_selection 变更的目标块：${targetBlockIds.join(', ')}`);
        }
    }

    logReviewSemantics(REVIEW_STAGE.ACCEPT_REQUEST, changeId, change, requestData);

    return requestData;
}

async function applyChangeToWordWithFeedback(change) {
    try {
        await applyChangeToWord(change);
        console.log('[✓] Word 文档已更新');
    } catch (wordError) {
        console.error('[x] Word 修改失败:', wordError);
        showMessage(`❌ Word 文档修改失败: ${wordError.message}`, 'error');
        throw wordError;
    }
}

async function sendAcceptRequest(requestData, config) {
    const response = await fetch('/api/accept', {
        method: 'POST',
        headers: buildModelRequestHeaders(config),
        body: JSON.stringify(requestData)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: '未知错误' }));
        throw new Error(`后端错误: ${errorData.message || response.statusText}`);
    }
}

function buildModelRequestHeaders(config) {
    return {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey,
        'X-Base-URL': config.baseUrl,
        'X-Model-Name': config.modelName
    };
}

async function commitAcceptSuccess(changeId, change) {
    change.status = 'accepted';
    console.log(`[✓] 变更 ${changeId} 已标记为已接受`);
    showMessage('✓ 修改已确认并同步到 Word', 'success');

    // 无论单条还是批量，先基于当前 changePool 做本地收敛，避免单条接受触发全量重置导致其他待审变更丢失。
    applyReviewSnapshot(REVIEW_ORCHESTRATOR_METHOD.ACCEPT, changeId, change);

    if (isStructureChangingAcceptChange(change)) {
        await fetchDocumentState(false, true);
    } else {
        await finalizeReviewActionUI();
    }

    appendMessage('system', REVIEW_SYSTEM_MESSAGE.ACCEPTED(changeId));
}

function isStructureChangingAcceptChange(change) {
    return !!change && (change.type === 'insert' || change.type === 'delete');
}

async function commitRejectSuccess(changeId) {
    await finalizeReviewActionUI();
    appendMessage('system', REVIEW_SYSTEM_MESSAGE.REJECTED(changeId));
}

function isValidParagraphIndex(paragraphIndex, paragraphs) {
    return paragraphIndex >= 0 && paragraphIndex < paragraphs.items.length;
}

async function replaceParagraphTextWithFormatPreserved(context, paragraph, newText) {
    paragraph.load("alignment,leftIndent,firstLineIndent,rightIndent,lineSpacing");
    await context.sync();
    const originalFormat = captureWordParagraphFormat(paragraph);
    const range = paragraph.getRange();
    range.insertText(newText, Word.InsertLocation.replace);
    restoreWordParagraphFormat(paragraph, originalFormat);
}

async function updateWordParagraphByBlockId(context, paragraphs, blockId, newText, isMergedContent = false) {
    const paragraphIndex = getParagraphIndexFromBlockId(blockId);
    if (!isValidParagraphIndex(paragraphIndex, paragraphs)) {
        return;
    }

    const paragraph = paragraphs.items[paragraphIndex];
    await replaceParagraphTextWithFormatPreserved(context, paragraph, newText);
    if (isMergedContent) {
        console.log(`[✓] Word 已更新段落 ${blockId}（多段合并）：${String(newText).substring(0, 30)}...`);
    } else {
        console.log(`[✓] Word 已更新段落 ${blockId}：${String(newText).substring(0, 30)}...`);
    }
}

function splitAiSelectionParagraphs(text) {
    return String(text || '')
        .split('\n')
        .map(p => p.trim())
        .filter(p => p.length > 0);
}

function splitSingleAiSelectionContentToTargets(content, targetBlockIds) {
    const targetCount = Array.isArray(targetBlockIds) ? targetBlockIds.length : 0;
    const safeContent = String(content || '').trim();
    if (targetCount <= 1) {
        return [safeContent];
    }

    if (!safeContent) {
        return Array(targetCount).fill('');
    }

    const weights = targetBlockIds.map((targetId) => {
        const ref = String(aiSelectionTargetBlocks?.[targetId] || '').trim();
        return Math.max(1, ref.length);
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0) || targetCount;
    const contentLength = safeContent.length;
    const result = [];
    let start = 0;
    let accumulatedWeight = 0;

    for (let i = 0; i < targetCount; i++) {
        if (i === targetCount - 1) {
            result.push(safeContent.substring(start).trim());
            break;
        }

        accumulatedWeight += weights[i];
        const expectedCut = Math.round(contentLength * accumulatedWeight / totalWeight);
        const cut = findBestAiSelectionCutPosition(safeContent, expectedCut, start, targetCount - i - 1);
        result.push(safeContent.substring(start, cut).trim());
        start = cut;
    }

    while (result.length < targetCount) {
        result.push('');
    }

    return result;
}

function findBestAiSelectionCutPosition(content, expectedCut, start, remainingChunks) {
    const minCut = start + 1;
    const maxCut = content.length - remainingChunks;
    if (maxCut < minCut) {
        return minCut;
    }

    const clamped = Math.min(Math.max(expectedCut, minCut), maxCut);
    const window = 24;
    let bestPos = clamped;
    let bestDistance = Number.MAX_SAFE_INTEGER;

    for (let i = Math.max(minCut, clamped - window); i <= Math.min(maxCut, clamped + window); i++) {
        const prevChar = content[i - 1];
        if (!isAiSelectionBoundaryChar(prevChar)) {
            continue;
        }

        const distance = Math.abs(i - clamped);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestPos = i;
        }
    }

    return bestPos;
}

function isAiSelectionBoundaryChar(char) {
    return /[\s。！？!?；;，,]/.test(char || '');
}

async function applyAiSelectionChangeToWord(context, paragraphs, change) {
    const targetBlockIds = getAiSelectionTargetBlockIds();
    if (targetBlockIds.length === 0) {
        console.warn('[!] ai_selection 没有找到目标块ID');
        return;
    }

    // 使用aiSelectionInitialContent而不是change.oldContent，确保正确对比
    if (!change.newContent || change.newContent === aiSelectionInitialContent) {
        console.warn('ai_selection 无有效AI修改，不同步到Word');
        return;
    }

    const contentParagraphs = splitAiSelectionParagraphs(change.newContent);

    // 三种同步策略（与后端保持一致）
    if (contentParagraphs.length === targetBlockIds.length) {
        // 策略1：内容段落数 = 目标块数 → 一对一分配
        for (let i = 0; i < targetBlockIds.length; i++) {
            await updateWordParagraphByBlockId(context, paragraphs, targetBlockIds[i], contentParagraphs[i]);
        }
        return;
    }

    if (contentParagraphs.length === 1) {
        // 策略2：只有一段内容 → 按目标段落数拆分后同步
        const distributed = splitSingleAiSelectionContentToTargets(contentParagraphs[0], targetBlockIds);
        for (let i = 0; i < targetBlockIds.length; i++) {
            await updateWordParagraphByBlockId(context, paragraphs, targetBlockIds[i], distributed[i]);
        }
        return;
    }

    // 策略3：段落数不匹配 → 将完整内容合并到第一个目标块
    await updateWordParagraphByBlockId(context, paragraphs, targetBlockIds[0], change.newContent, true);
}

/**
 * 在 Word 中应用变更
 */
async function applyChangeToWord(change) {
    if (!Office || !Office.context) {
        throw new Error('Office.js 尚未加载');
    }

    try {
        await Word.run(async (context) => {
            const paragraphs = context.document.body.paragraphs;
            paragraphs.load("items");
            await context.sync();

            // 特殊处理 ai_selection（无论type是什么，都需要应用变更）
            if (isAiSelectionId(change.blockId) || isAiSelectionId(change.targetId)) {
                await applyAiSelectionChangeToWord(context, paragraphs, change);
                await context.sync();
                return;
            }

            // 普通段落：update 或 delete 类型
            if (change.type === 'update' || change.type === 'delete') {
                const targetId = resolveDeleteTargetId(change, change.blockId);
                const paragraphIndex = getParagraphIndexFromBlockId(targetId);
                
                if (isValidParagraphIndex(paragraphIndex, paragraphs)) {
                    const paragraph = paragraphs.items[paragraphIndex];
                    
                    if (change.type === 'delete') {
                        const range = paragraph.getRange();
                        range.insertText('', Word.InsertLocation.replace);
                        console.log(`[✓] Word 已删除段落 ${targetId}`);
                    } else {
                        await replaceParagraphTextWithFormatPreserved(context, paragraph, change.newContent || '');
                        console.log(`[✓] Word 已更新段落 ${targetId}：${change.newContent.substring(0, 30)}...`);
                    }
                }
            } 
            // 普通插入
            else if (change.type === 'insert') {
                // 获取真实的目标blockId（已在syncChangesToPool中正确设置）
                const targetBlockId = resolveInsertTargetId(change, change.blockId);
                
                if (!targetBlockId) {
                    console.warn(`[!] 无法从插入变更中提取目标blockId`);
                    return;
                }

                // 优先使用 blockId 对应的段落索引，避免受“插入点”临时标记文本影响。
                let targetParagraphIndex = getParagraphIndexFromBlockId(targetBlockId);

                if (!isValidParagraphIndex(targetParagraphIndex, paragraphs)) {
                    // 兜底：若索引失效，再尝试按文本匹配。
                    const targetContent = getBlockContent(localDocState[targetBlockId]);
                    if (!targetContent) {
                        console.warn(`⚠️ 无法获取目标段落 [${targetBlockId}] 的内容`);
                        return;
                    }

                    for (let i = 0; i < paragraphs.items.length; i++) {
                        const para = paragraphs.items[i];
                        para.load("text");
                    }
                    await context.sync();

                    for (let i = 0; i < paragraphs.items.length; i++) {
                        const paraText = paragraphs.items[i].text.replace(/插入点/g, '').trim();
                        if (paraText === targetContent.trim()) {
                            targetParagraphIndex = i;
                            console.log(`[✓] 兜底匹配到目标段落索引 ${i} [${targetBlockId}]`);
                            break;
                        }
                    }
                }
                
                if (targetParagraphIndex >= 0) {
                    // 在找到的段落后面插入新段落
                    const targetParagraph = paragraphs.items[targetParagraphIndex];
                    targetParagraph.insertParagraph(change.newContent || '', Word.InsertLocation.after);
                    console.log(`[✓] Word 已在段落 [${targetBlockId}] 之后插入新段落，内容：${change.newContent.substring(0, 30)}...`);
                } else {
                    console.warn(`[!] 在Word文档中未找到与目标段落 [${targetBlockId}] 匹配的段落，内容: ${targetContent.substring(0, 50)}...`);
                }
            }
            
            await context.sync();
        });
    } catch (error) {
        console.error('在 Word 中应用变更失败:', error);
        throw error;
    }
}

/**
 * 拒绝变更
 */
async function rejectChange(changeId) {
    const change = getChangeFromPool(changeId);
    if (!change) return false;

    return executeReviewAction(buildRejectReviewActionOptions(changeId, change));
}

function buildAcceptReviewActionOptions(changeId, change, config) {
    return {
        changeId,
        actionName: REVIEW_ACTION.ACCEPT,
        change,
        shouldProceed: () => ensureAcceptChangeCanProceed(changeId, change),
        applyWordChange: applyChangeToWordWithFeedback,
        afterWordApply: async () => {
            const requestData = buildAcceptRequestData(changeId, change);
            await sendAcceptRequest(requestData, config);
        },
        onSuccess: async () => {
            await commitAcceptSuccess(changeId, change);
        }
    };
}

function ensureAcceptChangeCanProceed(changeId, change) {
    if (isAcceptedChange(change)) {
        console.warn(`[!] 变更 ${changeId} 已被接受过，跳过重复操作`);
        showMessage('⚠️ 该变更已被接受过', 'warning');
        return false;
    }
    return true;
}

function buildRejectReviewActionOptions(changeId, change) {
    return {
        changeId,
        actionName: REVIEW_ACTION.REJECT,
        change,
        beforeWordApply: async () => {
            applyReviewSnapshot(REVIEW_ORCHESTRATOR_METHOD.REJECT, changeId, change);
            const recoveryChange = buildRejectRecoveryChange(change);
            logReviewSemantics(REVIEW_STAGE.REJECT_RECOVERY, changeId, recoveryChange);
            return recoveryChange;
        },
        applyWordChange: applyRejectChangeToWord,
        onSuccess: async () => {
            await commitRejectSuccess(changeId);
        }
    };
}

async function applyRejectChangeToWord(change) {
    // 拒绝插入时不应改写 Word；只需丢弃草稿。
    if (change?.type === 'insert') {
        console.log('ℹ️ 拒绝插入变更：跳过 Word 写入，保持正文结构不变');
        return;
    }

    await applyChangeToWord(change);
}

function buildRejectRecoveryChange(change) {
    return {
        ...change,
        newContent: change.initialContent || change.oldContent
    };
}

async function finalizeReviewActionUI() {
    await clearAllAIMarkers();
    await renderDocumentView();
}

function requireOrchestratorMethod(methodName) {
    const method = paragraphOrchestrator[methodName];
    if (typeof method !== 'function') {
        throw new Error(`ParagraphOrchestrator.${methodName} 未加载`);
    }
    return method;
}

function applyReviewSnapshot(methodName, changeId, change) {
    const buildReviewState = requireOrchestratorMethod(methodName);
    const snapshot = buildReviewState({
        localDocState,
        changePool,
        changeId,
        change,
        selectionTargetMap,
        aiSelectionInitialContent,
        aiSelectionTargetBlocks
    });
    applyOrchestratorSnapshot(snapshot);
}

function getChangeFromPool(changeId, options = {}) {
    const { warnIfMissing = false } = options;
    const change = changePool[changeId];
    if (!change && warnIfMissing) {
        console.warn(`[!] 未找到变更: ${changeId}`);
    }
    return change;
}

function handleReviewActionError(actionName, error) {
    console.error(`${actionName}失败:`, error);
    appendMessage('system', REVIEW_SYSTEM_MESSAGE.ACTION_FAILED(actionName, error.message));
}

async function executeReviewAction(options) {
    const {
        changeId,
        actionName,
        change,
        shouldProceed,
        applyWordChange,
        beforeWordApply,
        afterWordApply,
        onSuccess,
        onError
    } = options;

    const normalizedChangeId = changeId != null ? String(changeId) : null;

    if (normalizedChangeId && processingChangeIds.has(normalizedChangeId)) {
        console.warn(`[!] 变更 ${normalizedChangeId} 正在处理中，忽略重复触发`);
        if (window.showMessage) {
            showMessage('⚠️ 该变更正在处理中，请勿重复点击', 'warning');
        }
        return false;
    }

    if (normalizedChangeId) {
        processingChangeIds.add(normalizedChangeId);
    }

    try {
        if (shouldProceed) {
            const canProceed = await shouldProceed();
            if (!canProceed) {
                return false;
            }
        }

        const wordChange = beforeWordApply ? await beforeWordApply() : change;
        const applyWord = applyWordChange || applyChangeToWord;
        await applyWord(wordChange);
        if (afterWordApply) {
            await afterWordApply(wordChange);
        }
        if (onSuccess) {
            await onSuccess();
        }
        return true;
    } catch (error) {
        if (onError) {
            await onError(error);
            return false;
        }
        handleReviewActionError(actionName, error);
        return false;
    } finally {
        if (normalizedChangeId) {
            processingChangeIds.delete(normalizedChangeId);
        }
    }
}

function logReviewSemantics(stage, changeId, change, requestData) {
    const safeChangeId = String(changeId || '');

    if (isAiSelectionId(safeChangeId)) {
        const targetBlockIds = getAiSelectionTargetBlockIds();
        if (targetBlockIds.length === 0) {
            console.warn(`[semantic:${stage}] ai_selection 缺少 targetBlockIds`);
        }
        return;
    }

    if (change?.type === 'insert' || isInsertChangeId(safeChangeId)) {
        const targetBlockId = requestData?.targetBlockId || change?.targetId || getInsertTargetBlockId(safeChangeId);
        if (!targetBlockId) {
            console.warn(`[semantic:${stage}] insert_after 缺少 targetBlockId: ${safeChangeId}`);
        }
        return;
    }

    if (change?.type === 'delete' || isDeleteChangeId(safeChangeId)) {
        const targetBlockId = requestData?.targetBlockId || change?.targetId || getDeleteTargetBlockId(safeChangeId);
        if (!targetBlockId) {
            console.warn(`[semantic:${stage}] delete_ 缺少 targetBlockId: ${safeChangeId}`);
        }
    }
}

/**
 * 批量接受所有变更
 */
async function batchAcceptAll() {
    await executeBatchReviewAction(buildBatchAcceptOptions());
}

/**
 * 批量拒绝所有变更
 */
async function batchRejectAll() {
    await executeBatchReviewAction(buildBatchRejectOptions());
}

function buildBatchAcceptOptions() {
    return {
        actionLabel: REVIEW_ACTION.ACCEPT,
        doneLabel: REVIEW_DONE_LABEL.ACCEPT_ALL,
        action: acceptChange
    };
}

function buildBatchRejectOptions() {
    return {
        actionLabel: REVIEW_ACTION.REJECT,
        doneLabel: REVIEW_DONE_LABEL.REJECT_ALL,
        action: rejectChange
    };
}

async function executeBatchReviewAction(options) {
    const {
        actionLabel,
        doneLabel,
        action
    } = options;

    const changes = getPendingChangeIds();
    if (changes.length === 0) {
        appendMessage('system', REVIEW_SYSTEM_MESSAGE.NO_PENDING);
        return {
            totalCount: 0,
            successCount: 0,
            failedCount: 0
        };
    }

    const totalCount = changes.length;
    let successCount = 0;
    let failedCount = 0;
    isBatchReviewRunning = true;

    try {
        for (const changeId of changes) {
            try {
                const result = await action(changeId);
                if (result === false) {
                    failedCount++;
                } else {
                    successCount++;
                }
            } catch (error) {
                console.error(`${actionLabel} ${changeId} 失败:`, error);
                failedCount++;
            }
        }
    } finally {
        isBatchReviewRunning = false;
    }

    // 批量接受后统一同步一次，避免每条接受都重扫 Word。
    if (actionLabel === REVIEW_ACTION.ACCEPT && successCount > 0) {
        await syncDocumentFromWordToBackend({
            silent: true,
            updateStatus: false,
            showWordMarkers: true
        });
    }

    appendMessage('system', REVIEW_SYSTEM_MESSAGE.BATCH_RESULT(doneLabel, successCount, failedCount));
    return {
        totalCount,
        successCount,
        failedCount
    };
}

function getPendingChangeIds() {
    return Object.keys(changePool).filter(k => !isAcceptedChange(changePool[k]));
}

function getPendingChanges() {
    return Object.values(changePool).filter(isPendingChange);
}

function isAcceptedChange(change) {
    return !!change && change.status === REVIEW_STATUS.ACCEPTED;
}

function isPendingChange(change) {
    return !!change && change.status === REVIEW_STATUS.PENDING;
}

function logPendingChanges(pendingChanges, idOnly = false) {
    if (idOnly) {
        console.log(`[•] 当前有 ${pendingChanges.length} 个待审查的变更：`, pendingChanges.map(c => c.blockId));
        return;
    }

        console.log(`[•] 当前有 ${pendingChanges.length} 个待审查的变更`, pendingChanges);
        console.log(`[•] 当前有 ${pendingChanges.length} 个待审查的变更：`, pendingChanges.map(c => c.blockId));
}

/**
 * 处理 AI 修改为待审查状态（关键修复）
 * 当 DocPulse 助手完成分析后，将其修改转换为待审查的变更卡片而不是直接显示
 */
async function handleAIModificationsAsChanges(updatedBlockIds) {
    try {
        console.log('[~] 开始处理 AI 修改为待审查状态，涉及块数:', updatedBlockIds.length);
        
        // 1. 获取新的服务器状态（包含 AI 的修改）
        const serverState = await fetchServerDocumentState();
        
        console.log(`[•] 获取服务器状态：${Object.keys(serverState).length} 个区块`);

        const snapshot = paragraphOrchestrator.buildPendingChangesFromAI({
            localDocState,
            changePool,
            initialDocState,
            updatedBlockIds,
            serverState,
            aiSelectionInitialContent,
            selectionTargetMap,
            parseInsertTargetBlockId: getInsertTargetBlockId,
            parseDeleteTargetBlockId: getDeleteTargetBlockId
        });

        changePool = snapshot.changePool;
        
        // 4. 渲染文档视图以显示待审查的修改
        await renderDocumentView();
        
        // 显示待审查变更数量
        const pendingChanges = getPendingChanges();
        logPendingChanges(pendingChanges, true);
        syncRuntimeMirrorFromCurrentState();
        appendMessage('system', REVIEW_SYSTEM_MESSAGE.REVIEW_NEEDED(pendingChanges.length));
        
    } catch (error) {
        console.error('[x] 处理 AI 修改失败:', error);
        appendMessage('system', REVIEW_SYSTEM_MESSAGE.REVIEW_FAILED(error.message));
    }
}

async function fetchServerDocumentState() {
    const response = await fetch('/api/document');
    const result = await response.json();
    return result.data || result;
}
