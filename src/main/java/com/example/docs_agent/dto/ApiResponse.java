package com.example.docs_agent.dto;

import com.example.docs_agent.constant.ApiConstants;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 统一 API 响应封装
 *
 * @param <T> 响应数据类型
 */
@Data
public class ApiResponse<T> {

    /**
     * 响应状态
     */
    private String status;

    /**
     * 错误码
     */
    private String errorCode;

    /**
     * 响应消息
     */
    private String message;

    /**
     * 响应数据
     */
    private T data;

    /**
     * 响应时间戳
     */
    private LocalDateTime timestamp;

    public ApiResponse() {
        this.timestamp = LocalDateTime.now();
    }

    /**
     * 成功响应
     */
    public static <T> ApiResponse<T> success(T data) {
        ApiResponse<T> response = new ApiResponse<>();
        response.setStatus(ApiConstants.STATUS_SUCCESS);
        response.setData(data);
        return response;
    }

    /**
     * 成功响应（带消息）
     */
    public static <T> ApiResponse<T> success(String message, T data) {
        ApiResponse<T> response = new ApiResponse<>();
        response.setStatus(ApiConstants.STATUS_SUCCESS);
        response.setMessage(message);
        response.setData(data);
        return response;
    }

    /**
     * 失败响应
     */
    public static <T> ApiResponse<T> fail(String errorCode, String message) {
        ApiResponse<T> response = new ApiResponse<>();
        response.setStatus(ApiConstants.STATUS_FAIL);
        response.setErrorCode(errorCode);
        response.setMessage(message);
        return response;
    }

    /**
     * 失败响应（默认错误码）
     */
    public static <T> ApiResponse<T> fail(String message) {
        return fail("ERROR", message);
    }
}
