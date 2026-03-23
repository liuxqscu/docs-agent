/**
 * 其他功能模块（语法检查、摘要生成等）
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
 * 打开摘要生成对话框
 */
function openSummarizeModal() {
    const modal = document.createElement('div');
    modal.id = 'summarizeModal';
    modal.className = 'modal summary-modal';

    modal.innerHTML = `
        <div class="modal-content summary-modal-content">
            <div class="modal-header">
                <span>≡</span>
                <h3>生成文档摘要</h3>
                <button class="modal-close" onclick="closeSummarizeModal()" title="关闭">×</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="summaryType">摘要类型</label>
                    <select id="summaryType">
                        <option value="brief">一句话摘要 - 简明扼要概括核心</option>
                        <option value="outline" selected>大纲式摘要 - 层级结构展示要点</option>
                        <option value="detailed">详细摘要 - 包含背景和结论</option>
                        <option value="keypoints">关键要点 - 提取核心 bullet points</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="summaryMaxLength">最大长度（字）</label>
                    <input type="number" id="summaryMaxLength" value="500" min="50" max="2000" step="50">
                </div>

                <div class="summary-help">
                    <p>[i] 提示：摘要生成会分析当前同步到系统的文档内容</p>
                    <p>[▤] 请先确保文档已同步，再生成摘要</p>
                </div>
            </div>

            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="closeSummarizeModal()">取消</button>
                <button class="btn btn-primary" onclick="generateSummary()">生成摘要</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

/**
 * 关闭摘要对话框
 */
function closeSummarizeModal() {
    const modal = document.getElementById('summarizeModal');
    if (modal) modal.remove();
}

/**
 * 生成摘要
 */
async function generateSummary() {
    const summaryType = document.getElementById('summaryType').value;
    const maxLength = parseInt(document.getElementById('summaryMaxLength').value) || 500;

    const config = getApiConfig();
    if (!config.apiKey) {
        appendMessage('system', '[!] 未配置 API Key，请点击右上角设置。');
        closeSummarizeModal();
        return;
    }

    closeSummarizeModal();
    const statusMsg = appendMessage('system', '[≡] 正在生成文档摘要，请稍候...');

    try {
        const response = await fetch('/api/summarize', {
            method: 'POST',
            headers: resolveDocScopeHeaders({
                'Content-Type': 'application/json',
                'X-API-Key': config.apiKey,
                'X-Base-URL': config.baseUrl,
                'X-Model-Name': config.modelName
            }),
            body: JSON.stringify({
                summaryType: summaryType,
                maxLength: maxLength
            })
        });

        if (response.ok) {
            const data = await response.json();

            if (data.status === 'success') {
                let summaryContent = `## [≡] 文档摘要\n\n`;
                summaryContent += `**摘要类型：** ${getSummaryTypeName(summaryType)}\n`;
                summaryContent += `**原文档字数：** ${data.originalWordCount || 'N/A'}\n`;
                summaryContent += `**摘要字数：** ${data.summaryWordCount || 'N/A'}\n`;
                if (data.compressionRatio) {
                    summaryContent += `**压缩比率：** ${data.compressionRatio}\n`;
                }
                summaryContent += `\n---\n\n`;
                summaryContent += data.summary;

                appendMessage('agent', summaryContent);

                if (data.keyPoints && data.keyPoints.length > 0) {
                    let pointsContent = `## [*] 关键要点\n\n`;
                    data.keyPoints.forEach((point, index) => {
                        pointsContent += `${index + 1}. ${point}\n`;
                    });
                    appendMessage('agent', pointsContent);
                }

                statusMsg.innerText = '[✓] 摘要生成完成！';
            } else {
                statusMsg.innerText = '[x] 生成失败：' + data.message;
            }
        } else {
            statusMsg.innerText = '[x] 请求失败：' + response.status;
        }
    } catch (e) {
        console.error(e);
        statusMsg.innerText = '[x] 生成失败：无法连接到后端';
    }
}

/**
 * 获取摘要类型名称
 */
function getSummaryTypeName(type) {
    const names = {
        'brief': '一句话摘要',
        'outline': '大纲式摘要',
        'detailed': '详细摘要',
        'keypoints': '关键要点'
    };
    return names[type] || type;
}
