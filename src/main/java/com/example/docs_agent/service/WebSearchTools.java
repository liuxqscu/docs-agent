package com.example.docs_agent.service;

import com.example.docs_agent.config.AiToolConfig;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.langchain4j.agent.tool.P;
import dev.langchain4j.agent.tool.Tool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * 通用外部信息工具箱
 */
@Slf4j
@Component
public class WebSearchTools {

    private static final String DDG_ENDPOINT = "https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q=";

    private final AiToolConfig aiToolConfig;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public WebSearchTools(AiToolConfig aiToolConfig) {
        this.aiToolConfig = aiToolConfig;
    }

    /**
     * 联网搜索（简版）
     */
    @Tool("联网搜索公开信息并返回简要结果列表，适合回答实时或外部知识问题。")
    public String searchWeb(
            @P("搜索关键词，例如 '2026年奥斯卡最佳影片' 或 'Java 21 release date'") String query,
            @P("返回条数，建议 1-8，留空时使用默认值") Integer maxResults) {
        if (query == null || query.trim().isEmpty()) {
            return "搜索关键词不能为空";
        }

        int limit = normalizeLimit(maxResults);
        String encoded = URLEncoder.encode(query.trim(), StandardCharsets.UTF_8);
        String url = DDG_ENDPOINT + encoded;

        HttpClient client = HttpClient.newBuilder().build();
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(java.time.Duration.ofSeconds(Math.max(aiToolConfig.getSearchTimeoutSeconds(), 1)))
                .header("Accept", "application/json")
                .header("User-Agent", "DocPulse/1.0")
                .GET()
                .build();

        try {
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() / 100 != 2) {
                return "联网搜索失败，HTTP 状态码: " + response.statusCode();
            }

            return toSearchSummary(query, response.body(), limit);
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.warn("联网搜索失败: {}", e.getMessage());
            return "联网搜索失败: " + e.getMessage();
        }
    }

    /**
     * 获取当前时间
     */
    @Tool("获取当前本机时间，可指定时区 ID（例如 Asia/Shanghai）。")
    public String getCurrentTime(@P("可选时区 ID，例如 Asia/Shanghai；留空使用系统时区") String zoneId) {
        ZoneId zone;
        try {
            zone = (zoneId == null || zoneId.trim().isEmpty())
                    ? ZoneId.systemDefault()
                    : ZoneId.of(zoneId.trim());
        } catch (Exception e) {
            return "时区无效: " + zoneId + "。示例: Asia/Shanghai";
        }

        ZonedDateTime now = ZonedDateTime.now(zone);
        return "当前时间: " + now.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss z"))
                + "\nISO-8601: " + now.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
                + "\n时区ID: " + zone.getId();
    }

    private int normalizeLimit(Integer maxResults) {
        int defaultLimit = Math.max(aiToolConfig.getSearchMaxResults(), 1);
        if (maxResults == null) {
            return defaultLimit;
        }
        return Math.max(1, Math.min(maxResults, 8));
    }

    private String toSearchSummary(String query, String json, int limit) throws IOException {
        JsonNode root = objectMapper.readTree(json);
        List<String> lines = new ArrayList<>();

        String heading = text(root, "Heading");
        String abstractText = text(root, "AbstractText");
        String abstractUrl = text(root, "AbstractURL");
        String answer = text(root, "Answer");

        if (!answer.isEmpty()) {
            lines.add("1. " + answer);
        }

        if (!abstractText.isEmpty()) {
            String title = heading.isEmpty() ? "摘要" : heading;
            String item = title + " - " + abstractText;
            if (!abstractUrl.isEmpty()) {
                item += " (来源: " + abstractUrl + ")";
            }
            lines.add((lines.size() + 1) + ". " + item);
        }

        JsonNode relatedTopics = root.path("RelatedTopics");
        if (relatedTopics.isArray()) {
            appendRelatedTopics(lines, relatedTopics, limit);
        }

        if (lines.isEmpty()) {
            return "未检索到可用结果。请尝试更具体的关键词。";
        }

        if (lines.size() > limit) {
            lines = new ArrayList<>(lines.subList(0, limit));
        }

        StringBuilder output = new StringBuilder();
        output.append("搜索词: ").append(query).append("\n");
        output.append("结果数: ").append(lines.size()).append("\n");
        for (int i = 0; i < lines.size(); i++) {
            output.append(lines.get(i));
            if (i < lines.size() - 1) {
                output.append("\n");
            }
        }
        return output.toString();
    }

    private void appendRelatedTopics(List<String> lines, JsonNode relatedTopics, int limit) {
        for (JsonNode item : relatedTopics) {
            if (lines.size() >= limit) {
                return;
            }

            // DuckDuckGo 可能出现嵌套 Topics
            if (item.has("Topics") && item.path("Topics").isArray()) {
                appendRelatedTopics(lines, item.path("Topics"), limit);
                continue;
            }

            String text = text(item, "Text");
            String firstUrl = text(item, "FirstURL");
            if (!text.isEmpty()) {
                String line = (lines.size() + 1) + ". " + text;
                if (!firstUrl.isEmpty()) {
                    line += " (来源: " + firstUrl + ")";
                }
                lines.add(line);
            }
        }
    }

    private String text(JsonNode node, String key) {
        JsonNode value = node.path(key);
        return value.isMissingNode() || value.isNull() ? "" : value.asText("").trim();
    }
}
