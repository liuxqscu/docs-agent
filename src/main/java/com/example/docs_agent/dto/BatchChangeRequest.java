package com.example.docs_agent.dto;

import com.example.docs_agent.entity.Block;
import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * 批量变更操作请求 DTO
 */
@Data
public class BatchChangeRequest {

    /**
     * 变更操作列表
     */
    private List<ChangeRequest> changes;

    /**
     * 操作类型：accept - 接受所有，reject - 拒绝所有
     */
    private String operationType;

    /**
     * 用于拒绝操作时恢复原始状态（key: blockId, value: 原始Block）
     */
    private Map<String, Block> originalBlocks;
}
