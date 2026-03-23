package com.example.docs_agent.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * AI 工具配置
 */
@Data
@Configuration
@ConfigurationProperties(prefix = "ai.tools")
public class AiToolConfig {

    /**
     * 联网搜索超时（秒）
     */
    private int searchTimeoutSeconds = 12;

    /**
     * 联网搜索默认返回条数
     */
    private int searchMaxResults = 5;
}
