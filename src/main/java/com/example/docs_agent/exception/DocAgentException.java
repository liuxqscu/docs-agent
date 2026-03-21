package com.example.docs_agent.exception;

/**
 * 文档 Agent 业务异常
 */
public class DocAgentException extends RuntimeException {

    private final String errorCode;

    public DocAgentException(String message) {
        super(message);
        this.errorCode = "DOC_AGENT_ERROR";
    }

    public DocAgentException(String errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public DocAgentException(String message, Throwable cause) {
        super(message, cause);
        this.errorCode = "DOC_AGENT_ERROR";
    }

    public DocAgentException(String errorCode, String message, Throwable cause) {
        super(message, cause);
        this.errorCode = errorCode;
    }

    public String getErrorCode() {
        return errorCode;
    }
}
