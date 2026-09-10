# AudioTracker 交接文件

> 最後更新:2026-09-10
> 這份文件是給接手的人看的。安全相關的細節不在這裡 —— 這個 repo 是公開的,
> 那部分在 `專案規劃/交接-機密事項.md`,由原作者另外交付。

---

## 1. 這是什麼

音響認證實驗室的內部記錄系統,約 15 人使用。三個模式:

| 模式 | 用途 |
|---|---|
| **Platform Tracking** | 內部公告 —— 測試手法、測試 sequence 更新。跟客戶無關。 |
| **Project Log** | 客戶專案 → 每日測試 log,含 Teams/Zoom 認證進度計算 |
| **Lab Instruments** | 實驗室設備清冊與校驗日期 |

技術上是 **GitHub Pages 上的靜態網頁 + Supabase**。沒有應用伺服器,沒有 build step。

- 線上位址:`https://william850718.github.io/Audio-Test-Track/`
- Supabase 專案:`ygoywjqgatkwboepxaaz`
- 部署方式:**推到 `main` 就上線**,沒有 CI、沒有預覽環境

---

## 2. 本機開發

**不能直接雙擊 `index.html`。** 程式碼以 ES module 載入,瀏覽器拒絕透過 `file://` 抓取模組(來源是 `null`,CORS 永遠不會過)。結果是整頁沒有任何反應,而且 console 什麼都不會說。

```
aclab-start.bat
```

會在 <http://127.0.0.1:8765/> 開起來。需要 PATH 上有 Python。

**測試:** 在 console 執行 `runSelfCheck()`,應該回報 72 條全過。

---

## 3. 架構

### 前端分層

```
index.html                  267 行,只有標記和一個 <script type="module">
frontend/src/
  main.js       + state.js     260   進入點、接線、跨模組共用狀態
  domain/                      829   規則:認證進度、封存、平台定義、權限
  services/                    648   Supabase:資料列、認證、Storage、推播、離線佇列
  components/                 1139   可重用 UI:卡片、篩選器、上傳器、儀表
  views/                      2806   三個模式 + 登入畫面
  export/                      219   PDF / JSON 報表
  utils/                        87   日期、格式、下載
  assets/app.css               920
tests/selfCheck.js             218   72 條斷言
```

**相依方向是單向的:**`views` 可以用下面所有東西;`domain` 和 `utils` 只依賴彼此;**`services` 從不 import view** —— 資料層需要重畫畫面時,呼叫的是 `main.js` 注入給它的回呼(`services/hooks.js` 的 `setRedraw`)。

`domain/` 不碰 DOM、不碰網路,所以可以獨立測試,也是理解這個系統在做什麼最快的入口。

### 後端

**沒有應用伺服器。**「後端」指的是:

| 位置 | 內容 |
|---|---|
| `backend/models/01~05` | 建表腳本,**有執行順序** |
| `backend/middlewares/policies.sql` | 全部 13 條 RLS 政策 + `is_approved()` / `is_admin()` |
| `backend/rpc/` `backend/migrations/` | 空的,見第 7 節 |
| `supabase/functions/notify-push/` | 唯一的伺服器端程式碼,73 行,發推播 |
| `.github/workflows/` | 每週一自動產生開發週報 |

後兩者**必須留在現在的位置** —— Supabase CLI 和 GitHub Actions 都是按路徑找檔案的。

詳細執行順序見 `backend/README.md`。**`policies.sql` 一定要最後跑**;在它之前所有表都是拒絕存取的狀態(這是刻意的)。

---

## 4. 資料契約 ⚠️ 最重要的一節

七張表,除了 `allowed_users` 之外全都是同一個形狀:

```sql
id text primary key,
data jsonb,          -- 所有欄位都在這裡
updated_at timestamptz,
updated_by text
```

**Postgres 完全不知道 `data` 裡有什麼。**這份知識只存在於程式碼裡,所以有了這一節。

### `records`(Platform Tracking)

