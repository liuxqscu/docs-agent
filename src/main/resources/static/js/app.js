/**
 * DocPulse 主入口
 */

// ========== 初始化 ==========

/**
 * 隐藏加载动画
 */
function hideLoading() {
    // 隐藏全屏初始加载动画
    const loading = document.getElementById('loading');
    if (loading) {
        setTimeout(function() {
            loading.style.opacity = '0';
            setTimeout(function() {
                loading.style.display = 'none';
            }, 500);
        }, 1000);
    }
    
    // 隐藏聊天历史中的加载指示符（来自 utils.showLoading）
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.remove();
    }
}

function supportsModernSyntaxForDocPulse() {
    try {
        const fn = new Function('var a={b:1}; return (a?.b ?? 0) === 1;');
        return !!fn();
    } catch (e) {
        return false;
    }
}

async function detectOfficeHost(timeoutMs) {
    if (typeof Office === 'undefined' || !Office || typeof Office.onReady !== 'function') {
        return {
            mode: 'web',
            ready: false,
            host: null,
            timeout: false,
            error: null
        };
    }

    const timeoutPromise = new Promise(function (resolve) {
        setTimeout(function () {
            resolve({ timeout: true });
        }, timeoutMs || 8000);
    });

    const readyPromise = Office.onReady()
        .then(function (info) {
            return { info: info };
        })
        .catch(function (error) {
            return { error: error };
        });

    const result = await Promise.race([readyPromise, timeoutPromise]);
    if (result && result.timeout) {
        return {
            mode: 'office-timeout',
            ready: false,
            host: null,
            timeout: true,
            error: null
        };
    }

    if (result && result.error) {
        return {
            mode: 'office-error',
            ready: false,
            host: null,
            timeout: false,
            error: result.error
        };
    }

    const info = result && result.info ? result.info : null;
    const host = info && info.host ? info.host : null;
    return {
        mode: 'office-ready',
        ready: true,
        host: host,
        timeout: false,
        error: null
    };
}

function evaluateCompatibility(capability) {
    const reasons = [];

    if (!capability.hasPromise) reasons.push('缺少 Promise');
    if (!capability.hasFetch) reasons.push('缺少 fetch');
    if (!capability.supportsModernSyntax) reasons.push('不支持可选链/空值合并语法');

    if (capability.office.mode === 'office-timeout') {
        reasons.push('Office.onReady 超时（任务窗未完成初始化）');
    }
    if (capability.office.mode === 'office-error') {
        reasons.push('Office.onReady 报错：' + (capability.office.error && capability.office.error.message ? capability.office.error.message : '未知错误'));
    }

    const inWordHost = capability.office.ready && capability.office.host === 'Word';

    if (!inWordHost && capability.office.mode === 'office-ready') {
        reasons.push('当前不在 Word 宿主（host=' + capability.office.host + '）');
    }

    const compatibleForWordTaskpane = reasons.length === 0 && inWordHost;
    const compatibleForWebOnly = reasons.length === 0 && capability.office.mode === 'web';

    return {
        compatibleForWordTaskpane: compatibleForWordTaskpane,
        compatibleForWebOnly: compatibleForWebOnly,
        reasons: reasons
    };
}

async function runCompatibilityCheck(options) {
    const cfg = options || {};
    const silent = !!cfg.silent;

    const capability = {
        userAgent: navigator.userAgent,
        hasPromise: typeof Promise === 'function',
        hasFetch: typeof fetch === 'function',
        supportsModernSyntax: supportsModernSyntaxForDocPulse(),
        office: await detectOfficeHost(8000)
    };

    const result = evaluateCompatibility(capability);
    window.docPulseCompatibilityReport = {
        timestamp: Date.now(),
        capability: capability,
        result: result
    };

    if (silent) {
        return window.docPulseCompatibilityReport;
    }

    if (result.compatibleForWordTaskpane) {
        appendMessage('system', '[✓] 环境检测通过：当前设备可运行 Word 任务窗模式。');
        if (typeof showMessage === 'function') {
            showMessage('环境检测通过：可运行 Word 模式', 'success');
        }
        return window.docPulseCompatibilityReport;
    }

    if (result.compatibleForWebOnly) {
        appendMessage('system', '[!] 环境检测结果：当前为网页模式，可使用聊天与资料能力，但无法直接读取 Word 当前文档。');
        if (typeof showMessage === 'function') {
            showMessage('检测完成：当前为网页模式', 'warning');
        }
        return window.docPulseCompatibilityReport;
    }

    const reasonText = result.reasons.join('；');
    appendMessage('system', '[x] 环境检测未通过：' + reasonText + '。建议使用较新 Office/WebView2 环境，或改用网页模式。');
    if (typeof showMessage === 'function') {
        showMessage('检测未通过：' + reasonText, 'error');
    }

    return window.docPulseCompatibilityReport;
}

