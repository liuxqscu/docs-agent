/**
 * 参考资料管理模块
 */

function resolveDocScopeHeaders(headers) {
    if (typeof withDocScopeHeaders === 'function') {
        return withDocScopeHeaders(headers);
    }
    const merged = { ...(headers || {}) };
    const docId = typeof getCurrentDocId === 'function' ? getCurrentDocId() : 'default';
    merged['X-Doc-Id'] = docId;
    if (typeof getPaneSessionId === 'function') {
        merged['X-Pane-Id'] = getPaneSessionId();
    }
    return merged;
}

/**
 * 显示自定义路径输入模态框（兼容 Office.js 环境）
 */
function showCustomPathInputModal(defaultValue, onConfirm) {
    const modal = document.createElement('div');
    modal.id = 'customPathInputModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10001;
    `;
    
    // 判断是否在 Office.js 环境
    const isInOffice = typeof Office !== 'undefined';
    
    modal.innerHTML = `
        <div style="
            background: white;
            padding: 24px;
            border-radius: 8px;
            max-width: 600px;
            width: 90%;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        ">
            <div style="font-size: 18px; margin-bottom: 16px; font-weight: bold;">
                📂 输入文件夹路径
            </div>
            <div style="margin-bottom: 20px;">
                ${isInOffice ? `
                    <div style="
                        background: #fff3cd;
                        border: 1px solid #ffc107;
                        border-radius: 4px;
                        padding: 12px;
                        margin-bottom: 12px;
                        font-size: 13px;
                        color: #856404;
                    ">
                        ⚠️ Word 环境限制：无法直接获取文件夹路径<br>
                        请<strong>手动输入完整的绝对路径</strong>，例如：<br>
                        <code style="
                            display: block;
                            background: #f8f9fa;
                            padding: 8px;
                            margin-top: 8px;
                            border-radius: 4px;
                            font-family: monospace;
                        ">D:\\MyReferences\\folder1</code>
                    </div>
                ` : ''}
                <p style="margin: 0 0 12px 0; color: #666; font-size: 14px;">
                    请输入参考文件夹的完整路径${!isInOffice && defaultValue ? '（已为您填充默认值）' : ''}：
                </p>
                <input 
                    type="text" 
                    id="pathInputField"
                    value="${defaultValue}"
                    placeholder="${isInOffice ? '例如：D:\\\\MyReferences\\\\folder1' : ''}"
                    style="
                        width: 100%;
                        padding: 10px 12px;
                        border: 1px solid #ddd;
                        border-radius: 4px;
                        font-size: 14px;
                        font-family: monospace;
                        box-sizing: border-box;
                    "
                />
                <p style="margin: 8px 0 0 0; color: #999; font-size: 13px;">
                    💡 提示：确保路径存在且可访问，必须是绝对路径（如 D:\\xxx）
                </p>
            </div>
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button id="cancelPathBtn" style="
                    padding: 8px 20px;
                    border: 1px solid #ddd;
                    background: white;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                ">取消</button>
                <button id="confirmPathBtn" style="
                    padding: 8px 20px;
                    border: none;
                    background: #007bff;
                    color: white;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                ">确定</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // 自动聚焦到输入框
    setTimeout(() => {
        const input = document.getElementById('pathInputField');
        if (input) {
            input.focus();
            input.select();
        }
    }, 100);
    
    // 绑定按钮事件
    document.getElementById('confirmPathBtn').onclick = () => {
        const path = document.getElementById('pathInputField').value.trim();
        if (!path) {
            showMessage('⚠️ 路径不能为空', 'warning');
            return;
        }
        document.body.removeChild(modal);
        if (onConfirm) onConfirm(path);
    };
    
    document.getElementById('cancelPathBtn').onclick = () => {
        document.body.removeChild(modal);
        showMessage('⚠️ 已取消', 'warning');
    };
    
    // 支持回车键确认
    document.getElementById('pathInputField').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('confirmPathBtn').click();
        }
    });
}

/**
 * 显示创建参考文件夹确认框
 */
