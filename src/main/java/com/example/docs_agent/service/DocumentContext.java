package com.example.docs_agent.service;

import com.example.docs_agent.entity.Block;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 文档上下文服务
 * 核心状态类：文档的内存载体，将文档抽象为一个个带有唯一 ID 的 Block（区块）
 */
@Slf4j
@Service
public class DocumentContext {

    private static final class DocumentState {
        private final Map<String, Integer> blockToParaIndex = new LinkedHashMap<>();
        private final Map<String, Block> blocks = new LinkedHashMap<>();
        private final UndoRedoService undoRedoService = new UndoRedoService();
    }

    private final Map<String, DocumentState> documentStates = new ConcurrentHashMap<>();

    private DocumentState getCurrentState() {
        String docId = DocumentScopeContext.getCurrentDocId();
        return documentStates.computeIfAbsent(docId, key -> new DocumentState());
    }

    /**
     * 区块 ID 与 Word 段落索引的映射
     */
    // 说明：字段已迁移到 DocumentState，避免多文档共享同一内存态。

    /**
     * 设置区块 ID 与 Word 段落索引的映射（扫描 Word 时调用）
     *
     * @param mapping 映射关系
     */
    public void setBlockToParaIndex(Map<String, Integer> mapping) {
        DocumentState state = getCurrentState();
        state.blockToParaIndex.clear();
        state.blockToParaIndex.putAll(mapping);
        log.debug("设置区块与段落索引映射，共 {} 个区块", mapping.size());
    }

    /**
     * 获取区块 ID 与 Word 段落索引的映射
     *
     * @return 不可修改的映射副本
     */
    public Map<String, Integer> getBlockToParaIndex() {
        DocumentState state = getCurrentState();
        return Collections.unmodifiableMap(new LinkedHashMap<>(state.blockToParaIndex));
    }

    /**
     * 获取指定区块
     *
     * @param blockId 区块 ID
     * @return 区块对象，不存在返回 null
     */
    public Block getBlock(String blockId) {
        DocumentState state = getCurrentState();
        return state.blocks.get(blockId);
    }

    /**
     * 在指定区块后面插入新段落
     * 生成新的blockId并在LinkedHashMap中插入
     *
     * @param afterBlockId 目标段落的ID（新段落将插入在其后面）
     * @param newText 新段落的内容
     * @return 新生成的 blockId
     */
    public String insertBlockAfter(String afterBlockId, String newText) {
        DocumentState state = getCurrentState();
        // 生成新的 blockId：p_current_max_index + 1
        int maxIndex = 0;
        for (String blockId : state.blocks.keySet()) {
            if (blockId.startsWith("p_")) {
                try {
                    int index = Integer.parseInt(blockId.substring(2));
                    maxIndex = Math.max(maxIndex, index);
                } catch (NumberFormatException e) {
                    // 忽略非标准格式的blockId
                }
            }
        }
        String newBlockId = "p_" + (maxIndex + 1);
        
        // 在LinkedHashMap中的正确位置插入新段落
        // 需要重建LinkedHashMap来保证顺序
        Map<String, Block> newBlocks = new LinkedHashMap<>();
        boolean inserted = false;
        
        for (Map.Entry<String, Block> entry : state.blocks.entrySet()) {
            newBlocks.put(entry.getKey(), entry.getValue());
            if (!inserted && entry.getKey().equals(afterBlockId)) {
                // 在找到目标段落后添加新段落
                newBlocks.put(newBlockId, new Block(newText));
                inserted = true;
            }
        }
        
        // 如果没有找到afterBlockId，就直接追加到末尾
        if (!inserted) {
            newBlocks.put(newBlockId, new Block(newText));
            log.warn("未找到目标段落 [{}]，新段落 [{}] 已追加到末尾", afterBlockId, newBlockId);
        } else {
            log.info("新段落 [{}] 已插入到 [{}] 之后，内容长度: {}", newBlockId, afterBlockId, 
                     newText != null ? newText.length() : 0);
        }
        
        // 清空原blocks并重新加载
        state.blocks.clear();
        state.blocks.putAll(newBlocks);
        
        return newBlockId;
    }

    /**
     * 在指定区块前面插入新段落
     * 生成新的blockId并在LinkedHashMap中插入
     *
     * @param beforeBlockId 目标段落的ID（新段落将插入在其前面）
     * @param newText 新段落的内容
     * @return 新生成的 blockId
     */
    public String insertBlockBefore(String beforeBlockId, String newText) {
        DocumentState state = getCurrentState();
        // 生成新的 blockId：p_current_max_index + 1
        int maxIndex = 0;
        for (String blockId : state.blocks.keySet()) {
            if (blockId.startsWith("p_")) {
                try {
                    int index = Integer.parseInt(blockId.substring(2));
                    maxIndex = Math.max(maxIndex, index);
                } catch (NumberFormatException e) {
                    // 忽略非标准格式的blockId
                }
            }
        }
        String newBlockId = "p_" + (maxIndex + 1);
        
        // 在LinkedHashMap中的正确位置插入新段落
        // 需要重建LinkedHashMap来保证顺序
        Map<String, Block> newBlocks = new LinkedHashMap<>();
        boolean inserted = false;
        
        for (Map.Entry<String, Block> entry : state.blocks.entrySet()) {
            if (!inserted && entry.getKey().equals(beforeBlockId)) {
                // 在找到目标段落前添加新段落
                newBlocks.put(newBlockId, new Block(newText));
                inserted = true;
            }
            newBlocks.put(entry.getKey(), entry.getValue());
        }
        
        // 如果没有找到beforeBlockId，就直接追加到末尾
        if (!inserted) {
            newBlocks.put(newBlockId, new Block(newText));
            log.warn("未找到目标段落 [{}]，新段落 [{}] 已追加到末尾", beforeBlockId, newBlockId);
        } else {
            log.info("新段落 [{}] 已插入到 [{}] 之前，内容长度: {}", newBlockId, beforeBlockId, 
                     newText != null ? newText.length() : 0);
        }
        
        // 清空原blocks并重新加载
        state.blocks.clear();
        state.blocks.putAll(newBlocks);
        
        return newBlockId;
    }

