package com.example.docs_agent.exception;

import com.example.docs_agent.constant.ApiConstants;
import com.example.docs_agent.dto.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.io.IOException;

/**
 * 全局异常处理器
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * 处理业务异常
     */
    @ExceptionHandler(DocAgentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiResponse<Void> handleDocAgentException(DocAgentException e) {
        log.error("业务异常: [{}] {}", e.getErrorCode(), e.getMessage());
        return ApiResponse.fail(e.getErrorCode(), e.getMessage());
    }

    /**
     * 处理 IO 异常
     */
    @ExceptionHandler(IOException.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ApiResponse<Void> handleIOException(IOException e) {
        log.error("IO 异常: {}", e.getMessage(), e);
        return ApiResponse.fail("IO_ERROR", "文件操作失败: " + e.getMessage());
    }

    /**
     * 处理非法参数异常
     */
    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiResponse<Void> handleIllegalArgumentException(IllegalArgumentException e) {
        log.error("参数异常: {}", e.getMessage());
        return ApiResponse.fail("INVALID_PARAM", e.getMessage());
    }

    /**
     * 处理所有其他异常
     */
    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ApiResponse<Void> handleException(Exception e) {
        log.error("系统异常: {}", e.getMessage(), e);
        return ApiResponse.fail("SYSTEM_ERROR", "系统内部错误: " + e.getMessage());
    }
}
