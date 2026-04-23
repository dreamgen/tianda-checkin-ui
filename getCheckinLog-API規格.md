# getCheckinLog API 規格

> 版本：1.0 | 資料來源：INDATA_電子簽到 + 人工簽到表 | 適用系統：QRPWA

---

## 概覽

`getCheckinLog` 提供**即時報到記錄**查詢，直接讀取簽到原始資料，適合顯示「今日已報到名單」或「指定日期出席狀況」。

| 特性 | getCheckinLog | getAttendanceByDate（參考） |
|------|--------------|--------------------------|
| 資料來源 | 電子簽到表 + 人工簽到表（原始） | 出席總表（已彙整） |
| 即時性 | ✅ 即時（每次掃描立刻可查） | ⚠️ 需等彙整後才更新 |
| 增量查詢 | ✅ 支援（節省流量） | ❌ 不支援 |
| 統計彙整 | 僅提供總筆數 | ✅ 提供出席/缺席/請假統計 |
| 適合場景 | 現場監控、即時顯示 | 事後統計、出席率分析 |

---

## 端點

```
POST https://script.google.com/macros/s/{DEPLOY_ID}/exec
Content-Type: application/json
```

> `DEPLOY_ID` 請向系統管理員取得（即 WEB_APP_URL 中 `/s/` 與 `/exec` 之間的字串）

---

## 請求格式

### Request Body（JSON）

```json
{
  "action": "getCheckinLog",
  "date": "2026/4/23",
  "classCode": "3",
  "eStartRow": 2,
  "mStartRow": 2
}
```

### 參數說明

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `action` | string | ✅ | 固定值 `"getCheckinLog"` |
| `date` | string | ❌ | 查詢日期，格式 `"yyyy/M/d"`（例：`"2026/4/23"`）。**省略時預設為今日** |
| `classCode` | string | ❌ | 班別代碼（例：`"3"`）。省略或空字串 = 查詢該日**全部班別** |
| `eStartRow` | number | ❌ | 電子簽到表的起始列號（增量查詢用，詳見下方）。預設 `2` |
| `mStartRow` | number | ❌ | 人工簽到表的起始列號（增量查詢用，詳見下方）。預設 `2` |

---

## 回應格式

### 成功回應

```json
{
  "success": true,
  "data": {
    "records": [
      {
        "time": "14:32:05",
        "id": "H111310023",
        "name": "王小明",
        "scheduleNote": "實體3",
        "source": "電子"
      },
      {
        "time": "14:28:41",
        "id": "H111310007",
        "name": "李大華",
        "scheduleNote": "實體3",
        "source": "人工"
      }
    ],
    "date": "2026/4/23",
    "classCode": "3",
    "total": 42,
    "nextERow": 35,
    "nextMRow": 12
  },
  "error": null,
  "timestamp": "2026-04-23T14:35:00+08:00"
}
```

### 找不到班程（該日期無對應班程記錄）

```json
{
  "success": true,
  "data": {
    "records": [],
    "date": "2026/4/23",
    "classCode": "3",
    "total": 0,
    "nextERow": 2,
    "nextMRow": 2,
    "note": "該日期無符合的班程"
  },
  "error": null,
  "timestamp": "..."
}
```

> `note` 欄位存在時，表示指定日期找不到對應班程，非錯誤。

### 失敗回應

```json
{
  "success": false,
  "data": null,
  "error": "找不到「班程」工作表",
  "timestamp": "..."
}
```

---

## 回應欄位說明

### 頂層欄位

| 欄位 | 型別 | 說明 |
|------|------|------|
| `success` | boolean | `true` = 查詢成功（records 可為空陣列）；`false` = 系統錯誤 |
| `data` | object\|null | 成功時的資料物件 |
| `error` | string\|null | 失敗時的錯誤說明 |
| `timestamp` | string | 回應時間（ISO 8601，台北時間，例：`"2026-04-23T14:35:00+08:00"`） |

### data 物件

| 欄位 | 型別 | 說明 |
|------|------|------|
| `records` | array | 報到記錄陣列，**按時間倒序排列（最新在前）** |
| `date` | string | 實際查詢的日期（`"yyyy/M/d"` 格式） |
| `classCode` | string | 查詢的班別代碼（空字串 = 查全部班別） |
| `total` | number | 本次回傳的記錄總筆數 |
| `nextERow` | number | 電子簽到表下一筆資料的列號（增量查詢用） |
| `nextMRow` | number | 人工簽到表下一筆資料的列號（增量查詢用） |
| `note` | string | （選填）找不到班程時的說明訊息 |

