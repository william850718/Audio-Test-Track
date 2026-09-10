# AudioTracker

實驗室內部記錄系統。GitHub Pages 靜態網頁 + Supabase,**沒有應用伺服器,沒有 build step**。
使用者約 15 人。完整說明見 `HANDOVER.md`。

---

## 溝通

**用繁體中文回覆。** 程式碼、識別字、commit message 用英文。

---

## 開發前必讀

### 這個 repo 是公開的

`https://github.com/william850718/Audio-Test-Track`

**每次 push 前跑兩道掃描:**

```bash
# 檔名
git diff --name-only origin/main..main | grep -iE "vapid-keys|SupaBase\.txt|\.env$|\.key$|\.pem$"

# 內容(只看新增行)
git diff origin/main..main | grep "^+" | grep -aiE "BEGIN .*PRIVATE KEY|service_role|<公司網域>"
```

注意事項:

- 用 `grep -a` —— `grep` 會把某些檔案當成二進位而**靜靜跳過**
- Supabase **anon key 出現在原始碼是正常的**,那把 key 設計上就是公開的,防線是 RLS
- `service_role` key 永遠不能離開 Supabase secrets
- **不要把公司網域或個人信箱寫進任何 committed 檔案**(含測試 fixture,用 `example.com`)

### `專案規劃/` 不進版控

裡面是規劃文件與**系統已知弱點清單**。repo 是公開的,那份清單等於幫攻擊者省下探勘。
進度標記維護在本機即可,不要 commit。

---

## 本機執行

**不能雙擊 `index.html`。** 程式碼以 ES module 載入,瀏覽器拒絕透過 `file://` 抓模組,
整頁不會有任何反應且 console 不會說明原因。

```
aclab-start.bat        # http://127.0.0.1:8765/
```

**測試:** console 執行 `runSelfCheck()`,應為 72 條全過。
純函式測試,不碰 DOM 與網路,隨時可跑。

---

## 架構

```
index.html              只有標記 + 一個 <script type="module">
frontend/src/
  main.js  state.js     進入點、接線、跨模組共用狀態
  domain/               規則:認證進度、封存、平台、權限 — 不碰 DOM、不碰網路
  services/             Supabase:資料列、認證、Storage、推播、離線佇列
  components/           可重用 UI
  views/                三個模式 + 登入
  export/  utils/  assets/
backend/models/         建表腳本,有順序
backend/middlewares/    全部 RLS 政策(集中,勿散落)
tests/selfCheck.js
```

**相依方向單向:**`views` 可用下層一切;`domain`/`utils` 只依賴彼此;
**`services` 絕不 import view** —— 資料層要重畫畫面時,呼叫 `main.js` 注入的回呼
(`services/hooks.js` 的 `setRedraw`)。

### 動過模組之後一定要跑

新增、搬移、刪除模組,或改動 import 之後:

```bash
python scripts/fiximports.py    # 重算所有 import,並檢查:未匯出、未匯入、循環相依
python scripts/rebridge.py      # 重建 main.js 底部的 window bridge
```

`fiximports.py` 的三道檢查會擋住三類會在**執行期才炸**的錯誤。它刻意「寧可多匯入」——
多餘的 import 無害,漏掉的是幾週後才出現的 ReferenceError。

---

## 已知的坑

| 事情 | 說明 |
|---|---|
| **`core.autocrlf=true`** | checkout 後工作區是 CRLF、commit 的 blob 是 LF。**做字串比對的腳本要先正規化**,否則全部失配 |
| **147 個 inline handler** | 靠 `main.js` 的 window bridge 才能運作。那是模組化的臨時腳手架,別把它當設計 |
| **模板字面值裡有 CSS** | 含 `/* */`。任何貪婪的區塊註解 regex 會吃掉真程式碼 |
| **巢狀模板字面值** | `${x?\`...\`:''}` 到處都是。**寫 lexer 去分辨程式碼與字串必失敗**,試過兩次 |
| **驗證工具不能和轉換工具共用邏輯** | 曾經兩者共用同一個有 bug 的掃描器,結果檢查器一起瞎掉,只有瀏覽器發現 |
| **GitHub 排程會遲到** | 週報實測遲到 73 分鐘是常態,不是故障。手動 dispatch 不會寄信給觸發者 |

---

## 工作方式

- **先討論再實作。** 提案、講清楚取捨、等點頭,不要直接動手
- **使用者會自己在本機驗證後才 push。** 做完在本機 commit,由他確認後再推
- 改完要**實際在瀏覽器驗證**,不要只說「應該可以」。screenshot 或 DOM 量測都行
- 破壞性操作(刪檔、force push、刪資料)一定要先問

---

## 目前未完成的工作

按重要性:

1. **附件 Storage 是公開 bucket** —— 唯一有實際外洩風險的一項。路徑用記錄編號,可枚舉。
   修法:bucket 改私有 + 前端改簽名網址(`services/storage.js` 加批次簽名快取,
   讓渲染維持同步)。PDF 匯出不受影響
2. **資料庫沒有版控** —— `backend/models/*.sql` 只是一次性腳本,真實 schema 活在 Supabase 上,
   沒有機制驗證一致。需要 `supabase db pull` 建 baseline migration
3. **RLS 只有一個位元** —— 所有政策都是 `is_approved()`。app 裡的刪除規則、封存隱藏、
   記錄者鎖定在資料庫層**完全不存在**。要做就走 RPC(`backend/rpc/` 是留給這個的)
4. **inline handler → 事件委派** —— 純可維護性
5. **Teams 專案表同步** —— 已調查,暫緩。表主非本人、含客戶 PII

---

## 資料模型的三個陷阱

七張表除 `allowed_users` 外都是 `id + data jsonb`,**Postgres 不知道欄位存在**。
完整欄位清單在 `HANDOVER.md` 第 4 節。三件最容易踩的:

1. **舊資料沒有 `createdBy`**(2026-08 才加)。依賴它的權限判斷要決定舊資料怎麼處理
2. **新舊欄位並存**:`sampleTypes`/`sampleType`、`certItems`/`certItem`、
   `connectionTypes`/`connectionType` —— 舊的那些還有真實資料,**不要刪**
3. **`assignee` / `reporter` 存的是信箱前綴不是全名**,而且是兩件不同的事。
   可靠的身分來源是資料表欄位 `updated_by`(來自 session,使用者改不掉)
