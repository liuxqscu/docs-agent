/**
 * 配置管理模块
 */

// 全局状态
let isProcessing = false;
let lastUserMessage = '';
let lastLockedSelection = null;
let selectionTargetMap = {};

/**
 * 打开设置对话框
 */
function openSettings() {
    document.getElementById('settingsModal').style.display = 'flex';
    const config = JSON.parse(localStorage.getItem('aiConfig') || '{}');
    document.getElementById('cfgApiKey').value = config.apiKey || '';
    document.getElementById('cfgBaseUrl').value = config.baseUrl || 'https://api.siliconflow.cn/v1';
    document.getElementById('cfgModelName').value = config.modelName || 'Qwen/Qwen3.5-397B-A17B';
}

/**
 * 关闭设置对话框
 */
function closeSettings() {
    document.getElementById('settingsModal').style.display = 'none';
}

/**
 * 保存设置
 */
function saveSettings() {
    const config = {
        apiKey: document.getElementById('cfgApiKey').value.trim(),
        baseUrl: document.getElementById('cfgBaseUrl').value.trim(),
        modelName: document.getElementById('cfgModelName').value.trim()
    };
    
    if (!config.apiKey) {
        showMessage("⚠️ API Key 不能为空！", "warning");
        return;
    }
    
    localStorage.setItem('aiConfig', JSON.stringify(config));
    closeSettings();
    appendMessage('system', `✅ 配置已保存，当前使用模型：${config.modelName}`);
}

/**
 * 获取指令模板（合并默认和自定义）
 */
function getCommandTemplates() {
    try {
        const custom = JSON.parse(localStorage.getItem(CUSTOM_TEMPLATES_KEY) || '{}');
        return { ...DEFAULT_COMMAND_TEMPLATES, ...custom };
    } catch (e) {
        return DEFAULT_COMMAND_TEMPLATES;
    }
}

/**
 * 应用指令模板
 */
function applyCommandTemplate(templateKey) {
    const templates = getCommandTemplates();
    const template = templates[templateKey];
    if (!template) return;

    const inputEl = document.getElementById('userInput');
    let commandText = template.text;

    // 如果有选区，追加选区内容
    if (lastLockedSelection && lastLockedSelection.text) {
        commandText += '\n\n选区内容：' + lastLockedSelection.text;
    }

    inputEl.value = commandText;
    inputEl.focus();
}

/**
 * 渲染快捷指令按钮/下拉菜单
 */
function renderCommandTemplateButtons() {
    // 填充快捷指令下拉框
    const selectElement = document.getElementById('commandTemplateSelect');
    if (!selectElement) return;
    
    const templates = getCommandTemplates();
    let html = '<option value="">快捷指令</option>';
    
    for (const [key, template] of Object.entries(templates)) {
        const icon = template.icon || '📝';
        const name = template.name || key;
        html += `<option value="${key}">${icon} ${name}</option>`;
    }
    
    selectElement.innerHTML = html;
    
    // 移除旧的事件监听器（避免重复绑定）
    const newElement = selectElement.cloneNode(true);
    selectElement.parentNode.replaceChild(newElement, selectElement);
    
    // 绑定下拉选择事件
    document.getElementById('commandTemplateSelect').addEventListener('change', function(e) {
        if (this.value) {
            applyCommandTemplate(this.value);
            // 重置选择
            this.value = '';
        }
    });
}

/**
 * 打开指令模板设置对话框
 */