| 欄位 | 說明 |
|---|---|
| `platform` | Teams / Microsoft HDE / Zoom / Intel / Google / Lenovo |
| `category` `subCategory` | 分類與子分類 |
| `type` `updateSubtype` | 記錄類型 |
| `sampleTypes[]` | 樣品類型(陣列) |
| `sampleType` | ⚠️ **舊格式**(單數字串),只用於讀取舊資料,不要再寫入 |
| `testSoftware` `testSoftwareOther` | 測試軟體 |
| `title` `desc` | 標題與內容 |
| `assignee` | 負責人,存**信箱前綴**(如 `ted.huang`),不是全名 |
| `fwVersion` | 韌體版本 |
| `status` | `in-progress` / `closed`(`pending` 是舊值,讀取時視為 in-progress) |
| `images[]` `files[]` | 附件,存 `{path, name, size, ...}`,實體檔在 Storage |
| `versions[]` | 版本歷程 |
| `created` `createdTs` | 建立日期 / 完整時間戳 |
| `createdBy` | ⚠️ **完整信箱**。**2026-08 才加的,舊資料沒有這個欄位** |
| `updated` `closedAt` | 更新日 / 關閉日 |

### `projects`(Project Log)

`name` `dut` `customer` `notes` `platform` `productType` `productTypeOther`
`connectionTypes[]` `connectionType`(⚠️ 舊格式,單數)`personalFeatures{}`
`os` `earpiece` `hasControls` `micDistanceM` `spkDistanceM`
`chromeOs` `chromeMic` `chromeFeatures[]`
`status` `created` `createdBy` `updated` `closedAt` `deleteAfter`

### `logs`(複合鍵 `project_id + id`)

| 欄位 | 說明 |
|---|---|
| `date` `phase` | 日期 / debug · pretest · qualification · requal |
| `lab` `fwVersion` `platform` | |
| `sampleNo` | **PAL ID**(欄位名沒改,UI 上叫 PAL ID) |
| `certItems[]` | 這次測了哪些認證項目 |
| `certItem` | ⚠️ **舊格式**(單數) |
| `result` | `pass` / `fail` / 空 |
| `waived` `waivedBy` `waivedAt` | 客戶認可的失敗項 |
| `reporter` | 記錄者,存信箱前綴 |
| `summary` `images[]` `files[]` | |

### 三個一定要知道的陷阱

1. **舊資料沒有 `createdBy`。** 任何依賴它的 RLS 或統計,必須決定舊資料怎麼處理。目前的做法是「沒有 `createdBy` 的一律只有 admin 能刪」。
2. **成對的新舊欄位**(`sampleTypes`/`sampleType`、`certItems`/`certItem`、`connectionTypes`/`connectionType`)—— 程式碼裡到處是讀取時的相容處理。**不要刪掉舊的**,那些欄位還有真實資料。
3. **`assignee` 和 `reporter` 是兩件事**,而且存的都是信箱前綴不是全名。`updated_by`(資料表欄位,不在 jsonb 裡)才是可靠的身分來源 —— 它來自登入 session,使用者改不掉。

---

## 5. 幾條不直觀的業務規則

### 認證進度(`domain/certification.js`)

Teams 專案的檢查清單是**從裝置規格推導出來的**,不是固定列表:

- 耳機/外接式喇叭 → 由連線方式決定。USB 除非是唯一模式否則不測 Audio 和 Cortana;NBT Function 只有在 LE Audio 並存時才標 Classic;ASP 只有有 Teams Button 的裝置才列;HID 要有實體按鍵
- 有內建系統的喇叭/SoundBar → 沒有連線方式。MTRoW 是 Audio + Function + Cortana;MTRoA 和 Deskphone 是 Audio + Loop Latency

進度 = **Debug 佔 20%**(且只有真的有 debug log 才算)+ 其餘項目均分 80%。已關閉的專案一律顯示 100%。

**沒有任何一項是手動打勾的** —— 全部由 log 上的標籤推導,所以不會跟實際記錄脫節。

### 封存(`domain/archive.js`)

- Closed 滿 **30 天**(`ARCHIVE_AFTER_DAYS`)後從清單消失,**但不刪除**
- 封存狀態是**從 `closedAt` 推導**的,沒有存欄位
- 只有 admin 看得到 Archived 區,可匯出 PDF / JSON,或手動清除
- **沒有任何東西會自動刪除。** 這是刻意的:這些是測試手法的歷史,兩年後還會有人來查
- 專案若沒有 `closedAt`,用**最新一筆 log 的日期**推算 —— 絕不用 `updated`,因為那個欄位每次存檔都會被蓋掉

### 刪除權限(`domain/permissions.js`)

- **自己建的、7 天內** → 本人可刪(涵蓋「存錯模組」這種失誤)
- 其他情況 → 只有 admin。批次刪除一律只有 admin
- 窗口從 `created` 起算,不是 `updated`
- ⚠️ **這些都只是 UI 層的限制,不是權限邊界。** 資料表對任何登入者仍然可寫,RLS 目前只檢查「是不是已核准的使用者」這一個位元

