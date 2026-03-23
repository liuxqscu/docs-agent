package com.example.docs_agent.service;

import com.example.docs_agent.config.AgentPromptConfig;
import com.example.docs_agent.config.AiModelConfig;
import com.example.docs_agent.constant.AgentType;
import com.example.docs_agent.constant.ApiConstants;
import com.example.docs_agent.constant.SystemMessageConstants;
import dev.langchain4j.memory.chat.MessageWindowChatMemory;
import dev.langchain4j.model.openai.OpenAiChatModel;
import dev.langchain4j.service.AiServices;
import dev.langchain4j.service.SystemMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.InterruptedIOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Document Agent 服务
 * 管理 AI Agent 的创建和缓存，支持多类型 Agent 提示词
 */
@Slf4j
@Service
public class DocumentAgentService {

    private final DocumentEditorTools documentEditorTools;
    private final WebSearchTools webSearchTools;
    private final AgentPromptConfig agentPromptConfig;
    private final AiModelConfig aiModelConfig;
    private final Map<String, Object> agentCache = new ConcurrentHashMap<>();

    public DocumentAgentService(DocumentEditorTools documentEditorTools,
                                WebSearchTools webSearchTools,
                                AgentPromptConfig agentPromptConfig,
                                AiModelConfig aiModelConfig) {
        this.documentEditorTools = documentEditorTools;
        this.webSearchTools = webSearchTools;
        this.agentPromptConfig = agentPromptConfig;
        this.aiModelConfig = aiModelConfig;
    }

    /**
     * AI Agent 接口定义 - 通用版本
     */
    public interface DocumentAgent {
        @SystemMessage(SystemMessageConstants.GENERAL_AGENT_SYSTEM_MESSAGE)
        String chat(String userMessage);
    }

    /**
     * 学术论文 Agent 接口
     */
    public interface AcademicDocumentAgent {
        @SystemMessage(SystemMessageConstants.ACADEMIC_AGENT_SYSTEM_MESSAGE)
        String chat(String userMessage);
    }

    /**
     * 商业文案 Agent 接口
     */
    public interface BusinessDocumentAgent {
        @SystemMessage(SystemMessageConstants.BUSINESS_AGENT_SYSTEM_MESSAGE)
        String chat(String userMessage);
    }

    /**
     * 技术文档 Agent 接口
     */
    public interface TechnicalDocumentAgent {
        @SystemMessage(SystemMessageConstants.TECHNICAL_AGENT_SYSTEM_MESSAGE)
        String chat(String userMessage);
    }

    /**
     * 法律文书 Agent 接口
     */
    public interface LegalDocumentAgent {
        @SystemMessage(SystemMessageConstants.LEGAL_AGENT_SYSTEM_MESSAGE)
        String chat(String userMessage);
    }

    /**
     * 创意写作 Agent 接口
     */
    public interface CreativeDocumentAgent {
        @SystemMessage(SystemMessageConstants.CREATIVE_AGENT_SYSTEM_MESSAGE)
        String chat(String userMessage);
    }

    /**
     * 获取 Agent 接口类
     *
     * @param agentType Agent 类型
     * @return Agent 接口类
     */
    @SuppressWarnings("unchecked")
    private Class<?> getAgentClass(AgentType agentType) {
        return switch (agentType) {
            case GENERAL -> DocumentAgent.class;
            case ACADEMIC -> AcademicDocumentAgent.class;
            case BUSINESS -> BusinessDocumentAgent.class;
            case TECHNICAL -> TechnicalDocumentAgent.class;
            case LEGAL -> LegalDocumentAgent.class;
            case CREATIVE -> CreativeDocumentAgent.class;
            case CUSTOM -> DocumentAgent.class; // 自定义类型使用通用接口，通过其他方式传入提示词
        };
    }

