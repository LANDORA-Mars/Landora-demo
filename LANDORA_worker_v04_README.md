# LANDORA API v0.4（獨立開發分支）
此版本尚未部署 Cloudflare。請勿當成可直接上線的正式配對引擎。

## 新增內容
- `LANDORA_worker_v04.js`：GET /health、GET /api/me、GET/POST /api/cases、GET /api/cases/:id。
- JWT RS256 以 JWKS 驗章，嚴格檢查 issuer、audience、exp、nbf；不接受客戶端自行聲稱的會員身分。
- 每個案件查詢以已驗證會員的 organization_id 過濾；資料庫無法使用或未設定身份服務時拒絕查詢。
- 新增案件會消耗會員額度，**但目前尚未完成併發壓力測試，不能直接用於付費扣點**。
- 僅建立 queued 案件，尚未取得合法房源解析權限或地籍 API，故不會假造比對結果。

## 部署前阻擋項
1. 身分供應商及 AUTH_ISSUER、AUTH_AUDIENCE、AUTH_JWKS_URL、ALLOWED_ORIGIN 設定；正式註冊與會員資料 provisioning。
2. 檢查 D1 遷移、外鍵啟用、資料庫交易和配額併發正確性。
3. 配額寫入需改為**單條條件式 INSERT ... SELECT** 或可靠的交易結果判定，以免 quota 更新成功但案件未建立時發生異常。
4. 登入驗證、CSRF/CORS、API 限速、記錄保護、資料刪除與備份。
5. 授權的房源解析與政府地籍查詢，證據評分和排除原因。
6. 先在測試 Worker 與測試 D1 驗證，切勿直接覆蓋現有正式 Worker。

## 資料庫
搭配 main 分支已提交的 `LANDORA_commercial_schema_v01.sql`，僅作為 D1 schema 草案。需審查後才可執行 migration。

## 安全提醒
JWT 公鑰網址由環境變數設定；不可允許用戶提交任意 JWKS URL。不能把私鑰、API Token 或 Cloudflare 帳密寫進 GitHub。
