# 天達大班報到系統 - 資料架構說明書

> **文件用途**：本文件根據實際的 Google Sheets 結構與 Google Apps Script 程式碼分析，說明現行系統的資料架構，並針對新版系統提出資料模型設計。供後續工程師或 AI 在重構時使用。

---

## 1. 現行系統架構概覽

```
┌─────────────────────────────────────────────────────────┐
│                  現行系統資料流                          │
├─────────────────────────────────────────────────────────┤
│  班員             →  Google Form (簽到單) / 簡易手動報到  │
│  (掃描 QR Code)      (Apps Script: settingAttendForm)    │
│        ↓                                                 │
│  INDATA_電子簽到  ←  Google Form 回應自動寫入           │
│  INDATA_請假單    ←  Google Form 請假自動寫入            │
│  人工簽到表       ←  管理員手動新增 (Apps Script)        │
│        ↓                                                 │
│  Apps Script: consolidateAttendanceData() (每日觸發)    │
│        ↓                                                 │
│  出席總表 (Pivot)   ←  整合所有資料的唯一事實來源       │
│        ↓                                                 │
│  Glide Apps UI   ←  讀取 出席總表 + 班員資料 展示       │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Google Sheets 資料表說明（All Sheets）

### 2.1 主資料表 (Master Data)

#### 📋 `班員資料` - 班員主名冊

| 欄位名稱 | 資料類型 | 說明 | 範例值 |
|---------|--------|------|-------|
| `編號` (ID) | String | 唯一識別碼，H 開頭 | `H111310001` |
| `姓名` | String | 班員全名 | `丁國恒` |
| `所屬單位` | String | 道場/區別 | `瑞芳區` |
| `班級` | String | 所屬班別 | `明理班` |
| `乾坤` | Enum | 性別/身分 (`乾`/`坤`) | `乾` |
| `組別` | String | 小組/輔導組別 | - |
| `啟用日期` | Date | 加入系統日期 | `2025/03/01` |
| `失效日期` | Date | 離開/停用日期，空白代表活躍 | - |
| `備註` | String | 特殊說明 | - |
| `QRCODE 1` | URL | QR Code 圖片連結 (主要) | `https://...` |
| `QRCODE 2` | URL | QR Code 圖片連結 (備用) | `https://...` |

> **💡 關鍵邏輯**：`編號` 是系統中**唯一識別每位班員**的主鍵，所有跨表關聯均以此欄位串接。

---

#### 📋 `青年名冊2026` / `天達名冊資料` - 年度補充名冊

| 欄位名稱 | 說明 |
|---------|------|
| `姓名` | 班員全名 |
| `ID`   | 同 `班員資料.編號` |
| `區域` | 所屬區域 |
| `志工服務團名` | 帶領人/志工名稱 |

> 此表為從外部來源匯入的年度資料，用於補充或更新 `班員資料`。

---

### 2.2 輸入資料表 (Input / Transaction Data)

#### 📝 `INDATA_電子簽到` (原 `簽到單回應`)

| 欄位名稱 | 說明 |
|---------|------|
| `時間戳記` | Google Form 提交時間 |
| `ID` (編號) | 班員編號 (由 QR Code 帶入) |
| `NAME` (姓名) | 班員姓名 |

> **關鍵說明**：班員掃描 QR Code 後，QR Code 中包含**預填的 Google Form 連結**（帶有 `?entry.XXX=H111310001` 參數），Form 提交後資料自動寫入此 Sheet。

---

#### 📝 `INDATA_請假單` (原 `請假單回應`)

| 欄位名稱 | 說明 |
|---------|------|
| `時間戳記` | 請假提交時間 |
| `姓名` | 班員姓名 |
| `請假日期` | 請假對應的班程日期 |
| `班次` | 請假的班別 |

---

#### 📝 `人工簽到表` (Manual Check-in Log)

| 欄位名稱 | 說明 |
|---------|------|
| `時間戳記` | 手動操作時間 |
| `ID` | 班員編號 |
| `姓名` | 班員姓名 |
| `班別` | 報到對應班別 |
| `備註` | 關係人或到班因由 |