    /**
     * 获取或创建 Agent 实例（使用默认提示词）
     *
     * @param apiKey    API Key
     * @param baseUrl   基础 URL
     * @param modelName 模型名称
     * @return DocumentAgent 实例
     */
    public DocumentAgent getOrCreateAgent(String apiKey, String baseUrl, String modelName) {
        String cacheKey = apiKey + "|" + baseUrl + "|" + modelName + "|general";

        return (DocumentAgent) agentCache.computeIfAbsent(cacheKey, k -> {
            log.info("正在初始化新模型实例: {}", modelName);
            OpenAiChatModel model = OpenAiChatModel.builder()
                    .apiKey(apiKey)
                    .baseUrl(baseUrl)
                    .modelName(modelName)
                    .timeout(Duration.ofSeconds(ApiConstants.DEFAULT_TIMEOUT_SECONDS))
                    .build();

            return AiServices.builder(DocumentAgent.class)
                    .chatLanguageModel(model)
                    .chatMemory(MessageWindowChatMemory.withMaxMessages(ApiConstants.DEFAULT_CHAT_MEMORY_SIZE))
                    .tools(documentEditorTools, webSearchTools)
                    .build();
        });
    }

    /**
     * 获取或创建 Agent 实例（指定 Agent 类型）
     *
     * @param apiKey    API Key
     * @param baseUrl   基础 URL
     * @param modelName 模型名称
     * @param agentType Agent 类型
     * @return Agent 实例
     */
    @SuppressWarnings("unchecked")
    public <T> T getOrCreateAgent(String apiKey, String baseUrl, String modelName, AgentType agentType) {
        // 使用配置组合 + Agent 类型作为缓存 Key
        String cacheKey = apiKey + "|" + baseUrl + "|" + modelName + "|" + agentType.getCode();

        return (T) agentCache.computeIfAbsent(cacheKey, k -> {
            log.info("正在初始化新模型实例: {} [Agent类型: {}]", modelName, agentType.getName());
            OpenAiChatModel model = OpenAiChatModel.builder()
                    .apiKey(apiKey)
                    .baseUrl(baseUrl)
                    .modelName(modelName)
                    .timeout(Duration.ofSeconds(ApiConstants.DEFAULT_TIMEOUT_SECONDS))
                    .build();

            Class<T> agentClass = (Class<T>) getAgentClass(agentType);

            return AiServices.builder(agentClass)
                    .chatLanguageModel(model)
                    .chatMemory(MessageWindowChatMemory.withMaxMessages(ApiConstants.DEFAULT_CHAT_MEMORY_SIZE))
                    .tools(documentEditorTools, webSearchTools)
                    .build();
        });
    }

    /**
     * 使用配置对象获取或创建 Agent（默认类型）
     *
     * @param config AI 模型配置
     * @return DocumentAgent 实例
     */
    public DocumentAgent getOrCreateAgent(AiModelConfig config) {
        return getOrCreateAgent(config.getApiKey(), config.getBaseUrl(), config.getModelName());
    }

    /**
     * 与 Agent 进行对话（默认类型）
     *
     * @param apiKey      API Key
     * @param baseUrl     基础 URL
     * @param modelName   模型名称
     * @param userMessage 用户消息
     * @return Agent 回复
     */
    public String chat(String apiKey, String baseUrl, String modelName, String userMessage) {
        DocumentAgent agent = getOrCreateAgent(apiKey, baseUrl, modelName);
        try {
            return agent.chat(userMessage);
        } catch (Exception e) {
            log.error("Agent 对话失败: {}", e.getMessage(), e);
            throw new RuntimeException("Agent 执行异常: " + e.getMessage(), e);
        }
    }

