# QRPWA API 移植操作說明

> 移植檔案：`qrpwa-api-transplant.js`
> 適用對象：任何採用相同班程報到架構的新 Google Sheet 系統

---

## 功能說明

移植後新系統將提供以下 API：

| 功能 | 方式 | 用途 |
|------|------|------|
| 設定檔驗證 | GET `?action=verify&name=...` | QRPWA 確認設定檔存在 |
| 取得設定檔 | GET `?action=getConfig&name=...` | QRPWA 下載設定 JSON |
| 列出設定檔 | GET `?action=listConfigs` | 取得所有班別清單 |
| 即時報到記錄 | POST `{"action":"getCheckinLog"}` | 查詢今日/指定日報到名單 |
| 當前班程資訊 | POST `{"action":"getActiveSchedule"}` | 取得今日啟用班程 |

---

## 前置條件：Google Sheet 結構需求

移植前，新的 Google Sheet **必須**包含以下結構。  
Sheet 名稱可在程式碼頂端的「使用者設定區」修改。

### 必要 Sheet 清單

| Sheet 名稱（預設） | 用途 | 可修改設定 |
|-------------------|------|-----------|
| `建置系統注意事項` | 存放系統基本設定 | `TP_SHEET.BUILD_INFO` |
| `班程` | 班別代碼、日期、密碼 | `TP_SHEET.SCHEDULES` |
| `INDATA_電子簽到` | 電子掃描報到記錄 | `TP_SHEET.ELECTRONIC_SIGN` |
| `人工簽到表` | 人工登記報到記錄 | `TP_SHEET.MANUAL_SIGN` |

---

### Sheet 欄位需求

#### 建置系統注意事項

| 儲存格 | 內容 | 範例 |
|--------|------|------|
| `B1` | 班別基礎名稱 | `新生大班` |
| `J1` | 出勤模式字串（含班別代碼） | `實體3`（系統自動去除尾部數字得 `實體`） |
| `N1` | ScanMode 數值 | `2` |

#### 班程 Sheet（資料從第 2 列開始）

| 欄位 | 欄名 | 說明 | 範例 |
|------|------|------|------|
| A | 日期 | 班程日期 | `2026/4/6` |
| D | 檢核密碼 | 當日報到密碼 | `abc123` |
| G | 班別代碼 | 同日多班時的班別編號 | `1`、`3` |
| H | 班別顯示名稱 | 人類可讀的班別名稱 | `第一週日`、`心靈成長班` |

> 欄位位置可在程式碼 `TP_SCHED_COL` 常數區調整。

#### INDATA_電子簽到（資料從第 2 列開始）

| 欄位 | 欄名 | 說明 |
|------|------|------|
| A | 時間戳記 | Google 表單提交時間 |
| B | ID | 班員 ID |
| C | 姓名 | 班員姓名 |
| E | 班程註記 | 如 `實體3` |
| G | 檢核密碼 | verify 欄位 |

#### 人工簽到表（資料從第 2 列開始）

| 欄位 | 欄名 | 說明 |
|------|------|------|
| A | Google Form 時間 | 表單提交時間（備援） |
| B | ID | 班員 ID |
| C | 姓名 | 班員姓名 |
| E | 班程註記 | 如 `實體3` |
| F | 實際報到時間 | 優先使用此欄 |
| I | 檢核密碼 | verify 欄位 |

---

### 必要 Named Ranges

在 Google Sheet 中設定以下命名範圍（**資料 → 命名範圍**）：

| Named Range 名稱 | 指向儲存格 | 內容說明 |
|-----------------|-----------|---------|
| `prefUrl_Attend` | 預填表單 URL 儲存格 | 含 `___ID`、`___NAME`、`___PASS`、`___TYPE` 佔位符的預填 Google 表單 URL |
| `CheckInFormURL` | 表單回應 URL 儲存格 | `https://docs.google.com/forms/d/.../formResponse` |
| `CheckInFormIDCol` | ID entry code 儲存格 | 如 `&entry.630960409` |
| `CheckInFormNameCol` | NAME entry code 儲存格 | 如 `&entry.200621713` |
| `paramQRCodePass` | 密碼值儲存格 | 如 `"pass"`（含引號，系統自動去除） |
| `CheckPassToday` | 今日報到密碼儲存格 | 當日有效密碼 |

