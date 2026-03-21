package com.example.docs_agent.service;

import com.example.docs_agent.dto.ReferenceFileInfo;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 参考文件管理服务
 * 管理参考资料的上传、列表、删除等操作
 */
@Slf4j
@Service
public class ReferenceFileService {

    /**
     * 允许的上传文件类型白名单
     */
    private static final List<String> ALLOWED_EXTENSIONS = Arrays.asList(
            "pdf", "docx", "doc", "txt", "md", "tex", "rtf"
    );

    /**
     * 最大文件大小：10MB
     */
    private static final long MAX_FILE_SIZE = 10 * 1024 * 1024;

    /**
     * 参考资料根目录基础路径
     */
    private static final String BASE_FOLDER = System.getProperty("user.home") +
            File.separator + "docs-agent-references";

    /**
     * 文档 ID 到自定义文件夹路径的映射（内存缓存）
     * Key: docId, Value: customFolderPath
     */
    private static final Map<String, String> CUSTOM_FOLDER_PATHS = new ConcurrentHashMap<>();

    /**
     * 获取或创建根目录（懒加载）
     *
     * @return 根目录绝对路径
     */
    public String getOrCreateRootFolder() {
        Path rootPath = Paths.get(BASE_FOLDER);

        if (!Files.exists(rootPath)) {
            try {
                Files.createDirectories(rootPath);
                log.info("✅ 已创建参考资料根目录：{}", BASE_FOLDER);
            } catch (IOException e) {
                log.error("❌ 创建根目录失败：{}", e.getMessage(), e);
                throw new RuntimeException("无法创建参考资料根目录：" + e.getMessage(), e);
            }
        }

        return BASE_FOLDER;
    }

    /**
     * 设置文档的自定义文件夹路径
     *
     * @param docId       文档 ID
     * @param customPath  自定义文件夹路径
     * @return 设置后的完整路径
     */
    public String setCustomDocFolder(String docId, String customPath) {
        // 校验参数
        if (docId == null || docId.trim().isEmpty()) {
            throw new IllegalArgumentException("文档 ID 不能为空");
        }
        if (customPath == null || customPath.trim().isEmpty()) {
            throw new IllegalArgumentException("自定义路径不能为空");
        }

        // 1. 先规范化路径字符串（统一分隔符、去除首尾空格）
        String normalizedPathStr = customPath.trim();
        
        // 2. 强制转换为标准 Windows 路径格式（统一使用反斜杠）
        normalizedPathStr = normalizedPathStr.replace('/', '\\');

        
        // 3. 移除末尾的反斜杠（如果有）
        if (normalizedPathStr.endsWith("\\")) {
            normalizedPathStr = normalizedPathStr.substring(0, normalizedPathStr.length() - 1);
        }
        
        // 4. 严格验证 Windows 绝对路径格式：必须以盘符开头（如 C:\ 或 D:\）
        if (!normalizedPathStr.matches("^[a-zA-Z]:\\\\.*")) {
            throw new IllegalArgumentException(
                "无效的 Windows 绝对路径格式：" + normalizedPathStr + 
                "。路径必须以盘符开头，例如：D:\\MyFolder"
            );
        }
        
        log.info("🔍 收到自定义路径请求：{} -> {}", docId, normalizedPathStr);

        // 5. 创建 Path 对象用于文件操作
        Path customPathObj = Paths.get(normalizedPathStr);
        
        // 6. 双重验证路径是否合法
        if (!customPathObj.isAbsolute()) {
            throw new IllegalArgumentException("路径验证失败，不是绝对路径：" + normalizedPathStr);
        }

        // 7. 如果文件夹不存在，尝试创建
        if (!Files.exists(customPathObj)) {
            try {
                Files.createDirectories(customPathObj);
                log.info("✅ 已创建自定义参考文件夹：{}", normalizedPathStr);
            } catch (IOException e) {
                log.error("❌ 创建自定义文件夹失败：{}", e.getMessage(), e);
                throw new RuntimeException("无法创建自定义文件夹：" + e.getMessage(), e);
            }
        } else {
            log.info("ℹ️ 自定义文件夹已存在：{}", normalizedPathStr);
        }

        // 8. 保存到映射中（保存原始路径字符串）
        CUSTOM_FOLDER_PATHS.put(docId, normalizedPathStr);
        log.info("📝 已设置文档 [{}] 的自定义文件夹路径：{}", docId, normalizedPathStr);

        return normalizedPathStr;
    }

    /**
     * 获取文档的文件夹路径（优先返回自定义路径）
     *
     * @param docId 文档标识符
     * @return 文件夹绝对路径，如果不存在则返回 null
     */
    public String getDocFolder(String docId) {
        // 校验 docId 合法性
        if (docId == null || docId.trim().isEmpty()) {
            throw new IllegalArgumentException("文档 ID 不能为空");
        }

        // 先检查是否有自定义路径
        String customPath = CUSTOM_FOLDER_PATHS.get(docId);
        if (customPath != null) {
            Path customPathObj = Paths.get(customPath);
            if (Files.exists(customPathObj)) {
                return customPath;
            } else {
                log.warn("⚠️ 自定义文件夹不存在：{}", customPath);
                // 自定义路径不存在，从缓存中移除
                CUSTOM_FOLDER_PATHS.remove(docId);
            }
        }

        // 防止路径遍历攻击
        if (docId.contains("..") || docId.contains("/") || docId.contains("\\")) {
            throw new SecurityException("非法的文档 ID");
        }

        String docFolder = BASE_FOLDER + File.separator + docId;
        Path docPath = Paths.get(docFolder);

        if (Files.exists(docPath)) {
            return docFolder;
        }

        return null;
    }

