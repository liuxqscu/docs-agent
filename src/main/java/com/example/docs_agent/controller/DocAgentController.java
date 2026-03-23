package com.example.docs_agent.controller;

import com.example.docs_agent.config.AgentPromptConfig;
import com.example.docs_agent.config.DocumentScopeFilter;
import com.example.docs_agent.constant.AgentType;
import com.example.docs_agent.constant.ApiConstants;
import com.example.docs_agent.constant.SystemMessageConstants;
import com.example.docs_agent.dto.*;
import com.example.docs_agent.entity.Block;
import com.example.docs_agent.dto.SummarizeRequest;
import com.example.docs_agent.dto.SummarizeResponse;
import com.example.docs_agent.service.BatchChangeService;
import com.example.docs_agent.service.DocumentAgentService;
import com.example.docs_agent.service.DocumentContext;
import com.example.docs_agent.service.DocumentScopeContext;
import com.example.docs_agent.service.DocumentScopeRegistry;
import com.example.docs_agent.service.GrammarCheckService;
import com.example.docs_agent.service.ReferenceFileService;
import com.example.docs_agent.service.WordDocumentService;
import com.example.docs_agent.service.AiSelectionSyncService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import jakarta.servlet.http.HttpServletRequest;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 文档 Agent 控制器
 * 处理文档编辑相关的 RESTful API 请求
 */
@Slf4j
@RestController
@RequestMapping(ApiConstants.API_BASE_PATH)
@RequiredArgsConstructor
public class DocAgentController {

    private final DocumentContext documentContext;
    private final WordDocumentService wordDocumentService;
    private final DocumentAgentService documentAgentService;
    private final BatchChangeService batchChangeService;
    private final GrammarCheckService grammarCheckService;
    private final AgentPromptConfig agentPromptConfig;
    private final ReferenceFileService referenceFileService;
    private final AiSelectionSyncService aiSelectionSyncService;
    private final DocumentScopeRegistry documentScopeRegistry;

    /**
     * 增量保存到 Word 文档（只修改有变更的段落）
     *
     * @param request 保存请求
     * @return 操作结果
     */
    @PostMapping("/save-to-word")
    public ResponseEntity<ApiResponse<Void>> saveToWord(@RequestBody SaveToWordRequest request) {
        log.info("收到保存到 Word 请求: {}", request.getDocxPath());
        try {
            wordDocumentService.applyBlocksToWord(
                    request.getDocxPath(),
                    documentContext.getAllBlocksAsMap(),
                    documentContext.getBlockToParaIndex()
            );
            return ResponseEntity.ok(ApiResponse.success("文档保存成功", null));
        } catch (IOException e) {
            log.error("保存 Word 文档失败: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError()
                    .body(ApiResponse.fail("SAVE_ERROR", "保存失败: " + e.getMessage()));
        }
    }

    /**
     * 获取当前文档状态
     *
     * @return 文档区块映射
     */
    @GetMapping("/document")
    public ResponseEntity<ApiResponse<Map<String, Block>>> getDocument() {
        String scope = DocumentScopeContext.getCurrentDocId();
        log.debug("获取当前文档状态，区块数: {}, scope={}", documentContext.getBlockCount(), scope);
        Map<String, Block> blocks = documentContext.getAllBlocksAsMap();
        return ResponseEntity.ok()
                .header(ApiConstants.HEADER_RESOLVED_SCOPE, scope)
                .body(ApiResponse.success(blocks));
    }

    /**
     * 初始化文档状态
     *
     * @param blocks 文档区块内容
     * @return 操作结果
     */
    @PostMapping("/init-document")
    public ResponseEntity<ApiResponse<Void>> initDocument(@RequestBody Map<String, String> blocks,
                                                          HttpServletRequest request) {
        String sessionId = (String) request.getAttribute(DocumentScopeFilter.ATTR_SESSION_ID);
        String routingKey = (String) request.getAttribute(DocumentScopeFilter.ATTR_SCOPE_ROUTING_KEY);
        String rawClientDocId = (String) request.getAttribute(DocumentScopeFilter.ATTR_RAW_CLIENT_DOC_ID);

        String contentScope = buildContentScope(routingKey, blocks);
        DocumentScopeContext.setCurrentDocId(contentScope);
        documentScopeRegistry.setLastScope(routingKey, contentScope);
        if (rawClientDocId != null && !rawClientDocId.isBlank()) {
            documentScopeRegistry.bindClientScope(routingKey, rawClientDocId, contentScope);
        }

        documentContext.clearAll();

        for (Map.Entry<String, String> entry : blocks.entrySet()) {
            documentContext.updateBlock(entry.getKey(), entry.getValue());
        }

        log.info("初始化文档状态，共 {} 个段落 [scope={}, rawClientDocId={}]", blocks.size(), contentScope, rawClientDocId);
        return ResponseEntity.ok(ApiResponse.success("文档初始化成功", null));
    }

    /**
     * 锁定选区 - 在保留现有文档的基础上，添加/更新 ai_selection 区块
     *
     * @param request 选区内容请求，包含 selectedText 和 targetBlockId（选区所属的原始段落 ID）
     * @return 操作结果
     */
    @PostMapping("/lock-selection")
    @SuppressWarnings("unchecked")
    public ResponseEntity<ApiResponse<Void>> lockSelection(@RequestBody Map<String, Object> request) {
        String selectedText = (String) request.get("selectedText");
        String blockId = (String) request.getOrDefault("blockId", "ai_selection");
        String targetBlockId = (String) request.get("targetBlockId"); // 选区所属的原始段落 ID
            
        // 支持多段落选区：接收 targetBlockIds 数组
        List<String> targetBlockIds = null;
        Object targetBlockIdsObj = request.get("targetBlockIds");
        if (targetBlockIdsObj instanceof List) {
            targetBlockIds = (List<String>) targetBlockIdsObj;
        }
    
        if (selectedText == null || selectedText.trim().isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.fail("INVALID_REQUEST", "选区内容不能为空"));
        }
    
        // 不清空文档，只更新/添加选区区块
        documentContext.updateBlock(blockId, selectedText);
    
        // 如果有目标段落 ID，建立映射关系（用于后续同步更新）
        if (targetBlockIds != null && !targetBlockIds.isEmpty()) {
            log.info("锁定选区 [{}] -> 目标段落 [{}] (共 {} 个段落)，当前文档共 {} 个区块",
                    blockId, String.join(", ", targetBlockIds), targetBlockIds.size(), documentContext.getBlockCount());
        } else if (targetBlockId != null && !targetBlockId.isEmpty()) {
            log.info("锁定选区 [{}] -> 目标段落 [{}]，当前文档共 {} 个区块",
                    blockId, targetBlockId, documentContext.getBlockCount());
        } else {
            log.info("锁定选区 [{}]，当前文档共 {} 个区块", blockId, documentContext.getBlockCount());
        }
        return ResponseEntity.ok(ApiResponse.success("选区已锁定", null));
    }

