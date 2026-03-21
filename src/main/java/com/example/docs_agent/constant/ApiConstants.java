package com.example.docs_agent.constant;

/**
 * API 相关常量定义
 */
public final class ApiConstants {

    private ApiConstants() {
        // 工具类禁止实例化
    }

    /**
     * API 基础路径
     */
    public static final String API_BASE_PATH = "/api";

    /**
     * API 响应状态
     */
    public static final String STATUS_SUCCESS = "success";
    public static final String STATUS_FAIL = "fail";
    public static final String STATUS_ACCEPTED = "accepted";

    /**
     * 请求头常量
     */
    public static final String HEADER_API_KEY = "X-API-Key";
    public static final String HEADER_BASE_URL = "X-Base-URL";
    public static final String HEADER_MODEL_NAME = "X-Model-Name";

    /**
     * 区块 ID 前缀
     */
    public static final String BLOCK_PREFIX_PARAGRAPH = "p_";
    public static final String BLOCK_PREFIX_INSERT = "insert_after_";
    public static final String BLOCK_PREFIX_DELETE = "delete_";
    public static final String BLOCK_AI_SELECTION = "ai_selection";

    /**
     * 特殊标记
     */
    public static final String DELETED_MARKER = "[DELETED_MARKER]";
    public static final String CONTENT_CONTROL_TITLE = "AI_Target";

    /**
     * 默认配置
     */
    public static final String DEFAULT_BASE_URL = "https://api.siliconflow.cn/v1";
    public static final String DEFAULT_MODEL_NAME = "Qwen/Qwen3.5-397B-A17B";
    public static final int DEFAULT_CHAT_MEMORY_SIZE = 10;
    public static final int DEFAULT_TIMEOUT_SECONDS = 60;
}
