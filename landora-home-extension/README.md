# LANDORA HOME｜房仲自動上架助手（第一階段 MVP）

此專案與「LANDORA 智匯 AI 地產」網站獨立。此版本是 Chrome Manifest V3 本機擴充功能原型，**尚不具備自動上架或 Facebook 自動發文能力**。

## 安裝測試
1. 下載本資料夾至電腦。
2. Chrome 開啟 chrome://extensions，啟用「開發人員模式」。
3. 點「載入未封裝項目」，選擇 landora-home-extension 資料夾。
4. 點選 LANDORA HOME 圖示，建立房源草稿、上傳照片、依房間分類、排序及複製文案。

## 已實作
- 本機房源草稿保存（chrome.storage.local）
- 房仲自行編輯文案與照片說明；不自動修改照片說明
- 照片本機預覽、空間分組、組內排序，同一空間不穿插
- 合規文案基礎模板（刊登前仍須確認法定欄位）

## 尚未實作
- 手機 OTP、LINE Login、單一手機號碼帳號與最多兩工作階段
- 房仲／租賃業者證照審核、廣告稿簽章及委託查核
- 社區主檔與地址核實、AI 圖片分類、跨平台照片持久化
- 各房屋網站授權刊登 API
- Meta Facebook Page 授權、Pages API 發文、排程後端與失敗重試

**安全界線**：不儲存第三方帳號密碼、不繞過 CAPTCHA、不對未授權網站自動操作。Facebook 自動發文需 Meta App、必要審核與 Page 授權，並在後端安全保存權杖。
