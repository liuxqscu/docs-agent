package com.example.docs_agent.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * 文档摘要响应 DTO
 */
@Data
@Builder
public class SummarizeResponse {

    /**
     * 状态：success, error
     */
    private String status;

    /**
     * 状态消息
     */
    private String message;

    /**
     * 摘要内容
     */
    private String summary;

    /**
     * 关键要点列表
     */
    private List<String> keyPoints;

    /**
     * 原文档字数统计
     */
    private Integer originalWordCount;

    /**
     * 摘要字数统计
     */
    private Integer summaryWordCount;

    /**
     * 摘要类型
     */
    private String summaryType;

    /**
     * 压缩比率（摘要字数/原文档字数）
     */
    private String compressionRatio;
}
