package com.example.docs_agent.service;

import com.example.docs_agent.constant.ApiConstants;
import com.example.docs_agent.entity.Block;
import dev.langchain4j.agent.tool.P;
import dev.langchain4j.agent.tool.Tool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 文档编辑工具箱
 * 暴露给大模型的工具集
 */
@Slf4j
@Component
public class DocumentEditorTools {

    private final DocumentContext context;

    public DocumentEditorTools(DocumentContext context) {
        this.context = context;
    }

    /**
     * 获取当前文档的所有区块 ID 和内容全貌，用于在修改前了解上下文
     */
    @Tool("获取当前文档的所有区块ID和内容全貌，用于在修改前了解上下文。")
    public String readDocumentOutline() {
        int blockCount = context.getAllBlocksAsMap().size();
        log.info("[Agent 调用工具: readDocumentOutline] 当前文档共 {} 个区块", blockCount);
        return context.getAllBlocksAsString();
    }

    /**
     * 读取指定区块的文本内容
     *
     * @param blockId 需要读取的区块 ID，例如 'p_0'
     * @return 区块文本内容
     */
    @Tool("读取指定区块的文本内容。")
    public String readParagraph(@P("需要读取的区块ID，例如 'p_0'") String blockId) {
        Block block = context.getBlock(blockId);
        String content = (block != null) ? block.getContent() : null;
        String displayContent = (content != null && content.length() > 90)
                ? content.substring(0, 90) + "..."
                : content;
        log.info("[Agent 调用工具: readParagraph] {} => {}", blockId, displayContent);
        return content;
    }

    /**
     * 更新指定区块的文本内容
     *
     * @param blockId 需要修改的区块 ID
     * @param newText 修改后的完整新文本内容
     */
    @Tool("核心动作：更新指定区块的文本内容。")
    public void updateParagraph(
            @P("需要修改的区块ID") String blockId,
            @P("修改后的完整新文本内容") String newText) {
        Block block = context.getBlock(blockId);
        String oldText = (block != null) ? block.getContent() : null;
        context.updateBlock(blockId, newText);
        log.info("[Agent 执行工具: updateParagraph] {} (old length={}, new length={})",
                blockId,
                oldText != null ? oldText.length() : 0,
                newText != null ? newText.length() : 0);
    }

    /**
     * 在指定区块后插入新段落
     *
     * @param blockId 目标区块 ID，新段落将被插入在这个区块的下方
     * @param content 要插入的全新段落内容
     */
    @Tool("在指定段落后插入新段落。")
    public void insertAfter(
            @P("目标区块ID，新段落将被插入在这个区块的下方。例如 'p_1'") String blockId,
            @P("要插入的段落内容") String content) {
        // 与前端审查流保持一致：仅创建待审查草稿，不直接改写文档结构。
        String draftId = ApiConstants.BLOCK_PREFIX_INSERT + blockId + "_" + System.currentTimeMillis();
        context.updateBlock(draftId, content);
        log.info("[Agent 提议插入新段落] 目标位置: {} 之后, 草稿ID: {}", blockId, draftId);
    }

    /**
     * 在指定区块前插入新段落
     *
     * @param blockId 目标区块 ID，新段落将被插入在这个区块的前面
     * @param content 要插入的全新段落内容
     */
    @Tool("在指定段落前插入新段落。")
    public void insertBefore(
            @P("目标区块ID，新段落将被插入在这个区块的前面。例如 'p_1'") String blockId,
            @P("要插入的段落内容") String content) {
        String previousBlockId = context.findPreviousLogicalBlockId(blockId);
        String anchorBlockId = previousBlockId != null ? previousBlockId : blockId;

        // 统一前端审查语义：insertBefore 也转为 insert_after_草稿。
        String draftId = ApiConstants.BLOCK_PREFIX_INSERT + anchorBlockId + "_" + System.currentTimeMillis();
        context.updateBlock(draftId, content);

        if (previousBlockId == null) {
            log.warn("[Agent 提议前插入段落] 目标 {} 前无可用前置锚点，降级为围绕 {} 生成草稿 {}",
                    blockId, anchorBlockId, draftId);
        } else {
            log.info("[Agent 提议前插入段落] 目标 {} 前，使用锚点 {}，草稿ID: {}",
                    blockId, anchorBlockId, draftId);
        }
    }

    /**
     * 在指定区块后插入新段落（旧版本，保留兼容性）
     *
     * @param targetBlockId 目标区块 ID，新段落将被插入在这个区块的下方
     * @param newText       要插入的全新段落内容
     */
    @Tool("当用户要求补充新观点、增加新内容，或者在某段话之后加上一段新话时，调用此工具。")
    public void insertParagraphAfter(
            @P("目标区块ID，新段落将被插入在这个区块的下方。例如 'p_1'") String targetBlockId,
            @P("要插入的全新段落内容") String newText) {
        // 为了在前端区分这是一个"插入"操作，我们生成一个特殊的虚拟 ID
        String newBlockId = ApiConstants.BLOCK_PREFIX_INSERT + targetBlockId + "_" + System.currentTimeMillis();

        // 将这个待插入的草稿放入内存
        context.updateBlock(newBlockId, newText);
        log.info("[Agent 提议插入新段落] 目标位置: {} 之后", targetBlockId);
    }

    /**
     * 删除指定段落
     *
     * @param blockId 要删除的区块 ID
     */
    @Tool("当用户要求删除某一段落、移除冗余内容、或者认为某部分内容不再需要时，调用此工具。")
    public void deleteParagraph(@P("要删除的区块ID，例如 'p_2'") String blockId) {
        // 生成一个特殊的删除指令 ID
        String actionId = ApiConstants.BLOCK_PREFIX_DELETE + blockId + "_" + System.currentTimeMillis();

        // 在内存中标记该区块为"待删除"状态
        context.updateBlock(actionId, ApiConstants.DELETED_MARKER);

        log.info("[Agent 提议删除段落] 目标 ID: {}", blockId);
    }

}
