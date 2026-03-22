/**
 * 聊天功能模块
 */

/**
 * 保存消息到 localStorage
 */
function saveMessageToHistory(role, text) {
    try {
        let history = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '[]');
        const message = {
            role: role,
            text: text,
            timestamp: new Date().toISOString()
        };
        history.push(message);
        
        // 限制历史记录数量
        if (history.length > MAX_HISTORY_SIZE) {
            history = history.slice(-MAX_HISTORY_SIZE);
        }
        
        localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
        console.error('保存会话历史失败:', e);
    }
}

/**
 * 加载会话历史
 */
function loadChatHistory() {
    try {
        const history = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '[]');
        if (history.length === 0) return;

        const historyEl = document.getElementById('chatHistory');
        // 清空默认欢迎消息
        historyEl.innerHTML = '';

        // 添加历史消息分隔线
        const dividerDiv = document.createElement('div');
        dividerDiv.className = 'message msg-system history-divider';
        dividerDiv.innerHTML = '--- 以上是历史消息 ---';
        historyEl.appendChild(dividerDiv);

        // 渲染历史消息
        history.forEach(msg => {
            renderMessageToDOM(msg.role, msg.text, new Date(msg.timestamp), false);
        });

        // 添加当前会话分隔线
        const currentDivider = document.createElement('div');
        currentDivider.className = 'message msg-system history-divider';
        currentDivider.innerHTML = '--- 当前会话 ---';
        historyEl.appendChild(currentDivider);

        historyEl.scrollTop = historyEl.scrollHeight;
    } catch (e) {
        console.error('加载会话历史失败:', e);
    }
}

/**
 * 清空会话历史
 */
function clearChatHistory() {
    showCustomConfirm('确定要清空所有会话历史吗？此操作不可恢复。', function() {
        localStorage.removeItem(CHAT_HISTORY_KEY);
        const historyEl = document.getElementById('chatHistory');
        historyEl.innerHTML = '<div class="message msg-system">[·] 欢迎使用 DocPulse 文脉引擎！快速选择快捷功能或输入指令编辑文档</div>';
        appendMessage('system', '[⌦] 会话历史已清空');
    });
}

/**
 * 渲染消息到 DOM
 */
