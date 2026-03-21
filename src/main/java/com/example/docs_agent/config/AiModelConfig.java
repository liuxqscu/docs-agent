package com.example.docs_agent.config;

import com.example.docs_agent.constant.ApiConstants;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * AI 模型配置类
 */
@Data
@Configuration
@ConfigurationProperties(prefix = "ai.model")
public class AiModelConfig {

    /**
     * API Key
     */
    private String apiKey;

    /**
     * 基础 URL
     */
    private String baseUrl = ApiConstants.DEFAULT_BASE_URL;

    /**
     * 模型名称
     */
    private String modelName = ApiConstants.DEFAULT_MODEL_NAME;

    /**
     * 超时时间（秒）
     */
    private int timeoutSeconds = ApiConstants.DEFAULT_TIMEOUT_SECONDS;

    /**
     * 摘要生成超时时间（秒）
     */
    private int summaryTimeoutSeconds = 180;

    /**
     * 聊天记忆窗口大小
     */
    private int chatMemorySize = ApiConstants.DEFAULT_CHAT_MEMORY_SIZE;

    /**
     * 获取超时时间 Duration 对象
     */
    public Duration getTimeout() {
        return Duration.ofSeconds(timeoutSeconds);
    }
}
