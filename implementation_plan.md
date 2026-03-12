# PWA 開發計畫 — 天達大班報到系統

## 背景說明

使用者已完成 Google Apps Script 的後端部署，並有完整的 Prototype UI 設計。目標是把 Prototype 轉換為**可實際使用的 PWA (Progressive Web App)**，連接已部署的 AppScript API，並托管於 GitHub Pages。

**API Base URL**:  
`https://script.google.com/macros/s/AKfycbwAIC1ZtWZVVtji1-dkozis8CFkyqx8m9h3_kP98wd53RzwSey634ZH98kWwESXXTMP/exec`

**可用 API (POST，JSON body)**:

| action | 說明 | 關鍵參數 |
|--------|------|---------|
| `getActiveSchedule` | 取得當前啟用班程、今日驗證密碼 | — |
| `getMembers` | 取得班員清單 | `unit`, `class`, `gender`, `status` |
| `getMemberById` | 取得單一班員詳細 | [id](file:///Users/dreamgen/StudioProjects/%E5%A0%B1%E5%88%B0%E7%B3%BB%E7%B5%B1/AppScript/api.js#407-418) |
| `getAttendanceByDate` | 取得指定日期出席名單 | [date](file:///Users/dreamgen/StudioProjects/%E5%A0%B1%E5%88%B0%E7%B3%BB%E7%B5%B1/New_UI_Prototype/js/app.js#72-103), `scheduleNote` |
| `getAttendanceStats` | 出席統計 KPI | [date](file:///Users/dreamgen/StudioProjects/%E5%A0%B1%E5%88%B0%E7%B3%BB%E7%B5%B1/New_UI_Prototype/js/app.js#72-103), `scheduleNote` |
| `checkin` | 單筆 QR 掃描報到 | [id](file:///Users/dreamgen/StudioProjects/%E5%A0%B1%E5%88%B0%E7%B3%BB%E7%B5%B1/AppScript/api.js#407-418), `name`, `verify`, `classCode` |
| `checkinManualBatch` | 批次簡易報到 | `verify`, `records[]`, `attendanceMode` |
| `checkinTemp` | 臨時報到（非在冊） | `name`, `verify`, `classCode` |
| `getSchedules` | 班程列表 | `filter` (all/future/past/active) |
| `getUnits` | 區別清單 | — |
| `getMemberAttendanceHistory` | 班員出席歷程 | [id](file:///Users/dreamgen/StudioProjects/%E5%A0%B1%E5%88%B0%E7%B3%BB%E7%B5%B1/AppScript/api.js#407-418) |

---

## 主要設計決策

> [!IMPORTANT]
> **設定優先啟動**：App 第一次開啟時，若 localStorage 中沒有「當次班程設定」（日期 + 班別代碼 + 驗證密碼），則自動跳至「工具設定」畫面，要求幹部先設定參數。

> [!NOTE]
> **單一 HTML 文件架構**：為了方便 GitHub Pages 部署，採用**單一 SPA (index.html)**，所有 Views 以 HTML template 的形式嵌於文件底部，由 JS Router 動態切換顯示，無需伺服器端路由。

---

## Proposed Changes

### 🏗️ PWA 應用程式框架

---

#### [NEW] [index.html](file:///Users/dreamgen/StudioProjects/報到系統/index.html)

主應用程式架構，包含：
- PWA meta tags, manifest link, theme-color
- Tailwind CDN + FontAwesome CDN + Google Fonts
- 桌面版 Sidebar + 行動版底部導航列
- `<main id="app-view">` 作為頁面切換容器
- 所有 View 的 HTML `<template>` block（共10個畫面）

---

#### [NEW] manifest.json

PWA 安裝設定：
- `name`, `short_name`: 天達大班報到系統
- `start_url`, `display: standalone`
- icons（使用文字型 SVG 生成）
- `theme_color: #2F6783`

---

#### [NEW] sw.js (Service Worker)

離線快取策略：
- 快取所有靜態資源（CSS/JS/字型）到 Cache Storage
- `stale-while-revalidate` 策略
- API 請求不快取（永遠走網路）

---

### 📜 JavaScript 邏輯層

---

#### [NEW] js/api.js

AppScript API 服務層：
```js
const API_BASE = 'https://script.google.com/macros/s/.../exec';
async function callAPI(action, params) { ... }
// 封裝所有 11 個 API 函式
```

---

#### [NEW] js/state.js

LocalStorage 持久化狀態管理：
```js
// 儲存/讀取：
// - currentSchedule: { date, classCode, className, verify, attendanceMode }
// - settings: { largeText, legacyQR, ... }
```

---

#### [NEW] js/router.js

View 切換路由器：
- `navigateTo(viewName)` 
- 從 `<template>` clone 並注入 `#app-view`
- 維護 browser history (pushState)
- 每個 View 有 `onInit()` 生命週期 callback

---

#### [NEW] js/views/*.js (各頁面邏輯)

每個主要頁面有對應的 JS 模組，負責：
- 呼叫 API 服務層
- 渲染資料到 DOM
- 事件綁定

---

### 📱 頁面畫面 (依 Prototype 設計 1:1 實作)

---

#### 工具設定頁 (Settings)

- 選擇日期、班別、出勤模式（實體/線上）
- 呼叫 `getActiveSchedule` API 自動填入建議值
- 亦可手動調整並從 `getSchedules` 取得班程選項
- 儲存設定到 LocalStorage
- 「產生專屬設定」按鈕 → 生成可分享的 QR Code URL

---

#### Dashboard 首頁

- 顯示當次班程資訊（日期、班別、出席率）
- 呼叫 `getAttendanceStats` 取得即時統計
- KPI 卡片：總出席、乾/坤分析、臨時報到數

---

#### QR 掃描報到 (Scanner)

- 使用 `html5-qrcode` 函式庫啟動相機
- 解析 QR Code 中的成員 ID
- 呼叫 `getMemberById` 取得成員資料並顯示確認卡
- 確認後呼叫 `checkin` API 完成報到
- 成功/失敗動畫回饋
- 手動輸入 ID 備援

---

#### 簡易報到 (Manual Checkin)

- 呼叫 `getAttendanceByDate` 載入當次成員名單
- 搜尋、篩選（區別/班級/狀態）
- 大字版模式（toggle）
- 報到打勾切換（視覺即時回饋）
- 批次送出呼叫 `checkinManualBatch`
- 臨時報到 → 呼叫 `checkinTemp`

---

#### 快速查詢 (Quick Search)

- 即時搜尋（姓名），呼叫 `getMembers` 模糊過濾
- 進階篩選 Bottom Sheet：日期、狀態、單位、班級
- 搜尋結果顯示當日報到狀態（搭配 `getAttendanceByDate`）
- 點擊進入班員詳細頁

---

#### 班員資料 / 分班檢視

- 呼叫 `getMembers` 取得所有班員
- Grid/List 切換
- Accordion 分班 (`class-view`)

---

#### 班員個人詳細頁

- `getMemberById` + `getMemberAttendanceHistory`
- 基本資料 / 出席歷程 Tabs
- QR Code 顯示（用已有的 `qrCodeUrl`）

---

#### 出席統計

- `getAttendanceStats` → KPI 卡片
- 動態 CSS Bar Chart（依區別分組）
- 日期/班別切換

---

#### 班程資料

- `getSchedules` 顯示班程時間軸
- 可點擊「設為當次班程」（更新 LocalStorage Settings）

---

## Verification Plan

### 自動驗證（瀏覽器）

1. **啟動本地伺服器**：`python3 -m http.server 8080`（目錄：`/Users/dreamgen/StudioProjects/報到系統`）
2. **開啟瀏覽器**：`http://localhost:8080`
3. 使用 browser_subagent 截圖驗證各頁面視覺

### API 連通測試

```bash
curl -X POST \
  "https://script.google.com/macros/s/AKfycbwAIC1ZtWZVVtji1-dkozis8CFkyqx8m9h3_kP98wd53RzwSey634ZH98kWwESXXTMP/exec" \
  -H "Content-Type: application/json" \
  -d '{"action":"getActiveSchedule"}'
```

### 人工驗證（請用戶配合）

1. 在手機瀏覽器開啟 GitHub Pages URL
2. 點「加到主畫面」確認 PWA 安裝
3. 確認工具設定畫面能正確設定班次
4. 掃描一個 QR Code 名牌確認掃描報到流程正常
