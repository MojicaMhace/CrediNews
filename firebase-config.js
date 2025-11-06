// Firebase Configuration for SDK v8
console.log('Loading Firebase configuration...');

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBB-DI9bjMXFx4-DFw2Nbr5F4Av7YCgM2U",
    authDomain: "credinews-2e5c0.firebaseapp.com",
    projectId: "credinews-2e5c0",
    storageBucket: "credinews-2e5c0.firebasestorage.app",
    messagingSenderId: "862665853708",
    appId: "1:862665853708:web:bb9dcef6418920df7c1729",
    measurementId: "G-SSWHWBNPD0"
};

// Initialize Firebase immediately (v8 style)
try {
    console.log('Initializing Firebase...');
    firebase.initializeApp(firebaseConfig);
    console.log('✅ Firebase initialized successfully');
    
    
    // Export for global access
    window.firebaseAuth = firebase.auth();
    window.firebaseDb = firebase.firestore();
    window.firebaseApp = firebase.app();
    window.firebaseConfig = firebaseConfig;
    
    console.log('✅ Firebase services exported globally');
    
} catch (error) {
    console.error('❌ Firebase initialization error:', error);
    console.error('Error details:', error.code, error.message);
}