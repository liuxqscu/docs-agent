/**
 * 段落状态存储（轻量包装）
 * Phase 1: 不替代现有变量，仅提供统一命名入口供后续迁移
 */
(function (global) {
    const paragraphRuntime = {
        docState: {},
        changeState: {},
        selectionState: {
            targetMap: {},
            initialSelectionContent: null,
            targetBlocksInitial: {}
        }
    };

    global.ParagraphRuntime = paragraphRuntime;
})(window);
