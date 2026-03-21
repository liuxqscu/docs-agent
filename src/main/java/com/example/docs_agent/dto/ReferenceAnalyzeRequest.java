package com.example.docs_agent.dto;

import lombok.Data;
import java.util.List;

/**
 * 参考文件分析请求 DTO
 */
@Data
public class ReferenceAnalyzeRequest {

    /**
     * 文档 ID
     */
    private String docId;

    /**
     * 选中的参考文件列表
     */
    private List<String> selectedFiles;

    /**
     * 用户指令
     */
    private String userInstruction;
}
