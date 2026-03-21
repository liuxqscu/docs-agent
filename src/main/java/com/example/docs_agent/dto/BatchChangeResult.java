package com.example.docs_agent.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * 批量变更操作结果 DTO
 */
@Data
@Builder
public class BatchChangeResult {

    /**
     * 操作成功的区块ID列表
     */
    private List<String> successIds;

    /**
     * 操作失败的区块ID列表
     */
    private List<String> failedIds;

    /**
     * 成功数量
     */
    private int successCount;

    /**
     * 失败数量
     */
    private int failedCount;

    /**
     * 操作结果消息
     */
    private String message;
}