function openTemplateSettings() {
    const modal = document.createElement('div');
    modal.id = 'templateSettingsModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 10000;';

    const customTemplates = JSON.parse(localStorage.getItem(CUSTOM_TEMPLATES_KEY) || '{}');
    
    // 常用图标库
    const iconOptions = [
        { icon: '✨', label: '闪亮' },
        { icon: '📝', label: '写作' },
        { icon: '✂️', label: '剪刀' },
        { icon: '🌐', label: '地球' },
        { icon: '📋', label: '剪贴板' },
        { icon: '🔍', label: '搜索' },
        { icon: '✏️', label: '铅笔' },
        { icon: '🎨', label: '调色板' },
        { icon: '💡', label: '灯泡' },
        { icon: '🚀', label: '火箭' },
        { icon: '⭐', label: '星星' },
        { icon: '❤️', label: '爱心' },
        { icon: '✅', label: '对勾' },
        { icon: '📌', label: '图钉' },
        { icon: '🔥', label: '火焰' },
        { icon: '🎯', label: '靶心' },
        { icon: '📊', label: '图表' },
        { icon: '💬', label: '对话' },
        { icon: '📖', label: '书本' },
        { icon: '🔧', label: '工具' }
    ];
    
    modal.innerHTML = `
        <div style="background: var(--panel-bg); padding: 24px; border-radius: 12px; width: 700px; max-height: 80vh; overflow-y: auto; border: 1px solid var(--border-color);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
                <h3 style="color: var(--text-color); margin: 0;">📝 自定义快捷指令</h3>
                <button onclick="closeTemplateSettings()" style="background: none; border: none; font-size: 24px; color: var(--text-secondary); cursor: pointer; line-height: 1;">×</button>
            </div>
            
            <div style="margin-bottom: 20px; padding: 12px; background: var(--block-bg); border-radius: 8px; font-size: 13px; color: var(--text-secondary);">
                💡 提示：您可以自定义快捷指令的名称、图标和内容，自定义的指令将覆盖默认指令
            </div>

            <div id="templateList" style="display: grid; gap: 12px;">
                ${renderTemplateList(customTemplates, iconOptions)}
            </div>

            <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-color);">
                <button onclick="addNewTemplate()" style="padding: 10px 20px; background: transparent; color: var(--accent-color); border: 1px solid var(--accent-color); border-radius: 6px; cursor: pointer;">
                    ➕ 添加新指令
                </button>
                <button onclick="resetToDefaults()" style="padding: 10px 20px; background: transparent; color: var(--warning-color); border: 1px solid var(--warning-color); border-radius: 6px; cursor: pointer;">
                    🔄 恢复默认
                </button>
                <button onclick="saveTemplateSettings()" style="padding: 10px 20px; background: var(--accent-color); color: white; border: none; border-radius: 6px; cursor: pointer;">
                    ✓ 保存
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

/**
 * 渲染模板列表
 */
function renderTemplateList(customTemplates, iconOptions = []) {
    const allTemplates = { ...DEFAULT_COMMAND_TEMPLATES, ...customTemplates };
    let html = '';
    
    for (const [key, template] of Object.entries(allTemplates)) {
        const isCustom = customTemplates[key] !== undefined;
        const currentIcon = template.icon || '📝';
        
        // 生成图标选择器 HTML
        let iconSelectorHtml = '';
        if (isCustom && iconOptions.length > 0) {
            iconSelectorHtml = `<select class="template-icon" data-key="${key}" style="padding: 6px; border-radius: 4px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-color); font-size: 13px; cursor: pointer;">`;
            iconOptions.forEach(opt => {
                iconSelectorHtml += `<option value="${opt.icon}" ${opt.icon === currentIcon ? 'selected' : ''}>${opt.icon} ${opt.label}</option>`;
            });
            iconSelectorHtml += `</select>`;
        } else if (!isCustom) {
            iconSelectorHtml = `<span style="font-size: 16px; color: var(--text-secondary);">${currentIcon}</span>`;
        }
        
        html += `
            <div class="template-item" data-key="${key}" style="display: grid; grid-template-columns: auto 80px 1fr auto; gap: 12px; align-items: center; padding: 12px; background: ${isCustom ? 'var(--input-bg)' : 'var(--block-bg)'}; border-radius: 6px; border: 1px solid ${isCustom ? 'var(--accent-color)' : 'var(--border-color)'};">
                ${iconSelectorHtml}
                <input type="text" value="${template.name}" placeholder="名称" 
                    class="template-name" data-key="${key}"
                    style="padding: 8px; border-radius: 4px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-color); font-size: 13px;" />
                <input type="text" value="${template.text}" placeholder="指令内容" 
                    class="template-text" data-key="${key}"
                    style="padding: 8px; border-radius: 4px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-color); font-size: 13px;" />
                <div style="display: flex; gap: 6px;">
                    ${!isCustom ? `<span style="font-size: 12px; color: var(--text-secondary); padding: 6px;">默认</span>` : ''}
                    ${isCustom ? `<button onclick="deleteTemplate('${key}')" style="padding: 6px 12px; background: transparent; color: var(--error-color); border: 1px solid var(--error-color); border-radius: 4px; cursor: pointer; font-size: 12px;">删除</button>` : ''}
                </div>
            </div>
        `;
    }
    
    return html;
}

/**
 * 关闭模板设置对话框
 */
function closeTemplateSettings() {
    const modal = document.getElementById('templateSettingsModal');
    if (modal) modal.remove();
}

/**
 * 保存模板设置
 */
function saveTemplateSettings() {
    const customTemplates = {};
    const templateItems = document.querySelectorAll('.template-item');
    
    templateItems.forEach(item => {
        const key = item.dataset.key;
        const iconSelect = item.querySelector('.template-icon');
        const nameInput = item.querySelector('.template-name');
        const textInput = item.querySelector('.template-text');
        
        if (nameInput && textInput) {
            const name = nameInput.value.trim();
            const text = textInput.value.trim();
            
            if (name && text) {
                // 获取图标（如果有选择器）
                const icon = iconSelect ? iconSelect.value : '📝';
                
                // 只保存自定义的模板（不在默认模板中的）
                if (!DEFAULT_COMMAND_TEMPLATES[key]) {
                    customTemplates[key] = { name, text, icon };
                } else if (name !== DEFAULT_COMMAND_TEMPLATES[key].name || text !== DEFAULT_COMMAND_TEMPLATES[key].text) {
                    // 如果修改了默认模板，也保存为自定义
                    customTemplates[key] = { name, text, icon };
                }
            }
        }
    });
    
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(customTemplates));
    closeTemplateSettings();
    renderCommandTemplateButtons(); // 重新渲染快捷指令按钮
    appendMessage('system', '✅ 快捷指令已保存');
}

/**
 * 添加新模板
 */
function addNewTemplate() {
    const key = 'custom_' + Date.now();
    const templateList = document.getElementById('templateList');
    
    // 生成图标选择器选项
    const iconOptions = [
        { icon: '✨', label: '闪亮' },
        { icon: '📝', label: '写作' },
        { icon: '✂️', label: '剪刀' },
        { icon: '🌐', label: '地球' },
        { icon: '📋', label: '剪贴板' },
        { icon: '🔍', label: '搜索' },
        { icon: '✏️', label: '铅笔' },
        { icon: '🎨', label: '调色板' },
        { icon: '💡', label: '灯泡' },
        { icon: '🚀', label: '火箭' },
        { icon: '⭐', label: '星星' },
        { icon: '❤️', label: '爱心' },
        { icon: '✅', label: '对勾' },
        { icon: '📌', label: '图钉' },
        { icon: '🔥', label: '火焰' },
        { icon: '🎯', label: '靶心' },
        { icon: '📊', label: '图表' },
        { icon: '💬', label: '对话' },
        { icon: '📖', label: '书本' },
        { icon: '🔧', label: '工具' }
    ];
    
    let iconSelectorHtml = `<select class="template-icon" data-key="${key}" style="padding: 6px; border-radius: 4px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-color); font-size: 13px; cursor: pointer;">`;
    iconOptions.forEach(opt => {
        iconSelectorHtml += `<option value="${opt.icon}" ${opt.icon === '✨' ? 'selected' : ''}>${opt.icon} ${opt.label}</option>`;
    });
    iconSelectorHtml += `</select>`;
    
    const newTemplateHtml = `
        <div class="template-item" data-key="${key}" style="display: grid; grid-template-columns: auto 80px 1fr auto; gap: 12px; align-items: center; padding: 12px; background: var(--input-bg); border-radius: 6px; border: 1px solid var(--accent-color);">
            ${iconSelectorHtml}
            <input type="text" value="新指令" placeholder="名称" 
                class="template-name" data-key="${key}"
                style="padding: 8px; border-radius: 4px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-color); font-size: 13px;" />
            <input type="text" value="请输入指令内容" placeholder="指令内容" 
                class="template-text" data-key="${key}"
                style="padding: 8px; border-radius: 4px; border: 1px solid var(--input-border); background: var(--input-bg); color: var(--text-color); font-size: 13px;" />
            <div style="display: flex; gap: 6px;">
                <button onclick="deleteTemplate('${key}')" style="padding: 6px 12px; background: transparent; color: var(--error-color); border: 1px solid var(--error-color); border-radius: 4px; cursor: pointer; font-size: 12px;">删除</button>
            </div>
        </div>
    `;
    templateList.insertAdjacentHTML('beforeend', newTemplateHtml);
}

/**
 * 删除模板
 */
function deleteTemplate(key) {
    const templateItem = document.querySelector(`.template-item[data-key="${key}"]`);
    if (templateItem) {
        templateItem.remove();
    }
}

/**
 * 恢复到默认模板
 */
function resetToDefaults() {
    showCustomConfirm('确定要恢复所有默认指令吗？您的自定义设置将被清除。', function() {
        localStorage.removeItem(CUSTOM_TEMPLATES_KEY);
        closeTemplateSettings();
        renderCommandTemplateButtons(); // 重新渲染快捷指令按钮
        appendMessage('system', '🔄 已恢复到默认指令');
    });
}
