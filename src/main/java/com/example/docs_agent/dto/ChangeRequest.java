package com.example.docs_agent.dto;

import lombok.Data;

import java.util.List;

/**
 * 变更操作请求 DTO
 */
@Data
public class ChangeRequest {

    /**
     * 区块 ID
     */
    private String blockId;

    /**
     * 原始文本（用于拒绝操作时恢复）
     */
    private String oldText;

    /**
     * 新文本内容（用于接受操作时同步更新）
     */
    private String newText;

    /**
     * 目标段落ID（用于 ai_selection 同步更新原始段落）
     */
    private String targetBlockId;

    /**
     * 目标段落ID列表（用于 ai_selection 多段落同步更新）
     */
    private List<String> targetBlockIds;

    /**
     * 变更类型（insert, update, delete）
     */
    private String changeType;
}
