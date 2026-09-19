import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    doc,
    updateDoc,
    deleteDoc,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";



const firebaseConfig = {
  apiKey: "AIzaSyDp1nJfslfbABS7uXKIo7-q7-hmFIFNjbg",
  authDomain: "villa-caetano-app.firebaseapp.com",
  projectId: "villa-caetano-app",
  storageBucket: "villa-caetano-app.firebasestorage.app",
  messagingSenderId: "709558625373",
  appId: "1:709558625373:web:99700cc3608e2372c199b4"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

const provider = new GoogleAuthProvider();


export {
    auth,
    db,
    provider,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    collection,
    addDoc,
    getDocs,
    doc,
    updateDoc,
    deleteDoc,
    query,
    orderBy
};