    /**
     * 与 Agent 进行对话（指定类型）
     *
     * @param apiKey      API Key
     * @param baseUrl     基础 URL
     * @param modelName   模型名称
     * @param userMessage 用户消息
     * @param agentType   Agent 类型
     * @return Agent 回复
     */
    public String chat(String apiKey, String baseUrl, String modelName, String userMessage, AgentType agentType) {
        try {
            return switch (agentType) {
                case GENERAL -> {
                    DocumentAgent agent = getOrCreateAgent(apiKey, baseUrl, modelName);
                    yield agent.chat(userMessage);
                }
                case ACADEMIC -> {
                    AcademicDocumentAgent agent = getOrCreateAgent(apiKey, baseUrl, modelName, AgentType.ACADEMIC);
                    yield agent.chat(userMessage);
                }
                case BUSINESS -> {
                    BusinessDocumentAgent agent = getOrCreateAgent(apiKey, baseUrl, modelName, AgentType.BUSINESS);
                    yield agent.chat(userMessage);
                }
                case TECHNICAL -> {
                    TechnicalDocumentAgent agent = getOrCreateAgent(apiKey, baseUrl, modelName, AgentType.TECHNICAL);
                    yield agent.chat(userMessage);
                }
                case LEGAL -> {
                    LegalDocumentAgent agent = getOrCreateAgent(apiKey, baseUrl, modelName, AgentType.LEGAL);
                    yield agent.chat(userMessage);
                }
                case CREATIVE -> {
                    CreativeDocumentAgent agent = getOrCreateAgent(apiKey, baseUrl, modelName, AgentType.CREATIVE);
                    yield agent.chat(userMessage);
                }
                case CUSTOM -> {
                    // 自定义类型使用通用 Agent，但可以通过其他方式（如配置）影响行为
                    DocumentAgent agent = getOrCreateAgent(apiKey, baseUrl, modelName);
                    yield agent.chat(userMessage);
                }
            };
        } catch (Exception e) {
            log.error("Agent 对话失败 [类型: {}]: {}", agentType.getName(), e.getMessage(), e);
            throw new RuntimeException("Agent 执行异常 [" + agentType.getName() + "]: " + e.getMessage(), e);
        }
    }

    /**
     * 与 Agent 进行对话（使用自定义提示词）
     * 注意：由于 langchain4j 注解限制，自定义提示词通过配置方式实现
     *
     * @param apiKey       API Key
     * @param baseUrl      基础 URL
     * @param modelName    模型名称
     * @param userMessage  用户消息
     * @param customPrompt 自定义系统提示词
     * @return Agent 回复
     */
    public String chatWithCustomPrompt(String apiKey, String baseUrl, String modelName, String userMessage, String customPrompt) {
        // 临时设置自定义提示词到常量类
        SystemMessageConstants.setCustomPrompt(customPrompt);
        try {
            // 创建新的 Agent 实例使用自定义提示词
            log.info("正在初始化自定义提示词模型实例: {}", modelName);
            OpenAiChatModel model = OpenAiChatModel.builder()
                    .apiKey(apiKey)
                    .baseUrl(baseUrl)
                    .modelName(modelName)
                    .timeout(Duration.ofSeconds(ApiConstants.DEFAULT_TIMEOUT_SECONDS))
                    .build();

            // 使用接口实现自定义提示词
            CustomDocumentAgent agent = AiServices.builder(CustomDocumentAgent.class)
                    .chatLanguageModel(model)
                    .chatMemory(MessageWindowChatMemory.withMaxMessages(ApiConstants.DEFAULT_CHAT_MEMORY_SIZE))
                    .tools(documentEditorTools, webSearchTools)
                    .build();

            return agent.chat(userMessage);
        } catch (Exception e) {
            log.error("Agent 对话失败 [自定义提示词]: {}", e.getMessage(), e);
            throw new RuntimeException("Agent 执行异常 [自定义提示词]: " + e.getMessage(), e);
        }
    }

    /**
     * 自定义 Agent 接口 - 使用动态设置的提示词
     */
    public interface CustomDocumentAgent {
        @SystemMessage("${custom.system.message}")
        String chat(String userMessage);
    }

    /**
     * 清除指定配置的 Agent 缓存
     *
     * @param apiKey    API Key
     * @param baseUrl   基础 URL
     * @param modelName 模型名称
     */
    public void clearAgentCache(String apiKey, String baseUrl, String modelName) {
        // 清除该配置下的所有 Agent 类型缓存
        for (AgentType type : AgentType.values()) {
            String cacheKey = apiKey + "|" + baseUrl + "|" + modelName + "|" + type.getCode();
            agentCache.remove(cacheKey);
        }
        log.info("已清除 Agent 缓存: {}", modelName);
    }

