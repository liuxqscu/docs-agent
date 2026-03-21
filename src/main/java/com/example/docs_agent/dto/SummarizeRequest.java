package com.example.docs_agent.dto;

import lombok.Data;

/**
 * 文档摘要请求 DTO
 */
@Data
public class SummarizeRequest {

    /**
     * 摘要类型
     * 可选值：brief(一句话摘要), outline(大纲式摘要), detailed(详细摘要), keypoints(关键要点)
     */
    private String summaryType = "outline";

    /**
     * 最大长度限制（字数）
     */
    private Integer maxLength = 500;

    /**
     * 目标语言（可选，默认中文）
     */
    private String language = "zh";
}
