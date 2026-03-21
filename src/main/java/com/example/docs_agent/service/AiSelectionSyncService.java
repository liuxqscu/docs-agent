package com.example.docs_agent.service;

import com.example.docs_agent.constant.ApiConstants;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * ai_selection 同步服务
 * 统一维护 ai_selection -> 目标段落的三策略映射，避免分散实现产生语义漂移。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiSelectionSyncService {

    private final DocumentContext documentContext;

    public void syncToTargets(String content, String targetBlockId, List<String> targetBlockIds, String logPrefix) {
        String safePrefix = (logPrefix == null || logPrefix.isBlank()) ? "ai_selection" : logPrefix;
        String safeContent = content == null ? "" : content;

        if (targetBlockIds != null && !targetBlockIds.isEmpty()) {
            List<String> nonEmptyParagraphs = safeContent.lines()
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .toList();

            if (nonEmptyParagraphs.size() == targetBlockIds.size()) {
                for (int i = 0; i < targetBlockIds.size(); i++) {
                    documentContext.updateBlock(targetBlockIds.get(i), nonEmptyParagraphs.get(i));
                }
                log.info("{} 一对一同步完成: 目标段落 {} 个", safePrefix, targetBlockIds.size());
                return;
            }

            if (nonEmptyParagraphs.size() == 1) {
                List<String> distributed = splitSingleParagraphToTargets(nonEmptyParagraphs.get(0), targetBlockIds);
                for (int i = 0; i < targetBlockIds.size(); i++) {
                    documentContext.updateBlock(targetBlockIds.get(i), distributed.get(i));
                }
                log.info("{} 单段内容已按目标段落数拆分同步: 目标段落 {} 个", safePrefix, targetBlockIds.size());
                return;
            }

            documentContext.updateBlock(targetBlockIds.get(0), safeContent);
            log.info("{} 段落数不匹配，已合并写入目标段落 [{}]", safePrefix, targetBlockIds.get(0));
            return;
        }

        if (targetBlockId != null && !targetBlockId.isEmpty()) {
            documentContext.updateBlock(targetBlockId, safeContent);
            log.info("{} 单目标同步完成: 目标段落 [{}]", safePrefix, targetBlockId);
            return;
        }

        log.warn("{} 缺少 targetBlockId/targetBlockIds，跳过同步", safePrefix);
    }

    private List<String> splitSingleParagraphToTargets(String content, List<String> targetBlockIds) {
        int targetCount = targetBlockIds == null ? 0 : targetBlockIds.size();
        String safeContent = content == null ? "" : content.trim();
        if (targetCount <= 1) {
            return List.of(safeContent);
        }

        if (safeContent.isEmpty()) {
            List<String> emptyChunks = new ArrayList<>();
            for (int i = 0; i < targetCount; i++) {
                emptyChunks.add("");
            }
            return emptyChunks;
        }

        List<Integer> weights = new ArrayList<>();
        int totalWeight = 0;
        for (String targetBlockId : targetBlockIds) {
            var block = documentContext.getBlock(targetBlockId);
            String refContent = block != null ? block.getContent() : "";
            int weight = refContent == null ? 0 : refContent.trim().length();
            if (weight <= 0) {
                weight = 1;
            }
            weights.add(weight);
            totalWeight += weight;
        }

        int contentLength = safeContent.length();
        List<String> result = new ArrayList<>();
        int start = 0;
        int accumulatedWeight = 0;

        for (int i = 0; i < targetCount; i++) {
            if (i == targetCount - 1) {
                result.add(safeContent.substring(start).trim());
                break;
            }

            accumulatedWeight += weights.get(i);
            int expectedCut = (int) Math.round((contentLength * 1.0 * accumulatedWeight) / totalWeight);
            int cut = findBestCutPosition(safeContent, expectedCut, start, targetCount - i - 1);
            result.add(safeContent.substring(start, cut).trim());
            start = cut;
        }

        while (result.size() < targetCount) {
            result.add("");
        }

        return result;
    }

    private int findBestCutPosition(String content, int expectedCut, int start, int remainingChunks) {
        int minCut = start + 1;
        int maxCut = content.length() - remainingChunks;
        if (maxCut < minCut) {
            return minCut;
        }

        int clamped = Math.min(Math.max(expectedCut, minCut), maxCut);
        int bestPos = clamped;
        int bestDistance = Integer.MAX_VALUE;
        int window = 24;

        for (int i = Math.max(minCut, clamped - window); i <= Math.min(maxCut, clamped + window); i++) {
            char c = content.charAt(i - 1);
            if (!isBoundaryChar(c)) {
                continue;
            }
            int distance = Math.abs(i - clamped);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestPos = i;
            }
        }

        return bestPos;
    }

    private boolean isBoundaryChar(char c) {
        return Character.isWhitespace(c)
                || c == '。'
                || c == '！'
                || c == '？'
                || c == ';'
                || c == '；'
                || c == '，'
                || c == ',';
    }

    public String resolveAiSelectionContent(String newText) {
        if (newText != null) {
            return newText;
        }
        var aiBlock = documentContext.getBlock(ApiConstants.BLOCK_AI_SELECTION);
        return aiBlock != null ? aiBlock.getContent() : "";
    }
}
