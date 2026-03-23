/**
 * 工具函数模块
 */

// 常量定义
const CHAT_HISTORY_KEY_PREFIX = 'docsAgentChatHistory';
const MAX_HISTORY_SIZE = 50;
const CUSTOM_TEMPLATES_KEY = 'customCommandTemplates';
const DOC_SCOPE_HEADER = 'X-Doc-Id';
const DOC_PANE_ID_KEY = 'docPulsePaneId';

function buildChatHistoryStorageKey(scopeId) {
    return CHAT_HISTORY_KEY_PREFIX + ':' + String(scopeId || 'default');
}

function getCurrentHistoryScopeId() {
    return (window.currentHistoryScopeId || '').trim();
}

function normalizeHistoryScopeId(resolvedScope) {
    const scope = String(resolvedScope || '').trim();
    if (!scope) {
        return '';
    }

    if (scope.startsWith('route_')) {
        return scope;
    }

    const match = scope.match(/route_[^\s]+_doc_[0-9a-fA-F]{8,}/);
    return match ? match[0] : '';
}

/**
 * 使用后端返回的 resolvedScope 做历史迁移桥接。
 * 聊天历史仍以稳定 docId 作为主键，避免 scope 变化导致刷新后丢历史。
 */
function setCurrentHistoryScopeFromResolvedScope(resolvedScope) {
    const nextScopeId = normalizeHistoryScopeId(resolvedScope);
    if (!nextScopeId) {
        return false;
    }

    const previousScopeId = getCurrentHistoryScopeId();
    const stableDocKey = buildChatHistoryStorageKey(getCurrentDocId());
    const scopeKey = buildChatHistoryStorageKey(nextScopeId);

    try {
        if (stableDocKey !== scopeKey) {
            const docRaw = localStorage.getItem(stableDocKey);
            const scopeRaw = localStorage.getItem(scopeKey);

            // 兼容旧版：如果旧版把历史存到了 scopeKey，迁移回稳定 docKey。
            if (scopeRaw && !docRaw) {
                localStorage.setItem(stableDocKey, scopeRaw);
            }

            // 双写一份到 scopeKey，保证历史兼容读取。
            if (docRaw && !scopeRaw) {
                localStorage.setItem(scopeKey, docRaw);
            }

            // 从上一轮 scope 迁移到稳定 key。
            if (previousScopeId && previousScopeId !== nextScopeId) {
                const previousScopeKey = buildChatHistoryStorageKey(previousScopeId);
                const previousScopeRaw = localStorage.getItem(previousScopeKey);
                const latestDocRaw = localStorage.getItem(stableDocKey);
                if (previousScopeRaw && !latestDocRaw) {
                    localStorage.setItem(stableDocKey, previousScopeRaw);
                }
            }
        }
    } catch (e) {
        console.warn('[!] 迁移会话历史失败:', e);
    }

    window.currentHistoryScopeId = nextScopeId;
    return previousScopeId !== nextScopeId;
}

// 默认指令模板
const DEFAULT_COMMAND_TEMPLATES = {
    polish: { name: '润色', icon: '✨', text: '请润色这段文字，使其更加流畅和专业' },
    expand: { name: '扩写', icon: '📝', text: '请扩写这段内容，增加更多细节和解释' },
    simplify: { name: '精简', icon: '✂️', text: '请精简这段文字，保留核心信息' },
    translate: { name: '翻译', icon: '🌐', text: '请将这段内容翻译成英文' },
    summarize: { name: '总结', icon: '📋', text: '请总结这段文字的核心要点' },
    check: { name: '检查', icon: '🔍', text: '请检查这段内容的语法和表达问题' },
    analyzeRef: { name: '分析资料', icon: '📚', text: '请分析参考资料，并基于分析内容对文档进行适当修改' }
};

/**
 * HTML 转义函数
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

/**
 * 格式化日期时间
 */
function formatDateTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    if (diff < 60 * 1000) return '刚刚';
    if (diff < 60 * 60 * 1000) return Math.floor(diff / (60 * 1000)) + '分钟前';
    if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / (60 * 60 * 1000)) + '小时前';
    
    return date.toLocaleDateString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * 显示加载提示
 */