function renderMessageToDOM(role, text, timestamp, saveToStorage = true) {
    const normalizedRole = role === 'ai' ? 'agent' : role;
    const historyEl = document.getElementById('chatHistory');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message msg-${normalizedRole}`;

    // 格式化时间
    const timeStr = timestamp.getHours().toString().padStart(2, '0') + ':' +
                   timestamp.getMinutes().toString().padStart(2, '0');

    // 角色标签
    let roleLabel = '';
    let roleIcon = '';
    if (normalizedRole === 'user') {
        roleLabel = '我';
        roleIcon = '◇';
    } else if (normalizedRole === 'agent') {
        roleLabel = 'DocPulse 助手';
        roleIcon = '◎';
    }

    // 构建消息内容
    if (normalizedRole === 'system') {
        msgDiv.innerHTML = text;
    } else if (normalizedRole === 'agent') {
        const renderedHtml = renderMarkdown(text);
        msgDiv.innerHTML = `
            <div class="message-header">
                <span>${roleIcon} ${roleLabel}</span>
                <span class="message-time">${timeStr}</span>
            </div>
            <div class="markdown-content">${renderedHtml}</div>
            <div class="message-actions">
                <button class="toolbar-btn message-action-btn" onclick="redoLastMessage()">
                    <span>↻</span> 重做
                </button>
            </div>
        `;
    } else {
        msgDiv.innerHTML = `
            <div class="message-header">
                <span>${roleIcon} ${roleLabel}</span>
                <span class="message-time">${timeStr}</span>
            </div>
            <div>${escapeHtml(text)}</div>
        `;
    }

    historyEl.appendChild(msgDiv);
    historyEl.scrollTop = historyEl.scrollHeight;

    // 保存到 localStorage
    if (saveToStorage) {
        saveMessageToHistory(normalizedRole, text);
    }

    return msgDiv;
}

/**
 * 改进的消息追加函数
 */
function appendMessage(role, text) {
    return renderMessageToDOM(role, text, new Date(), true);
}

/**
 * 发送消息
 */
async function sendMessage() {
    const inputEl = document.getElementById('userInput');
    const message = inputEl.value.trim();
    if (!message) return;

    const config = JSON.parse(localStorage.getItem('aiConfig') || '{}');
    if (!config.apiKey) {
        appendMessage('system', '[!] 未配置 API Key，请点击右上角设置。');
        return;
    }

    // 检查是否是参考资料分析请求
    if (shouldAnalyzeReferences(message)) {
        const selectedFiles = getSelectedReferenceFiles();
        if (selectedFiles.length > 0) {
            appendMessage('user', message);
            inputEl.value = '';
            await analyzeReferencesFromChat(message, selectedFiles);
            return;
        }
    }

    appendMessage('user', message);
    lastUserMessage = message;
    inputEl.value = '';

    // 设置处理中状态
    isProcessing = true;
    updateSendButtonState(true);
    updateActionButtonsState(true);

    const statusMsg = appendMessage('system', '[~] DocPulse 正在分析并尝试调用编辑工具...');

    try {
        const agentType = document.getElementById('agentTypeSelect').value;
        const customPrompt = localStorage.getItem('customSystemPrompt') || '';

        const requestBody = {
            message: message,
            agentType: agentType
        };

        if (agentType === 'custom' && customPrompt) {
            requestBody.customSystemPrompt = customPrompt;
        }

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': config.apiKey,
                'X-Base-URL': config.baseUrl,
                'X-Model-Name': config.modelName
            },
            body: JSON.stringify(requestBody)
        });

        if (response.ok) {
            const data = await response.json();
            statusMsg.innerText = '[✓] 大模型处理完毕，正在比对文档差异...';

            if (data.reply) {
                appendMessage('agent', data.reply);
            }

            await fetchDocumentState(false);

            const diffCards = document.querySelectorAll('.has-diff, .to-delete');
            if (diffCards.length > 0) {
                appendMessage('system', '[▤] 草稿卡片已生成，请在右侧审查并在卡片上点击 [✓ 接受]。');
            } else {
                appendMessage('system', '[!] DocPulse 已返回结果，但未检测到对文档的实质性修改。');
            }

        } else {
            statusMsg.innerText = '[x] 执行异常：大模型响应错误 ' + response.status;
        }
    } catch (e) {
        console.error(e);
        statusMsg.innerText = '[x] 链路中断：无法连接到后端服务。';
    } finally {
        isProcessing = false;
        updateSendButtonState(false);
        updateActionButtonsState(false);
    }
}

/**
 * 更新发送按钮状态
 */
function updateSendButtonState(processing) {
    const btn = document.getElementById('sendBtn');
    if (processing) {
        btn.innerHTML = '<span class="thinking-icon"><span></span><span></span><span></span></span>';
        btn.disabled = true;
        btn.title = '思考中...';
    } else {
        btn.innerHTML = '<span class="send-icon">➤</span>';
        btn.disabled = false;
        btn.title = '发送';
    }
}

/**
 * 更新批量操作按钮状态
 */
function updateActionButtonsState(processing) {
    const acceptBtn = document.getElementById('batchAcceptBtn');
    const rejectBtn = document.getElementById('batchRejectBtn');
    
    if (acceptBtn) acceptBtn.disabled = processing;
    if (rejectBtn) rejectBtn.disabled = processing;
    
    // 同时更新所有段落中的单个接受/拒绝按钮
    const allAcceptBtns = document.querySelectorAll('.btn-accept');
    const allRejectBtns = document.querySelectorAll('.btn-reject');
    
    allAcceptBtns.forEach(btn => {
        btn.disabled = processing;
    });
    
    allRejectBtns.forEach(btn => {
        btn.disabled = processing;
    });
}

/**
 * 重做最后一条消息
 */
async function redoLastMessage() {
    if (!lastUserMessage) {
        appendMessage('system', '[!] 没有可重做的消息');
        return;
    }
    
    const inputEl = document.getElementById('userInput');
    inputEl.value = lastUserMessage;
    await sendMessage();
}

/**
 * 判断是否应该分析参考资料（检查关键词）
 */
function shouldAnalyzeReferences(message) {
    const keywords = ['分析参考', '参考资料', '分析资料', '资料分析', '基于参考', '结合参考', '用参考'];
    const lowerMessage = message.toLowerCase();
    return keywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * 从聊天中分析参考资料
 */
async function analyzeReferencesFromChat(instruction, selectedFiles) {
    const docId = getCurrentDocId();
    
    // 设置处理中状态
    isProcessing = true;
    updateSendButtonState(true);
    updateActionButtonsState(true);
    
    const statusMsg = appendMessage('system', `[⧉] 已检测到您想分析参考资料，将使用已选中的 ${selectedFiles.length} 个文件进行分析...`);
    
    try {
        showLoading('◎ 正在分析参考资料...');
        
        const config = getApiConfig();
        const requestBody = {
            docId: docId,
            selectedFiles: selectedFiles,
            userInstruction: instruction
        };
        
        const response = await fetch('/api/references/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': config.apiKey,
                'X-Base-URL': config.baseUrl,
                'X-Model-Name': config.modelName
            },
            body: JSON.stringify(requestBody)
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            const updatedCount = (result && result.updatedBlocks && result.updatedBlocks.length) || 0;
            const message = updatedCount > 0 
                ? `[✓] 参考资料分析完成！已更新 ${updatedCount} 个段落`
                : `[✓] 参考资料分析完成！（文档未发生变更，可能仅需总结）`;
            
            statusMsg.innerText = message;
            showMessage(message, 'success');
            
            // 显示 AI 的分析回复
            if (result.agentReply) {
                appendMessage('agent', result.agentReply);
            }
            
            // 与 reference.js 一致：有更新时转换为待审查卡片，而不是 init 重置。
            if (updatedCount > 0) {
                await handleAIModificationsAsChanges(result.updatedBlocks || []);
            } else {
                await fetchDocumentState(false);
            }
            
            // 检查实际的待审查变更（从 changePool 获取，更准确）
            const pendingChanges = Object.values(changePool).filter(c => c.status === 'pending');
            const changeCount = pendingChanges.length;
            
            if (changeCount > 0) {
                const changeTypes = {};
                pendingChanges.forEach(change => {
                    changeTypes[change.type] = (changeTypes[change.type] || 0) + 1;
                });
                
                const typeDesc = Object.entries(changeTypes)
                    .map(([type, count]) => {
                        const typeLabel = {
                            'update': '更新',
                            'insert': '插入',
                            'delete': '删除'
                        }[type] || type;
                        return `${count} 个${typeLabel}`;
                    })
                    .join('、');
                
                const confirmMsg = `[!] 已生成 ${changeCount} 个修改（${typeDesc}）\n` +
                    `✓ 请在右侧预览卡片上点击 [✓ 接受] 确认修改\n` +
                    `✗ 点击 [✗ 拒绝] 可撤销修改\n` +
                    `[i] 只有经过您明确确认的修改才会同步到 Word 文档`;
                appendMessage('system', confirmMsg);
            } else if (updatedCount === 0) {
                appendMessage('system', '[·] 分析完成，但未检测到需要修改的内容。');
            } else {
                appendMessage('system', '[!] 服务器报告有修改，但预览中未检测到变更卡片。');
            }
        } else {
            statusMsg.innerText = '[x] 分析失败：' + result.message;
            showMessage('[x] 分析失败：' + result.message, 'error');
        }
    } catch (error) {
        console.error('分析失败:', error);
        statusMsg.innerText = '[x] 分析失败：' + error.message;
        showMessage('[x] 分析失败：' + error.message, 'error');
    } finally {
        hideLoading();
        isProcessing = false;
        updateSendButtonState(false);
        updateActionButtonsState(false);
    }
}