function showCreateFolderConfirm(defaultPath, onConfirm, onCustomSelect) {
    // 创建自定义模态框
    const modal = document.createElement('div');
    modal.id = 'createFolderConfirmModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;
    
    modal.innerHTML = `
        <div style="
            background: white;
            padding: 24px;
            border-radius: 8px;
            max-width: 600px;
            width: 90%;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        ">
            <div style="font-size: 20px; margin-bottom: 16px; font-weight: bold;">
                📁 创建参考文件夹
            </div>
            <div style="margin-bottom: 20px; line-height: 1.6;">
                <p style="margin: 0 0 12px 0; font-weight: 500;">当前文档还没有参考文件夹，请选择创建位置：</p>
                
                <div style="margin-top: 16px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;">方案一：使用默认位置</label>
                    <div style="
                        background: #f5f5f5;
                        padding: 12px;
                        border-radius: 4px;
                        font-family: monospace;
                        font-size: 13px;
                        word-break: break-all;
                        margin-bottom: 12px;
                        border: 1px solid #e0e0e0;
                    ">${defaultPath}</div>
                </div>
                
                <div style="margin-top: 16px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;">方案二：自定义位置</label>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input 
                            type="text" 
                            id="customFolderPath" 
                            placeholder="请输入完整路径，如：D:\\MyReferences\\folder1"
                            style="
                                flex: 1;
                                padding: 8px 12px;
                                border: 1px solid #ddd;
                                border-radius: 4px;
                                font-size: 14px;
                                font-family: monospace;
                            "
                        />
                        <button id="browseFolderBtn" style="
                            padding: 8px 16px;
                            border: 1px solid #ddd;
                            background: #f8f9fa;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 14px;
                            white-space: nowrap;
                        ">📂 浏览</button>
                    </div>
                    <p style="margin: 8px 0 0 0; color: #666; font-size: 13px;">
                        💡 Word 环境限制：请点击"浏览"后手动输入完整路径，或直接在上方输入框输入
                    </p>
                </div>
            </div>
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button id="cancelFolderBtn" style="
                    padding: 8px 20px;
                    border: 1px solid #ddd;
                    background: white;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                ">取消</button>
                <button id="useDefaultBtn" style="
                    padding: 8px 20px;
                    border: 1px solid #007bff;
                    background: white;
                    color: #007bff;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                ">使用默认位置</button>
                <button id="useCustomBtn" style="
                    padding: 8px 20px;
                    border: none;
                    background: #007bff;
                    color: white;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                ">使用自定义位置</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // 获取自定义路径输入框和浏览按钮
    const customPathInput = document.getElementById('customFolderPath');
    const browseBtn = document.getElementById('browseFolderBtn');
    
    // 浏览按钮点击事件 - 调用系统文件夹选择器
    browseBtn.onclick = async () => {
        try {
            // 尝试使用 Web File System Access API（如果浏览器支持）
            if ('showDirectoryPicker' in window) {
                const dirHandle = await window.showDirectoryPicker();
                // 注意：由于安全原因，无法直接获取完整路径
                // 使用自定义模态框让用户输入路径
                const examplePath = defaultPath.replace(/[^\\\/]+$/, '') + dirHandle.name;
                showCustomPathInputModal(examplePath, (userPath) => {
                    if (userPath && userPath.trim()) {
                        customPathInput.value = userPath;
                    }
                });
            } else {
                // 降级方案：使用自定义模态框，但给一个空白的默认值，提示用户手动输入
                showCustomPathInputModal('', (path) => {
                    if (path && path.trim()) {
                        customPathInput.value = path;
                    }
                });
            }
        } catch (error) {
            console.error('选择文件夹失败:', error);
            // Office.js 环境降级到自定义模态框，同样给空白默认值
            showCustomPathInputModal('', (path) => {
                if (path && path.trim()) {
                    customPathInput.value = path;
                }
            });
        }
    };
    
    // 绑定按钮事件
    document.getElementById('useDefaultBtn').onclick = () => {
        document.body.removeChild(modal);
        if (onConfirm) onConfirm(defaultPath); // 传递默认路径
    };
    
    document.getElementById('useCustomBtn').onclick = () => {
        const customPath = customPathInput.value.trim();
        console.log('[•] 用户点击"使用自定义位置"按钮');
        console.log('[•] 输入框中的路径:', customPath);
        console.log('[•] 输入框值的长度:', customPath ? customPath.length : 0);
        
        if (!customPath) {
            showMessage('⚠️ 请输入或选择自定义文件夹路径', 'warning');
            return;
        }
        document.body.removeChild(modal);
        console.log('[✓] 准备传递自定义路径:', customPath);
        if (onCustomSelect) onCustomSelect(customPath); // 传递自定义路径
    };
    
    document.getElementById('cancelFolderBtn').onclick = () => {
        document.body.removeChild(modal);
        showMessage('⚠️ 已取消创建参考文件夹', 'warning');
    };
}

/**
 * 上传参考文件
 */
async function uploadReferences() {
    const docId = getCurrentDocId();
    
    // 先检查文件夹是否存在
    let folderExists = false;
    let baseFolder = '';
    try {
        const response = await fetch(`/api/references/list?docId=${encodeURIComponent(docId)}`, {
            headers: resolveDocScopeHeaders({})
        });
        const result = await response.json();
        if (result.status === 'success') {
            folderExists = result.data.folderExists || false;
            baseFolder = result.data.baseFolder || '';
        }
    } catch (error) {
        console.error('检查文件夹状态失败:', error);
    }
    
    // 如果文件夹不存在，提示用户确认创建
    if (!folderExists) {
        const defaultPath = baseFolder ? (baseFolder + '\\' + docId) : ('docs-agent-references\\' + docId);
        
        // 使用自定义模态框让用户选择
        return new Promise((resolve) => {
            showCreateFolderConfirm(defaultPath, 
                (selectedPath) => {
                    // 用户选择使用默认路径 - 直接解析并返回
                    console.log('使用默认路径:', selectedPath);
                    resolve({ type: 'default', path: selectedPath });
                },
                (customPath) => {
                    // 用户选择自定义路径 - 先保存再返回
                    console.log('使用自定义路径:', customPath);
                    resolve({ type: 'custom', path: customPath });
                }
            );
        }).then(selection => {
            if (!selection) return;
            
            // 如果是自定义路径，先调用 API 保存
            if (selection.type === 'custom') {
                return setCustomFolderPath(docId, selection.path).then(() => {
                    return performFileUpload(docId);
                });
            } else {
                // 默认路径，直接上传
                return performFileUpload(docId);
            }
        });
    }
    
    // 文件夹已存在，直接上传
    return performFileUpload(docId);
}

/**
 * 执行文件上传（核心逻辑）
 */
async function performFileUpload(docId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.docx,.doc,.txt,.md,.tex,.rtf';

    input.onchange = async () => {
        if (input.files.length === 0) return;

        const formData = new FormData();
        formData.append('docId', docId);

        for (let i = 0; i < input.files.length; i++) {
            formData.append('files', input.files[i]);
        }

        try {
            showLoading('正在上传文件...');
            const response = await fetch('/api/references/upload', {
                method: 'POST',
                headers: resolveDocScopeHeaders({}),
                body: formData
            });

            const result = await response.json();
            hideLoading();

            if (result.status === 'success') {
                showMessage('✅ ' + result.message, 'success');
                await refreshReferences();
            } else {
                showMessage('❌ 上传失败：' + result.message, 'error');
            }
        } catch (error) {
            hideLoading();
            console.error('上传失败:', error);
            showMessage('❌ 上传失败：' + error.message, 'error');
        }
    };

    input.click();
}

/**
 * 刷新参考文件列表
 */
async function refreshReferences() {
    const docId = getCurrentDocId();

    try {
        const response = await fetch(`/api/references/list?docId=${encodeURIComponent(docId)}`, {
            headers: resolveDocScopeHeaders({})
        });
        const result = await response.json();

        if (result.status === 'success') {
            const data = result.data;
            
            document.getElementById('refDocId').textContent = docId;
            
            // 更新文件夹路径显示
            if (data.folderExists && data.folderPath) {
                document.getElementById('refFolderPath').textContent = data.folderPath;
                document.getElementById('refFolderPath').title = data.folderPath;
            } else {
                document.getElementById('refFolderPath').textContent = '未创建（点击上传文件时将提示创建）';
                document.getElementById('refFolderPath').title = '';
            }

            renderReferenceFileList(data.files, data.folderExists);
        } else {
            showMessage('❌ 获取文件列表失败：' + result.message, 'error');
        }
    } catch (error) {
        console.error('刷新失败:', error);
        showMessage('❌ 刷新失败：' + error.message, 'error');
    }
}

/**
 * 渲染参考文件列表
 */
function renderReferenceFileList(files, folderExists = true) {
    const container = document.getElementById('referenceFileList');

    // 如果文件夹不存在，显示特殊提示
    if (!folderExists) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">◫</div>
                <div class="empty-state-text">参考文件夹尚未创建</div>
                <div style="font-size: 12px; margin-top: 8px; opacity: 0.7;">
                    请点击 [上传文件] 按钮<br>
                    首次上传时将提示您创建参考文件夹
                </div>
            </div>
        `;
        updateReferenceFileCount(0);
        return;
    }

    if (!files || files.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">◫</div>
                <div class="empty-state-text">暂无参考文件</div>
                <div style="font-size: 12px; margin-top: 8px; opacity: 0.7;">
                    你可以：<br>
                    1. 点击 [上传文件] 添加本地文件<br>
                    2. 直接拖拽文件到文件夹
                </div>
            </div>
        `;
        updateReferenceFileCount(0);
        return;
    }

    let html = '';
    files.forEach(file => {
        html += `
            <div class="reference-file-item" onclick="toggleFileSelection('${file.fileName}', this)">
                <input type="checkbox" class="file-checkbox" value="${file.fileName}" />
                <span class="file-icon">${file.fileIcon || '📄'}</span>
                <div class="file-info">
                    <div class="file-name" title="${file.fileName}">${file.fileName}</div>
                    <div class="file-meta">
                        <span>${file.fileSizeReadable || formatFileSize(file.fileSize)}</span>
                        <span>•</span>
                        <span>${formatDateTime(file.uploadTime)}</span>
                    </div>
                </div>
                <div class="file-actions">
                    <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteReferenceFile('${file.fileName}')">删除</button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    
    // 更新文件计数显示
    updateReferenceFileCount(files.length);
    
    // 更新主界面的已选文件显示
    updateSelectedReferencesDisplay();
}