    /**
     * 获取或创建文档子目录（优先使用自定义路径）
     *
     * @param docId 文档标识符
     * @return 子目录绝对路径
     */
    public String getOrCreateDocFolder(String docId) {
        // 先尝试获取自定义路径
        String customPath = CUSTOM_FOLDER_PATHS.get(docId);
        if (customPath != null) {
            Path customPathObj = Paths.get(customPath);
            if (Files.exists(customPathObj)) {
                return customPath;
            }
            // 自定义路径不存在，降级到默认路径
            log.warn("⚠️ 自定义文件夹不存在，使用默认路径：{}", customPath);
            CUSTOM_FOLDER_PATHS.remove(docId);
        }

        // 校验 docId 合法性
        if (docId == null || docId.trim().isEmpty()) {
            throw new IllegalArgumentException("文档 ID 不能为空");
        }

        // 防止路径遍历攻击
        if (docId.contains("..") || docId.contains("/") || docId.contains("\\")) {
            throw new SecurityException("非法的文档 ID");
        }

        String docFolder = BASE_FOLDER + File.separator + docId;
        Path docPath = Paths.get(docFolder);

        if (!Files.exists(docPath)) {
            try {
                Files.createDirectories(docPath);
                log.info("✅ 已创建文档子目录：{}", docFolder);
            } catch (IOException e) {
                log.error("❌ 创建文档子目录失败：{}", e.getMessage(), e);
                throw new RuntimeException("无法创建文档子目录：" + e.getMessage(), e);
            }
        }

        return docFolder;
    }

    /**
     * 上传文件到指定文档的参考目录
     *
     * @param docId  文档 ID
     * @param file   上传的文件
     * @return 保存后的文件信息
     */
    public ReferenceFileInfo uploadFile(String docId, MultipartFile file) {
        // 校验文件
        validateFile(file);

        // 获取或创建文档子目录（添加日志用于调试）
        log.info("📂 上传文件，准备获取文件夹路径，docId: {}", docId);
        String docFolder = getOrCreateDocFolder(docId);
        log.info("✅ 使用文件夹路径：{}", docFolder);

        // 处理文件名（过滤非法字符）
        String originalFilename = file.getOriginalFilename();
        String safeFileName = sanitizeFileName(originalFilename);

        // 处理重名情况：添加时间戳
        Path filePath = Paths.get(docFolder, safeFileName);
        if (Files.exists(filePath)) {
            String timestamp = String.valueOf(System.currentTimeMillis());
            String fileNameWithoutExt = getFileNameWithoutExtension(safeFileName);
            String extension = getFileExtension(safeFileName);
            safeFileName = fileNameWithoutExt + "_" + timestamp + "." + extension;
            filePath = Paths.get(docFolder, safeFileName);
            log.info("文件重名，已添加时间戳：{}", safeFileName);
        }

        // 保存文件
        try {
            file.transferTo(filePath.toFile());
            log.info("✅ 文件上传成功：{}", filePath);
        } catch (IOException e) {
            log.error("❌ 文件保存失败：{}", e.getMessage(), e);
            throw new RuntimeException("文件保存失败：" + e.getMessage(), e);
        }

        // 构建文件信息对象
        return buildReferenceFileInfo(filePath, docId);
    }

    /**
     * 获取指定文档的所有参考文件列表
     *
     * @param docId 文档 ID
     * @return 文件列表
     */
    public List<ReferenceFileInfo> listFiles(String docId) {
        // 先检查文件夹是否存在，不存在则返回空列表
        String docFolder = getDocFolder(docId);
        if (docFolder == null) {
            return new ArrayList<>();
        }

        List<ReferenceFileInfo> files = new ArrayList<>();

        try {
            File folder = new File(docFolder);
            File[] fileList = folder.listFiles();

            if (fileList != null) {
                for (File file : fileList) {
                    if (file.isFile()) {
                        String extension = getFileExtension(file.getName()).toLowerCase();
                        // 只返回支持的文件类型
                        if (ALLOWED_EXTENSIONS.contains(extension)) {
                            files.add(buildReferenceFileInfo(file.toPath(), docId));
                        }
                    }
                }
            }

            // 按修改时间倒序排列
            files.sort((f1, f2) -> f2.getUploadTime().compareTo(f1.getUploadTime()));

        } catch (Exception e) {
            log.error("扫描文件列表失败：{}", e.getMessage(), e);
        }

        return files;
    }

