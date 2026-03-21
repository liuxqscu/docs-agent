package com.example.docs_agent.dto;

import lombok.Builder;
import lombok.Data;

/**
 * 聊天响应 DTO
 */
@Data
@Builder
public class ChatResponse {

    /**
     * AI 回复内容
     */
    private String reply;

    /**
     * 当前文档状态（序列化后的区块内容）
     */
    private String document;

    /**
     * 文档是否发生变更
     */
    private Boolean changed;

    /**
     * 状态描述
     */
    private String status;

    /**
     * 错误信息（如有）
     */
    private String error;
}