    /**
     * 接受变更
     *
     * @param request 变更请求
     * @return 操作结果
     */
    @PostMapping("/accept")
    public ResponseEntity<ApiResponse<Void>> acceptChange(@RequestBody ChangeRequest request) {
        String blockId = request.getBlockId();
        String newText = request.getNewText();
        String targetBlockId = request.getTargetBlockId();
        List<String> targetBlockIds = request.getTargetBlockIds();
        String changeType = request.getChangeType();

        log.info("接受变更: blockId={}, changeType={}, targetBlockId={}, newText长度={}", blockId, changeType, 
                 targetBlockId, newText != null ? newText.length() : 0);

        // 保存快照用于撤销
        documentContext.saveSnapshot("ACCEPT", "接受变更: " + blockId);

        // 情况1：ai_selection 变更（需要同步到实际目标段落）
        if ("ai_selection".equals(blockId)) {
            String content = aiSelectionSyncService.resolveAiSelectionContent(newText);
            aiSelectionSyncService.syncToTargets(content, targetBlockId, targetBlockIds, "接受变更 - ai_selection");
        } 
        // 情况2：插入操作（需要在指定位置后面插入新段落）
        else if ("insert".equalsIgnoreCase(changeType)) {
            // 对于插入操作：blockId 可能是虚拟ID (insert_after_xxx)，targetBlockId 是实际目标位置 (p_0)
            String insertAfterBlockId = targetBlockId != null && !targetBlockId.isEmpty() 
                ? targetBlockId 
                : blockId;  // 备用：如果没有targetBlockId，从blockId中提取
            
            // 从虚拟blockId中提取实际的目标位置（如果blockId以insert_after_开头）
            if (insertAfterBlockId.startsWith("insert_after_")) {
                java.util.regex.Pattern pattern = java.util.regex.Pattern.compile("insert_after_(p_\\d+)");
                java.util.regex.Matcher matcher = pattern.matcher(insertAfterBlockId);
                if (matcher.find()) {
                    insertAfterBlockId = matcher.group(1);  // 提取 p_0
                } else {
                    insertAfterBlockId = insertAfterBlockId.replace("insert_after_", "");
                }
            }
            
            String newBlockId = documentContext.insertBlockAfter(insertAfterBlockId, newText);

            // 接受后清理插入草稿，避免前端重复识别为待审查变更。
            if (blockId != null && blockId.startsWith(ApiConstants.BLOCK_PREFIX_INSERT)) {
                documentContext.deleteBlock(blockId);
            }

            log.info("✅ 已接受插入操作，在 [{}] 之后生成新段落 [{}]，内容长度: {}", 
                    insertAfterBlockId, newBlockId, newText != null ? newText.length() : 0);
        }
        // 情况3：删除操作（需要删除指定的段落）
        else if ("delete".equalsIgnoreCase(changeType)) {
            // 对于删除操作：blockId 是虚拟ID (delete_xxx) 或目标 ID，targetBlockId 是实际目标位置
            String deleteBlockId = targetBlockId != null && !targetBlockId.isEmpty()
                ? targetBlockId
                : blockId;
            
            // 从虚拟blockId中提取实际的被删除段落（如果blockId以delete_开头）
            if (deleteBlockId.startsWith("delete_")) {
                java.util.regex.Pattern pattern = java.util.regex.Pattern.compile("delete_(p_\\d+)");
                java.util.regex.Matcher matcher = pattern.matcher(deleteBlockId);
                if (matcher.find()) {
                    deleteBlockId = matcher.group(1);  // 提取 p_0
                } else {
                    deleteBlockId = deleteBlockId.replace("delete_", "");
                }
            }
            
            // 从 documentContext 中删除该段落
            documentContext.deleteBlock(deleteBlockId);

            // 接受后清理删除草稿，避免前端重复识别为待审查变更。
            if (blockId != null && blockId.startsWith(ApiConstants.BLOCK_PREFIX_DELETE)) {
                documentContext.deleteBlock(blockId);
            }

            log.info("✅ 已接受删除操作，删除段落 [{}]", deleteBlockId);
        }
        // 情况4：普通段落变更（直接更新该段落）
        else {
            // 直接更新指定的块
            documentContext.updateBlock(blockId, newText);
            log.info("✅ 已接受并更新段落 [{}], 新内容长度: {}", blockId, newText != null ? newText.length() : 0);
        }

        return ResponseEntity.ok(ApiResponse.success(ApiConstants.STATUS_ACCEPTED, null));
    }

