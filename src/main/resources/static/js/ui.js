/**
 * 主题和布局管理
 */

/**
 * 切换主题
 */
function toggleTheme() {
    const body = document.body;
    const icon = document.getElementById('themeIcon');
    const text = document.getElementById('themeText');
    const currentTheme = localStorage.getItem('theme') || 'dark';
    let newTheme;
    
    if (currentTheme === 'dark') {
        newTheme = 'light';
        if (icon) icon.textContent = '○';
    } else if (currentTheme === 'light') {
        newTheme = 'gray';
        if (icon) icon.textContent = '◍';
    } else {
        newTheme = 'dark';
        if (icon) icon.textContent = '◐';
    }
    
    const isSingleColumn = body.classList.contains('single-column');
    body.className = newTheme === 'dark' ? '' : newTheme + '-theme';
    if (isSingleColumn) {
        body.classList.add('single-column');
    }
    localStorage.setItem('theme', newTheme);
}

/**
 * 切换布局
 */
function toggleLayout() {
    const body = document.body;
    const icon = document.getElementById('layoutIcon');
    const leftPanel = document.querySelector('.left-panel');
    const isSingleColumn = body.classList.toggle('single-column');

    if (isSingleColumn) {
        if (icon) icon.textContent = '▦';
        appendMessage('system', '▦ 已切换为单栏模式，可上下滑动浏览');
    } else {
        if (icon) icon.textContent = '▥';
        appendMessage('system', '▥ 已切换为双栏模式，可拖动分隔条调节大小');
        
        const savedWidth = localStorage.getItem('leftPanelWidth');
        if (savedWidth && leftPanel) {
            leftPanel.style.setProperty('width', savedWidth + 'px', 'important');
            leftPanel.style.setProperty('max-width', 'none', 'important');
        }
    }

    localStorage.setItem('singleColumn', isSingleColumn ? 'true' : 'false');
}

/**
 * 初始化布局
 */
function initLayout() {
    const savedLayout = localStorage.getItem('singleColumn');
    const icon = document.getElementById('layoutIcon');
    if (savedLayout === 'true') {
        document.body.classList.add('single-column');
        if (icon) {
            icon.textContent = '▦';
        }
    } else {
        if (icon) {
            icon.textContent = '▥';
        }
    }
}

/**
 * 初始化主题
 */
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme !== 'dark') {
        document.body.className = savedTheme + '-theme';
    }
    
    const icon = document.getElementById('themeIcon');
    const text = document.getElementById('themeText');
    
    // 检查元素是否存在（可能在某些页面中不存在这些元素）
    if (!icon || !text) {
        return;
    }
    
    if (savedTheme === 'light') {
        icon.textContent = '○';
        text.textContent = '浅色';
    } else if (savedTheme === 'gray') {
        icon.textContent = '◍';
        text.textContent = '灰色';
    } else {
        icon.textContent = '◐';
        text.textContent = '深色';
    }
}

/**
 * 初始化面板大小调整器
 */
function initResizer() {
    const resizer = document.getElementById('resizer');
    const leftPanel = document.querySelector('.left-panel');
    const body = document.body;
    
    // 如果元素不存在，直接返回
    if (!resizer || !leftPanel) {
        return;
    }
    
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    const savedWidth = localStorage.getItem('leftPanelWidth');
    if (savedWidth) {
        leftPanel.style.setProperty('width', savedWidth + 'px', 'important');
        leftPanel.style.setProperty('max-width', 'none', 'important');
    }

    resizer.addEventListener('mousedown', function(e) {
        if (body.classList.contains('single-column')) return;

        isResizing = true;
        startX = e.clientX;
        startWidth = leftPanel.offsetWidth;
        resizer.classList.add('resizing');

        const overlay = document.createElement('div');
        overlay.className = 'resize-overlay';
        overlay.id = 'resizeOverlay';
        body.appendChild(overlay);

        e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
        if (!isResizing) return;

        const diff = e.clientX - startX;
        let newWidth = startWidth + diff;

        const minWidth = 320;
        const maxWidth = window.innerWidth * 0.75;

        if (newWidth < minWidth) newWidth = minWidth;
        if (newWidth > maxWidth) newWidth = maxWidth;

        leftPanel.style.setProperty('width', newWidth + 'px', 'important');
        leftPanel.style.setProperty('max-width', 'none', 'important');
    });

    document.addEventListener('mouseup', function() {
        if (!isResizing) return;

        isResizing = false;
        resizer.classList.remove('resizing');

        const overlay = document.getElementById('resizeOverlay');
        if (overlay) overlay.remove();

        localStorage.setItem('leftPanelWidth', leftPanel.offsetWidth);
    });

    // 触摸设备支持
    resizer.addEventListener('touchstart', function(e) {
        if (body.classList.contains('single-column')) return;

        isResizing = true;
        startX = e.touches[0].clientX;
        startWidth = leftPanel.offsetWidth;
        resizer.classList.add('resizing');
        e.preventDefault();
    });

    document.addEventListener('touchmove', function(e) {
        if (!isResizing) return;

        const diff = e.touches[0].clientX - startX;
        let newWidth = startWidth + diff;

        const minWidth = 320;
        const maxWidth = window.innerWidth * 0.75;

        if (newWidth < minWidth) newWidth = minWidth;
        if (newWidth > maxWidth) newWidth = maxWidth;

        leftPanel.style.setProperty('width', newWidth + 'px', 'important');
        leftPanel.style.setProperty('max-width', 'none', 'important');
    });

    document.addEventListener('touchend', function() {
        if (!isResizing) return;

        isResizing = false;
        resizer.classList.remove('resizing');
        localStorage.setItem('leftPanelWidth', leftPanel.offsetWidth);
    });
}
