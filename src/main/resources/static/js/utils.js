/**
 * 工具函数模块
 */

// 常量定义
const CHAT_HISTORY_KEY = 'docsAgentChatHistory';
const MAX_HISTORY_SIZE = 50;
const CUSTOM_TEMPLATES_KEY = 'customCommandTemplates';

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
    if (!window.currentDocId) {
        window.currentDocId = 'doc_' + Date.now();
    }
    return window.currentDocId;
}

/**
 * 获取 API 配置
 */
function getApiConfig() {
    return JSON.parse(localStorage.getItem('aiConfig') || '{}');
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