---

## 6. 維運

| 項目 | 說明 |
|---|---|
| **開發週報** | 每週一自動產生 `docs/weekly/YYYY-Www.md` 並開 Issue。排程是 UTC,**實際觸發常常晚一小時以上,那是 GitHub 排程的正常行為,不是故障** |
| **推播通知** | Edge Function `notify-push`,需要 `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` / `APP_URL` 這些 Supabase secrets |
| **帳號核准** | 新註冊的人預設不能用,要在 app 內的 admin 面板核准(`allowed_users` 表的 `approved` / `is_admin`) |
| **離線** | 沒網路時寫入會排進佇列,恢復連線後自動重放 |
| **即時同步** | 一個人改動,其他人畫面自動更新 |

### 推 code 之前一定要做的檢查

**這個 repo 是公開的。**每次 push 前掃兩件事:

```bash
# 檔名
git diff --name-only origin/main..main | grep -iE "vapid-keys|SupaBase\.txt|\.env$|\.key$|\.pem$"

# 內容(新增的行)
git diff origin/main..main | grep "^+" | grep -iE "@<公司網域>|BEGIN .*PRIVATE KEY|service_role"
```

Supabase 的 **anon key 出現在原始碼裡是正常的** —— 那把 key 本來就設計成公開,防線是 RLS 不是保密。但 `service_role` key 永遠不能離開 Supabase secrets。

---

## 7. 已知未完成的工作

按重要性排序:

### ① 附件的 Storage 是公開的 ⚠️

`attachments` bucket 設定為 `public: true`,意思是**任何人拿到網址就能看,不需要登入**。而檔案路徑用的是記錄編號(`records/TM-001/`、`logs/PRJ-003/LOG-001/`),是可以猜的。

**修法:**bucket 改成 `public: false`,前端改用簽名網址。範圍是 `services/storage.js` 加一層快取(批次簽名、渲染前預先取得,讓渲染維持同步),加上 5 處呼叫點換函式名。PDF 匯出**不受影響** —— 列印時圖片已經嵌進 PDF 的點陣資料。

### ② 資料庫沒有版控

`backend/models/*.sql` 是**一次性設定腳本**,不是 schema 的真實狀態。真正的 schema 活在 Supabase 上,沒有任何機制驗證兩者一致。有人在後台改了什麼,repo 不會知道。

**修法:**`supabase link` + `supabase db pull` 產生 baseline migration,之後每次改 schema 都寫成編號檔。兩個人同時開發時這會立刻變成必需品。

### ③ RLS 只有一個位元

每條政策都是 `using (public.is_approved())` —— 只檢查「是不是已核准的使用者」。第 5 節那些刪除規則、封存隱藏、記錄者鎖定,**在資料庫層完全不存在**。

**修法:**把有規則的動作改成 Postgres RPC(`security definer`),並收回直接寫入權。`backend/rpc/` 就是留給這個的。建議從刪除開始,不要一次全改。

### ④ Inline event handler

畫面上約 147 個 `onclick="..."` 是靠 `main.js` 底部的 window bridge 才能運作。那段是**模組化過程的臨時腳手架**,長期應該改成事件委派(record detail modal 已經是那個寫法,可以照抄)。不影響功能,只影響可維護性。

### ⑤ 擱置中的想法

- **Teams 專案表同步** —— 從 Google 試算表抓專案狀態自動提示可以 Close。已調查過但暫緩:表主不是我們、表內含客戶聯絡信箱,不能公開發布;要做只能走伺服器端代理
- **KPI / 產出統計** —— 等 `createdBy` 和記錄者下拉選單累積夠乾淨的資料再做

---

## 8. 交接清單

以下**不在 repo 裡**,需要原作者另外交付:

| 項目 | 說明 |
|---|---|
| `vapid-keys.txt` | 推播的 VAPID 金鑰對(私鑰) |
| `SupaBase.txt` | Supabase 存取資訊 |
| `專案規劃/` | 規劃文件與安全弱點清單(**刻意不進公開 repo**) |
| `網頁圖標.png` | 網站圖示原始檔 |
| Supabase 專案擁有權 | 需要轉移或加入新的 owner |
| GitHub repo 擁有權 | 目前在個人帳號 `william850718` 下 |
| Supabase secrets | Edge Function 用的四個環境變數 |

**建議:** repo 轉到公司組織帳號下,Supabase 專案也轉到公司帳號。目前兩者都掛在個人帳號,人一走就沒人能改。