    /**
     * 清除所有 Agent 缓存
     */
    public void clearAllAgentCache() {
        agentCache.clear();
        log.info("已清除所有 Agent 缓存");
    }

    /**
     * 生成文档摘要
     *
     * @param apiKey      API Key
     * @param baseUrl     基础 URL
     * @param modelName   模型名称
     * @param documentContent 文档内容
     * @param summaryType 摘要类型
     * @param maxLength   最大长度
     * @return 生成的摘要
     */
    public String generateSummary(String apiKey, String baseUrl, String modelName,
                                   String documentContent, String summaryType, int maxLength) {
        log.info("开始生成文档摘要 [类型: {}, 最大长度: {}]", summaryType, maxLength);

        // 构建摘要提示词
        String prompt = buildSummaryPrompt(documentContent, summaryType, maxLength);

        try {
            int summaryTimeoutSeconds = Math.max(aiModelConfig.getSummaryTimeoutSeconds(), 1);

            // 创建专用的摘要生成模型实例（不使用工具）
            OpenAiChatModel model = OpenAiChatModel.builder()
                    .apiKey(apiKey)
                    .baseUrl(baseUrl)
                    .modelName(modelName)
                    .timeout(Duration.ofSeconds(summaryTimeoutSeconds))
                    .build();

            // 直接调用模型生成摘要
            return model.generate(prompt);
        } catch (Exception e) {
            if (isTimeoutException(e)) {
                int timeoutSeconds = Math.max(aiModelConfig.getSummaryTimeoutSeconds(), 1);
                log.error("生成摘要超时（{}秒）: {}", timeoutSeconds, e.getMessage(), e);
                throw new RuntimeException("AI 服务响应超时（" + timeoutSeconds + "秒）。请稍后重试，或缩短文档内容后再生成摘要。", e);
            }
            log.error("生成摘要失败: {}", e.getMessage(), e);
            throw new RuntimeException("生成摘要失败: " + e.getMessage(), e);
        }
    }

    private boolean isTimeoutException(Throwable throwable) {
        Throwable current = throwable;
        while (current != null) {
            if (current instanceof InterruptedIOException) {
                return true;
            }

            String message = current.getMessage();
            if (message != null) {
                String lowerMessage = message.toLowerCase();
                if (lowerMessage.contains("timeout") || lowerMessage.contains("timed out")) {
                    return true;
                }
            }

            current = current.getCause();
        }
        return false;
    }

    /**
     * 构建摘要提示词
     */
    private String buildSummaryPrompt(String documentContent, String summaryType, int maxLength) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("请对以下文档进行摘要，要求：\n\n");

        switch (summaryType) {
            case "brief":
                prompt.append("- 生成一句话摘要（不超过50字）\n");
                prompt.append("- 简明扼要地概括文档核心内容\n");
                break;
            case "outline":
                prompt.append("- 生成大纲式摘要\n");
                prompt.append("- 使用层级结构展示主要内容\n");
                prompt.append("- 突出关键章节和要点\n");
                prompt.append("- 字数控制在 ").append(maxLength).append(" 字以内\n");
                break;
            case "detailed":
                prompt.append("- 生成详细摘要\n");
                prompt.append("- 包含背景、主要论点、结论等要素\n");
                prompt.append("- 保留重要细节和数据\n");
                prompt.append("- 字数控制在 ").append(maxLength).append(" 字以内\n");
                break;
            case "keypoints":
                prompt.append("- 提取关键要点\n");
                prompt.append("- 使用 bullet points 格式\n");
                prompt.append("- 列出 5-10 个核心要点\n");
                prompt.append("- 每个要点简洁明了\n");
                break;
            default:
                prompt.append("- 生成标准摘要\n");
                prompt.append("- 字数控制在 ").append(maxLength).append(" 字以内\n");
        }

        prompt.append("\n文档内容：\n");
        prompt.append(documentContent);
        prompt.append("\n\n请直接输出摘要内容，不要添加额外说明。");

        return prompt.toString();
    }
}