    /**
     * 删除指定文件
     *
     * @param docId    文档 ID
     * @param fileName 文件名
     */
    public void deleteFile(String docId, String fileName) {
        // 安全检查
        if (fileName.contains("..") || fileName.startsWith("/") || fileName.startsWith("\\")) {
            throw new SecurityException("非法的文件名");
        }

        String docFolder = getOrCreateDocFolder(docId);
        Path filePath = Paths.get(docFolder, fileName);

        if (!Files.exists(filePath)) {
            throw new RuntimeException("文件不存在：" + fileName);
        }

        try {
            Files.delete(filePath);
            log.info("✅ 已删除文件：{}", filePath);
        } catch (IOException e) {
            log.error("❌ 删除文件失败：{}", e.getMessage(), e);
            throw new RuntimeException("删除文件失败：" + e.getMessage(), e);
        }
    }

    /**
     * 解析文件内容为纯文本
     *
     * @param docId    文档 ID
     * @param fileName 文件名
     * @return 解析后的文本内容
     */
    public String parseFileContent(String docId, String fileName) {
        String docFolder = getOrCreateDocFolder(docId);
        Path filePath = Paths.get(docFolder, fileName);

        if (!Files.exists(filePath)) {
            throw new RuntimeException("文件不存在：" + fileName);
        }

        try {
            return FileContentParser.parseFile(filePath.toFile());
        } catch (Exception e) {
            log.error("文件解析失败：{}", e.getMessage(), e);
            throw new RuntimeException("文件解析失败：" + e.getMessage(), e);
        }
    }

    // ==================== 辅助方法 ====================

    /**
     * 校验文件
     */
    private void validateFile(MultipartFile file) {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("上传文件不能为空");
        }

        String originalFilename = file.getOriginalFilename();
        String extension = getFileExtension(originalFilename).toLowerCase();

        if (!ALLOWED_EXTENSIONS.contains(extension)) {
            throw new UnsupportedOperationException("不支持的文件类型：" + extension);
        }

        if (file.getSize() > MAX_FILE_SIZE) {
            throw new UnsupportedOperationException("文件大小超过 10MB 限制");
        }
    }

    /**
     * 过滤文件名非法字符
     */
    private String sanitizeFileName(String filename) {
        return filename.replaceAll("[/\\\\:*?\"<>|]", "_");
    }

    /**
     * 获取文件扩展名
     */
    private String getFileExtension(String filename) {
        int lastDot = filename.lastIndexOf('.');
        return (lastDot > 0 && lastDot < filename.length() - 1)
                ? filename.substring(lastDot + 1)
                : "";
    }

    /**
     * 获取不带扩展名的文件名
     */
    private String getFileNameWithoutExtension(String filename) {
        int lastDot = filename.lastIndexOf('.');
        return (lastDot > 0)
                ? filename.substring(0, lastDot)
                : filename;
    }

    /**
     * 构建文件信息对象
     */
    private ReferenceFileInfo buildReferenceFileInfo(Path filePath, String docId) {
        try {
            ReferenceFileInfo info = new ReferenceFileInfo();
            info.setFileName(filePath.getFileName().toString());
            info.setFilePath(filePath.toString());
            info.setFileSize(Files.size(filePath));
            info.setFileSizeReadable(formatFileSize(Files.size(filePath)));
            info.setFileType(getFileType(filePath.getFileName().toString()));
            info.setFileIcon(getFileIcon(filePath.getFileName().toString()));
            info.setUploadTime(LocalDateTime.ofInstant(
                    Files.getLastModifiedTime(filePath).toInstant(),
                    ZoneId.systemDefault()
            ));
            info.setDocId(docId);
            return info;
        } catch (IOException e) {
            log.error("读取文件信息失败：{}", e.getMessage(), e);
            throw new RuntimeException("读取文件信息失败：" + e.getMessage(), e);
        }
    }

    /**
     * 格式化文件大小
     */
    private String formatFileSize(long size) {
        if (size < 1024) {
            return size + " B";
        } else if (size < 1024 * 1024) {
            return String.format("%.1f KB", size / 1024.0);
        } else if (size < 1024 * 1024 * 1024) {
            return String.format("%.1f MB", size / (1024.0 * 1024.0));
        } else {
            return String.format("%.1f GB", size / (1024.0 * 1024.0 * 1024.0));
        }
    }

    /**
     * 获取文件类型
     */
    private String getFileType(String filename) {
        String ext = getFileExtension(filename).toUpperCase();
        if (Arrays.asList("PDF").contains(ext)) {
            return "PDF";
        } else if (Arrays.asList("DOCX", "DOC").contains(ext)) {
            return "DOCX";
        } else {
            return ext;
        }
    }

    /**
     * 获取文件图标
     */
    private String getFileIcon(String filename) {
        String ext = getFileExtension(filename).toLowerCase();
        return switch (ext) {
            case "pdf" -> "📄";
            case "docx", "doc" -> "📘";
            case "md" -> "📝";
            case "txt" -> "📃";
            case "tex" -> "📜";
            case "rtf" -> "📄";
            default -> "📁";
        };
    }
}
