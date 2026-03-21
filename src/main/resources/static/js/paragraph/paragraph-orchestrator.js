/**
 * 段落编排器（Phase 1）
 * 目标：收敛高频状态流转入口，不改变现有业务行为。
 */
(function (global) {
    function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj || {}));
    }

    function getBlockContent(block) {
        return (typeof block === 'object' && block !== null) ? block.content : block;
    }

    function buildAiSelectionPendingChange(aiSelectionInitialContent, selectionTargetMap, aiContent) {
        return {
            blockId: 'ai_selection',
            type: 'update',
            initialContent: aiSelectionInitialContent,
            oldContent: aiSelectionInitialContent || '',
            newContent: aiContent || '',
            targetIds: selectionTargetMap?.ai_selection || [],
            status: 'pending',
            isVirtualChange: true
        };
    }

    function buildUpdatePendingChange(blockId, initialContent, oldContent, newContent) {
        return {
            blockId,
            type: 'update',
            initialContent,
            oldContent: oldContent || '',
            newContent: newContent || '',
            status: 'pending'
        };
    }

    function buildInsertPendingChange(blockId, targetId, newContent) {
        return {
            blockId,
            type: 'insert',
            targetId,
            initialContent: '',
            oldContent: '',
            newContent: newContent || '',
            status: 'pending'
        };
    }

    function buildDeletePendingChange(changeId, targetId, initialContent, oldContent) {
        return {
            blockId: changeId,
            type: 'delete',
            targetId,
            initialContent,
            oldContent: oldContent || '',
            newContent: '',
            status: 'pending'
        };
    }

    function isPendingChange(change) {
        return !!change && change.status === 'pending';
    }

    function splitSingleAiSelectionContentToTargets(content, targetBlockIds, aiSelectionTargetBlocks) {
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
            const cut = findBestCutPosition(safeContent, expectedCut, start, targetCount - i - 1);
            result.push(safeContent.substring(start, cut).trim());
            start = cut;
        }

        while (result.length < targetCount) {
            result.push('');
        }

        return result;
    }

    function findBestCutPosition(content, expectedCut, start, remainingChunks) {
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
            if (!/[\s。！？!?；;，,]/.test(prevChar || '')) {
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

    function buildAcceptedLocalState(payload) {
        const {
            localDocState,
            changePool,
            changeId,
            change,
            selectionTargetMap,
            aiSelectionInitialContent,
            aiSelectionTargetBlocks
        } = payload;

        const nextLocalDocState = { ...(localDocState || {}) };
        const nextChangePool = { ...(changePool || {}) };
        let nextAiSelectionInitialContent = aiSelectionInitialContent;
        let nextAiSelectionTargetBlocks = { ...(aiSelectionTargetBlocks || {}) };

        if (changeId === 'ai_selection') {
            const targetBlockIds = selectionTargetMap?.ai_selection || [];
            if (targetBlockIds.length > 0) {
                const contentParagraphs = String(change?.newContent || '')
                    .split('\n')
                    .map((p) => p.trim())
                    .filter((p) => p.length > 0);

                if (contentParagraphs.length === targetBlockIds.length) {
                    targetBlockIds.forEach((targetId, index) => {
                        nextLocalDocState[targetId] = { content: contentParagraphs[index] };
                        delete nextChangePool[targetId];
                    });
                } else if (contentParagraphs.length === 1) {
                    const distributed = splitSingleAiSelectionContentToTargets(contentParagraphs[0], targetBlockIds, nextAiSelectionTargetBlocks);
                    targetBlockIds.forEach((targetId, index) => {
                        nextLocalDocState[targetId] = { content: distributed[index] };
                        delete nextChangePool[targetId];
                    });
                } else {
                    nextLocalDocState[targetBlockIds[0]] = { content: change?.newContent };
                }

                delete nextLocalDocState.ai_selection;
            }

            nextAiSelectionInitialContent = null;
            nextAiSelectionTargetBlocks = {};
        } else if (change?.type === 'insert') {
            let maxIndex = -1;
            for (const blockId of Object.keys(nextLocalDocState)) {
                if (!blockId.startsWith('p_')) {
                    continue;
                }
                const index = parseInt(blockId.substring(2), 10);
                if (!Number.isNaN(index)) {
                    maxIndex = Math.max(maxIndex, index);
                }
            }
            const newBlockId = `p_${maxIndex + 1}`;
            const targetBlockId = change?.targetId;

            const rebuilt = {};
            let inserted = false;
            for (const [blockId, block] of Object.entries(nextLocalDocState)) {
                if (blockId.startsWith('insert_after_') || blockId.startsWith('delete_') || blockId === 'ai_selection') {
                    continue;
                }

                rebuilt[blockId] = block;
                if (!inserted && blockId === targetBlockId) {
                    rebuilt[newBlockId] = { content: change?.newContent };
                    inserted = true;
                }
            }

            if (!inserted) {
                rebuilt[newBlockId] = { content: change?.newContent };
            }

            for (const key of Object.keys(nextLocalDocState)) {
                delete nextLocalDocState[key];
            }
            Object.assign(nextLocalDocState, rebuilt);
        } else if (change?.type === 'update') {
            const targetId = change?.targetId || changeId;
            nextLocalDocState[targetId] = { content: change?.newContent };
        } else if (change?.type === 'delete') {
            const targetId = change?.targetId || String(changeId).replace('delete_', '');
            delete nextLocalDocState[targetId];

            for (const key of Object.keys(nextLocalDocState)) {
                if (key.startsWith('delete_') && key.includes(targetId)) {
                    delete nextLocalDocState[key];
                }
            }
        }

        delete nextChangePool[changeId];

        return {
            localDocState: nextLocalDocState,
            changePool: nextChangePool,
            aiSelectionInitialContent: nextAiSelectionInitialContent,
            aiSelectionTargetBlocks: nextAiSelectionTargetBlocks
        };
    }

    function buildRejectedLocalState(payload) {
        const {
            localDocState,
            changePool,
            changeId,
            change,
            selectionTargetMap,
            aiSelectionTargetBlocks
        } = payload;

        const nextLocalDocState = { ...(localDocState || {}) };
        const nextChangePool = { ...(changePool || {}) };
        let nextAiSelectionInitialContent = null;
        let nextAiSelectionTargetBlocks = { ...(aiSelectionTargetBlocks || {}) };

        if (changeId === 'ai_selection') {
            const targetBlockIds = selectionTargetMap?.ai_selection || [];
            targetBlockIds.forEach((blockId) => {
                if (nextAiSelectionTargetBlocks[blockId] !== undefined) {
                    nextLocalDocState[blockId] = { content: nextAiSelectionTargetBlocks[blockId] };
                }
            });
            delete nextLocalDocState.ai_selection;
            nextAiSelectionTargetBlocks = {};
        } else if (change?.type === 'insert') {
            const virtualBlockIds = Object.keys(nextLocalDocState).filter((bid) =>
                bid.startsWith('insert_after_') && bid.includes(String(changeId).replace('insert_after_', ''))
            );
            virtualBlockIds.forEach((bid) => delete nextLocalDocState[bid]);
            delete nextLocalDocState[changeId];
        } else if (change?.type === 'update' || change?.type === 'delete') {
            const targetId = change?.targetId || String(changeId).replace('delete_', '');
            const initialContent = change?.initialContent ?? change?.oldContent;
            if (initialContent !== undefined) {
                nextLocalDocState[targetId] = { content: initialContent };
            }

            if (change?.type === 'delete') {
                const virtualBlockIds = Object.keys(nextLocalDocState).filter((bid) =>
                    bid.startsWith('delete_') && bid.includes(targetId)
                );
                virtualBlockIds.forEach((bid) => delete nextLocalDocState[bid]);
            }
        }

        delete nextChangePool[changeId];

        return {
            localDocState: nextLocalDocState,
            changePool: nextChangePool,
            aiSelectionInitialContent: nextAiSelectionInitialContent,
            aiSelectionTargetBlocks: nextAiSelectionTargetBlocks
        };
    }

    function buildPendingChangesFromAI(payload) {
        const {
            localDocState,
            changePool,
            initialDocState,
            updatedBlockIds,
            serverState,
            aiSelectionInitialContent,
            selectionTargetMap,
            parseInsertTargetBlockId,
            parseDeleteTargetBlockId
        } = payload;

        const nextChangePool = { ...(changePool || {}) };
        const safeUpdatedBlockIds = Array.isArray(updatedBlockIds) ? updatedBlockIds : [];
        const safeServerState = serverState || {};

        for (const blockId of safeUpdatedBlockIds) {
            // 虚拟草稿块由后续专门分支处理，避免被误判为普通 update。
            if (blockId === 'ai_selection' || blockId.startsWith('insert_after_') || blockId.startsWith('delete_')) {
                continue;
            }

            const oldContent = getBlockContent(localDocState?.[blockId]);

            const serverBlock = safeServerState[blockId];
            const newContent = getBlockContent(serverBlock);

            if (newContent && newContent !== oldContent) {
                const initialContent = initialDocState?.[blockId] || oldContent;
                nextChangePool[blockId] = buildUpdatePendingChange(
                    blockId,
                    initialContent,
                    oldContent,
                    newContent
                );
            }
        }

        for (const [blockId, serverBlock] of Object.entries(safeServerState)) {
            if (blockId === 'ai_selection') {
                const aiContent = getBlockContent(serverBlock);

                if (aiContent && aiContent !== aiSelectionInitialContent) {
                    nextChangePool.ai_selection = buildAiSelectionPendingChange(
                        aiSelectionInitialContent,
                        selectionTargetMap,
                        aiContent
                    );
                }
                continue;
            }

            if (blockId.startsWith('insert_after_') && !localDocState?.[blockId]) {
                const newContent = getBlockContent(serverBlock);
                const existingChange = nextChangePool[blockId];
                if (isPendingChange(existingChange)) {
                    continue;
                }

                const targetId = parseInsertTargetBlockId ? (parseInsertTargetBlockId(blockId) || blockId) : blockId;
                nextChangePool[blockId] = buildInsertPendingChange(blockId, targetId, newContent);
                continue;
            }

            if (blockId.startsWith('insert_after_') && safeUpdatedBlockIds.includes(blockId)) {
                const newContent = getBlockContent(serverBlock);
                const existingChange = nextChangePool[blockId];
                if (isPendingChange(existingChange)) {
                    continue;
                }

                const targetId = parseInsertTargetBlockId ? (parseInsertTargetBlockId(blockId) || blockId) : blockId;
                nextChangePool[blockId] = buildInsertPendingChange(blockId, targetId, newContent);
                continue;
            }

            if (blockId.startsWith('delete_')) {
                const serverContent = getBlockContent(serverBlock);
                if (serverContent === '[DELETED_MARKER]' && safeUpdatedBlockIds.includes(blockId)) {
                    const targetDeleteBlockId = parseDeleteTargetBlockId ? parseDeleteTargetBlockId(blockId) : null;
                    if (!targetDeleteBlockId) {
                        continue;
                    }

                    const existingChange = nextChangePool[blockId];
                    if (isPendingChange(existingChange)) {
                        continue;
                    }

                    const originalContent = getBlockContent(localDocState?.[targetDeleteBlockId]);
                    const trueInitialContent = initialDocState?.[targetDeleteBlockId] || originalContent || '';
                    nextChangePool[blockId] = buildDeletePendingChange(
                        blockId,
                        targetDeleteBlockId,
                        trueInitialContent,
                        originalContent
                    );
                }
            }
        }

        return { changePool: nextChangePool };
    }

    function buildChangePoolFromServerState(payload) {
        const {
            localDocState,
            changePool,
            initialDocState,
            serverState,
            aiSelectionInitialContent,
            selectionTargetMap,
            parseInsertTargetBlockId,
            parseDeleteTargetBlockId
        } = payload;

        const nextChangePool = { ...(changePool || {}) };
        const safeServerState = serverState || {};

        for (const [blockId, serverBlock] of Object.entries(safeServerState)) {
            const serverContent = getBlockContent(serverBlock);

            const localBlock = localDocState?.[blockId];
            const localContent = getBlockContent(localBlock);

            if (blockId === 'ai_selection') {
                continue;
            }

            if (blockId.startsWith('delete_') && serverContent === '[DELETED_MARKER]') {
                const targetDeleteBlockId = parseDeleteTargetBlockId ? parseDeleteTargetBlockId(blockId) : null;
                if (targetDeleteBlockId) {
                    const deleteChangeId = blockId;
                    const existingChange = nextChangePool[deleteChangeId];
                    if (existingChange && existingChange.status === 'pending') {
                        continue;
                    }

                    const originalContent = getBlockContent(localDocState?.[targetDeleteBlockId]);

                    const trueInitialContent = initialDocState?.[targetDeleteBlockId] || originalContent || '';
                    nextChangePool[deleteChangeId] = buildDeletePendingChange(
                        deleteChangeId,
                        targetDeleteBlockId,
                        trueInitialContent,
                        originalContent
                    );
                    continue;
                }
            }

            if (blockId.startsWith('insert_after_') && !localBlock) {
                let targetId = blockId;
                const parsedTargetId = parseInsertTargetBlockId ? parseInsertTargetBlockId(blockId) : null;
                if (parsedTargetId) {
                    targetId = parsedTargetId;
                }

                const existingChange = nextChangePool[blockId];
                if (isPendingChange(existingChange)) {
                    continue;
                }

                nextChangePool[blockId] = buildInsertPendingChange(blockId, targetId, serverContent);
                continue;
            }

            const existingChange = nextChangePool[blockId];
            if (isPendingChange(existingChange)) {
                continue;
            }

            if (!localBlock) {
                nextChangePool[blockId] = buildInsertPendingChange(blockId, blockId, serverContent);
            } else if (serverContent !== localContent) {
                const trueInitialContent = initialDocState?.[blockId] || localContent;
                nextChangePool[blockId] = buildUpdatePendingChange(
                    blockId,
                    trueInitialContent,
                    localContent,
                    serverContent
                );
            }
        }

        for (const blockId of Object.keys(localDocState || {})) {
            if (!safeServerState[blockId] && blockId !== 'ai_selection' && !blockId.startsWith('delete_') && !blockId.startsWith('insert_after_')) {
                const localBlock = localDocState[blockId];
                const localContent = getBlockContent(localBlock);

                const deleteChangeId = `delete_${blockId}`;
                const existingChange = nextChangePool[deleteChangeId];
                if (isPendingChange(existingChange)) {
                    continue;
                }

                const trueInitialContent = initialDocState?.[blockId] || localContent;
                nextChangePool[deleteChangeId] = buildDeletePendingChange(
                    deleteChangeId,
                    blockId,
                    trueInitialContent,
                    localContent
                );
            }
        }

        const aiBlock = safeServerState.ai_selection;
        if (aiBlock) {
            const aiContent = getBlockContent(aiBlock);
            if (aiContent && aiContent !== aiSelectionInitialContent) {
                const existingAiChange = nextChangePool.ai_selection;
                if (!isPendingChange(existingAiChange)) {
                    nextChangePool.ai_selection = buildAiSelectionPendingChange(
                        aiSelectionInitialContent,
                        selectionTargetMap,
                        aiContent
                    );
                }
            }
        }

        return { changePool: nextChangePool };
    }

    function buildInitState(serverState) {
        const safeState = serverState || {};
        return {
            localDocState: { ...safeState },
            initialDocState: deepClone(safeState),
            changePool: {}
        };
    }

    function clearSelectionRuntimeState() {
        return {
            selectionTargetMap: {},
            aiSelectionInitialContent: null,
            aiSelectionTargetBlocks: {},
            lastLockedSelection: null
        };
    }

    function syncRuntimeMirror(snapshot) {
        if (!global.ParagraphRuntime || !snapshot) {
            return;
        }

        if (snapshot.localDocState !== undefined) {
            global.ParagraphRuntime.docState = snapshot.localDocState;
        }
        if (snapshot.changePool !== undefined) {
            global.ParagraphRuntime.changeState = snapshot.changePool;
        }

        const selectionState = global.ParagraphRuntime.selectionState || {};
        if (snapshot.selectionTargetMap !== undefined) {
            selectionState.targetMap = snapshot.selectionTargetMap;
        }
        if (snapshot.aiSelectionInitialContent !== undefined) {
            selectionState.initialSelectionContent = snapshot.aiSelectionInitialContent;
        }
        if (snapshot.aiSelectionTargetBlocks !== undefined) {
            selectionState.targetBlocksInitial = snapshot.aiSelectionTargetBlocks;
        }
        global.ParagraphRuntime.selectionState = selectionState;
    }

    global.ParagraphOrchestrator = {
        buildInitState,
        clearSelectionRuntimeState,
        syncRuntimeMirror,
        buildAcceptedLocalState,
        buildRejectedLocalState,
        buildPendingChangesFromAI,
        buildChangePoolFromServerState
    };
})(window);
