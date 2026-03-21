package com.example.docs_agent.service;

import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * 文件内容解析器
 * 支持多种格式文件的文本提取
 */
@Slf4j
public class FileContentParser {

    /**
     * 根据文件类型选择解析器
     *
     * @param file 文件对象
     * @return 解析后的文本内容
     */
    public static String parseFile(File file) throws IOException {
        String filename = file.getName();
        String extension = getFileExtension(filename).toLowerCase();

        log.info("开始解析文件：{} [类型：{}]", filename, extension);

        return switch (extension) {
            case "pdf" -> parsePdf(file);
            case "docx", "doc" -> parseDocx(file);
            case "txt", "md", "tex", "rtf" -> parseText(file);
            default -> throw new UnsupportedOperationException("不支持的文件类型：" + extension);
        };
    }

    /**
     * PDF 文件解析（使用 PDFBox）
     *
     * @param file PDF 文件
     * @return 解析后的文本
     */
    private static String parsePdf(File file) throws IOException {
        try (PDDocument document = PDDocument.load(file)) {
            PDFTextStripper stripper = new PDFTextStripper();
            String text = stripper.getText(document);
            log.info("PDF 解析成功，文本长度：{}", text.length());
            return text;
        } catch (IOException e) {
            log.error("PDF 解析失败：{}", e.getMessage(), e);
            throw new IOException("PDF 文件解析失败：" + e.getMessage(), e);
        }
    }

    /**
     * Word 文档解析（使用 POI）
     *
     * @param file Word 文件
     * @return 解析后的文本
     */
    private static String parseDocx(File file) throws IOException {
        StringBuilder text = new StringBuilder();

        try (XWPFDocument document = new XWPFDocument(new FileInputStream(file))) {
            for (XWPFParagraph paragraph : document.getParagraphs()) {
                String paraText = paragraph.getText();
                if (paraText != null && !paraText.trim().isEmpty()) {
                    text.append(paraText).append("\n");
                }
            }

            log.info("Word 解析成功，文本长度：{}", text.length());
            return text.toString();
        } catch (IOException e) {
            log.error("Word 解析失败：{}", e.getMessage(), e);
            throw new IOException("Word 文件解析失败：" + e.getMessage(), e);
        }
    }

    /**
     * 文本文件解析
     *
     * @param file 文本文件
     * @return 解析后的文本
     */
    private static String parseText(File file) throws IOException {
        String content = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
        log.info("文本文件解析成功，文本长度：{}", content.length());
        return content;
    }

    /**
     * 获取文件扩展名
     *
     * @param filename 文件名
     * @return 扩展名
     */
    private static String getFileExtension(String filename) {
        int lastDot = filename.lastIndexOf('.');
        return (lastDot > 0 && lastDot < filename.length() - 1)
                ? filename.substring(lastDot + 1)
                : "";
    }
}
