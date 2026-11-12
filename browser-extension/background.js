"use strict";
chrome.action.onClicked.addListener(async tab => {
  if (!tab?.id) return;
  try { await chrome.sidePanel.open({tabId:tab.id}); }
  catch (error) { console.error("無法開啟 LANDORA 側邊面板",error); }
});