> `prefUrl_Attend` 是最重要的 Named Range。若正確設定此欄，系統可自動解析所有 entry codes，其他 entry code 相關 Named Ranges 作為備援。

---

## 移植步驟

### Step 1：建立 Google Sheet 結構

確認新 Google Sheet 已建立上述所有 Sheet 與欄位結構。  
若使用不同名稱，記得修改程式碼設定區。

---

### Step 2：貼入程式碼

1. 開啟新 Google Sheet
2. 選單列 → **擴充功能 → Apps Script**
3. 建立新檔案，命名為 `qrpwa-api`
4. 將 `qrpwa-api-transplant.js` 的全部內容貼入
5. **儲存**（Ctrl+S）

---

### Step 3：依需求修改設定區

找到程式碼頂端的「▼ 使用者設定區」，確認以下常數符合你的 Sheet 結構：

```javascript
// Sheet 名稱（如與預設不同請修改）
const TP_SHEET = {
  BUILD_INFO:      '建置系統注意事項',  // ← 改成你的 Sheet 名稱
  SCHEDULES:       '班程',
  ELECTRONIC_SIGN: 'INDATA_電子簽到',
  MANUAL_SIGN:     '人工簽到表',
};

// 建置系統注意事項 儲存格（如位置不同請修改）
const TP_BUILD_CELL = {
  BASE_NAME:   'B1',   // ← baseName 位置
  ATTEND_MODE: 'J1',   // ← 出勤模式位置
  SCAN_MODE:   'N1',   // ← ScanMode 位置
};
```

> 欄位索引（`TP_SCHED_COL`、`TP_ESIGN_COL`、`TP_MSIGN_COL`）若與預設不符也請一併調整（0-indexed）。

---

### Step 4：設定 Named Ranges

1. 在 Google Sheet 選 **資料 → 命名範圍**
2. 依上方表格逐一建立所有 Named Ranges
3. 確認 `prefUrl_Attend` 指向的儲存格包含預填表單 URL

---

### Step 5：執行診斷

回到 Apps Script 編輯器，執行 `tp_runSetupDiagnostic()`：

```
Apps Script → 選擇函式 tp_runSetupDiagnostic → 執行
```

查看執行記錄（View → Logs），確認所有項目為 ✅：

```
【Sheet 存在性】
  ✅ BUILD_INFO = 「建置系統注意事項」
  ✅ SCHEDULES = 「班程」
  ✅ ELECTRONIC_SIGN = 「INDATA_電子簽到」
  ✅ MANUAL_SIGN = 「人工簽到表」

【Named Ranges】
  ✅ PREF_URL (prefUrl_Attend) = https://docs.google.com/forms/...
  ✅ FORM_URL (CheckInFormURL) = https://docs.google.com/forms/...
  ...

【可用設定檔】
  1. 新生大班-第一週日-實體1
  2. 新生大班-明德班-實體2
  ...

✅ 診斷通過！可以部署 Web App。
```

若有 ❌ 或 ⚠️，依提示修正後重新執行。

---

### Step 6：部署 Web App

1. Apps Script 右上角 → **部署 → 新增部署**
2. 設定如下：

   | 設定 | 值 |
   |------|---|
   | 類型 | 網頁應用程式 |
   | 執行身份 | **我**（你的 Google 帳號） |
   | 存取權限 | **任何人** |

3. 點「部署」，複製產生的 URL（格式：`https://script.google.com/macros/s/XXXXX/exec`）

---

### Step 7：設定 WEB_APP_URL 指令碼屬性