/**
 * 切换文件选中状态
 */
function toggleFileSelection(fileName, element) {
    const checkbox = element.querySelector('.file-checkbox');
    checkbox.checked = !checkbox.checked;
    element.classList.toggle('selected', checkbox.checked);
    
    // 更新主界面的参考文件显示
    updateSelectedReferencesDisplay();
}

/**
 * 删除参考文件
 */
async function deleteReferenceFile(fileName) {
    // 使用自定义确认对话框（兼容 Office.js）
    const confirmed = await showConfirmDialog(`确定要删除文件 "${fileName}" 吗？`);
    if (!confirmed) {
        return;
    }

    const docId = getCurrentDocId();

    try {
        const response = await fetch(
            `/api/references/delete?docId=${encodeURIComponent(docId)}&fileName=${encodeURIComponent(fileName)}`,
            { method: 'DELETE' }
        );

        const result = await response.json();

        if (result.status === 'success') {
            showMessage('[✓] ' + result.message, 'success');
            await refreshReferences();
        } else {
            showMessage('[x] 删除失败：' + result.message, 'error');
        }
    } catch (error) {
        console.error('删除失败:', error);
        showMessage('[x] 删除失败：' + error.message, 'error');
    }
}

/**
 * 设置自定义文件夹路径
 */
