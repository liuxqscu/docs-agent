package com.example.docs_agent.service;

import com.example.docs_agent.constant.ApiConstants;
import com.example.docs_agent.entity.Block;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.springframework.stereotype.Service;

import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Map;

/**
 * Word 文档服务
 * 处理 Word 文档的读写操作
 */
@Slf4j
@Service
public class WordDocumentService {

    /**
     * 按照 blocks 的内容，定点修改 Word 文档
     *
     * @param docxPath         Word 文件路径
     * @param blocks           区块内容，key 为段落唯一标识，value 为 Block 对象
     * @param blockToParaIndex 区块 ID 与 Word 段落索引的映射
     * @throws IOException IO 异常
     */
    public void applyBlocksToWord(String docxPath,
                                   Map<String, Block> blocks,
                                   Map<String, Integer> blockToParaIndex) throws IOException {
        log.info("开始应用区块到 Word 文档: {}，共 {} 个区块", docxPath, blocks.size());

        try (FileInputStream fis = new FileInputStream(docxPath);
             XWPFDocument doc = new XWPFDocument(fis)) {

            int updateCount = 0;
            // 只对有变更的段落做定点替换
            for (Map.Entry<String, Block> entry : blocks.entrySet()) {
                String blockId = entry.getKey();
                Block block = entry.getValue();
                Integer paraIdx = blockToParaIndex.get(blockId);

                if (paraIdx != null && paraIdx < doc.getParagraphs().size()) {
                    XWPFParagraph para = doc.getParagraphs().get(paraIdx);
                    // 替换正文内容
                    para.getRuns().clear();
                    para.createRun().setText(block.getContent());
                    updateCount++;
                }
            }

            // 保存到原文件
            try (FileOutputStream fos = new FileOutputStream(docxPath)) {
                doc.write(fos);
            }

            log.info("Word 文档更新完成，共更新 {} 个段落", updateCount);
        }
    }
}