> 由 `巨集.gs` 中的 `checkinManual()` 函式寫入，對應前端「簡易報到」功能。

---

### 2.3 輸出與統計表 (Output / Computed Data)

#### 📊 `出席總表` (Master Attendance Pivot)

這是系統中**最重要**的輸出表。由 Apps Script `consolidateAttendanceData()` **每日定時執行**後重新生成。

| 欄位結構 | 說明 |
|---------|------|
| `編號` | 班員ID |
| `姓名` | 班員姓名 |
| `[日期 1]`, `[日期 2]`... | 每個班程日期為一欄，值為出席狀態符號 |

**出席狀態符號對照：**

| 符號 | 意義 |
|------|------|
| `○`  | 實體出席 (Present) |
| `★`  | 線上出席 (Online) |
| `/`  | 缺席 (Absent) |
| `●`  | 遲到 (Late) |
| `㊣` | 幹部出席 (Staff Present) |
| (空白) | 未到/未登錄 |

---

#### 📊 `出席率統計`

| 欄位名稱 | 說明 |
|---------|------|
| `日期/班別` | 統計目標班程 |
| `應到` | 預期出席人數 |
| `實到` | 實際出席人數 |
| `缺席` | 缺席人數 |
| `乾` | 男性出席 |
| `坤` | 女性出席 |

---

### 2.4 系統設定表 (Configuration)

#### ⚙️ `參數設定`

| 參數項目 | 說明 |
|---------|------|
| Google Form URL | 簽到表單、請假表單的 URL |
| Form Entry IDs | 如 `entry.630960409` = ID 欄位 |
| 出席符號定義 | `○`, `★`, `/`, `●`, `㊣` |
| Sheet 名稱對照 | 各功能對應的 Sheet 名稱 |

> 此表是 Apps Script 的設定中心，修改此表即可調整系統行為，無需修改程式碼。

---

#### 📅 `班程`

| 欄位名稱 | 說明 |
|---------|------|
| `班程日期` | 班程舉辦日期 |
| `啟用` | 是否啟用報到 (`TRUE`/`FALSE`) |
| `簽到時間` | 報到開放時間 |
| `檢核` | 資料驗證欄位 |
| `週次` | 第幾週日 |
| `同日多班` | 同日有多班的旗標 |

---

#### 🔖 `列印QRCODE`

| 說明 |
|------|
| 動態生成每位班員的 QR Code 名牌，包含 `姓名`、`編號`、`QR Code 圖片`。 |
| 用於現場列印個人名牌，QR Code 掃描後帶出帶有 ID 預填的簽到 Form 連結。 |

---

## 3. Google Apps Script 邏輯說明

### 3.1 核心函式

```
程式碼.gs (主程式，1200+ 行)
│
├── consolidateAttendanceData()   ← 每日自動觸發，整合所有報到資料到出席總表
│   ├── readAllSources()          ← 批次讀取所有 INDATA 分頁
│   ├── createPivotTableOptimized() ← 將流水帳轉換為 Pivot (班員 × 日期)
│   └── 寫回 出席總表
│
├── initialSetup()               ← 系統初始化（一次性執行）
│   ├── creatForm()              ← 自動建立簽到表單與請假表單
│   ├── settingAttendForm()      ← 設定表單欄位（帶入班別、隱藏ID等）
│   └── setupTrigger()           ← 設定每日定時觸發器
│
├── searchDataInSheet()          ← 前端搜尋 API
│   ├── 輸入: searchText, unit, status
│   └── 輸出: 包含 QR Code URL 的班員資料 JSON
│
├── getUniqueUnits()             ← 回傳所有唯一區別清單（供下拉選單使用）
└── getUniqueFirstName(unit)     ← 回傳特定區別的班員姓名清單

巨集.gs (手動操作工具)
│
├── checkinManual()              ← 簡易報到：將手動填寫資料寫入 人工簽到表
└── checkQRCODE()               ← 快速查詢：處理核選框狀態重置

SearchForm.html (前端查詢介面)
└── jQuery + DataTables 表格，呼叫 Apps Script 後端取得 QR Code 資料
```

