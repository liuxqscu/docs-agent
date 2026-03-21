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

document.addEventListener('DOMContentLoaded', function() {
    // 初始化主题和布局
    initTheme();
    initLayout();
    
    // 初始化面板大小调整器
    initResizer();
    
    // 加载会话历史
    loadChatHistory();
    
    // 初始化助手类型选择器
    initAgentTypeSelector();
    
    // 渲染快捷指令按钮（包括自定义指令）
    renderCommandTemplateButtons();
    
    // 隐藏加载动画
    hideLoading();
    
    // Office.js 就绪后执行
    if (typeof Office !== 'undefined') {
        Office.onReady(async (info) => {
            if (info.host === Office.HostType.Word) {
                appendMessage('system', '[✓] 成功接入 Word 内部环境！');
                setTimeout(async () => {
                    await syncDocumentFromWordToBackend();
                }, 500);
            } else {
                appendMessage('system', '[!] 未在 Word 环境中运行，尝试加载缓存。');
                fetchDocumentState(true);
            }
        });
    }
    
    // 注意：参考文件列表不再自动加载，由用户手动点击刷新按钮或上传文件时触发
    // 这样可以避免首次加载时就为用户创建参考文件夹
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
