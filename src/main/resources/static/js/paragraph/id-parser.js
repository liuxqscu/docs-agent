/**
 * 段落与变更 ID 解析工具
 * Phase 1: 提供统一解析入口，不改变现有业务语义
 */
(function (global) {
    function parseParagraphIndexFromBlockId(blockId) {
        if (typeof blockId !== 'string') {
            return -1;
        }
        const match = blockId.match(/^p_(\d+)$/);
        return match ? parseInt(match[1], 10) : -1;
    }

    function parseTargetBlockIdFromInsertChangeId(changeId) {
        if (typeof changeId !== 'string') {
            return null;
        }
        const match = changeId.match(/insert_after_(p_\d+)/);
        return match ? match[1] : null;
    }

    function parseTargetBlockIdFromDeleteChangeId(changeId) {
        if (typeof changeId !== 'string') {
            return null;
        }
        const match = changeId.match(/delete_(p_\d+)/);
        return match ? match[1] : null;
    }

    function isVirtualChangeId(id) {
        return typeof id === 'string' && (id.startsWith('insert_after_') || id.startsWith('delete_'));
    }

    global.ParagraphIdParser = {
        parseParagraphIndexFromBlockId,
        parseTargetBlockIdFromInsertChangeId,
        parseTargetBlockIdFromDeleteChangeId,
        isVirtualChangeId
    };
})(window);
