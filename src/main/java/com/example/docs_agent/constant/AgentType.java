package com.example.docs_agent.constant;

import lombok.Getter;

/**
 * Agent 类型枚举
 * 定义不同场景下的 AI Agent 角色和用途
 */
@Getter
public enum AgentType {

    /**
     * 通用文档助手 - 基础文档编辑和排版
     */
    GENERAL("general", "通用文档助手", "适用于各类文档的基础编辑和排版"),

    /**
     * 学术论文助手 - 针对学术论文的专业编辑
     */
    ACADEMIC("academic", "学术论文助手", "专注于学术论文的结构优化、语言润色和格式规范"),

    /**
     * 商业文案助手 - 针对营销和商业文档
     */
    BUSINESS("business", "商业文案助手", "优化商业文档的表达效果，提升说服力和专业性"),

    /**
     * 技术文档助手 - 针对技术文档和 API 文档
     */
    TECHNICAL("technical", "技术文档助手", "专注于技术文档的清晰度、准确性和可读性"),

    /**
     * 法律合同助手 - 针对法律文书的严谨性检查
     */
    LEGAL("legal", "法律合同助手", "确保法律文书的严谨性、准确性和条款完整性"),

    /**
     * 创意写作助手 - 针对小说、故事等创意内容
     */
    CREATIVE("creative", "创意写作助手", "辅助创意写作，优化叙事结构和文学表达"),

    /**
     * 自定义助手 - 用户自定义提示词
     */
    CUSTOM("custom", "自定义助手", "用户自定义的个性化 Agent");

    private final String code;
    private final String name;
    private final String description;

    AgentType(String code, String name, String description) {
        this.code = code;
        this.name = name;
        this.description = description;
    }

    /**
     * 根据 code 获取 AgentType
     *
     * @param code 类型代码
     * @return AgentType，找不到则返回 GENERAL
     */
    public static AgentType fromCode(String code) {
        for (AgentType type : values()) {
            if (type.code.equalsIgnoreCase(code)) {
                return type;
            }
        }
        return GENERAL;
    }

    /**
     * 检查是否为有效的类型代码
     *
     * @param code 类型代码
     * @return 是否有效
     */
    public static boolean isValid(String code) {
        for (AgentType type : values()) {
            if (type.code.equalsIgnoreCase(code)) {
                return true;
            }
        }
        return false;
    }
}
