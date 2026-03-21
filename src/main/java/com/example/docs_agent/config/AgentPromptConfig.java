package com.example.docs_agent.config;

import com.example.docs_agent.constant.AgentType;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.util.HashMap;
import java.util.Map;

/**
 * Agent 提示词配置类
 * 支持通过配置文件自定义各类 Agent 的提示词
 */
@Data
@Configuration
@ConfigurationProperties(prefix = "agent.prompt")
public class AgentPromptConfig {

    /**
     * 默认 Agent 类型
     */
    private String defaultType = "general";

    /**
     * 是否允许前端覆盖提示词类型
     */
    private boolean allowClientOverride = true;

    /**
     * 是否允许自定义提示词
     */
    private boolean allowCustomPrompt = true;

    /**
     * 自定义提示词存储（key: agentTypeCode, value: prompt）
     */
    private Map<String, String> customPrompts = new HashMap<>();

    /**
     * 获取默认 Agent 类型
     *
     * @return AgentType
     */
    public AgentType getDefaultAgentType() {
        return AgentType.fromCode(defaultType);
    }

    /**
     * 添加自定义提示词
     *
     * @param agentTypeCode Agent 类型代码
     * @param prompt        提示词内容
     */
    public void addCustomPrompt(String agentTypeCode, String prompt) {
        customPrompts.put(agentTypeCode, prompt);
    }

    /**
     * 获取自定义提示词
     *
     * @param agentTypeCode Agent 类型代码
     * @return 提示词内容，如果不存在返回 null
     */
    public String getCustomPrompt(String agentTypeCode) {
        return customPrompts.get(agentTypeCode);
    }

    /**
     * 检查是否有自定义提示词
     *
     * @param agentTypeCode Agent 类型代码
     * @return 是否有自定义提示词
     */
    public boolean hasCustomPrompt(String agentTypeCode) {
        return customPrompts.containsKey(agentTypeCode);
    }

    /**
     * 移除自定义提示词
     *
     * @param agentTypeCode Agent 类型代码
     */
    public void removeCustomPrompt(String agentTypeCode) {
        customPrompts.remove(agentTypeCode);
    }
}