1. Apps Script → 左側齒輪 ⚙️ **專案設定**
2. 捲到最下方「指令碼屬性」
3. 點「新增屬性」，輸入：

   | 屬性名稱 | 值 |
   |---------|---|
   | `WEB_APP_URL` | `https://script.google.com/macros/s/（你的部署ID）/exec` |

4. 儲存

---

### Step 8：產生設定檔 QR Code

1. 重新整理 Google Sheet（讓 onOpen 選單出現）
2. 選單列 → **📡 QRPWA API → 📱 選擇設定檔並顯示 QR Code**
3. 從下拉選單選擇班別，對話框會顯示 QR Code
4. 用 QRPWA 掃描 QR Code，App 將自動下載並套用設定檔

---

### Step 9：驗證 API 正常運作

在瀏覽器開啟以下 URL（將 `{DEPLOY_ID}` 替換為實際部署 ID）：

```
# 列出所有設定檔
https://script.google.com/macros/s/{DEPLOY_ID}/exec?action=listConfigs

# 驗證特定設定檔
https://script.google.com/macros/s/{DEPLOY_ID}/exec?action=verify&name=新生大班-第一週日-實體1

# 取得設定檔內容
https://script.google.com/macros/s/{DEPLOY_ID}/exec?action=getConfig&name=新生大班-第一週日-實體1
```

成功回應範例：
```json
{
  "status": "ok",
  "configs": ["新生大班-第一週日-實體1", "新生大班-明德班-實體2"],
  "total": 2
}
```

---

## 日後維護

### 更新部署（程式碼修改後）

每次修改程式碼後需重新部署，**並更新 WEB_APP_URL 指令碼屬性**：

1. 部署 → 管理部署 → 選現有部署 → 編輯（鉛筆圖示）
2. 版本選「新版本」→ 部署
3. 確認 URL 是否變更（若變更，更新指令碼屬性）

### 新增班別

在「班程」Sheet 新增一列（G欄填入新代碼、H欄填入顯示名稱），API 會自動產生對應設定檔，無需修改程式碼。

### 切換出勤模式（如從「實體」改為「線上」）

修改「建置系統注意事項」J1 的值（例如：`實體3` → `線上3`），設定檔名稱中的模式字串會自動更新。

---

## 常見問題

**Q: listConfigs 回傳空陣列？**
A: 執行 `tp_runSetupDiagnostic()` 確認「可用設定檔」區段。最常見原因：班程 G欄無代碼、或 J1 出勤模式為空。

**Q: getCheckinLog 回傳 `note: "該日期無符合的班程"`？**
A: 班程 Sheet 中找不到指定日期。確認日期格式為 `yyyy/M/d`（月日**不補零**），例 `2026/4/6` 而非 `2026/04/06`。

**Q: 設定檔 QR Code 對話框顯示「⚠️ 尚未設定 Web App URL」？**
A: 完成 Step 7，在指令碼屬性設定 `WEB_APP_URL`。

**Q: QRPWA 呼叫 API 出現 CORS 錯誤？**
A: GAS Web App 不支援跨域 preflight。QRPWA 需使用 `mode: 'no-cors'` 或透過後端代理轉發請求。

**Q: 電子簽到或人工簽到 Sheet 欄位與預設不同？**
A: 修改程式碼頂端 `TP_ESIGN_COL` 或 `TP_MSIGN_COL` 常數（值為 0-indexed 欄號）。

---

## 移植確認清單

```
□ Step 1：建立所有必要 Sheet 與欄位結構
□ Step 2：貼入 qrpwa-api-transplant.js 並儲存
□ Step 3：修改程式碼設定區（Sheet 名稱 / 欄位位置）
□ Step 4：設定所有 Named Ranges
□ Step 5：執行 tp_runSetupDiagnostic() 全部通過 ✅
□ Step 6：部署 Web App（執行身份：我 / 存取：任何人）
□ Step 7：設定指令碼屬性 WEB_APP_URL
□ Step 8：產生設定檔 QR Code 並用 QRPWA 掃描測試
□ Step 9：瀏覽器驗證 listConfigs / getConfig API 正常回應
```
