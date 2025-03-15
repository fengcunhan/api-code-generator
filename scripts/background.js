// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "generateApiCode",
    title: "生成API代码",
    contexts: ["selection"]
  });
});

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "generateApiCode") {
    // 打开侧边栏
    chrome.sidePanel.open({ tabId: tab.id }).then(() => {
      // 发送清除历史内容的消息
      chrome.runtime.sendMessage({
        action: "clearContent"
      });
      // 存储选中的文本到会话存储
      chrome.storage.session.set({
        selectedApiDoc: info.selectionText,
        sourceTabId: tab.id
      });
    }).catch(error => {
      console.error("打开侧边栏失败:", error);
    });
  }
});

// 处理来自内容脚本和侧边栏的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openSidePanel") {
    // 打开侧边栏
    chrome.sidePanel.open({ tabId: sender.tab.id }).then(() => {
      // 存储选中的API文档
      chrome.storage.session.set({
        selectedApiDoc: request.apiDoc,
        sourceTabId: sender.tab.id
      });
      // 发送响应
      sendResponse({ success: true });
    }).catch(error => {
      console.error("打开侧边栏失败:", error);
      sendResponse({ success: false, error: error.message });
    });
  } else if (request.action === "sidePanelLoaded") {
    // 侧边栏已加载，发送之前存储的API文档
    chrome.storage.session.get(['selectedApiDoc'], function(result) {
      if (result.selectedApiDoc) {
        chrome.runtime.sendMessage({
          action: "setApiDoc",
          apiDoc: result.selectedApiDoc
        });
      }
      sendResponse({ success: true });
    });
  } else if (request.action === "generateCode") {
    // 获取设置
    chrome.storage.sync.get(['apiKey', 'apiEndpoint', 'model', 'customModel'], function(result) {
      if (!result.apiKey) {
        chrome.runtime.sendMessage({
          action: "showError",
          error: "请先在插件设置中配置API Key"
        });
        sendResponse({ success: false, error: "No API Key" });
        return;
      }

      // 确定使用哪个模型
      const modelToUse = result.model === 'custom' && result.customModel ? 
                        result.customModel : 
                        (result.model || 'gpt-3.5-turbo');

      // 发送请求到LLM API
      generateCode(
        result.apiKey,
        result.apiEndpoint || 'https://api.openai.com/v1/chat/completions',
        modelToUse,
        request.apiDoc,
        request.language
      );
      
      sendResponse({ success: true });
    });
  } else {
    // 对于不需要异步响应的消息，不返回 true
    return false;
  }
  
  // 返回true表示将异步发送响应
  return true;
});

// 生成代码函数
async function generateCode(apiKey, apiEndpoint, model, apiDoc, language) {
  try {
    // 发送初始消息，表示开始生成
    chrome.runtime.sendMessage({
      action: "codeGenerationStarted"
    });

    const prompt = `根据以下API文档，生成${language}语言的API请求代码：\n\n${apiDoc}`;
    
    // 发送请求到LLM API
    const requestBody = JSON.stringify({
      model: model,
      messages: [
        {
          role: "system",
          content: `你是一个API代码生成助手。你的任务是根据提供的API文档生成${language}语言的API请求代码。请使用Markdown格式输出，确保代码块使用正确的语法高亮标记（如 \`\`\`${language.toLowerCase()}）。请确保代码简洁、高效，并包含必要的错误处理。`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      stream: true
    });
    
    console.log('请求URL:', apiEndpoint);
    console.log('请求头:', {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.substring(0, 5)}...`
    });
    console.log('请求体:', requestBody);
    
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: requestBody
    });
    
    if (!response.ok) {
      // 获取错误响应的文本内容
      const errorText = await response.text();
      console.error('API请求失败:', response.status, errorText);
      
      // 尝试解析错误响应
      let errorMessage = `API请求失败: ${response.status}`;
      let detailedError = '';
      
      if (response.status === 404) {
        detailedError = `API端点不存在，请检查API端点URL是否正确: ${apiEndpoint}`;
      } else if (response.status === 401) {
        detailedError = '认证失败，请检查API Key是否正确';
      } else if (response.status === 429) {
        detailedError = '请求过于频繁，请稍后再试';
      }
      
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error && errorJson.error.message) {
          detailedError += `\n\nAPI返回错误: ${errorJson.error.message}`;
        }
      } catch (e) {
        // 如果无法解析为JSON，则使用原始错误文本
        if (errorText && errorText.length < 200) {
          detailedError += `\n\n${errorText}`;
        }
      }
      
      // 发送错误消息到侧边栏
      chrome.runtime.sendMessage({
        action: "codeGenerationUpdate",
        content: `错误: ${errorMessage}\n${detailedError}`
      });
      
      chrome.runtime.sendMessage({
        action: "codeGenerationCompleted"
      });
      
      throw new Error(`${errorMessage}\n${detailedError}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      buffer += chunk;
      
      // 处理SSE格式的响应
      const lines = buffer.split('\n');
      buffer = lines.pop() || "";
      
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.substring(6));
            if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
              // 发送增量内容到侧边栏
              chrome.runtime.sendMessage({
                action: "codeGenerationUpdate",
                content: data.choices[0].delta.content
              });
            }
          } catch (e) {
            console.error('解析SSE数据失败:', e);
          }
        }
      }
    }
    
    // 发送完成消息
    chrome.runtime.sendMessage({
      action: "codeGenerationCompleted"
    });
    
  } catch (error) {
    console.error('生成代码时出错:', error);
    chrome.runtime.sendMessage({
      action: "showError",
      error: `生成代码时出错: ${error.message}`
    });
  }
}