### 3.2 核心報到流程

```
【QR Code 掃描報到】
班員名牌 QR Code
    ↓ 包含 pre-filled Google Form URL
Google Form 提交 (自動)
    ↓ Form 連結 Sheet
INDATA_電子簽到 (新增一筆記錄)
    ↓ 每日自動觸發
Apps Script: consolidateAttendanceData()
    ↓
出席總表 (Pivot 重新計算)

【手動（簡易）報到】
管理員在 Glide APP 操作
    ↓
Apps Script: checkinManual()
    ↓
人工簽到表 (新增一筆記錄)
    ↓ 每日自動觸發
Apps Script: consolidateAttendanceData()
    ↓
出席總表 (Pivot 重新計算)
```

---

## 4. 現行架構的問題與痛點

| 問題 | 說明 |
|------|------|
| **資料延遲** | `出席總表` 每日才觸發重算，**不是即時的**。掃描後需等待才能在統計畫面看到更新。 |
| **依賴 Form** | 需要 Google Form 作為中間層，增加設定複雜度與出錯機會。 |
| **效能限制** | `consolidateAttendanceData()` 需讀取所有年度資料，執行時間隨資料量增長，有超時風險。 |
| **多分頁管理困難** | 約 45 個 Sheet 分頁，難以整體掌握資料流向。 |
| **無 API** | 所有資料只能透過 Sheets 讀取，無法直接提供給前端 REST API。 |

---

## 5. 新版系統資料模型設計

### 5.1 推薦架構：Firebase Firestore + Google Sheets 雙軌

```
    Android/iOS/Web 前端 (New UI Prototype)
            ↓ read/write
    Firebase Firestore (即時資料庫)
            ↓ 定期同步 (Apps Script 或 Webhook)
    Google Sheets (歷史備份 + 報表 + 匯出)
```

---

### 5.2 Firestore Collection 設計

#### `members` Collection

```json
// /members/{memberId}
{
  "id": "H111310001",         // 主鍵，沿用現有編號
  "name": "丁國恒",
  "unit": "瑞芳區",           // 所屬單位/區別
  "class": "明理班",          // 班別
  "gender": "乾",             // "乾" | "坤"
  "group": "",                // 小組
  "joinDate": "2025-03-01",  // Timestamp
  "expiryDate": null,         // Timestamp | null
  "status": "active",        // "active" | "inactive"
  "qrCodeUrl": "https://...", // QR Code 圖片 URL (保留現有)
  "email": "",                // Firebase Auth email (新增)
  "fcmToken": "",             // 推播通知 Token (新增)
  "notes": "",
  "tags": ["身心舒活", "志工服務"],  // 社團/志工標籤 (新增)
  "createdAt": Timestamp,
  "updatedAt": Timestamp
}
```

---

#### `schedules` Collection

```json
// /schedules/{scheduleId}
{
  "id": "20260315-3rd-sun",
  "date": "2026-03-15",       // Timestamp
  "weekLabel": "第三週日",
  "type": "physical",         // "physical" | "online"
  "isActive": true,           // 是否啟用報到
  "checkinOpenAt": Timestamp, // 開始報到時間
  "checkinCloseAt": Timestamp,// 截止報到時間
  "createdBy": "dreamgen@gmail.com",
  "notes": ""
}
```

---

#### `attendance` Collection (核心)

```json
// /attendance/{attendanceId}   (格式: {memberId}_{scheduleId})
{
  "id": "H111310001_20260315-3rd-sun",
  "memberId": "H111310001",
  "memberName": "丁國恒",
  "scheduleId": "20260315-3rd-sun",
  "scheduleDate": "2026-03-15",
  "status": "present",        // "present" | "online" | "absent" | "late" | "leave" | "temp"
  "checkinMethod": "qr",      // "qr" | "manual" | "auto"
  "checkinAt": Timestamp,     // 實際報到時間
  "recordedBy": "admin_uid",  // 記錄者 (幹部 UID)
  "notes": "",                // 備註、關係人
  "isTemporary": false        // 是否為臨時報到
}
```

