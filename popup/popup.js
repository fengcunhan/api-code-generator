document.addEventListener('DOMContentLoaded', function() {
  // 加载保存的设置
  chrome.storage.sync.get(['apiKey', 'apiEndpoint', 'model', 'customModel'], function(result) {
    if (result.apiKey) {
      document.getElementById('api-key').value = result.apiKey;
    }
    if (result.apiEndpoint) {
      document.getElementById('api-endpoint').value = result.apiEndpoint;
    } else {
      document.getElementById('api-endpoint').value = 'https://api.openai.com/v1/chat/completions';
    }
    if (result.model) {
      document.getElementById('model').value = result.model;
    }
    
    // 加载自定义模型设置
    if (result.customModel) {
      document.getElementById('custom-model').value = result.customModel;
    }
    
    // 根据选择的模型类型显示或隐藏自定义模型输入框
    toggleCustomModelInput();
  });

  // 监听模型选择变化
  document.getElementById('model').addEventListener('change', toggleCustomModelInput);

  // 保存设置
  document.getElementById('save-settings').addEventListener('click', function() {
    const apiKey = document.getElementById('api-key').value;
    const apiEndpoint = document.getElementById('api-endpoint').value;
    const modelSelect = document.getElementById('model');
    const model = modelSelect.value;
    const customModel = document.getElementById('custom-model').value;

    // 确定最终使用的模型名称
    const finalModel = model === 'custom' ? customModel : model;

    chrome.storage.sync.set({
      apiKey: apiKey,
      apiEndpoint: apiEndpoint,
      model: model,
      customModel: customModel,
      finalModel: finalModel
    }, function() {
      alert('设置已保存');
    });
  });
});

// 根据选择的模型类型显示或隐藏自定义模型输入框
function toggleCustomModelInput() {
  const modelSelect = document.getElementById('model');
  const customModelContainer = document.getElementById('custom-model-container');
  
  if (modelSelect.value === 'custom') {
    customModelContainer.style.display = 'block';
  } else {
    customModelContainer.style.display = 'none';
  }
}