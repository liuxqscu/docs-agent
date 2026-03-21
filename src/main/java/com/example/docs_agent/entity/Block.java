package com.example.docs_agent.entity;

import lombok.Data;
import java.util.List;

/**
 * 文档区块实体
 * 表示文档中的一个段落或内容块
 */
@Data
public class Block {

    /**
     * 区块内容
     */
    private String content;

    /**
     * 目标区块ID（用于 ai_selection 等临时区块）
     * 表示该区块内容应该应用到的目标段落
     */
    private String targetBlockId;

    /**
     * 目标区块ID列表（用于多段落选区）
     * 当用户选中多个段落时，存储所有目标段落的ID
     */
    private List<String> targetBlockIds;

    public Block() {
    }

    public Block(String content) {
        this.content = content;
    }

    public Block(String content, String targetBlockId) {
        this.content = content;
        this.targetBlockId = targetBlockId;
    }

    public Block(String content, List<String> targetBlockIds) {
        this.content = content;
        this.targetBlockIds = targetBlockIds;
    }
}
