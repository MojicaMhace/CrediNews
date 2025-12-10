// Firebase Configuration for SDK v8
console.log('Loading Firebase configuration...');

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCjjNo-ljRh-STMj5ZvKR8m29tAX2fRWkE",
  authDomain: "credinews-c6433.firebaseapp.com",
  projectId: "credinews-c6433",
  storageBucket: "credinews-c6433.firebasestorage.app",
  messagingSenderId: "379730284424",
  appId: "1:379730284424:web:d3bd346663e7c3f97d743d"
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

    // --- FIX IS HERE: Added merge: true ---
    try { 
        window.firebaseDb.settings({ 
            experimentalForceLongPolling: true, 
            useFetchStreams: false,
            merge: true  
        }); 
    } catch (_) {}
    
    console.log('✅ Firebase services exported globally');
    
} catch (error) {
    console.error('❌ Firebase initialization error:', error);
    console.error('Error details:', error.code, error.message);
}