// 监听插件按钮点击事件
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: 'getSelectedText' }, (response) => {
    if (response && response.text) {
      // 打开侧边栏并处理获取到的文本内容
      chrome.sidePanel.open({ tabId: tab.id }).then(() => {
        // 发送清除历史内容的消息
        chrome.runtime.sendMessage({
          action: "clearContent"
        });
        // 存储获取到的文本到会话存储
        chrome.storage.session.set({
          selectedApiDoc: response.text,
          sourceTabId: tab.id
        });
      }).catch(error => {
        console.error("打开侧边栏失败:", error);
      });
    }
  });
});

// 处理来自内容脚本和侧边栏的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openSidePanel") {
    // 打开侧边栏
    chrome.sidePanel.open({ tabId: sender.tab.id }).then(() => {
      // 存储选中的API文档
      chrome.storage.session.set({
        selectedApiDoc: request.apiDoc,
        sourceTabId: sender.tab.id
      });
      // 发送响应
      sendResponse({ success: true });
    }).catch(error => {
      console.error("打开侧边栏失败:", error);
      sendResponse({ success: false, error: error.message });
    });
  } else if (request.action === "sidePanelLoaded") {
    // 侧边栏已加载，发送之前存储的API文档
    chrome.storage.session.get(['selectedApiDoc'], function(result) {
      if (result.selectedApiDoc) {
        chrome.runtime.sendMessage({
          action: "setApiDoc",
          apiDoc: result.selectedApiDoc
        });
      }
      sendResponse({ success: true });
    });
  } else if (request.action === "generateCode") {
    // 获取设置
    chrome.storage.sync.get(['apiKey', 'apiEndpoint', 'model', 'customModel'], function(result) {
      if (!result.apiKey) {
        chrome.runtime.sendMessage({
          action: "showError",
          error: "请先在插件设置中配置API Key"
        });
        sendResponse({ success: false, error: "No API Key" });
        return;
      }

      // 确定使用哪个模型
      const modelToUse = result.model === 'custom' && result.customModel ? 
                        result.customModel : 
                        (result.model || 'gpt-3.5-turbo');

      // 发送请求到LLM API
      generateCode(
        result.apiKey,
        result.apiEndpoint || 'https://api.openai.com/v1/chat/completions',
        modelToUse,
        request.apiDoc,
        request.language
      );
      
      sendResponse({ success: true });
    });
  } else if (request.action === "extractCode") {
    // 从完整内容中提取代码部分
    const content = request.content;
    const codeMatches = content.match(/```[\s\S]*?\n([\s\S]*?)```/g);
    
    if (codeMatches && codeMatches.length > 0) {
      // 提取所有代码块中的实际代码内容
      const codeContent = codeMatches.map(block => {
        // 移除开头的 ```language 和结尾的 ```
        return block.replace(/```.*\n/, '').replace(/```$/, '').trim();
      }).join('\n\n');
      
      sendResponse({ success: true, code: codeContent });
    } else {
      sendResponse({ success: false, error: "未找到代码块" });
    }
  }
  else {
    // 对于不需要异步响应的消息，不返回 true
    return false;
  }
  
  // 返回true表示将异步发送响应
  return true;
});

