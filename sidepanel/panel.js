// 全局变量
let selectedApiDoc = '';

// 初始化
document.addEventListener('DOMContentLoaded', function() {
  // 获取元素
  const generateBtn = document.querySelector('.generate-btn');
  const copyBtn = document.querySelector('.copy-btn');
  const backBtn = document.querySelector('.back-btn');
  const languageSection = document.querySelector('.language-selector-section');
  const codeSection = document.querySelector('.code-output-section');
  
  // 添加事件监听器
  generateBtn.addEventListener('click', generateCode);
  copyBtn.addEventListener('click', copyCode);
  backBtn.addEventListener('click', goBack);
  
  // 监听来自背景脚本的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('侧边栏收到消息:', request);
    
    if (request.action === "setApiDoc") {
      selectedApiDoc = request.apiDoc;
    } else if (request.action === "codeGenerationStarted") {
      showCodeOutput();
    } else if (request.action === "codeGenerationUpdate") {
      updateCodeOutput(request.content);
    } else if (request.action === "codeGenerationCompleted") {
      completeCodeOutput();
    } else if (request.action === "showError") {
      showError(request.error);
    }
    
    return true;
  });
  
  // 通知背景脚本侧边栏已加载
  chrome.runtime.sendMessage({
    action: "sidePanelLoaded"
  });
});

// 生成代码
function generateCode() {
  if (!selectedApiDoc) {
    showError("没有选中API文档，请先选择文档内容");
    return;
  }
  
  const selectedLanguage = document.querySelector('input[name="language"]:checked').value;
  
  // 发送消息到背景脚本，开始生成代码
  chrome.runtime.sendMessage({
    action: "generateCode",
    apiDoc: selectedApiDoc,
    language: selectedLanguage
  });
}

// 复制代码
function copyCode() {
  const codeText = document.querySelector('.code-content').textContent;
  navigator.clipboard.writeText(codeText)
    .then(() => {
      const copyBtn = document.querySelector('.copy-btn');
      copyBtn.textContent = '已复制';
      setTimeout(() => {
        copyBtn.textContent = '复制代码';
      }, 2000);
    })
    .catch(err => {
      console.error('复制失败:', err);
    });
}

// 返回语言选择
function goBack() {
  document.querySelector('.language-selector-section').style.display = 'block';
  document.querySelector('.code-output-section').style.display = 'none';
}

// 显示代码输出
function showCodeOutput() {
  document.querySelector('.language-selector-section').style.display = 'none';
  document.querySelector('.code-output-section').style.display = 'block';
  document.querySelector('.loading-indicator').style.display = 'block';
  document.querySelector('.code-content').textContent = '';
}

// 更新代码输出
function updateCodeOutput(content) {
  const codeContainer = document.querySelector('.code-content');
  
  // 累积 Markdown 内容
  if (!codeContainer.dataset.markdownContent) {
    codeContainer.dataset.markdownContent = '';
  }
  codeContainer.dataset.markdownContent += content;
  
  // 使用 marked.js 将 Markdown 转换为 HTML
  codeContainer.innerHTML = marked.parse(codeContainer.dataset.markdownContent);
  
  // 隐藏加载指示器
  document.querySelector('.loading-indicator').style.display = 'none';
}

// 完成代码输出
function completeCodeOutput() {
  // 隐藏加载指示器
  document.querySelector('.loading-indicator').style.display = 'none';
  
  // 获取最终的 Markdown 内容
  const codeElement = document.querySelector('.code-content');
  const markdownContent = codeElement.dataset.markdownContent || '';
  
  // 使用 marked.js 将 Markdown 转换为 HTML
  codeElement.innerHTML = marked.parse(markdownContent);
  
  // 应用语法高亮
  if (typeof hljs !== 'undefined') {
    document.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block);
    });
  }
}

// 显示错误信息
function showError(errorMessage) {
  alert(`错误: ${errorMessage}`);
}