    /**
     * 拒绝变更
     *
     * @param request 变更请求
     * @return 操作结果
     */
    @PostMapping("/reject")
    public ResponseEntity<ApiResponse<Void>> rejectChange(@RequestBody ChangeRequest request) {
        log.info("拒绝变更: {}，恢复原始内容", request.getBlockId());

        // 保存快照用于撤销
        documentContext.saveSnapshot("REJECT", "拒绝变更: " + request.getBlockId());

        documentContext.updateBlock(request.getBlockId(), request.getOldText());
        return ResponseEntity.ok(ApiResponse.success("变更已拒绝", null));
    }

    /**
     * 批量接受变更
     *
     * @param request 批量变更请求
     * @return 批量操作结果
     */
    @PostMapping("/batch-accept")
    public ResponseEntity<ApiResponse<BatchChangeResult>> batchAcceptChanges(@RequestBody BatchChangeRequest request) {
        log.info("收到批量接受请求，共 {} 个变更", request.getChanges() != null ? request.getChanges().size() : 0);
        BatchChangeResult result = batchChangeService.batchAccept(request.getChanges());
        return ResponseEntity.ok(ApiResponse.success(result.getMessage(), result));
    }

    /**
     * 批量拒绝变更
     *
     * @param request 批量变更请求
     * @return 批量操作结果
     */
    @PostMapping("/batch-reject")
    public ResponseEntity<ApiResponse<BatchChangeResult>> batchRejectChanges(@RequestBody BatchChangeRequest request) {
        log.info("收到批量拒绝请求，共 {} 个变更", request.getChanges() != null ? request.getChanges().size() : 0);
        BatchChangeResult result = batchChangeService.batchReject(request.getChanges());
        return ResponseEntity.ok(ApiResponse.success(result.getMessage(), result));
    }

    /**
     * 接受所有待处理的变更
     *
     * @param pendingChanges 待处理变更映射
     * @return 批量操作结果
     */
    @PostMapping("/accept-all")
    public ResponseEntity<ApiResponse<BatchChangeResult>> acceptAllChanges(@RequestBody Map<String, Block> pendingChanges) {
        log.info("收到接受所有变更请求，共 {} 个待处理变更", pendingChanges != null ? pendingChanges.size() : 0);
        if (pendingChanges == null || pendingChanges.isEmpty()) {
            return ResponseEntity.ok(ApiResponse.success("没有待处理的变更",
                    BatchChangeResult.builder()
                            .successCount(0)
                            .failedCount(0)
                            .message("没有待处理的变更")
                            .build()));
        }
        // 打印接收到的数据用于调试
        pendingChanges.forEach((key, value) -> {
            log.debug("接受变更 - {}: {}", key, value != null ? value.getContent() : "null");
        });
        BatchChangeResult result = batchChangeService.acceptAll(pendingChanges);
        log.info("接受所有变更完成: {}", result.getMessage());
        return ResponseEntity.ok(ApiResponse.success(result.getMessage(), result));
    }

    /**
     * 拒绝所有待处理的变更
     *
     * @param request 批量变更请求，包含变更ID列表和原始区块状态
     * @return 批量操作结果
     */
    @PostMapping("/reject-all")
    public ResponseEntity<ApiResponse<BatchChangeResult>> rejectAllChanges(@RequestBody BatchChangeRequest request) {
        List<String> pendingChangeIds = request != null ? request.getChanges().stream()
                .map(ChangeRequest::getBlockId)
                .toList() : List.of();
        log.info("收到拒绝所有变更请求，共 {} 个待处理变更", pendingChangeIds.size());
        if (pendingChangeIds.isEmpty()) {
            return ResponseEntity.ok(ApiResponse.success("没有待处理的变更",
                    BatchChangeResult.builder()
                            .successCount(0)
                            .failedCount(0)
                            .message("没有待处理的变更")
                            .build()));
        }
        // 构建原始区块状态映射
        Map<String, Block> originalBlocks = new LinkedHashMap<>();
        for (ChangeRequest change : request.getChanges()) {
            if (change.getOldText() != null) {
                originalBlocks.put(change.getBlockId(), new Block(change.getOldText()));
            }
        }
        // 打印调试信息
        log.debug("拒绝变更 - 原始区块: {}", originalBlocks.keySet());
        BatchChangeResult result = batchChangeService.rejectAll(pendingChangeIds, originalBlocks);
        log.info("拒绝所有变更完成: {}", result.getMessage());
        return ResponseEntity.ok(ApiResponse.success(result.getMessage(), result));
    }

