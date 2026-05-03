import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { initializeFirestore, persistentLocalCache, doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove, onSnapshot, collection, addDoc, query, orderBy, getDocs, limit, where, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithRedirect, getRedirectResult, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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

// Initialize Firestore with persistent cache for Task 2
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache()
});

export const auth = getAuth(app);

// Export Auth functions
export { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  GoogleAuthProvider, 
  signInWithRedirect, 
  getRedirectResult, 
  signInWithPopup 
};

// Export Firestore functions
export {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  collection,
  addDoc,
  query,
  orderBy,
  getDocs,
  limit,
  where,
  deleteDoc
};
