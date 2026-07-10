const statusEl = document.getElementById("status");
const togglePanelBtn = document.getElementById("togglePanel");

togglePanelBtn.addEventListener("click", () => sendToActiveTab({ type: "BAH_TOGGLE_PANEL" }));

async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes("zhipin.com")) {
    statusEl.textContent = "请先打开 zhipin.com 页面。";
    return;
  }

  chrome.tabs.sendMessage(tab.id, message, () => {
    if (chrome.runtime.lastError) {
      statusEl.textContent = "页面助手未就绪，请刷新 BOSS 页面。";
      return;
    }
    statusEl.textContent = "已切换页面面板。";
  });
}
