package com.example.docs_agent.service;

/**
 * 请求级文档作用域上下文
 */
public final class DocumentScopeContext {

    private static final String DEFAULT_DOC_ID = "default";
    private static final ThreadLocal<String> DOC_SCOPE = new ThreadLocal<>();

    private DocumentScopeContext() {
    }

    public static void setCurrentDocId(String docId) {
        if (docId == null || docId.isBlank()) {
            DOC_SCOPE.set(DEFAULT_DOC_ID);
            return;
        }
        DOC_SCOPE.set(docId.trim());
    }

    public static String getCurrentDocId() {
        String docId = DOC_SCOPE.get();
        if (docId == null || docId.isBlank()) {
            return DEFAULT_DOC_ID;
        }
        return docId;
    }

    public static void clear() {
        DOC_SCOPE.remove();
    }
}