function showLoading(message) {
    hideLoading(); // 移除已存在的加载提示
    
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loadingIndicator';
    loadingDiv.className = 'message msg-system';
    loadingDiv.style.cssText = 'text-align: center; color: var(--accent-color); font-size: 14px; margin: 16px 0; padding: 12px; background: rgba(99, 102, 241, 0.1); border-radius: 8px; animation: pulse 2s infinite;';
    loadingDiv.innerHTML = `<span style="display: inline-block; margin-right: 8px; animation: spin 1s linear infinite;">⚙️</span>${escapeHtml(message)}`;
    loadingDiv.setAttribute('data-loading-time', Date.now());
    
    const historyEl = document.getElementById('chatHistory');
    historyEl.appendChild(loadingDiv);
    historyEl.scrollTop = historyEl.scrollHeight;
}

/**
 * 隐藏加载提示
 */
function hideLoading() {
    const loadingEl = document.getElementById('loadingIndicator');
    if (loadingEl) {
        loadingEl.remove();
    }
}

/**
 * 显示消息提示（临时 toast 通知）
 */
function showMessage(message, type = 'info') {
    const colorMap = {
        success: 'var(--success-color)',
        error: 'var(--error-color)',
        warning: 'var(--warning-color)',
        info: 'var(--info-color)'
    };
    
    const iconMap = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    const color = colorMap[type] || colorMap.info;
    const icon = iconMap[type] || iconMap.info;
    
    const toast = document.createElement('div');
    toast.style.cssText = `position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: ${color}; color: white; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500; z-index: 10001; box-shadow: 0 4px 20px rgba(0,0,0,0.3); animation: slideInDown 0.3s ease-out;`;
    toast.innerHTML = `<span style="margin-right: 8px;">${icon}</span>${escapeHtml(message)}`;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Markdown 渲染函数
 */
function renderMarkdown(text) {
    if (!text) return '';
    try {
        marked.setOptions({
            breaks: true,
            gfm: true,
            headerIds: false,
            mangle: false,
            sanitize: false
        });

        let html = marked.parse(text);
        html = html.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
        
        return html;
    } catch (e) {
        console.error('Markdown 渲染失败:', e);
        return escapeHtml(text);
    }
}

/**
 * 获取当前文档 ID
 */
function getCurrentDocId() {
    if (isLegacyTimestampDocId(window.currentDocId)) {
        const migratedFingerprint = buildDocFingerprint();
        window.currentDocFingerprint = migratedFingerprint;
        window.currentDocId = createDocIdFromFingerprint(migratedFingerprint);
        window.currentDocIdSource = isWordUrlFingerprint(migratedFingerprint) ? 'word-url' : 'ephemeral';
        window.docIdMigrated = true;
    }

    if (!window.currentDocId) {
        const fingerprint = buildDocFingerprint();
        window.currentDocFingerprint = fingerprint;
        window.currentDocId = createDocIdFromFingerprint(fingerprint);
        window.currentDocIdSource = isWordUrlFingerprint(fingerprint) ? 'word-url' : 'ephemeral';
    }
    return window.currentDocId;
}

/**
 * 获取当前文档会话历史的 localStorage 键
 */
function getChatHistoryStorageKey() {
    // 历史主键固定为稳定文档 ID，避免作用域切换导致会话丢失。
    return buildChatHistoryStorageKey(getCurrentDocId());
}

function buildDocFingerprint() {
    const paneId = getPaneSessionId();
    let source = 'pane:' + paneId + '|web:' + window.location.pathname;

    try {
        if (typeof Office !== 'undefined' && Office && Office.context && Office.context.document) {
            const officeUrl = (Office.context.document.url || '').trim();
            if (officeUrl) {
                // 对可识别 URL 的文档，不引入 paneId，保证刷新后 docId 稳定。
                source = 'word-url:' + officeUrl;
            }
        }
    } catch (e) {
        // ignore and fallback to web path
    }

    return source;
}

function isWordUrlFingerprint(fingerprint) {
    return String(fingerprint || '').startsWith('word-url:');
}

function createDocIdFromFingerprint(fingerprint) {
    const hash = simpleHash(fingerprint || 'unknown-doc');
    return 'doc_' + hash;
}

/**
 * 用同步得到的文档内容刷新当前文档身份（用于无 URL 场景的隔离）
 */
function updateCurrentDocIdentityFromBlocks(docBlocks) {
    const currentDocId = window.currentDocId || '';
    const currentSource = window.currentDocIdSource || '';
    const shouldPromote = !currentDocId || currentSource === 'ephemeral';
    if (!shouldPromote) {
        return {
            docId: currentDocId || getCurrentDocId(),
            changed: false
        };
    }

    const entries = Object.entries(docBlocks || {});
    const normalized = entries
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([blockId, text]) => `${blockId}:${String(text || '').trim()}`)
        .join('\n');

    const fingerprint = `content|count:${entries.length}|hash:${simpleHash(normalized)}`;
    const nextDocId = createDocIdFromFingerprint(fingerprint);

    try {
        if (currentDocId && currentDocId !== nextDocId) {
            const sourceKey = buildChatHistoryStorageKey(currentDocId);
            const targetKey = buildChatHistoryStorageKey(nextDocId);
            const sourceRaw = localStorage.getItem(sourceKey);
            const targetRaw = localStorage.getItem(targetKey);
            if (sourceRaw && !targetRaw) {
                localStorage.setItem(targetKey, sourceRaw);
            }
        }
    } catch (e) {
        console.warn('[!] 文档ID升级时迁移历史失败:', e);
    }

    window.currentDocFingerprint = fingerprint;
    window.currentDocId = nextDocId;
    window.currentDocIdSource = 'content';
    return {
        docId: nextDocId,
        changed: currentDocId !== nextDocId
    };
}

