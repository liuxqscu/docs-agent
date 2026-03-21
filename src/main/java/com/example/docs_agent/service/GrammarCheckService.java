package com.example.docs_agent.service;

import com.example.docs_agent.entity.Block;
import dev.langchain4j.model.openai.OpenAiChatModel;
import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * 全文语法检查服务
 * 利用 AI 对文档进行批量语法检查
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GrammarCheckService {

    private final DocumentContext documentContext;

    /**
     * 语法检查结果
     */
    @Data
    @Builder
    public static class GrammarCheckResult {
        private String blockId;
        private String originalText;
        private boolean hasError;
        private String errorDescription;
        private String suggestedCorrection;
        private int severity; // 1=建议, 2=轻微, 3=严重
    }

    /**
     * 批量语法检查请求
     */
    @Data
    @Builder
    public static class BatchGrammarCheckRequest {
        private String apiKey;
        private String baseUrl;
        private String modelName;
        private List<String> blockIds; // 如果为空则检查所有
    }

    /**
     * 批量语法检查响应
     */
    @Data
    @Builder
    public static class BatchGrammarCheckResponse {
        private int totalChecked;
        private int errorCount;
        private List<GrammarCheckResult> results;
        private String summary;
    }

    /**
     * 执行全文语法检查
     *
     * @param request 检查请求
     * @return 检查结果
     */
    public BatchGrammarCheckResponse checkGrammar(BatchGrammarCheckRequest request) {
        Map<String, Block> blocks = documentContext.getAllBlocksAsMap();

        if (blocks.isEmpty()) {
            return BatchGrammarCheckResponse.builder()
                    .totalChecked(0)
                    .errorCount(0)
                    .results(new ArrayList<>())
                    .summary("文档为空，无需检查")
                    .build();
        }

        // 过滤需要检查的区块
        List<String> targetBlockIds = request.getBlockIds();
        if (targetBlockIds == null || targetBlockIds.isEmpty()) {
            targetBlockIds = new ArrayList<>(blocks.keySet());
        }

        log.info("开始全文语法检查，共 {} 个段落", targetBlockIds.size());

        // 创建 AI 模型
        OpenAiChatModel model = OpenAiChatModel.builder()
                .apiKey(request.getApiKey())
                .baseUrl(request.getBaseUrl())
                .modelName(request.getModelName())
                .timeout(Duration.ofSeconds(60))
                .build();

        List<GrammarCheckResult> results = new ArrayList<>();
        int errorCount = 0;

        // 分批处理，避免一次性请求过多
        int batchSize = 5;
        for (int i = 0; i < targetBlockIds.size(); i += batchSize) {
            List<String> batch = targetBlockIds.subList(i, Math.min(i + batchSize, targetBlockIds.size()));

            // 构建批量检查提示
            StringBuilder prompt = new StringBuilder();
            prompt.append("请检查以下段落的语法和表达，以 JSON 格式返回结果。\n\n");
            prompt.append("对于每个段落，请分析：\n");
            prompt.append("1. 是否有语法错误\n");
            prompt.append("2. 表达是否通顺\n");
            prompt.append("3. 是否有更好的表达方式\n\n");
            prompt.append("返回格式（JSON 数组）：\n");
            prompt.append("[\n");
            prompt.append("  {\n");
            prompt.append("    \"blockId\": \"段落ID\",\n");
            prompt.append("    \"hasError\": true/false,\n");
            prompt.append("    \"errorDescription\": \"错误描述（如有）\",\n");
            prompt.append("    \"suggestedCorrection\": \"建议修改（如有）\",\n");
            prompt.append("    \"severity\": 1-3（1=建议优化, 2=轻微错误, 3=严重错误）\n");
            prompt.append("  }\n");
            prompt.append("]\n\n");
            prompt.append("待检查段落：\n\n");

            for (String blockId : batch) {
                Block block = blocks.get(blockId);
                if (block != null) {
                    prompt.append(String.format("[%s]: %s\n\n", blockId, block.getContent()));
                }
            }

            prompt.append("请只返回 JSON 数组，不要包含其他说明文字。");

            try {
                String response = model.generate(prompt.toString());
                List<GrammarCheckResult> batchResults = parseGrammarCheckResults(response, blocks);
                results.addAll(batchResults);

                for (GrammarCheckResult result : batchResults) {
                    if (result.isHasError()) {
                        errorCount++;
                    }
                }

                // 短暂延迟，避免请求过快
                Thread.sleep(500);

            } catch (Exception e) {
                log.error("语法检查批次处理失败: {}", e.getMessage());
                // 为失败的批次添加默认结果
                for (String blockId : batch) {
                    Block block = blocks.get(blockId);
                    if (block != null) {
                        results.add(GrammarCheckResult.builder()
                                .blockId(blockId)
                                .originalText(block.getContent())
                                .hasError(false)
                                .errorDescription("检查失败: " + e.getMessage())
                                .suggestedCorrection(null)
                                .severity(1)
                                .build());
                    }
                }
            }
        }

        // 生成总结
        String summary = generateSummary(results.size(), errorCount);

        return BatchGrammarCheckResponse.builder()
                .totalChecked(targetBlockIds.size())
                .errorCount(errorCount)
                .results(results)
                .summary(summary)
                .build();
    }

    /**
     * 解析 AI 返回的语法检查结果
     */
    private List<GrammarCheckResult> parseGrammarCheckResults(String response, Map<String, Block> blocks) {
        List<GrammarCheckResult> results = new ArrayList<>();

        try {
            // 尝试提取 JSON 部分
            String jsonStr = extractJson(response);
            if (jsonStr == null) {
                log.warn("无法从响应中提取 JSON: {}", response);
                return results;
            }

            // 简单解析 JSON 数组
            List<Map<String, Object>> parsedResults = parseSimpleJsonArray(jsonStr);

            for (Map<String, Object> item : parsedResults) {
                String blockId = (String) item.get("blockId");
                Block block = blocks.get(blockId);

                if (block != null) {
                    results.add(GrammarCheckResult.builder()
                            .blockId(blockId)
                            .originalText(block.getContent())
                            .hasError(Boolean.TRUE.equals(item.get("hasError")))
                            .errorDescription((String) item.get("errorDescription"))
                            .suggestedCorrection((String) item.get("suggestedCorrection"))
                            .severity(parseSeverity(item.get("severity")))
                            .build());
                }
            }

        } catch (Exception e) {
            log.error("解析语法检查结果失败: {}", e.getMessage());
        }

        return results;
    }

    /**
     * 从响应中提取 JSON
     */
    private String extractJson(String response) {
        // 查找方括号包裹的内容
        int start = response.indexOf('[');
        int end = response.lastIndexOf(']');

        if (start != -1 && end != -1 && end > start) {
            return response.substring(start, end + 1);
        }

        // 查找花括号包裹的内容（单个对象）
        start = response.indexOf('{');
        end = response.lastIndexOf('}');

        if (start != -1 && end != -1 && end > start) {
            return "[" + response.substring(start, end + 1) + "]";
        }

        return null;
    }

    /**
     * 简单解析 JSON 数组（不使用外部库）
     */
    private List<Map<String, Object>> parseSimpleJsonArray(String json) {
        List<Map<String, Object>> results = new ArrayList<>();

        // 这是一个简化版的解析器，实际项目中建议使用 Jackson 或 Gson
        // 这里为了简单，使用正则提取关键字段
        java.util.regex.Pattern pattern = java.util.regex.Pattern.compile(
                "\\{([^}]*)\\}"
        );
        java.util.regex.Matcher matcher = pattern.matcher(json);

        while (matcher.find()) {
            String objStr = matcher.group(1);
            Map<String, Object> map = new java.util.HashMap<>();

            // 提取 blockId
            java.util.regex.Pattern blockIdPattern = java.util.regex.Pattern.compile(
                    "\"blockId\"\\s*:\\s*\"([^\"]*)\""
            );
            java.util.regex.Matcher blockIdMatcher = blockIdPattern.matcher(objStr);
            if (blockIdMatcher.find()) {
                map.put("blockId", blockIdMatcher.group(1));
            }

            // 提取 hasError
            java.util.regex.Pattern hasErrorPattern = java.util.regex.Pattern.compile(
                    "\"hasError\"\\s*:\\s*(true|false)"
            );
            java.util.regex.Matcher hasErrorMatcher = hasErrorPattern.matcher(objStr);
            if (hasErrorMatcher.find()) {
                map.put("hasError", Boolean.parseBoolean(hasErrorMatcher.group(1)));
            }

            // 提取 errorDescription
            java.util.regex.Pattern errorDescPattern = java.util.regex.Pattern.compile(
                    "\"errorDescription\"\\s*:\\s*\"([^\"]*)\""
            );
            java.util.regex.Matcher errorDescMatcher = errorDescPattern.matcher(objStr);
            if (errorDescMatcher.find()) {
                map.put("errorDescription", errorDescMatcher.group(1));
            }

            // 提取 suggestedCorrection
            java.util.regex.Pattern suggestionPattern = java.util.regex.Pattern.compile(
                    "\"suggestedCorrection\"\\s*:\\s*\"([^\"]*)\""
            );
            java.util.regex.Matcher suggestionMatcher = suggestionPattern.matcher(objStr);
            if (suggestionMatcher.find()) {
                map.put("suggestedCorrection", suggestionMatcher.group(1));
            }

            // 提取 severity
            java.util.regex.Pattern severityPattern = java.util.regex.Pattern.compile(
                    "\"severity\"\\s*:\\s*(\\d+)"
            );
            java.util.regex.Matcher severityMatcher = severityPattern.matcher(objStr);
            if (severityMatcher.find()) {
                map.put("severity", Integer.parseInt(severityMatcher.group(1)));
            }

            results.add(map);
        }

        return results;
    }

    /**
     * 解析严重级别
     */
    private int parseSeverity(Object severity) {
        if (severity instanceof Number) {
            return ((Number) severity).intValue();
        }
        if (severity instanceof String) {
            try {
                return Integer.parseInt((String) severity);
            } catch (NumberFormatException e) {
                return 1;
            }
        }
        return 1;
    }

    /**
     * 生成检查总结
     */
    private String generateSummary(int totalChecked, int errorCount) {
        if (errorCount == 0) {
            return String.format("检查完成！共检查 %d 个段落，未发现语法问题。", totalChecked);
        } else {
            return String.format("检查完成！共检查 %d 个段落，发现 %d 处问题。", totalChecked, errorCount);
        }
    }
}
