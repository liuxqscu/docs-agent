package com.example.docs_agent.config;

import com.example.docs_agent.constant.ApiConstants;
import com.example.docs_agent.service.DocumentScopeContext;
import com.example.docs_agent.service.DocumentScopeRegistry;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Optional;

/**
 * 为每个 API 请求绑定文档作用域，避免多文档间内存上下文互相覆盖。
 */
@Slf4j
@Component
public class DocumentScopeFilter extends OncePerRequestFilter {

    public static final String ATTR_RAW_CLIENT_DOC_ID = "rawClientDocId";
    public static final String ATTR_SESSION_ID = "sessionId";
    public static final String ATTR_SCOPE_ROUTING_KEY = "scopeRoutingKey";

    private static final String LEGACY_TIMESTAMP_DOC_ID_REGEX = "^doc_\\d{13,}$";
    private final DocumentScopeRegistry scopeRegistry;

    public DocumentScopeFilter(DocumentScopeRegistry scopeRegistry) {
        this.scopeRegistry = scopeRegistry;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path == null || !path.startsWith(ApiConstants.API_BASE_PATH);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        HttpSession session = request.getSession(true);
        String sessionId = session.getId();
        String paneId = request.getHeader(ApiConstants.HEADER_PANE_ID);
        if (paneId == null || paneId.isBlank()) {
            paneId = "pane_default";
        }

        String routingKey = sessionId + "|" + paneId;
        String sessionDefaultScope = "session_" + sessionId + "_pane_" + paneId + "_default";

        String rawClientDocId = request.getHeader(ApiConstants.HEADER_DOC_ID);
        String source = "header";
        if (rawClientDocId == null || rawClientDocId.isBlank()) {
            rawClientDocId = request.getParameter("docId");
            source = "parameter";
        }

        String resolvedScope;
        if (rawClientDocId == null || rawClientDocId.isBlank()) {
            Optional<String> lastScope = scopeRegistry.getLastScope(routingKey);
            resolvedScope = lastScope.orElse(sessionDefaultScope);
            source = lastScope.isPresent() ? "session-last" : "session-default";
        } else {
            Optional<String> mappedScope = scopeRegistry.resolveClientScope(routingKey, rawClientDocId);
            if (mappedScope.isPresent()) {
                resolvedScope = mappedScope.get();
                source = "client-mapped";
            } else if (rawClientDocId.matches(LEGACY_TIMESTAMP_DOC_ID_REGEX)) {
                final String legacyDocId = rawClientDocId;
                resolvedScope = scopeRegistry.getLastScope(routingKey)
                        .orElse("session_" + sessionId + "_legacy_" + legacyDocId);
                scopeRegistry.bindClientScope(routingKey, legacyDocId, resolvedScope);
                source = "legacy-header";
            } else {
                resolvedScope = rawClientDocId;
                scopeRegistry.bindClientScope(routingKey, rawClientDocId, resolvedScope);
                source = "client-raw";
            }
        }

        if (("session-default".equals(source) || "session-last".equals(source) || "legacy-header".equals(source) || "client-mapped".equals(source))
                && (request.getRequestURI().endsWith("/init-document") || request.getRequestURI().endsWith("/chat"))) {
            log.warn("请求作用域路由: path={}, source={}, rawClientDocId={}, resolvedScope={}",
                    request.getRequestURI(), source, rawClientDocId, resolvedScope);
        }

        request.setAttribute(ATTR_RAW_CLIENT_DOC_ID, rawClientDocId);
        request.setAttribute(ATTR_SESSION_ID, sessionId);
        request.setAttribute(ATTR_SCOPE_ROUTING_KEY, routingKey);

        scopeRegistry.setLastScope(routingKey, resolvedScope);
        DocumentScopeContext.setCurrentDocId(resolvedScope);
        response.setHeader(ApiConstants.HEADER_RESOLVED_SCOPE, resolvedScope);
        try {
            filterChain.doFilter(request, response);
        } finally {
            DocumentScopeContext.clear();
        }
    }
}