---

#### `leaves` Collection

```json
// /leaves/{leaveId}
{
  "id": "auto-generated",
  "memberId": "H111310001",
  "memberName": "丁國恒",
  "scheduleDate": "2026-03-15",
  "reason": "家中有事",
  "submittedAt": Timestamp,
  "status": "approved"        // "pending" | "approved" | "rejected"
}
```

---

#### `config` Collection

```json
// /config/system
{
  "currentScheduleId": "20260315-3rd-sun",
  "checkinSymbols": {
    "present": "○",
    "online": "★",
    "absent": "/",
    "late": "●",
    "staffPresent": "㊣"
  },
  "sheetsId": "1pTCj8xGEAKTpG_6RKT66Js8rY6X13hpAOs5TUflLhd4",
  "formUrls": {
    "checkin": "https://docs.google.com/forms/...",
    "leave": "https://docs.google.com/forms/..."
  }
}
```

---

### 5.3 Firebase Authentication 設計

| 角色 | 表示方式 | 說明 |
|------|---------|------|
| **Admin** | `customClaims: { role: "admin" }` | 可操作所有功能 |
| **Staff** | `customClaims: { role: "staff" }` | 可操作報到、查詢 |
| **Student** | `customClaims: { role: "student" }` | 只能查看個人頁面、請假 |

---

### 5.4 Google Sheets API 整合策略（保留現有 Sheets）

**同步策略**：Firestore 為主，Google Sheets 為定期匯出備份。

```
                  Firestore (即時主資料)
                        ↓ (每日一次 / 手動觸發)
                  Apps Script 同步腳本
                        ↓
                  Google Sheets (歷史備份、出席總表、匯出 Excel)
```

**保留現有功能：**
- `出席總表` 匯出仍由 Apps Script 製作（從 Firestore 讀取每月資料重建）
- `列印QRCODE` 功能繼續由 Sheets 產生
- QR Code URL 規則沿用（帶有 `entry.XXX` 的 Form 連結），或改為直接帶 `memberId` 參數

---

### 5.5 新舊資料欄位對照表

| 現行欄位 (Google Sheets) | 新系統欄位 (Firestore) | 說明 |
|------------------------|---------------------|------|
| `編號` | `members.id` | 沿用原有 H-prefix ID |
| `姓名` | `members.name` | |
| `所屬單位` | `members.unit` | |
| `班級` | `members.class` | |
| `乾坤` | `members.gender` | |
| `QRCODE 1` | `members.qrCodeUrl` | |
| `班程日期` | `schedules.date` | |
| `啟用` | `schedules.isActive` | |
| 出席狀態符號 `○/★/●` | `attendance.status` (Enum) | 轉為英文 Enum，顯示時轉換 |
| `時間戳記` (Form 回應) | `attendance.checkinAt` | |

---

## 6. API 設計建議（Apps Script Web App）

若初期不部署 Firebase Functions，可先用 **Google Apps Script** 作為 REST API 橋接：

| Endpoint | Method | 說明 |
|----------|--------|------|
| `/checkin` | POST | 提交報到（memberId, scheduleId） |
| `/members` | GET | 取得所有班員資料（可帶 unit 參數） |
| `/attendance` | GET | 取得特定場次出席資料 |
| `/stats` | GET | 取得統計摘要 |
| `/leave` | POST | 提交請假申請 |

---

## 7. 遷移建議（Migration Path）

### Phase 1（現在）：維持 Sheets + 優化 API 層
- 繼續使用現有 Google Sheets，但透過 Apps Script 提供 REST API  
- 前端改為呼叫 API 而非直接讀取 Sheets

### Phase 2（短期）：加入 Firebase Auth
- 使用者以 Firebase Authentication 登入，取代現有 Glide Auth
- 根據角色（Admin/Staff/Student）顯示不同介面

### Phase 3（中期）：遷移資料到 Firestore
- 將 `班員資料` 批次匯入 `members` Collection
- 新的報到資料直接寫入 `attendance` Collection（即時）
- Sheets 改為歷史備份與報表匯出用途
