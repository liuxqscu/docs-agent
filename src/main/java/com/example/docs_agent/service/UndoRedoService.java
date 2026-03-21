package com.example.docs_agent.service;

import com.example.docs_agent.entity.Block;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * 撤销/重做服务
 * 管理文档操作的历史记录，支持撤销和重做功能
 */
@Slf4j
@Service
public class UndoRedoService {

    /**
     * 历史记录栈（用于撤销）
     */
    private final Deque<DocumentSnapshot> undoStack = new ArrayDeque<>();

    /**
     * 重做栈
     */
    private final Deque<DocumentSnapshot> redoStack = new ArrayDeque<>();

    /**
     * 最大历史记录数
     */
    private static final int MAX_HISTORY_SIZE = 50;

    /**
     * 文档快照类
     */
    public static class DocumentSnapshot {
        private final Map<String, Block> blocks;
        private final String operationType;
        private final String description;
        private final long timestamp;

        public DocumentSnapshot(Map<String, Block> blocks, String operationType, String description) {
            // 深拷贝区块数据
            this.blocks = new LinkedHashMap<>();
            for (Map.Entry<String, Block> entry : blocks.entrySet()) {
                this.blocks.put(entry.getKey(), new Block(entry.getValue().getContent()));
            }
            this.operationType = operationType;
            this.description = description;
            this.timestamp = System.currentTimeMillis();
        }

        public Map<String, Block> getBlocks() {
            return new LinkedHashMap<>(blocks);
        }

        public String getOperationType() {
            return operationType;
        }

        public String getDescription() {
            return description;
        }

        public long getTimestamp() {
            return timestamp;
        }
    }

    /**
     * 保存文档快照（在执行操作前调用）
     *
     * @param blocks 当前文档状态
     * @param operationType 操作类型
     * @param description 操作描述
     */
    public void saveSnapshot(Map<String, Block> blocks, String operationType, String description) {
        // 清除重做栈（新的操作分支）
        redoStack.clear();

        // 保存新快照
        DocumentSnapshot snapshot = new DocumentSnapshot(blocks, operationType, description);
        undoStack.push(snapshot);

        // 限制历史记录数量
        while (undoStack.size() > MAX_HISTORY_SIZE) {
            undoStack.removeLast();
        }

        log.debug("保存文档快照: {} - {}", operationType, description);
    }

    /**
     * 是否可以撤销
     *
     * @return true 如果可以撤销
     */
    public boolean canUndo() {
        return !undoStack.isEmpty();
    }

    /**
     * 是否可以重做
     *
     * @return true 如果可以重做
     */
    public boolean canRedo() {
        return !redoStack.isEmpty();
    }

    /**
     * 撤销操作
     *
     * @param currentBlocks 当前文档状态（用于重做）
     * @return 上一个状态的快照，如果没有可撤销的返回 null
     */
    public DocumentSnapshot undo(Map<String, Block> currentBlocks) {
        if (!canUndo()) {
            log.debug("没有可撤销的操作");
            return null;
        }

        // 保存当前状态到重做栈
        DocumentSnapshot currentSnapshot = new DocumentSnapshot(currentBlocks, "UNDO", "撤销前的状态");
        redoStack.push(currentSnapshot);

        // 弹出并返回上一个状态
        DocumentSnapshot previousSnapshot = undoStack.pop();
        log.info("撤销操作: {} - {}", previousSnapshot.getOperationType(), previousSnapshot.getDescription());

        return previousSnapshot;
    }

    /**
     * 重做操作
     *
     * @param currentBlocks 当前文档状态（用于撤销）
     * @return 下一个状态的快照，如果没有可重做的返回 null
     */
    public DocumentSnapshot redo(Map<String, Block> currentBlocks) {
        if (!canRedo()) {
            log.debug("没有可重做的操作");
            return null;
        }

        // 保存当前状态到撤销栈
        DocumentSnapshot currentSnapshot = new DocumentSnapshot(currentBlocks, "REDO", "重做前的状态");
        undoStack.push(currentSnapshot);

        // 弹出并返回下一个状态
        DocumentSnapshot nextSnapshot = redoStack.pop();
        log.info("重做操作: {} - {}", nextSnapshot.getOperationType(), nextSnapshot.getDescription());

        return nextSnapshot;
    }

    /**
     * 获取撤销历史列表（用于显示）
     *
     * @return 历史记录列表（最新的在前）
     */
    public List<DocumentSnapshot> getUndoHistory() {
        return new ArrayList<>(undoStack);
    }

    /**
     * 清空所有历史记录
     */
    public void clearHistory() {
        undoStack.clear();
        redoStack.clear();
        log.debug("清空所有历史记录");
    }

    /**
     * 获取撤销栈大小
     *
     * @return 撤销栈大小
     */
    public int getUndoStackSize() {
        return undoStack.size();
    }

    /**
     * 获取重做栈大小
     *
     * @return 重做栈大小
     */
    public int getRedoStackSize() {
        return redoStack.size();
    }
}
