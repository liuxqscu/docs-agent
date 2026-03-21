package com.example.docs_agent.dto;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 参考文件信息 DTO
 * 用于封装参考文件的元数据
 */
@Data
public class ReferenceFileInfo {

    /**
     * 文件名
     */
    private String fileName;

    /**
     * 文件完整路径
     */
    private String filePath;

    /**
     * 文件大小（字节）
     */
    private long fileSize;

    /**
     * 可读的文件大小（如：2.3 MB）
     */
    private String fileSizeReadable;

    /**
     * 文件类型：PDF/DOCX/TXT/MD/TEX/RTF
     */
    private String fileType;

    /**
     * 文件图标
     */
    private String fileIcon;

    /**
     * 上传/修改时间
     */
    private LocalDateTime uploadTime;

    /**
     * 所属文档 ID
     */
    private String docId;
}