    /**
     * 查找指定逻辑段落前一个逻辑段落 ID（仅 p_ 前缀）。
     *
     * @param blockId 当前逻辑段落 ID
     * @return 前一个逻辑段落 ID；如果不存在则返回 null
     */
    public String findPreviousLogicalBlockId(String blockId) {
        DocumentState state = getCurrentState();
        String previousLogical = null;
        for (String currentId : state.blocks.keySet()) {
            if (!currentId.startsWith("p_")) {
                continue;
            }

            if (currentId.equals(blockId)) {
                return previousLogical;
            }

            previousLogical = currentId;
        }
        return null;
    }

    /**
     * 更新指定区块的文本（Agent 调用的核心方法）
     *
     * @param blockId 区块 ID
     * @param newText 新文本内容
     */
    public void updateBlock(String blockId, String newText) {
        DocumentState state = getCurrentState();
        Block block = state.blocks.get(blockId);
        if (block != null) {
            block.setContent(newText);
            log.debug("更新区块 [{}]，新内容长度: {}", blockId, newText != null ? newText.length() : 0);
        } else {
            state.blocks.put(blockId, new Block(newText));
            log.debug("新增区块 [{}]，内容长度: {}", blockId, newText != null ? newText.length() : 0);
        }
    }

    /**
     * 删除指定的区块
     *
     * @param blockId 要删除的区块 ID
     */
    public void deleteBlock(String blockId) {
        DocumentState state = getCurrentState();
        if (state.blocks.remove(blockId) != null) {
            log.info("删除区块 [{}]", blockId);
        } else {
            log.warn("要删除的区块 [{}] 不存在", blockId);
        }
    }

    /**
     * 获取当前文档的全貌（供 Agent 阅读上下文）
     *
     * @return 格式化的文档内容字符串
     */
    public String getAllBlocksAsString() {
        DocumentState state = getCurrentState();
        StringBuilder sb = new StringBuilder();
        sb.append("--- 当前文档内容 ---\n");
        for (Map.Entry<String, Block> entry : state.blocks.entrySet()) {
            sb.append(String.format("[%s]: %s\n", entry.getKey(), entry.getValue().getContent()));
        }
        sb.append("--------------------\n");
        return sb.toString();
    }

    /**
     * 获取所有区块的 Map 集合（供 RESTful API 返回 JSON 使用）
     *
     * @return 区块映射的副本
     */
    public Map<String, Block> getAllBlocksAsMap() {
        DocumentState state = getCurrentState();
        // 返回一个拷贝，防止外部直接修改底层数据结构
        return new LinkedHashMap<>(state.blocks);
    }

    /**
     * 清空内存
     */
    public void clearAll() {
        DocumentState state = getCurrentState();
        state.blocks.clear();
        log.debug("清空所有文档区块");
    }

    /**
     * 获取区块数量
     *
     * @return 区块数量
     */
    public int getBlockCount() {
        DocumentState state = getCurrentState();
        return state.blocks.size();
    }

    // ========== 撤销/重做功能 ==========

    /**
     * 保存当前文档状态快照
     *
     * @param operationType 操作类型
     * @param description 操作描述
     */
    public void saveSnapshot(String operationType, String description) {
        DocumentState state = getCurrentState();
        state.undoRedoService.saveSnapshot(new LinkedHashMap<>(state.blocks), operationType, description);
    }

    /**
     * 撤销上一次操作
     *
     * @return true 如果撤销成功
     */
    public boolean undo() {
        DocumentState state = getCurrentState();
        UndoRedoService.DocumentSnapshot snapshot = state.undoRedoService.undo(new LinkedHashMap<>(state.blocks));
        if (snapshot != null) {
            state.blocks.clear();
            state.blocks.putAll(snapshot.getBlocks());
            log.info("撤销成功，恢复到: {}", snapshot.getDescription());
            return true;
        }
        return false;
    }

    /**
     * 重做上一次撤销的操作
     *
     * @return true 如果重做成功
     */
    public boolean redo() {
        DocumentState state = getCurrentState();
        UndoRedoService.DocumentSnapshot snapshot = state.undoRedoService.redo(new LinkedHashMap<>(state.blocks));
        if (snapshot != null) {
            state.blocks.clear();
            state.blocks.putAll(snapshot.getBlocks());
            log.info("重做成功，恢复到: {}", snapshot.getDescription());
            return true;
        }
        return false;
    }

    /**
     * 是否可以撤销
     *
     * @return true 如果可以撤销
     */
    public boolean canUndo() {
        DocumentState state = getCurrentState();
        return state.undoRedoService.canUndo();
    }

    /**
     * 是否可以重做
     *
     * @return true 如果可以重做
     */
    public boolean canRedo() {
        DocumentState state = getCurrentState();
        return state.undoRedoService.canRedo();
    }

    /**
     * 清空撤销历史
     */
    public void clearUndoHistory() {
        DocumentState state = getCurrentState();
        state.undoRedoService.clearHistory();
    }

    /**
     * 恢复区块数据（用于撤销/重做）
     *
     * @param newBlocks 新的区块数据
     */
    public void restoreBlocks(Map<String, Block> newBlocks) {
        DocumentState state = getCurrentState();
        state.blocks.clear();
        state.blocks.putAll(newBlocks);
        log.debug("恢复文档状态，共 {} 个区块", state.blocks.size());
    }
}
