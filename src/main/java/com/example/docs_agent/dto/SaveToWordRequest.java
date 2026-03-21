package com.example.docs_agent.dto;

import lombok.Data;

/**
 * 保存到 Word 请求 DTO
 */
@Data
public class SaveToWordRequest {

    /**
     * Word 文档路径
     */
    private String docxPath;
}