document.addEventListener('DOMContentLoaded', function() {
    try {
        // 初始化主题和布局
        if (typeof initTheme === 'function') initTheme();
        if (typeof initLayout === 'function') initLayout();

        // 初始化面板大小调整器
        if (typeof initResizer === 'function') initResizer();

        // 加载会话历史
        if (typeof loadChatHistory === 'function') loadChatHistory();

        if (typeof consumeDocIdMigrationFlag === 'function' && consumeDocIdMigrationFlag()) {
            appendMessage('system', '[i] 已检测到旧版会话标识，已自动切换到新隔离模式。');
        }

        // 初始化助手类型选择器
        initAgentTypeSelector();

        // 渲染快捷指令按钮（包括自定义指令）
        if (typeof renderCommandTemplateButtons === 'function') renderCommandTemplateButtons();
    } catch (error) {
        console.error('[x] 前端初始化失败:', error);
        if (typeof appendMessage === 'function') {
            appendMessage('system', '[x] 前端初始化失败：' + (error && error.message ? error.message : '未知错误'));
        }
    } finally {
        // 无论是否异常，都要移除启动遮罩，避免界面不可操作。
        hideLoading();
    }
    
    // Office.js 就绪后执行
    if (typeof Office !== 'undefined') {
        Office.onReady(async (info) => {
            if (info.host === Office.HostType.Word) {
                if (typeof reloadChatHistoryForCurrentDoc === 'function') {
                    reloadChatHistoryForCurrentDoc();
                }
                appendMessage('system', '[✓] 成功接入 Word 内部环境！');
                setTimeout(async function () {
                    try {
                        if (typeof syncDocumentFromWordToBackend === 'function') {
                            await syncDocumentFromWordToBackend();
                        } else {
                            appendMessage('system', '[!] 文档同步模块加载失败，请刷新任务窗重试。');
                        }
                    } catch (error) {
                        appendMessage('system', '[x] Word 初始化同步失败：' + (error && error.message ? error.message : '未知错误'));
                    }
                }, 500);
            } else {
                appendMessage('system', '[!] 未在 Word 环境中运行，尝试加载缓存。');
                if (typeof fetchDocumentState === 'function') {
                    fetchDocumentState(true);
                }
            }
        });
    }
    
    // 注意：参考文件列表不再自动加载，由用户手动点击刷新按钮或上传文件时触发
    // 这样可以避免首次加载时就为用户创建参考文件夹

    // 自动执行一次环境检测，帮助用户快速判断当前设备兼容性。
    setTimeout(function () {
        runCompatibilityCheck({ silent: false }).catch(function (error) {
            console.warn('[!] 环境检测执行失败:', error);
        });
    }, 1200);
});

/**
 * 初始化助手类型选择器
 */
function initAgentTypeSelector() {
    const agentTypeSelect = document.getElementById('agentTypeSelect');
    const customPromptBtn = document.getElementById('customPromptBtn');
    const savedAgentType = localStorage.getItem('selectedAgentType') || 'general';
    
    agentTypeSelect.value = savedAgentType;
    updateCustomPromptBtn();

    function updateCustomPromptBtn() {
        if (agentTypeSelect.value === 'custom') {
            customPromptBtn.classList.remove('is-hidden');
        } else {
            customPromptBtn.classList.add('is-hidden');
        }
    }

    agentTypeSelect.addEventListener('change', function() {
        localStorage.setItem('selectedAgentType', this.value);
        updateCustomPromptBtn();
        
        const selectedText = this.options[this.selectedIndex].text;
        appendMessage('system', `[◎] 已切换到：${selectedText}`);
    });
}

/**
 * 打开自定义提示词模态框
 */
function openCustomPromptModal() {
    const savedPrompt = localStorage.getItem('customSystemPrompt') || '';
    document.getElementById('customSystemPrompt').value = savedPrompt;
    document.getElementById('customPromptModal').style.display = 'flex';
}

/**
 * 关闭自定义提示词模态框
 */
function closeCustomPromptModal() {
    document.getElementById('customPromptModal').style.display = 'none';
}

/**
 * 保存自定义提示词
 */
function saveCustomPrompt() {
    const prompt = document.getElementById('customSystemPrompt').value.trim();
    if (!prompt) {
        showMessage('[!] 提示词内容不能为空', 'warning');
        return;
    }
    localStorage.setItem('customSystemPrompt', prompt);
    closeCustomPromptModal();
    appendMessage('system', '[✓] 自定义提示词已保存');
}

/**
 * 清除自定义提示词
 */
async function clearCustomPrompt() {
    // 使用自定义确认对话框（兼容 Office.js）
    const confirmed = await showConfirmDialog('确定要清除自定义提示词吗？');
    if (!confirmed) {
        return;
    }
    
    localStorage.removeItem('customSystemPrompt');
    document.getElementById('customSystemPrompt').value = '';
    appendMessage('system', '[⌦] 自定义提示词已清除');
}

/**
 * 点击模态框外部关闭
 */
window.onclick = function(event) {
    const modal = document.getElementById('customPromptModal');
    if (event.target === modal) {
        closeCustomPromptModal();
    }
};

// 导出全局函数
window.toggleTheme = toggleTheme;
window.toggleLayout = toggleLayout;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.saveSettings = saveSettings;
window.sendMessage = sendMessage;
window.lockSelection = lockSelection;
window.acceptChange = acceptChange;
window.rejectChange = rejectChange;
window.batchAcceptAll = batchAcceptAll;
window.batchRejectAll = batchRejectAll;
window.uploadReferences = uploadReferences;
window.refreshReferences = refreshReferences;
window.deleteReferenceFile = deleteReferenceFile;
window.analyzeReferences = analyzeReferences;
window.applyCommandTemplate = applyCommandTemplate;
window.clearChatHistory = clearChatHistory;
window.openSummarizeModal = openSummarizeModal;
window.openCustomPromptModal = openCustomPromptModal;
window.closeCustomPromptModal = closeCustomPromptModal;
window.saveCustomPrompt = saveCustomPrompt;
window.clearCustomPrompt = clearCustomPrompt;
window.redoLastMessage = redoLastMessage;
window.hideLoading = hideLoading;
// 模板设置相关函数
window.openTemplateSettings = openTemplateSettings;
window.closeTemplateSettings = closeTemplateSettings;
window.saveTemplateSettings = saveTemplateSettings;
window.addNewTemplate = addNewTemplate;
window.deleteTemplate = deleteTemplate;
window.resetToDefaults = resetToDefaults;
window.renderCommandTemplateButtons = renderCommandTemplateButtons;
window.runCompatibilityCheck = runCompatibilityCheck;
