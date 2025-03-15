(function() {
  // 创建UI元素
  let sidebarContainer = null;
  let codeOutputContainer = null;
  let selectedApiDoc = '';

  // 监听来自背景脚本的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('内容脚本收到消息:', request);
    
    if (request.action === "showLanguageSelector") {
      // 获取选中的文本
      const selectedText = request.selectedText;
      
      // 发送消息到背景脚本，请求打开侧边栏
      chrome.runtime.sendMessage({
        action: "openSidePanel",
        apiDoc: selectedText
      });
    } else if (request.action === "showError") {
      showError(request.error);
    }
    
    return true;
  });

  // 显示侧边栏
  function showSidebar() {
    // 如果已经存在，先移除
    if (sidebarContainer) {
      document.body.removeChild(sidebarContainer);
    }

    // 创建侧边栏容器
    sidebarContainer = document.createElement('div');
    sidebarContainer.className = 'api-code-generator-sidebar';
    
    // 创建内容
    sidebarContainer.innerHTML = `
      <div class="sidebar-header">
        <h2>API 代码生成器</h2>
        <button class="close-btn">&times;</button>
      </div>
      <div class="sidebar-content">
        <div class="language-selector-section">
          <h3>选择编程语言</h3>
          <div class="language-options">
            <div class="language-option">
              <input type="radio" id="lang-js" name="language" value="JavaScript" checked>
              <label for="lang-js">JavaScript</label>
            </div>
            <div class="language-option">
              <input type="radio" id="lang-py" name="language" value="Python">
              <label for="lang-py">Python</label>
            </div>
            <div class="language-option">
              <input type="radio" id="lang-java" name="language" value="Java">
              <label for="lang-java">Java</label>
            </div>
            <div class="language-option">
              <input type="radio" id="lang-go" name="language" value="Go">
              <label for="lang-go">Go</label>
            </div>
            <div class="language-option">
              <input type="radio" id="lang-csharp" name="language" value="C#">
              <label for="lang-csharp">C#</label>
            </div>
            <div class="language-option">
              <input type="radio" id="lang-php" name="language" value="PHP">
              <label for="lang-php">PHP</label>
            </div>
            <div class="language-option">
              <input type="radio" id="lang-ruby" name="language" value="Ruby">
              <label for="lang-ruby">Ruby</label>
            </div>
            <div class="language-option">
              <input type="radio" id="lang-swift" name="language" value="Swift">
              <label for="lang-swift">Swift</label>
            </div>
            <div class="language-option">
              <input type="radio" id="lang-kotlin" name="language" value="Kotlin">
              <label for="lang-kotlin">Kotlin</label>
            </div>
            <div class="language-option">
              <input type="radio" id="lang-ts" name="language" value="TypeScript">
              <label for="lang-ts">TypeScript</label>
            </div>
          </div>
          <button class="generate-btn">生成代码</button>
        </div>
        <div class="code-output-section" style="display: none;">
          <h3>生成的代码</h3>
          <div class="code-container">
            <pre><code class="code-content"></code></pre>
            <div class="loading-indicator">正在生成代码...</div>
          </div>
          <button class="copy-btn">复制代码</button>
          <button class="back-btn">返回</button>
        </div>
      </div>
    `;
    
    // 添加到页面
    document.body.appendChild(sidebarContainer);
    
    // 添加事件监听器
    sidebarContainer.querySelector('.close-btn').addEventListener('click', () => {
      document.body.removeChild(sidebarContainer);
      sidebarContainer = null;
    });
    
    // 生成代码按钮点击事件
    sidebarContainer.querySelector('.generate-btn').addEventListener('click', () => {
      const selectedLanguage = sidebarContainer.querySelector('input[name="language"]:checked').value;
      
      // 发送消息到背景脚本，开始生成代码
      chrome.runtime.sendMessage({
        action: "generateCode",
        apiDoc: selectedApiDoc,
        language: selectedLanguage
      });
    });
    
    // 复制代码按钮点击事件
    sidebarContainer.querySelector('.copy-btn').addEventListener('click', () => {
      const codeText = sidebarContainer.querySelector('.code-content').textContent;
      navigator.clipboard.writeText(codeText)
        .then(() => {
          const copyBtn = sidebarContainer.querySelector('.copy-btn');
          copyBtn.textContent = '已复制';
          setTimeout(() => {
            copyBtn.textContent = '复制代码';
          }, 2000);
        })
        .catch(err => {
          console.error('复制失败:', err);
        });
    });
    
    // 返回按钮点击事件
    sidebarContainer.querySelector('.back-btn').addEventListener('click', () => {
      sidebarContainer.querySelector('.language-selector-section').style.display = 'block';
      sidebarContainer.querySelector('.code-output-section').style.display = 'none';
    });
  }

  // 更新侧边栏以显示代码生成部分
  function updateSidebarForCodeGeneration() {
    if (!sidebarContainer) return;
    
    sidebarContainer.querySelector('.language-selector-section').style.display = 'none';
    sidebarContainer.querySelector('.code-output-section').style.display = 'block';
    sidebarContainer.querySelector('.loading-indicator').style.display = 'block';
    sidebarContainer.querySelector('.code-content').textContent = '';
  }

  // 更新代码输出
  function updateCodeOutput(content) {
    if (!sidebarContainer) return;
    
    const codeContainer = sidebarContainer.querySelector('.code-content');
    codeContainer.textContent += content;
    
    // 隐藏加载指示器
    sidebarContainer.querySelector('.loading-indicator').style.display = 'none';
  }

  // 完成代码输出
  function completeCodeOutput() {
    if (!sidebarContainer) return;
    
    // 隐藏加载指示器
    sidebarContainer.querySelector('.loading-indicator').style.display = 'none';
    
    // 添加语法高亮
    const codeElement = sidebarContainer.querySelector('code');
    if (typeof hljs !== 'undefined') {
      hljs.highlightElement(codeElement);
    }
  }

  // 获取整个页面内容
  function getFullPageContent() {
    // 获取主要内容区域（排除导航栏、页脚等）
    const mainContent = document.querySelector('main') || document.querySelector('article') || document.body;
    return mainContent.innerText;
  }

  // 监听来自 background 的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getSelectedText') {
      const selectedText = window.getSelection().toString();
      if (!selectedText || selectedText.trim() === '') {
        // 如果没有选中文本，则返回整个页面内容
        sendResponse({ text: getFullPageContent() });
      } else {
        sendResponse({ text: selectedText });
      }
    }
  });
})();