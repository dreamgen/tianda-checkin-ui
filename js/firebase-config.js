import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, off } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";

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
