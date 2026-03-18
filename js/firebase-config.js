import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { getDatabase, ref, onValue, set, update, get, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBvVou318GT40HL7PbqeFRpPZfUa6YthYU",
  databaseURL: "https://jczs-checkin-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "jczs-checkin"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export { ref, onValue, set, update, get, query, orderByChild, equalTo };
