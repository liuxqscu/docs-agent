package com.example.docs_agent.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * 语法检查响应 DTO
 */
@Data
@Builder
public class GrammarCheckResponse {

    /**
     * 检查状态：success / error
     */
    private String status;

    /**
     * 状态消息
     */
    private String message;

    /**
     * 检查的总段落数
     */
    private int totalChecked;

    /**
     * 发现的问题数量
     */
    private int errorCount;

    /**
     * 检查结果列表
     */
    private List<GrammarCheckItem> results;

    /**
     * 检查总结
     */
    private String summary;

    /**
     * 单个检查结果项
     */
    @Data
    @Builder
    public static class GrammarCheckItem {
        private String blockId;
        private String originalText;
        private boolean hasError;
        private String errorDescription;
        private String suggestedCorrection;
        private int severity; // 1=建议, 2=轻微, 3=严重
        private String severityLabel;
    }
}