    /**
     * 全文语法检查
     *
     * @param apiKey    API Key
     * @param baseUrl   基础 URL
     * @param modelName 模型名称
     * @param request   语法检查请求
     * @return 检查结果
     */
    @PostMapping("/grammar-check")
    public ResponseEntity<GrammarCheckResponse> checkGrammar(
            @RequestHeader(ApiConstants.HEADER_API_KEY) String apiKey,
            @RequestHeader(ApiConstants.HEADER_BASE_URL) String baseUrl,
            @RequestHeader(ApiConstants.HEADER_MODEL_NAME) String modelName,
            @RequestBody GrammarCheckRequest request) {

        log.info("收到全文语法检查请求");

        // 检查文档是否为空
        if (documentContext.getAllBlocksAsMap().isEmpty()) {
            return ResponseEntity.ok(GrammarCheckResponse.builder()
                    .status("error")
                    .message("文档为空，请先同步文档内容")
                    .totalChecked(0)
                    .errorCount(0)
                    .results(new ArrayList<>())
                    .summary("文档为空")
                    .build());
        }

        try {
            // 构建服务层请求
            GrammarCheckService.BatchGrammarCheckRequest serviceRequest =
                    GrammarCheckService.BatchGrammarCheckRequest.builder()
                            .apiKey(apiKey)
                            .baseUrl(baseUrl)
                            .modelName(modelName)
                            .blockIds(request.getBlockIds())
                            .build();

            // 执行语法检查
            GrammarCheckService.BatchGrammarCheckResponse serviceResponse =
                    grammarCheckService.checkGrammar(serviceRequest);

            // 转换为响应 DTO
            List<GrammarCheckResponse.GrammarCheckItem> items = new ArrayList<>();
            for (GrammarCheckService.GrammarCheckResult result : serviceResponse.getResults()) {
                String severityLabel = result.getSeverity() == 1 ? "建议" :
                        result.getSeverity() == 2 ? "轻微" : "严重";

                items.add(GrammarCheckResponse.GrammarCheckItem.builder()
                        .blockId(result.getBlockId())
                        .originalText(result.getOriginalText())
                        .hasError(result.isHasError())
                        .errorDescription(result.getErrorDescription())
                        .suggestedCorrection(result.getSuggestedCorrection())
                        .severity(result.getSeverity())
                        .severityLabel(severityLabel)
                        .build());
            }

            return ResponseEntity.ok(GrammarCheckResponse.builder()
                    .status("success")
                    .message("检查完成")
                    .totalChecked(serviceResponse.getTotalChecked())
                    .errorCount(serviceResponse.getErrorCount())
                    .results(items)
                    .summary(serviceResponse.getSummary())
                    .build());

        } catch (Exception e) {
            log.error("语法检查失败: {}", e.getMessage(), e);
            return ResponseEntity.ok(GrammarCheckResponse.builder()
                    .status("error")
                    .message("检查失败: " + e.getMessage())
                    .totalChecked(0)
                    .errorCount(0)
                    .results(new ArrayList<>())
                    .summary("检查失败")
                    .build());
        }
    }

    /**
     * 与 AI Agent 对话
     *
     * @param apiKey    API Key
     * @param baseUrl   基础 URL
     * @param modelName 模型名称
     * @param request   聊天请求
     * @return 聊天响应
     */
    @PostMapping("/chat")
    public ResponseEntity<ChatResponse> chatWithAgent(
            @RequestHeader(ApiConstants.HEADER_API_KEY) String apiKey,
            @RequestHeader(ApiConstants.HEADER_BASE_URL) String baseUrl,
            @RequestHeader(ApiConstants.HEADER_MODEL_NAME) String modelName,
            @RequestBody ChatRequest request) {

        String userMessage = request.getMessage();
        String agentTypeCode = request.getAgentType();
        String customSystemPrompt = request.getCustomSystemPrompt();
        String docScopeId = DocumentScopeContext.getCurrentDocId();

        String bodyDocId = request.getDocId();
        if (bodyDocId != null && !bodyDocId.isBlank() && !docScopeId.equals(bodyDocId.trim())) {
            log.debug("检测到 docId 不一致：headerScope={}, bodyDocId={}，将以 headerScope 为准", docScopeId, bodyDocId);
        }

        // 确定使用的 Agent 类型
        AgentType agentType = AgentType.GENERAL;
        if (agentTypeCode != null && !agentTypeCode.isEmpty()) {
            if (agentPromptConfig.isAllowClientOverride()) {
                agentType = AgentType.fromCode(agentTypeCode);
            } else {
                log.warn("客户端尝试切换 Agent 类型被禁止，使用默认类型");
            }
        }

        log.info("收到前端指令: {} [使用模型: {}, Agent类型: {}, 文档会话: {}]",
            userMessage, modelName, agentType.getName(), docScopeId);

        // 检查文档是否为空
        if (documentContext.getAllBlocksAsMap().isEmpty()) {
            String msg = "文档当前为空，请先点击「扫全文」或调用 /api/init-document 上传文档内容。";
            log.warn("文档为空，无法处理聊天请求");
            ChatResponse response = ChatResponse.builder()
                    .reply(msg)
                    .document(documentContext.getAllBlocksAsString())
                    .changed(false)
                    .build();
            return ResponseEntity.ok(response);
        }

        // 记录修改前的状态
        Map<String, Block> beforeMap = documentContext.getAllBlocksAsMap();

        String agentReply;
        try {
            // 如果有自定义提示词且允许使用，则使用自定义提示词
            if (AgentType.CUSTOM.equals(agentType) && customSystemPrompt != null && !customSystemPrompt.isEmpty()) {
                if (agentPromptConfig.isAllowCustomPrompt()) {
                    agentReply = documentAgentService.chatWithCustomPrompt(
                            apiKey, baseUrl, modelName, userMessage, customSystemPrompt, docScopeId);
                } else {
                    agentReply = "当前配置不允许使用自定义提示词";
                }
            } else {
                agentReply = documentAgentService.chat(apiKey, baseUrl, modelName, userMessage, agentType, docScopeId);
            }
            log.info("Agent 执行完毕，返回结果长度: {}", agentReply != null ? agentReply.length() : 0);
        } catch (Exception e) {
            log.error("Agent 执行失败: {}", e.getMessage(), e);
            agentReply = "Agent 执行异常: " + e.getMessage();
        }

        // 检查文档是否发生变更
        Map<String, Block> afterMap = documentContext.getAllBlocksAsMap();
        boolean changed = !afterMap.equals(beforeMap);
        log.debug("聊天前后区块对比: before={}, after={}, changed={}",
                beforeMap.size(), afterMap.size(), changed);

        String status = changed
                ? "文档状态已更新（当前区块数: " + afterMap.size() + "）"
                : "文档状态未检测到变更（请确认模型是否调用了工具）";

        ChatResponse response = ChatResponse.builder()
                .reply(agentReply != null ? agentReply : "Agent 未返回内容")
                .document(documentContext.getAllBlocksAsString())
                .changed(changed)
                .status(status)
                .build();

        return ResponseEntity.ok(response);
    }

