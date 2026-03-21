/**
 * Word 行内联显示模块
 * 直接在 Word 文档中显示修改建议（删除线/绿色高亮）
 */

function getInlineDiffParagraphIndex(blockId) {
    if (window.ParagraphIdParser && window.ParagraphIdParser.parseParagraphIndexFromBlockId) {
        return window.ParagraphIdParser.parseParagraphIndexFromBlockId(blockId);
    }
    return parseInt(String(blockId).replace('p_', ''), 10);
}

function getInlineDiffInsertTargetBlockId(changeId) {
    if (window.ParagraphIdParser && window.ParagraphIdParser.parseTargetBlockIdFromInsertChangeId) {
        return window.ParagraphIdParser.parseTargetBlockIdFromInsertChangeId(changeId);
    }
    const match = String(changeId).match(/insert_after_(p_\d+)/);
    return match ? match[1] : null;
}

/**
 * 在 Word 中标记有修改的段落（用紫色框）
 * @param {string} blockId - 段落 ID
 * @param {string} oldText - 原始内容
 * @param {string} newText - 新内容
 */
async function showInlineDiffInWord(blockId, oldText, newText) {
    try {
        await Word.run(async (context) => {
            // 清除旧的 AI 标记
            await clearOldAIControls(context);
            
            const paragraphIndex = getInlineDiffParagraphIndex(blockId);
            const paragraphs = context.document.body.paragraphs;
            paragraphs.load("items");
            await context.sync();
            
            if (paragraphIndex >= paragraphs.items.length) {
                console.warn('段落索引超出范围:', paragraphIndex);
                return;
            }
            
            const paragraph = paragraphs.items[paragraphIndex];
            
            // 为段落添加一个紫色边框标记，表示此段落有修改建议
            const range = paragraph.getRange();
            const contentControl = range.insertContentControl(paragraph.getText());
            contentControl.appearance = 'boundingBox';
            contentControl.color = '#6366F1'; // 紫色边框
            contentControl.title = `AI_Suggestion_${blockId}`;
            contentControl.tag = 'AI_MODIFICATION';
            
            await context.sync();
            
            console.log(`✅ 已在 Word 中显示段落 ${blockId} 的修改标记`);
        });
    } catch (error) {
        console.error('❌ 显示行内联 Diff 失败:', error);
        throw error;
    }
}

/**
 * 为插入的新段落显示行内联标记
 * @param {string} changeId - 变更 ID
 * @param {string} content - 新内容
 */
async function showInsertInlineDiff(changeId, content) {
    try {
        await Word.run(async (context) => {
            // 清除旧的 AI 标记
            await clearOldAIControls(context);
            
            // 找到目标位置（兼容 insert_after_p_x_timestamp 格式）
            const targetId = getInlineDiffInsertTargetBlockId(changeId);
            if (!targetId) {
                console.warn('无法从插入变更ID解析目标段落:', changeId);
                return;
            }
            const paragraphIndex = getInlineDiffParagraphIndex(targetId);
            
            const paragraphs = context.document.body.paragraphs;
            paragraphs.load("items");
            await context.sync();
            
            // 在目标段落后面创建新的段落标记
            if (paragraphIndex < paragraphs.items.length) {
                const newParagraph = paragraphs.items[paragraphIndex].insertParagraph(
                    content,
                    Word.InsertLocation.after
                );
                
                // 为新段落添加高亮标记
                const range = newParagraph.getRange();
                const contentControl = range.insertContentControl(content);
                contentControl.appearance = 'boundingBox';
                contentControl.color = '#22C55E'; // 绿色边框表示新增
                contentControl.title = `AI_Insert_${changeId}`;
                contentControl.tag = 'AI_INSERTION';
                
                await context.sync();
            }
            
            console.log(`✅ 已标记插入段落 ${changeId}`);
        });
    } catch (error) {
        console.error('❌ 显示插入标记失败:', error);
        throw error;
    }
}

/**
 * 为删除操作显示行内联标记
 * @param {string} blockId - 段落 ID
 * @param {string} content - 原始内容
 */
async function showDeleteInlineDiff(blockId, content) {
    try {
        await Word.run(async (context) => {
            // 清除旧的 AI 标记
            await clearOldAIControls(context);
            
            const paragraphIndex = getInlineDiffParagraphIndex(blockId);
            const paragraphs = context.document.body.paragraphs;
            paragraphs.load("items");
            await context.sync();
            
            if (paragraphIndex < paragraphs.items.length) {
                const paragraph = paragraphs.items[paragraphIndex];
                
                // 为整个段落添加删除标记
                const range = paragraph.getRange();
                const contentControl = range.insertContentControl(content);
                contentControl.appearance = 'boundingBox';
                contentControl.color = '#EF4444'; // 红色边框表示删除
                contentControl.title = `AI_Delete_${blockId}`;
                contentControl.tag = 'AI_DELETION';
                
                // 设置删除线样式
                paragraph.font.strikeThrough = true;
                paragraph.font.highlightColor = Word.HighlightColor.pink;
                
                await context.sync();
            }
            
            console.log(`✅ 已标记删除段落 ${blockId}`);
        });
    } catch (error) {
        console.error('❌ 显示删除标记失败:', error);
        throw error;
    }
}

/**
 * 清除旧的 AI 控件
 * （现在主要清理可能的内容控件遗留，因为已改用样式标记）
 */
async function clearOldAIControls(context) {
    try {
        // 尝试清理可能残留的contentControl标记
        const allControls = context.document.contentControls;
        allControls.load("items");
        await context.sync();
        
        // 逐个过滤并删除AI相关的内容控件
        let deletedCount = 0;
        allControls.items.forEach(c => {
            if (c.title && c.title.match(/^AI_/)) {
                try {
                    // AI_Target 包裹的是用户选中文本，删除控件时需保留正文。
                    const keepContent = c.title === 'AI_Target';
                    c.delete(keepContent);
                    deletedCount++;
                } catch (e) {
                    // 忽略删除单个控件的错误
                }
            }
        });
        
        if (deletedCount > 0) {
            console.log(`✅ 已清理 ${deletedCount} 个残留的AI标记`);
        }
    } catch (error) {
        console.warn('⚠️ 清除旧标记时出错（可忽略）:', error.message);
    }
}

/**
 * 清除所有 AI 标记（用户接受/拒绝后）
 * 重置所有段落的样式标记回默认状态
 */
async function clearAllAIMarkers() {
    try {
        await Word.run(async (context) => {
            // 清除contentControl遗留
            await clearOldAIControls(context);
            
            // 重置所有段落的格式标记（恢复默认黑色）
            const paragraphs = context.document.body.paragraphs;
            paragraphs.load("items");
            await context.sync();
            
            paragraphs.items.forEach(paragraph => {
                try {
                    const range = paragraph.getRange();
                    range.font.color = '#000000'; // 恢复黑色
                    range.font.strikeThrough = false; // 移除删除线
                    range.font.bold = false; // 恢复正常粗细
                } catch (e) {
                    // 忽略单个段落的格式化错误
                }
            });
            
            await context.sync();
        });
        console.log('✅ 已清除所有 AI 标记，恢复默认样式');
    } catch (error) {
        console.error('❌ 清除 AI 标记失败:', error.message);
    }
}

/**
 * HTML 转义工具函数
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 导出全局函数
window.showInlineDiffInWord = showInlineDiffInWord;
window.showInsertInlineDiff = showInsertInlineDiff;
window.showDeleteInlineDiff = showDeleteInlineDiff;
window.clearAllAIMarkers = clearAllAIMarkers;