### records 陣列每筆欄位

| 欄位 | 型別 | 說明 |
|------|------|------|
| `time` | string | 報到時間，格式 `"HH:mm:ss"`（台北時間） |
| `id` | string | 班員 ID（例：`"H111310023"`）；臨時報到格式：`"TEMP-20260423-xxxx"` |
| `name` | string | 姓名。臨時報到若有關係人，格式為 `"姓名(關係人:關係人ID)"` |
| `scheduleNote` | string | 班程註記，格式：`出勤方式 + 班別代碼`（例：`"實體3"`、`"線上1"`） |
| `source` | string | 報到來源：`"電子"`（掃 QR Code）或 `"人工"`（人工登記） |

---

## 增量查詢（Polling）

初次載入後，為避免重複傳輸已顯示的舊資料，可使用增量查詢：

```
第一次呼叫：{ action, date, classCode }
↓ 回應包含 nextERow=35, nextMRow=12

第二次呼叫：{ action, date, classCode, eStartRow: 35, mStartRow: 12 }
↓ 只回傳第 35 列之後的新電子簽到 + 第 12 列之後的新人工簽到
```

### 建議輪詢間隔

- 現場即時顯示：每 **30 秒**輪詢一次
- 一般查詢：每 **60 秒**

### 範例實作（JavaScript）

```javascript
let state = { eStartRow: 2, mStartRow: 2, allRecords: [] };

async function pollCheckinLog(date, classCode) {
  const resp = await fetch(WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'getCheckinLog',
      date: date,
      classCode: classCode,
      eStartRow: state.eStartRow,
      mStartRow: state.mStartRow
    })
  });
  const json = await resp.json();
  if (!json.success) {
    console.error('getCheckinLog 失敗:', json.error);
    return;
  }
  const d = json.data;
  // 合併新記錄（新的插入最前面）
  state.allRecords = [...d.records, ...state.allRecords];
  state.eStartRow = d.nextERow;
  state.mStartRow = d.nextMRow;
  renderCheckinLog(state.allRecords, d.total);
}

// 初始化後每 30 秒輪詢
pollCheckinLog('2026/4/23', '3');
setInterval(() => pollCheckinLog('2026/4/23', '3'), 30000);
```

---

## 使用情境範例

### 情境 1：顯示今日所有班別的即時報到名單

```json
{
  "action": "getCheckinLog"
}
```

### 情境 2：查詢指定日期、指定班別

```json
{
  "action": "getCheckinLog",
  "date": "2026/4/6",
  "classCode": "3"
}
```

### 情境 3：選擇日期查看歷史記錄（不分班別）

```json
{
  "action": "getCheckinLog",
  "date": "2026/3/1"
}
```

---

## QRPWA 顯示畫面建議

```
┌──────────────────────────────────┐
│  📋 2026/4/23  第三週日-實體3    │
│  已報到：42 人  🔄 14:35 更新    │
├──────────────────────────────────┤
│  14:32  王小明  H111310023  📱電子 │
│  14:28  李大華  H111310007  ✍️人工 │
│  14:21  陳美麗  H111310015  📱電子 │
│  ...                             │
└──────────────────────────────────┘
```

建議顯示欄位：`time` / `name` / `id`（可縮短） / `source`（icon 區分）

---

## 注意事項

1. **日期格式**：請使用 `"yyyy/M/d"`（月、日不補零），例 `"2026/4/6"` 而非 `"2026/04/06"`
2. **classCode 與 scheduleNote 的關係**：  
   - 請求參數 `classCode` = 純數字（`"3"`）  
   - 回應的 `scheduleNote` = 出勤方式 + 代碼（`"實體3"`）  
3. **增量查詢的 nextERow/nextMRow**：切換日期時須重置為 `2`
4. **CORS 注意**：GAS Web App 不支援跨域 `fetch`，QRPWA 需使用 `mode: 'no-cors'` 或透過後端代理
5. **密碼驗證**：API 內部會自動以班程表的密碼驗證記錄合法性，呼叫端**不需要**傳入密碼

---

## 相關 API

| action | 用途 |
|--------|------|
| `getAttendanceByDate` | 從已彙整的出席總表取得出席/缺席統計（非即時） |
| `getAttendanceStats` | 同上，另加按區別分組的 KPI 統計 |
| `getActiveSchedule` | 取得當前啟用班程的日期、班別代碼、今日密碼 |
| `getSchedules` | 取得所有班程列表（可篩選 future/past/active） |