    private String buildContentScope(String routingKey, Map<String, String> blocks) {
        String safeRoutingKey = (routingKey == null || routingKey.isBlank()) ? "anonymous" : routingKey;
        String routingHash = Integer.toHexString(safeRoutingKey.hashCode());
        String contentHash = digestBlocks(blocks);
        return "route_" + routingHash + "_doc_" + contentHash;
    }

    private String digestBlocks(Map<String, String> blocks) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            blocks.entrySet().stream()
                    .sorted(Map.Entry.comparingByKey())
                    .forEach(entry -> {
                        digest.update(entry.getKey().getBytes(StandardCharsets.UTF_8));
                        digest.update((byte) '=');
                        String value = entry.getValue() == null ? "" : entry.getValue();
                        digest.update(value.getBytes(StandardCharsets.UTF_8));
                        digest.update((byte) '\n');
                    });

            byte[] hash = digest.digest();
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 8 && i < hash.length; i++) {
                sb.append(String.format("%02x", hash[i]));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            return Integer.toHexString(blocks.hashCode());
        }
    }


    // ==================== Agent 类型管理 API ====================

    /**
     * 获取所有可用的 Agent 类型
     *
     * @return Agent 类型列表
     */
    @GetMapping("/agent-types")
    public ResponseEntity<ApiResponse<List<Map<String, String>>>> getAgentTypes() {
        List<Map<String, String>> agentTypes = new ArrayList<>();
        for (AgentType type : AgentType.values()) {
            Map<String, String> typeInfo = new HashMap<>();
            typeInfo.put("code", type.getCode());
            typeInfo.put("name", type.getName());
            typeInfo.put("description", type.getDescription());
            agentTypes.add(typeInfo);
        }
        return ResponseEntity.ok(ApiResponse.success(agentTypes));
    }

    /**
     * 获取指定 Agent 类型的系统提示词
     *
     * @param typeCode Agent 类型代码
     * @return 系统提示词
     */
    @GetMapping("/agent-prompt/{typeCode}")
    public ResponseEntity<ApiResponse<Map<String, String>>> getAgentPrompt(@PathVariable String typeCode) {
        AgentType agentType = AgentType.fromCode(typeCode);
        String prompt = SystemMessageConstants.getSystemMessage(agentType);

        Map<String, String> result = new HashMap<>();
        result.put("typeCode", agentType.getCode());
        result.put("typeName", agentType.getName());
        result.put("prompt", prompt);

        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /**
     * 设置自定义系统提示词
     *
     * @param request 包含自定义提示词的请求
     * @return 操作结果
     */
    @PostMapping("/custom-prompt")
    public ResponseEntity<ApiResponse<Void>> setCustomPrompt(@RequestBody Map<String, String> request) {
        String prompt = request.get("prompt");
        if (prompt == null || prompt.trim().isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.fail("INVALID_REQUEST", "提示词内容不能为空"));
        }

        // 检查是否允许自定义提示词
        if (!agentPromptConfig.isAllowCustomPrompt()) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.fail("NOT_ALLOWED", "当前配置不允许自定义提示词"));
        }

        SystemMessageConstants.setCustomPrompt(prompt);
        // 清除缓存以使用新的提示词
        documentAgentService.clearAllAgentCache();

        log.info("已设置自定义系统提示词，长度: {}", prompt.length());
        return ResponseEntity.ok(ApiResponse.success("自定义提示词已设置", null));
    }

    /**
     * 获取当前自定义提示词
     *
     * @return 自定义提示词
     */
    @GetMapping("/custom-prompt")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getCustomPrompt() {
        Map<String, Object> result = new HashMap<>();
        result.put("hasCustomPrompt", SystemMessageConstants.hasCustomPrompt());
        result.put("allowCustomPrompt", agentPromptConfig.isAllowCustomPrompt());

        if (SystemMessageConstants.hasCustomPrompt()) {
            String prompt = SystemMessageConstants.getCustomPrompt();
            result.put("prompt", prompt);
            result.put("length", prompt.length());
        }

        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /**
     * 清除自定义提示词
     *
     * @return 操作结果
     */
    @DeleteMapping("/custom-prompt")
    public ResponseEntity<ApiResponse<Void>> clearCustomPrompt() {
        SystemMessageConstants.clearCustomPrompt();
        // 清除缓存
        documentAgentService.clearAllAgentCache();

        log.info("已清除自定义系统提示词");
        return ResponseEntity.ok(ApiResponse.success("自定义提示词已清除", null));
    }

    /**
     * 获取当前 Agent 配置信息
     *
     * @return 配置信息
     */
    @GetMapping("/agent-config")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getAgentConfig() {
        Map<String, Object> config = new HashMap<>();
        config.put("defaultType", agentPromptConfig.getDefaultAgentType().getCode());
        config.put("allowClientOverride", agentPromptConfig.isAllowClientOverride());
        config.put("allowCustomPrompt", agentPromptConfig.isAllowCustomPrompt());
        config.put("hasCustomPrompt", SystemMessageConstants.hasCustomPrompt());

        return ResponseEntity.ok(ApiResponse.success(config));
    }

    // ==================== 智能摘要生成 API ====================

    /**
     * 生成文档摘要
     *
     * @param apiKey    API Key
     * @param baseUrl   基础 URL
     * @param modelName 模型名称
     * @param request   摘要请求
     * @return 摘要响应
     */
    @PostMapping("/summarize")
    public ResponseEntity<SummarizeResponse> generateSummary(
            @RequestHeader(ApiConstants.HEADER_API_KEY) String apiKey,
            @RequestHeader(ApiConstants.HEADER_BASE_URL) String baseUrl,
            @RequestHeader(ApiConstants.HEADER_MODEL_NAME) String modelName,
            @RequestBody SummarizeRequest request) {

        log.info("收到文档摘要生成请求 [类型: {}]", request.getSummaryType());

        // 检查文档是否为空
        Map<String, Block> blocks = documentContext.getAllBlocksAsMap();
        if (blocks.isEmpty()) {
            return ResponseEntity.ok(SummarizeResponse.builder()
                    .status("error")
                    .message("文档为空，请先同步文档内容")
                    .summary("")
                    .build());
        }

        try {
            // 合并文档内容
            StringBuilder documentContent = new StringBuilder();
            blocks.values().forEach(block -> {
                if (block.getContent() != null && !block.getContent().trim().isEmpty()) {
                    documentContent.append(block.getContent()).append("\n\n");
                }
            });

            String content = documentContent.toString().trim();
            int originalWordCount = content.length();

            // 限制文档长度，避免超出模型上下文限制
            if (originalWordCount > 10000) {
                content = content.substring(0, 10000) + "\n\n[文档过长，已截断...]";
                log.warn("文档过长，已截断至10000字符");
            }

            // 生成摘要
            String summary = documentAgentService.generateSummary(
                    apiKey, baseUrl, modelName,
                    content, request.getSummaryType(), request.getMaxLength()
            );

            int summaryWordCount = summary.length();
            String compressionRatio = originalWordCount > 0
                    ? String.format("%.1f%%", (summaryWordCount * 100.0 / originalWordCount))
                    : "0%";

            // 提取关键要点（简单按行分割）
            List<String> keyPoints = summary.lines()
                    .filter(line -> line.trim().startsWith("-") || line.trim().startsWith("•") || line.trim().matches("^\\d+[.、]"))
                    .map(line -> line.replaceAll("^[-•\\d.、\\s]+", "").trim())
                    .filter(line -> !line.isEmpty())
                    .limit(10)
                    .toList();

            return ResponseEntity.ok(SummarizeResponse.builder()
                    .status("success")
                    .message("摘要生成成功")
                    .summary(summary)
                    .keyPoints(keyPoints.isEmpty() ? null : keyPoints)
                    .originalWordCount(originalWordCount)
                    .summaryWordCount(summaryWordCount)
                    .summaryType(request.getSummaryType())
                    .compressionRatio(compressionRatio)
                    .build());

        } catch (Exception e) {
            log.error("生成摘要失败: {}", e.getMessage(), e);
            return ResponseEntity.ok(SummarizeResponse.builder()
                    .status("error")
                    .message("生成摘要失败: " + e.getMessage())
                    .summary("")
                    .build());
        }
    }

    // ==================== 参考资料管理 API ====================

    /**
     * 上传参考文件
     *
     * @param docId 文档 ID
     * @param files 上传的文件（支持多文件）
     * @return 上传结果
     */
    @PostMapping("/references/upload")
    public ResponseEntity<ApiResponse<List<ReferenceFileInfo>>> uploadReferences(
            @RequestParam("docId") String docId,
            @RequestParam("files") MultipartFile[] files) {

        log.info("收到上传参考文件请求，共 {} 个文件", files.length);

        List<ReferenceFileInfo> uploadedFiles = new ArrayList<>();
        for (MultipartFile file : files) {
            try {
                ReferenceFileInfo fileInfo = referenceFileService.uploadFile(docId, file);
                uploadedFiles.add(fileInfo);
            } catch (Exception e) {
                log.error("上传文件失败 [{}]: {}", file.getOriginalFilename(), e.getMessage());
            }
        }

        if (uploadedFiles.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.fail("没有文件成功上传"));
        }

        return ResponseEntity.ok(ApiResponse.success(
                "上传成功，共 " + uploadedFiles.size() + " 个文件",
                uploadedFiles));
    }

    /**
     * 设置文档的自定义参考文件夹路径
     *
     * @param request 请求体，包含 docId 和 customPath
     * @return 设置结果
     */
    @PostMapping("/references/set-custom-folder")
    public ResponseEntity<ApiResponse<Map<String, String>>> setCustomFolder(
            @RequestBody Map<String, String> request) {
        
        String docId = request.get("docId");
        String customPath = request.get("customPath");

        
        if (docId == null || docId.trim().isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.fail("INVALID_REQUEST", "文档 ID 不能为空"));
        }
        
        if (customPath == null || customPath.trim().isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.fail("INVALID_REQUEST", "自定义路径不能为空"));
        }
        
        try {
            String folderPath = referenceFileService.setCustomDocFolder(docId, customPath);
            
            Map<String, String> result = new HashMap<>();
            result.put("docId", docId);
            result.put("folderPath", folderPath);
            
            log.info("✅ 成功设置文档 [{}] 的自定义文件夹路径：{}", docId, folderPath);
            return ResponseEntity.ok(ApiResponse.success("已设置自定义文件夹路径", result));
        } catch (Exception e) {
            log.error("❌ 设置自定义文件夹失败：{}", e.getMessage(), e);
            return ResponseEntity.badRequest()
                    .body(ApiResponse.fail("ERROR", "设置失败：" + e.getMessage()));
        }
    }

    /**
     * 获取参考文件列表
     *
     * @param docId 文档 ID
     * @return 文件列表
     */
    @GetMapping("/references/list")
    public ResponseEntity<ApiResponse<Map<String, Object>>> listReferences(
            @RequestParam("docId") String docId) {

        log.debug("获取参考文件列表：{}", docId);

        List<ReferenceFileInfo> files = referenceFileService.listFiles(docId);
        // 只获取文件夹路径，如果不存在则返回 null，不自动创建
        String folderPath = referenceFileService.getDocFolder(docId);
        // 获取基础路径用于前端显示提示
        String baseFolder = referenceFileService.getOrCreateRootFolder();

        Map<String, Object> result = new HashMap<>();
        result.put("docId", docId);
        result.put("folderPath", folderPath != null ? folderPath : "");
        result.put("files", files);
        result.put("folderExists", folderPath != null);
        result.put("baseFolder", baseFolder);

        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /**
     * 删除参考文件
     *
     * @param docId    文档 ID
     * @param fileName 文件名
     * @return 删除结果
     */
    @DeleteMapping("/references/delete")
    public ResponseEntity<ApiResponse<Void>> deleteReference(
            @RequestParam("docId") String docId,
            @RequestParam("fileName") String fileName) {

        log.info("删除参考文件：{}/{}", docId, fileName);

        try {
            referenceFileService.deleteFile(docId, fileName);
            return ResponseEntity.ok(ApiResponse.success("已删除文件：" + fileName, null));
        } catch (Exception e) {
            log.error("删除文件失败：{}", e.getMessage(), e);
            return ResponseEntity.badRequest()
                    .body(ApiResponse.fail("删除失败：" + e.getMessage()));
        }
    }

    /**
     * 分析参考文件并更新文档
     *
     * @param apiKey    API Key
     * @param baseUrl   基础 URL
     * @param modelName 模型名称
     * @param request   分析请求
     * @return 分析结果
     */
    @PostMapping("/references/analyze")
    public ResponseEntity<ReferenceAnalyzeResponse> analyzeReferences(
            @RequestHeader(ApiConstants.HEADER_API_KEY) String apiKey,
            @RequestHeader(ApiConstants.HEADER_BASE_URL) String baseUrl,
            @RequestHeader(ApiConstants.HEADER_MODEL_NAME) String modelName,
            @RequestBody ReferenceAnalyzeRequest request) {

        log.info("收到参考文件分析请求，共 {} 个文件", 
                request.getSelectedFiles() != null ? request.getSelectedFiles().size() : 0);

        // 检查文档是否为空
        if (documentContext.getAllBlocksAsMap().isEmpty()) {
            return ResponseEntity.ok(ReferenceAnalyzeResponse.builder()
                    .status("error")
                    .message("文档为空，请先同步文档内容")
                    .analyzedFiles(0)
                    .changed(false)
                    .build());
        }

        // 检查选中的文件
        if (request.getSelectedFiles() == null || request.getSelectedFiles().isEmpty()) {
            return ResponseEntity.ok(ReferenceAnalyzeResponse.builder()
                    .status("error")
                    .message("未选择任何参考文件")
                    .analyzedFiles(0)
                    .changed(false)
                    .build());
        }

        try {
            // 记录修改前的状态
            Map<String, Block> beforeMap = documentContext.getAllBlocksAsMap();

            // 解析所有选中的参考文件
            StringBuilder referencesContent = new StringBuilder();
            for (String fileName : request.getSelectedFiles()) {
                try {
                    String content = referenceFileService.parseFileContent(request.getDocId(), fileName);
                    referencesContent.append("=== ").append(fileName).append(" ===\n");
                    referencesContent.append(content).append("\n\n");
                    log.info("已解析参考文件：{}", fileName);
                } catch (Exception e) {
                    log.error("解析文件失败 [{}]: {}", fileName, e.getMessage());
                }
            }

            // 构建 Prompt
            String prompt = buildReferenceAnalysisPrompt(
                    referencesContent.toString(),
                    request.getUserInstruction()
            );

            // 调用 AI Agent 分析并更新文档
            String agentReply = documentAgentService.chat(apiKey, baseUrl, modelName, prompt, AgentType.GENERAL);
            log.info("AI 分析完成，回复长度：{}", agentReply != null ? agentReply.length() : 0);

            // 检查文档是否发生变更
            Map<String, Block> afterMap = documentContext.getAllBlocksAsMap();
            boolean changed = !afterMap.equals(beforeMap);

            // 如果用户明确要求“基于分析修改文档”，但首轮未产生变更，进行一次强制写入重试。
            if (!changed && isModificationRequested(request.getUserInstruction())) {
                String enforcementPrompt = buildReferenceModificationEnforcementPrompt(
                        referencesContent.toString(),
                        request.getUserInstruction(),
                        agentReply
                );
                String retryReply = documentAgentService.chat(apiKey, baseUrl, modelName, enforcementPrompt, AgentType.GENERAL);
                if (retryReply != null && !retryReply.isBlank()) {
                    agentReply = retryReply;
                }

                afterMap = documentContext.getAllBlocksAsMap();
                changed = !afterMap.equals(beforeMap);
                log.info("参考资料分析二次执行完成，changed={}", changed);
            }

            // 收集变更的区块 ID
            List<String> updatedBlocks = collectUpdatedBlocks(beforeMap, afterMap);

            String message = changed
                    ? "分析完成，文档已更新"
                    : "分析完成，但未检测到实际文档修改（请调整指令后重试）";

            return ResponseEntity.ok(ReferenceAnalyzeResponse.builder()
                    .status("success")
                    .message(message)
                    .agentReply(agentReply)
                    .analyzedFiles(request.getSelectedFiles().size())
                    .updatedBlocks(updatedBlocks)
                    .changed(changed)
                    .build());

        } catch (Exception e) {
            log.error("分析参考文件失败：{}", e.getMessage(), e);
            return ResponseEntity.ok(ReferenceAnalyzeResponse.builder()
                    .status("error")
                    .message("分析失败：" + e.getMessage())
                    .analyzedFiles(0)
                    .changed(false)
                    .build());
        }
    }

    /**
     * 构建参考文件分析的 Prompt（智能版）
     */
    private String buildReferenceAnalysisPrompt(String references, String userInstruction) {
        StringBuilder prompt = new StringBuilder();

        prompt.append("【任务目标】\n");
        prompt.append("根据用户提供的参考资料和指令，智能修改和优化文档内容。\n\n");

        prompt.append("【角色设定】\n");
        prompt.append("你是一个专业的文档编辑助手，擅长根据参考资料优化文档内容。\n\n");

        prompt.append("【参考资料】\n");
        prompt.append(references);
        prompt.append("\n");

        prompt.append("【用户指令】\n");
        prompt.append(userInstruction);
        prompt.append("\n\n");

        prompt.append("【可用工具函数】\n");
        prompt.append("1. readDocumentOutline(): 获取当前文档的全部段落ID和内容（必须首先调用此函数了解文档结构）\n");
        prompt.append("2. readParagraph(blockId): 读取指定段落的详细内容\n");
        prompt.append("3. updateParagraph(blockId, newContent): 更新指定段落的内容\n");
        prompt.append("4. insertAfter(blockId, content): 在指定段落后插入新段落\n");
        prompt.append("5. insertBefore(blockId, content): 在指定段落前插入新段落\n");
        prompt.append("6. deleteParagraph(blockId): 删除指定段落\n\n");

        prompt.append("【执行步骤】\n");
        prompt.append("1. 首先调用 readDocumentOutline() 获取文档结构\n");
        prompt.append("2. 仔细阅读参考资料内容和用户指令\n");
        prompt.append("3. 根据指令内容分析需要的文档修改操作：\n");
        prompt.append("   - \"扩充\"、\"补充\"、\"丰富\" → updateParagraph 更新内容\n");
        prompt.append("   - \"插入\"、\"添加\"、\"新增\" → insertAfter/insertBefore 插入内容\n");
        prompt.append("   - \"替换\"、\"改写\"、\"修改\" → updateParagraph 替换内容\n");
        prompt.append("   - \"删除\"、\"移除\"、\"去掉\" → deleteParagraph 删除内容\n");
        prompt.append("   - \"总结\"、\"对比\"、\"分析\" → 仅提供分析结果，不修改文档\n");
        prompt.append("4. 调用对应的工具函数执行操作（如有修改）\n");
        prompt.append("5. 最后输出一个简短的执行总结（2-3句话）\n\n");

        prompt.append("【重要提示】\n");
        prompt.append("- 必须首先调用 readDocumentOutline() 了解文档结构\n");
        prompt.append("- 准确指定目标段落 ID（如 p_0、p_1 等）\n");
        prompt.append("- 新内容应该与原文风格保持一致\n");
        prompt.append("- 修改完成后必须输出确认语句\n\n");

        prompt.append("开始执行：");

        return prompt.toString();
    }

    private List<String> collectUpdatedBlocks(Map<String, Block> beforeMap, Map<String, Block> afterMap) {
        List<String> updatedBlocks = new ArrayList<>();
        for (Map.Entry<String, Block> entry : afterMap.entrySet()) {
            Block beforeBlock = beforeMap.get(entry.getKey());
            if (beforeBlock == null || !beforeBlock.getContent().equals(entry.getValue().getContent())) {
                updatedBlocks.add(entry.getKey());
            }
        }
        return updatedBlocks;
    }

    private boolean isModificationRequested(String userInstruction) {
        if (userInstruction == null || userInstruction.isBlank()) {
            return false;
        }
        String text = userInstruction.toLowerCase();
        return text.contains("修改")
                || text.contains("改写")
                || text.contains("补充")
                || text.contains("扩充")
                || text.contains("插入")
                || text.contains("添加")
                || text.contains("新增")
                || text.contains("删除")
                || text.contains("替换");
    }

    private String buildReferenceModificationEnforcementPrompt(String references, String userInstruction, String firstReply) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("【二次执行要求】\n");
        prompt.append("用户已明确要求基于参考资料修改文档，但上一轮未产生任何实际文档变更。\n");
        prompt.append("你这次必须调用至少一个写入类工具（updateParagraph / insertAfter / insertBefore / deleteParagraph）完成修改。\n");
        prompt.append("禁止只返回说明文字而不调用工具。\n\n");

        prompt.append("【上一轮回复】\n");
        prompt.append(firstReply == null ? "(空)" : firstReply).append("\n\n");

        prompt.append("【参考资料】\n").append(references).append("\n\n");
        prompt.append("【用户原始指令】\n").append(userInstruction).append("\n\n");

        prompt.append("【执行步骤】\n");
        prompt.append("1. 先调用 readDocumentOutline()。\n");
        prompt.append("2. 选择最合适的 1~3 个段落执行实质修改。\n");
        prompt.append("3. 必须调用写入工具完成修改。\n");
        prompt.append("4. 最后用一句话说明你做了哪些修改（包含段落 ID）。\n");

        return prompt.toString();
    }
}
