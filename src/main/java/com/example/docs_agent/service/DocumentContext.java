package com.example.docs_agent.service;

import com.example.docs_agent.entity.Block;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 文档上下文服务
 * 核心状态类：文档的内存载体，将文档抽象为一个个带有唯一 ID 的 Block（区块）
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DocumentContext {

    /**
     * 区块 ID 与 Word 段落索引的映射
     */
    private final Map<String, Integer> blockToParaIndex = new LinkedHashMap<>();

    /**
     * 使用 LinkedHashMap 保持区块的插入顺序（即文档的阅读顺序）
     */
    private final Map<String, Block> blocks = new LinkedHashMap<>();

    /**
     * 撤销/重做服务
     */
    private final UndoRedoService undoRedoService;

    /**
     * 设置区块 ID 与 Word 段落索引的映射（扫描 Word 时调用）
     *
     * @param mapping 映射关系
     */
    public void setBlockToParaIndex(Map<String, Integer> mapping) {
        blockToParaIndex.clear();
        blockToParaIndex.putAll(mapping);
        log.debug("设置区块与段落索引映射，共 {} 个区块", mapping.size());
    }

    /**
     * 获取区块 ID 与 Word 段落索引的映射
     *
     * @return 不可修改的映射副本
     */
    public Map<String, Integer> getBlockToParaIndex() {
        return Collections.unmodifiableMap(blockToParaIndex);
    }

    /**
     * 获取指定区块
     *
     * @param blockId 区块 ID
     * @return 区块对象，不存在返回 null
     */
    public Block getBlock(String blockId) {
        return blocks.get(blockId);
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
        // 生成新的 blockId：p_current_max_index + 1
        int maxIndex = 0;
        for (String blockId : blocks.keySet()) {
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
        
        for (Map.Entry<String, Block> entry : blocks.entrySet()) {
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
        blocks.clear();
        blocks.putAll(newBlocks);
        
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
        // 生成新的 blockId：p_current_max_index + 1
        int maxIndex = 0;
        for (String blockId : blocks.keySet()) {
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
        
        for (Map.Entry<String, Block> entry : blocks.entrySet()) {
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
        blocks.clear();
        blocks.putAll(newBlocks);
        
        return newBlockId;
    }

    /**
     * 查找指定逻辑段落前一个逻辑段落 ID（仅 p_ 前缀）。
     *
     * @param blockId 当前逻辑段落 ID
     * @return 前一个逻辑段落 ID；如果不存在则返回 null
     */
    public String findPreviousLogicalBlockId(String blockId) {
        String previousLogical = null;
        for (String currentId : blocks.keySet()) {
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
        Block block = blocks.get(blockId);
        if (block != null) {
            block.setContent(newText);
            log.debug("更新区块 [{}]，新内容长度: {}", blockId, newText != null ? newText.length() : 0);
        } else {
            blocks.put(blockId, new Block(newText));
            log.debug("新增区块 [{}]，内容长度: {}", blockId, newText != null ? newText.length() : 0);
        }
    }

    /**
     * 删除指定的区块
     *
     * @param blockId 要删除的区块 ID
     */
    public void deleteBlock(String blockId) {
        if (blocks.remove(blockId) != null) {
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
        StringBuilder sb = new StringBuilder();
        sb.append("--- 当前文档内容 ---\n");
        for (Map.Entry<String, Block> entry : blocks.entrySet()) {
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
        // 返回一个拷贝，防止外部直接修改底层数据结构
        return new LinkedHashMap<>(blocks);
    }

    /**
     * 清空内存
     */
    public void clearAll() {
        blocks.clear();
        log.debug("清空所有文档区块");
    }

    /**
     * 获取区块数量
     *
     * @return 区块数量
     */
    public int getBlockCount() {
        return blocks.size();
    }

    // ========== 撤销/重做功能 ==========

    /**
     * 保存当前文档状态快照
     *
     * @param operationType 操作类型
     * @param description 操作描述
     */
    public void saveSnapshot(String operationType, String description) {
        undoRedoService.saveSnapshot(new LinkedHashMap<>(blocks), operationType, description);
    }

    /**
     * 撤销上一次操作
     *
     * @return true 如果撤销成功
     */
    public boolean undo() {
        UndoRedoService.DocumentSnapshot snapshot = undoRedoService.undo(new LinkedHashMap<>(blocks));
        if (snapshot != null) {
            blocks.clear();
            blocks.putAll(snapshot.getBlocks());
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
        UndoRedoService.DocumentSnapshot snapshot = undoRedoService.redo(new LinkedHashMap<>(blocks));
        if (snapshot != null) {
            blocks.clear();
            blocks.putAll(snapshot.getBlocks());
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
        return undoRedoService.canUndo();
    }

    /**
     * 是否可以重做
     *
     * @return true 如果可以重做
     */
    public boolean canRedo() {
        return undoRedoService.canRedo();
    }

    /**
     * 清空撤销历史
     */
    public void clearUndoHistory() {
        undoRedoService.clearHistory();
    }

    /**
     * 恢复区块数据（用于撤销/重做）
     *
     * @param newBlocks 新的区块数据
     */
    public void restoreBlocks(Map<String, Block> newBlocks) {
        blocks.clear();
        blocks.putAll(newBlocks);
        log.debug("恢复文档状态，共 {} 个区块", blocks.size());
    }
}
