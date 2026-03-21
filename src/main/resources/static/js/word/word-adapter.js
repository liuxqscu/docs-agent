/**
 * Word 适配工具
 * Phase 1: 提取可复用的格式捕获/恢复逻辑
 */
(function (global) {
    function captureParagraphFormat(paragraph) {
        return {
            alignment: paragraph.alignment,
            leftIndent: paragraph.leftIndent,
            firstLineIndent: paragraph.firstLineIndent,
            rightIndent: paragraph.rightIndent,
            lineSpacing: paragraph.lineSpacing
        };
    }

    function restoreParagraphFormat(paragraph, format) {
        paragraph.alignment = format.alignment;
        paragraph.leftIndent = format.leftIndent;
        paragraph.firstLineIndent = format.firstLineIndent;
        paragraph.rightIndent = format.rightIndent;
        paragraph.lineSpacing = format.lineSpacing;
    }

    global.WordParagraphAdapter = {
        captureParagraphFormat,
        restoreParagraphFormat
    };
})(window);
