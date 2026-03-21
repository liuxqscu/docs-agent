package com.example.docs_agent.dto;

import lombok.Data;

/**
 * 聊天请求 DTO
 */
@Data
public class ChatRequest {

    /**
     * 用户消息
     */
    private String message;

    /**
     * Agent 类型代码（可选，默认使用通用助手）
     * 可选值：general, academic, business, technical, legal, creative, custom
     */
    private String agentType;

    /**
     * 自定义系统提示词（当 agentType 为 custom 时使用）
     */
    private String customSystemPrompt;
}