async function setCustomFolderPath(docId, customPath) {
    try {
        console.log('[~] 调用 setCustomFolderPath API');
        console.log('[•] docId:', docId);
        console.log('[•] customPath:', customPath);
        
        const response = await fetch('/api/references/set-custom-folder', {
            method: 'POST',
            headers: resolveDocScopeHeaders({
                'Content-Type': 'application/json'
            }),
            body: JSON.stringify({
                docId: docId,
                customPath: customPath
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showMessage('[✓] 已设置自定义文件夹路径：' + result.data.folderPath, 'success');
            // 刷新文件列表以更新显示
            await refreshReferences();
        } else {
            showMessage('[x] 设置失败：' + result.message, 'error');
        }
    } catch (error) {
        hideLoading();
        console.error('设置自定义路径失败:', error);
        showMessage('[x] 设置失败：' + error.message, 'error');
    }
}

/**
 * 获取已选择的参考文件列表
 */
function getSelectedReferenceFiles() {
    const checkboxes = document.querySelectorAll('#referenceFileList .file-checkbox:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

/**
 * 检查参考文件是否被选中
 */
function hasSelectedReferences() {
    return getSelectedReferenceFiles().length > 0;
}

/**
 * 分析参考文件（旧函数，保留兼容性，现已重定向到新的智能分析）
 */
async function analyzeReferences() {
    const instruction = document.getElementById('analysisInstruction').value.trim();

    if (!instruction) {
        showMessage('[!] 请输入分析指令', 'warning');
        return;
    }

    const checkboxes = document.querySelectorAll('#referenceFileList .file-checkbox:checked');
    const selectedFiles = Array.from(checkboxes).map(cb => cb.value);

    if (selectedFiles.length === 0) {
        showMessage('[!] 请至少选择一个参考文件', 'warning');
        return;
    }

    const docId = getCurrentDocId();

    try {
        showLoading('◎ 正在分析参考资料...');

        const requestBody = {
            docId: docId,
            selectedFiles: selectedFiles,
            userInstruction: instruction
        };

        const config = getApiConfig();
        const response = await fetch('/api/references/analyze', {
            method: 'POST',
            headers: resolveDocScopeHeaders({
                'Content-Type': 'application/json',
                'X-API-Key': config.apiKey,
                'X-Base-URL': config.baseUrl,
                'X-Model-Name': config.modelName
            }),
            body: JSON.stringify(requestBody)
        });

        const result = await response.json();

        if (result.status === 'success') {
            const updatedCount = (result && result.updatedBlocks && result.updatedBlocks.length) || 0;
            const message = updatedCount > 0 
                ? `[✓] 分析完成！已更新 ${updatedCount} 个段落，已切换为待审查状态`
                : `[✓] 分析完成！（文档未发生变更）`;
            showMessage(message, 'success');
            appendMessage('system', message);
            
            // 显示 AI 的分析回复
            if (result.agentReply) {
                appendMessage('ai', result.agentReply);
            }
            
            document.getElementById('analysisInstruction').value = '';
            
            // 🔴 修复：不直接重新初始化文档，而是将修改转换为待审查的变更
            if (updatedCount > 0) {
                await handleAIModificationsAsChanges(result.updatedBlocks || []);
            } else {
                // 如果没有修改，仍然刷新一下以获取最新状态
                await fetchDocumentState(false);
            }
        } else {
            showMessage('[x] 分析失败：' + result.message, 'error');
        }
    } catch (error) {
        console.error('分析失败:', error);
        showMessage('[x] 分析失败：' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * 切换参考资料模态窗口的显示/隐藏
 */
function toggleReferencePanel() {
    const modal = document.getElementById('referencePanelModal');
    if (modal.style.display === 'block') {
        modal.style.display = 'none';
    } else {
        modal.style.display = 'block';
        // 打开时刷新文件列表
        refreshReferences();
        // 确保选中状态显示被更新
        setTimeout(() => updateSelectedReferencesDisplay(), 100);
    }
}

/**
 * 更新参考资料文件计数显示
 */
function updateReferenceFileCount(count) {
    const countEl = document.getElementById('referenceFileCount');
    if (countEl) {
        countEl.textContent = `${count} 个文件`;
    }
}

/**
 * 更新主界面选中的参考文件显示
 */
function updateSelectedReferencesDisplay() {
    const selectedFiles = getSelectedReferenceFiles();
    const displayEl = document.getElementById('selectedReferencesDisplay');
    
    if (!displayEl) return;
    
    if (selectedFiles.length === 0) {
        displayEl.innerHTML = '';
        displayEl.style.minHeight = '0';
        return;
    }
    
    let html = '<div style="padding: 8px; background: rgba(99, 102, 241, 0.1); border-radius: 4px; margin-bottom: 8px;">';
    html += `<div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">[✓] 已选中 ${selectedFiles.length} 个参考文件：</div>`;
    html += '<div style="display: flex; flex-wrap: wrap; gap: 6px;">';
    
    selectedFiles.forEach(file => {
        html += `
            <div style="
                padding: 4px 10px;
                background: var(--accent-color);
                color: white;
                border-radius: 12px;
                font-size: 12px;
                font-weight: 500;
                max-width: 100%;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                cursor: pointer;
            " title="点击移除文件的选中" onclick="removeSelectedFile('${file}')">
                ▤ ${file}
                <span style="margin-left: 4px; opacity: 0.7;">×</span>
            </div>
        `;
    });
    
    html += '</div></div>';
    html += '<div style="font-size: 12px; color: var(--text-secondary); visibility: hidden; height: 0; overflow: hidden;" class="reference-tip" title="在聊天框中输入分析指令（如"分析参考资料"、"基于这些资料扩充文档"）即可开始分析">💡 在聊天框中输入分析指令（如"分析参考资料"、"基于这些资料扩充文档"）即可开始分析</div>';
    
    displayEl.innerHTML = html;
    displayEl.style.minHeight = 'auto';
}

/**
 * 移除已选中的文件
 */
function removeSelectedFile(fileName) {
    const checkboxes = document.querySelectorAll('#referenceFileList .file-checkbox');
    checkboxes.forEach(checkbox => {
        if (checkbox.value === fileName && checkbox.checked) {
            checkbox.checked = false;
            checkbox.closest('.reference-file-item').classList.remove('selected');
        }
    });
    updateSelectedReferencesDisplay();
}