function getPaneSessionId() {
    try {
        let paneId = sessionStorage.getItem(DOC_PANE_ID_KEY);
        if (!paneId) {
            paneId = `pane_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
            sessionStorage.setItem(DOC_PANE_ID_KEY, paneId);
        }
        return paneId;
    } catch (e) {
        return `pane_fallback_${Math.random().toString(36).slice(2, 8)}`;
    }
}

function simpleHash(text) {
    const input = String(text || '');
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

/**
 * 获取 API 配置
 */
function getApiConfig() {
    return JSON.parse(localStorage.getItem('aiConfig') || '{}');
}

/**
 * 为 API 请求附加当前文档作用域头
 */
function withDocScopeHeaders(headers = {}) {
    const merged = { ...headers };
    merged[DOC_SCOPE_HEADER] = getCurrentDocId();
    merged['X-Pane-Id'] = getPaneSessionId();
    return merged;
}

function consumeDocIdMigrationFlag() {
    if (window.docIdMigrated) {
        window.docIdMigrated = false;
        return true;
    }
    return false;
}

function isLegacyTimestampDocId(docId) {
    if (!docId) {
        return false;
    }
    return /^doc_\d{13,}$/.test(String(docId));
}

/**
 * 自定义确认对话框（Promise 版本，兼容 Office.js）
 * @param {string} message - 确认消息
 * @returns {Promise<boolean>} - 用户是否确认
 */
function showConfirmDialog(message) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 10000;';

        modal.innerHTML = `
            <div style="background: var(--panel-bg); padding: 24px; border-radius: 12px; width: 400px; border: 1px solid var(--border-color); text-align: center;">
                <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                <div style="color: var(--text-color); margin-bottom: 24px; line-height: 1.6;">${escapeHtml(message)}</div>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button id="confirmCancelBtn" style="padding: 10px 24px; border: 1px solid var(--input-border); background: transparent; color: var(--text-color); border-radius: 6px; cursor: pointer;">取消</button>
                    <button id="confirmOkBtn" style="padding: 10px 24px; background: var(--accent-color); color: white; border: none; border-radius: 6px; cursor: pointer;">确定</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 绑定按钮事件
        modal.querySelector('#confirmCancelBtn').onclick = function() {
            modal.remove();
            resolve(false);
        };

        modal.querySelector('#confirmOkBtn').onclick = function() {
            modal.remove();
            resolve(true);
        };

        // 点击背景关闭
        modal.onclick = function(e) {
            if (e.target === modal) {
                modal.remove();
                resolve(false);
            }
        };
    });
}

/**
 * 自定义确认对话框（回调版本）
 */
function showCustomConfirm(message, onConfirm) {
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 10000;';

    modal.innerHTML = `
        <div style="background: var(--panel-bg); padding: 24px; border-radius: 12px; width: 400px; border: 1px solid var(--border-color); text-align: center;">
            <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
            <div style="color: var(--text-color); margin-bottom: 24px; line-height: 1.6;">${message}</div>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="confirmCancel" style="padding: 10px 24px; border: 1px solid var(--input-border); background: transparent; color: var(--text-color); border-radius: 6px; cursor: pointer;">取消</button>
                <button id="confirmOk" style="padding: 10px 24px; background: var(--error-color); color: white; border: none; border-radius: 6px; cursor: pointer;">确定</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#confirmCancel').onclick = function() {
        modal.remove();
    };

    modal.querySelector('#confirmOk').onclick = function() {
        modal.remove();
        onConfirm();
    };

    modal.onclick = function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    };
}
