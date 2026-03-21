package com.example.docs_agent.dto;

import lombok.Builder;
import lombok.Data;
import java.util.List;

/**
 * 参考文件分析响应 DTO
 */
@Data
@Builder
public class ReferenceAnalyzeResponse {

    /**
     * 状态：success/error
     */
    private String status;

    /**
     * 响应消息
     */
    private String message;

    /**
     * AI 分析回复内容
     */
    private String agentReply;

    /**
     * 分析的文件数量
     */
    private int analyzedFiles;

    /**
     * 更新的区块 ID 列表
     */
    private List<String> updatedBlocks;

    /**
     * 文档是否发生变更
     */
    private boolean changed;
}
