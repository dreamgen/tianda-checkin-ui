import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, off } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";

/**
 * ⚠️ SECURITY NOTICE
 * Firebase 設定包含 API Key，此檔案存在於公開 Repository。
 * Firebase API Key 本身可被前端存取，但必須確保以下設定正確：
 *
 * 1. Firebase Console → Realtime Database → Rules
 *    應設定為限制讀寫，例如：
 *    {
 *      "rules": {
 *        ".read": "auth != null",    ← 禁止匿名讀取
 *        ".write": "auth != null"    ← 禁止匿名寫入
 *      }
 *    }
 *    若目前為 true/true，任何人都能讀寫資料庫，請立即修正！
 *
 * 2. Firebase Console → Authentication → 已授權網域
 *    應只列出實際使用的網域，移除 localhost（正式環境）
 *
 * 3. 考慮啟用 Firebase App Check 以防止非授權 App 存取
 */
const firebaseConfig = {
    apiKey: "AIzaSyBvVou318GT40HL7PbqeFRpPZfUa6YthYU",
    databaseURL: "https://jczs-checkin-default-rtdb.asia-southeast1.firebasedatabase.app/",
    projectId: "jczs-checkin",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Since the new branch uses standard script tags for API, expose Firebase to window
window.FirebaseDB = {
    db, ref, set, get, update, onValue, off
};
