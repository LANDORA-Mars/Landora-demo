# LANDORA 房屋／土地雙向配對後端（未部署）

這是可供 Cloudflare Workers + D1 使用的**授權索引查詢原型**，不是全台真實資料庫，也不是可公開使用的正式會員 API。程式沒有爬蟲、沒有 AI 解析，也不會自動取得任何第三方刊登資料。

## 部署前必要設定

1. 在 D1 建立 `schema.sql` 表格，Worker 設定 `DB` D1 binding。
2. 以 Secrets 設定 `QUERY_TOKEN`（暫供內部測試查詢）和 `INGEST_TOKEN`（限管理員匯入），並設定 `ALLOWED_ORIGIN` 為指定網站來源。
3. 使用 `POST /api/index/ingest` 匯入**具有合法授權依據**的紀錄；每筆需含 `id,type,url,city,district,source,sourceUrl,permissionBasis,observedAt`。土地另需 `section,parcels:[{number}]`。
4. `GET /api/lookup/address?city=...&district=...&q=...` 查詢房屋；`GET /api/lookup/parcel?city=...&district=...&section=...&number=...` 查詢土地；使用 `Authorization: Bearer <QUERY_TOKEN>`。
5. 查詢回傳至多 50 筆，保留不同來源及多地號組合，無結果即回傳空陣列。

## 安全限制與正式上線阻擋事項

- **不可把 QUERY_TOKEN 寫進 GitHub Pages、擴充功能或任何瀏覽器程式碼。** 正式服務必須以會員登入、租戶隔離、試用額度與伺服器端權限檢查替換此暫時測試憑證。
- 匯入 API 僅允許受信任的管理環境呼叫；正式版還須加入資料來源授權審核、速率限制、稽核紀錄、資料更新與撤除、內容安全及負載測試。
- 目前尚未完成真實來源接入、部署或端到端驗收，不能將此 Worker 當作已上線功能。
- 本模組應在測試環境獨立部署，**不要直接覆蓋現有 landora-api Worker**。
