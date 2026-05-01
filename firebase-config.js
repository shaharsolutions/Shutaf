import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDK40F17kOfy4yX6HJISlQuncwd80orEYk",
  authDomain: "shutaf-dba59.firebaseapp.com",
  projectId: "shutaf-dba59",
  storageBucket: "shutaf-dba59.firebasestorage.app",
  messagingSenderId: "515956731718",
  appId: "1:515956731718:web:f9e4b3ba55d59527293f47",
  measurementId: "G-JXWFJJLXG5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
