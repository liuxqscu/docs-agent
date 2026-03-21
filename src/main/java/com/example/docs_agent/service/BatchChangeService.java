package com.example.docs_agent.service;

import com.example.docs_agent.dto.BatchChangeResult;
import com.example.docs_agent.dto.ChangeRequest;
import com.example.docs_agent.entity.Block;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 批量变更操作服务
 * 处理文档变更的批量接受/拒绝操作
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BatchChangeService {

    private final DocumentContext documentContext;
    private final AiSelectionSyncService aiSelectionSyncService;

    /**
     * 批量接受变更
     *
     * @param changes 变更列表
     * @return 操作结果
     */
    public BatchChangeResult batchAccept(List<ChangeRequest> changes) {
        List<String> successIds = new ArrayList<>();
        List<String> failedIds = new ArrayList<>();

        for (ChangeRequest change : changes) {
            try {
                String blockId = change.getBlockId();
                String newText = change.getNewText();
                String targetBlockId = change.getTargetBlockId();
                List<String> targetBlockIds = change.getTargetBlockIds();

                // 处理 ai_selection 的特殊逻辑
                if ("ai_selection".equals(blockId)) {
                    String content = aiSelectionSyncService.resolveAiSelectionContent(newText);
                    aiSelectionSyncService.syncToTargets(content, targetBlockId, targetBlockIds, "批量接受 - ai_selection");
                }

                successIds.add(blockId);
                log.debug("批量接受变更: {}", blockId);
            } catch (Exception e) {
                failedIds.add(change.getBlockId());
                log.error("批量接受变更失败 [{}]: {}", change.getBlockId(), e.getMessage());
            }
        }

        return BatchChangeResult.builder()
                .successIds(successIds)
                .failedIds(failedIds)
                .successCount(successIds.size())
                .failedCount(failedIds.size())
                .message(String.format("成功接受 %d 个变更，失败 %d 个", successIds.size(), failedIds.size()))
                .build();
    }

    /**
     * 批量拒绝变更
     *
     * @param changes 变更列表
     * @return 操作结果
     */
    public BatchChangeResult batchReject(List<ChangeRequest> changes) {
        List<String> successIds = new ArrayList<>();
        List<String> failedIds = new ArrayList<>();

        for (ChangeRequest change : changes) {
            try {
                String blockId = change.getBlockId();
                String oldText = change.getOldText();

                // 恢复原始内容
                if (oldText != null) {
                    documentContext.updateBlock(blockId, oldText);
                }

                successIds.add(blockId);
                log.debug("批量拒绝变更: {}", blockId);
            } catch (Exception e) {
                failedIds.add(change.getBlockId());
                log.error("批量拒绝变更失败 [{}]: {}", change.getBlockId(), e.getMessage());
            }
        }

        return BatchChangeResult.builder()
                .successIds(successIds)
                .failedIds(failedIds)
                .successCount(successIds.size())
                .failedCount(failedIds.size())
                .message(String.format("成功拒绝 %d 个变更，失败 %d 个", successIds.size(), failedIds.size()))
                .build();
    }

    /**
     * 接受所有待处理的变更
     *
     * @param pendingChanges 待处理变更映射（blockId -> Block）
     * @return 操作结果
     */
    public BatchChangeResult acceptAll(Map<String, Block> pendingChanges) {
        List<String> successIds = new ArrayList<>();
        List<String> failedIds = new ArrayList<>();

        for (Map.Entry<String, Block> entry : pendingChanges.entrySet()) {
            try {
                String blockId = entry.getKey();
                Block block = entry.getValue();
                String newText = block != null ? block.getContent() : null;

                // 处理 ai_selection 的特殊逻辑（支持多段落）
                if ("ai_selection".equals(blockId)) {
                    List<String> targetBlockIds = block != null ? block.getTargetBlockIds() : null;
                    String targetBlockId = block != null ? block.getTargetBlockId() : null;
                    String content = newText != null ? newText : (block != null ? block.getContent() : null);
                    aiSelectionSyncService.syncToTargets(content, targetBlockId, targetBlockIds, "接受所有变更 - ai_selection");
                    successIds.add(blockId);
                    continue;
                }

                // 处理删除操作：从文档中删除对应区块
                if (blockId.startsWith("delete_")) {
                    String targetId = blockId.replace("delete_", "");
                    // 这里我们只记录成功，实际删除在Word中已完成
                    successIds.add(blockId);
                    log.debug("接受所有变更 - 删除区块: {}", targetId);
                    continue;
                }

                // 处理插入操作
                if (blockId.startsWith("insert_after_")) {
                    // 从 blockId 中提取目标位置，比如从 insert_after_p_0_xxx 提取 p_0
                    String[] parts = blockId.split("_");
                    if (parts.length >= 3) {
                        String targetId = parts[2];  // 提取 p_0
                        String newBlockId = documentContext.insertBlockAfter(targetId, newText);
                        successIds.add(blockId);
                        log.info("接受所有变更 - 插入操作成功，在 [{}] 后插入新段落 [{}]", targetId, newBlockId);
                    } else {
                        failedIds.add(blockId);
                        log.warn("接受所有变更 - 插入操作失败，无法解析目标位置: {}", blockId);
                    }
                    continue;
                }

                // 普通更新：更新区块内容
                if (newText != null) {
                    documentContext.updateBlock(blockId, newText);
                }

                successIds.add(blockId);
                log.debug("接受所有变更 - 更新区块: {}", blockId);
            } catch (Exception e) {
                failedIds.add(entry.getKey());
                log.error("接受所有变更失败 [{}]: {}", entry.getKey(), e.getMessage());
            }
        }

        return BatchChangeResult.builder()
                .successIds(successIds)
                .failedIds(failedIds)
                .successCount(successIds.size())
                .failedCount(failedIds.size())
                .message(String.format("成功接受 %d 个变更，失败 %d 个", successIds.size(), failedIds.size()))
                .build();
    }

    /**
     * 拒绝所有待处理的变更
     * 行为定义：丢弃草稿，保持Word文档不变，后端状态恢复到变更前
     *
     * @param pendingChangeIds 待处理变更ID列表
     * @param originalBlocks 原始区块状态（用于恢复）
     * @return 操作结果
     */
    public BatchChangeResult rejectAll(List<String> pendingChangeIds, Map<String, Block> originalBlocks) {
        List<String> successIds = new ArrayList<>();
        List<String> failedIds = new ArrayList<>();

        for (String blockId : pendingChangeIds) {
            try {
                // 处理删除操作的拒绝：恢复被标记删除的区块
                if (blockId.startsWith("delete_")) {
                    String targetId = blockId.replace("delete_", "");
                    Block originalBlock = originalBlocks.get(targetId);
                    if (originalBlock != null) {
                        documentContext.updateBlock(targetId, originalBlock.getContent());
                        log.debug("拒绝删除操作 - 恢复区块: {}", targetId);
                    }
                    successIds.add(blockId);
                    continue;
                }

                // 处理插入操作的拒绝：无需额外操作，因为插入尚未写入Word
                if (blockId.startsWith("insert_after_")) {
                    successIds.add(blockId);
                    log.debug("拒绝插入操作 - 丢弃区块: {}", blockId);
                    continue;
                }

                // 普通更新操作的拒绝：恢复到原始内容
                Block originalBlock = originalBlocks.get(blockId);
                if (originalBlock != null) {
                    documentContext.updateBlock(blockId, originalBlock.getContent());
                    log.debug("拒绝更新操作 - 恢复区块: {}", blockId);
                }

                successIds.add(blockId);
            } catch (Exception e) {
                failedIds.add(blockId);
                log.error("拒绝所有变更失败 [{}]: {}", blockId, e.getMessage());
            }
        }

        return BatchChangeResult.builder()
                .successIds(successIds)
                .failedIds(failedIds)
                .successCount(successIds.size())
                .failedCount(failedIds.size())
                .message(String.format("成功拒绝 %d 个变更，失败 %d 个", successIds.size(), failedIds.size()))
                .build();
    }
}
