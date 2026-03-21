package com.example.docs_agent.dto;

import lombok.Data;

import java.util.List;

/**
 * 语法检查请求 DTO
 */
@Data
public class GrammarCheckRequest {

    /**
     * 要检查的区块ID列表（为空则检查全部）
     */
    private List<String> blockIds;

    /**
     * 是否自动应用建议的修改
     */
    private boolean autoApply;
}