// 生成代码函数
async function generateCode(apiKey, apiEndpoint, model, apiDoc, language) {
  try {
    // 发送初始消息，表示开始生成
    chrome.runtime.sendMessage({
      action: "codeGenerationStarted"
    });

    const prompt = `根据以下API文档，生成${language}语言的API请求代码：\n\n${apiDoc}`;
    
    // 发送请求到LLM API
    const requestBody = JSON.stringify({
      model: model,
      messages: [
        {
          role: "system",
          content: `你是一个API代码生成助手。你的任务是根据提供的API文档生成${language}语言的API请求代码。请使用Markdown格式输出，确保代码块使用正确的语法高亮标记（如 \`\`\`${language.toLowerCase()}）。请确保代码简洁、高效，并包含必要的错误处理。`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      stream: true
    });
    
    console.log('请求URL:', apiEndpoint);
    console.log('请求头:', {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.substring(0, 5)}...`
    });
    console.log('请求体:', requestBody);
    
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: requestBody
    });
    
    if (!response.ok) {
      // 获取错误响应的文本内容
      const errorText = await response.text();
      console.error('API请求失败:', response.status, errorText);
      
      // 尝试解析错误响应
      let errorMessage = `API请求失败: ${response.status}`;
      let detailedError = '';
      
      if (response.status === 404) {
        detailedError = `API端点不存在，请检查API端点URL是否正确: ${apiEndpoint}`;
      } else if (response.status === 401) {
        detailedError = '认证失败，请检查API Key是否正确';
      } else if (response.status === 429) {
        detailedError = '请求过于频繁，请稍后再试';
      }
      
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error && errorJson.error.message) {
          detailedError += `\n\nAPI返回错误: ${errorJson.error.message}`;
        }
      } catch (e) {
        // 如果无法解析为JSON，则使用原始错误文本
        if (errorText && errorText.length < 200) {
          detailedError += `\n\n${errorText}`;
        }
      }
      
      // 发送错误消息到侧边栏
      chrome.runtime.sendMessage({
        action: "codeGenerationUpdate",
        content: `错误: ${errorMessage}\n${detailedError}`
      });
      
      chrome.runtime.sendMessage({
        action: "codeGenerationCompleted"
      });
      
      throw new Error(`${errorMessage}\n${detailedError}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      buffer += chunk;
      
      // 处理SSE格式的响应
      const lines = buffer.split('\n');
      buffer = lines.pop() || "";
      
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.substring(6));
            if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
              // Escape HTML content before sending to frontend
              const content = data.choices[0].delta.content
              
              // 发送增量内容到侧边栏
              chrome.runtime.sendMessage({
                action: "codeGenerationUpdate",
                content: content
              });
            }
          } catch (e) {
            console.error('解析SSE数据失败:', e);
          }
        }
      }
    }
    
    // 发送完成消息
    chrome.runtime.sendMessage({
      action: "codeGenerationCompleted"
    });
    
  } catch (error) {
    console.error('生成代码时出错:', error);
    chrome.runtime.sendMessage({
      action: "showError",
      error: `生成代码时出错: ${error.message}`
    });
  }
}

// 监听插件按钮点击事件
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: 'getSelectedText' }, (response) => {
    if (response && response.text) {
      // 打开侧边栏并处理获取到的文本内容
      chrome.sidePanel.open({ tabId: tab.id }).then(() => {
        // 发送清除历史内容的消息
        chrome.runtime.sendMessage({
          action: "clearContent"
        });
        // 存储获取到的文本到会话存储
        chrome.storage.session.set({
          selectedApiDoc: response.text,
          sourceTabId: tab.id
        });
      }).catch(error => {
        console.error("打开侧边栏失败:", error);
      });
    }
  });
});