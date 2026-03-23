package com.example.docs_agent.service;

import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 文档作用域映射注册表
 * 用于将旧版前端 docId（如 doc_时间戳）映射到稳定的服务端文档作用域。
 */
@Service
public class DocumentScopeRegistry {

    private final ConcurrentHashMap<String, String> clientScopeMap = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, String> lastScopeBySession = new ConcurrentHashMap<>();

    public Optional<String> resolveClientScope(String routingKey, String clientDocId) {
        if (isBlank(routingKey) || isBlank(clientDocId)) {
            return Optional.empty();
        }
        return Optional.ofNullable(clientScopeMap.get(buildClientKey(routingKey, clientDocId)));
    }

    public void bindClientScope(String routingKey, String clientDocId, String resolvedScope) {
        if (isBlank(routingKey) || isBlank(clientDocId) || isBlank(resolvedScope)) {
            return;
        }
        clientScopeMap.put(buildClientKey(routingKey, clientDocId), resolvedScope);
    }

    public Optional<String> resolveLegacyScope(String sessionId, String clientDocId) {
        return resolveClientScope(sessionId, clientDocId);
    }

    public void bindLegacyScope(String sessionId, String clientDocId, String resolvedScope) {
        bindClientScope(sessionId, clientDocId, resolvedScope);
    }

    public Optional<String> getLastScope(String sessionId) {
        if (isBlank(sessionId)) {
            return Optional.empty();
        }
        return Optional.ofNullable(lastScopeBySession.get(sessionId));
    }

    public void setLastScope(String sessionId, String scopeId) {
        if (isBlank(sessionId) || isBlank(scopeId)) {
            return;
        }
        lastScopeBySession.put(sessionId, scopeId);
    }

    private String buildClientKey(String routingKey, String clientDocId) {
        return routingKey + "|" + clientDocId;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
