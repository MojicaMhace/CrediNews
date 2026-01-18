(function(){
  const firebaseConfig = {
  apiKey: "AIzaSyCjjNo-ljRh-STMj5ZvKR8m29tAX2fRWkE",
  authDomain: "credinews.site",
  projectId: "credinews-c6433",
  storageBucket: "credinews-c6433.appspot.com",
  messagingSenderId: "379730284424",
  appId: "1:379730284424:web:d3bd346663e7c3f97d743d",
  measurementId: "G-3S77HYYH0X"
};

  function ensureFirebase() {
    return new Promise((resolve, reject) => {
      if (window.firebase && typeof window.firebase.initializeApp === 'function') { resolve(); return; }
      const urls = [
        'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js',
        'https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js',
        'https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js'
      ];
      let i = 0;
      const next = () => {
        if (i >= urls.length) { resolve(); return; }
        const s = document.createElement('script');
        s.src = urls[i++];
        s.onload = next;
        s.onerror = () => reject(new Error('Failed to load Firebase SDK'));
        document.head.appendChild(s);
      };
      next();
    });
  }

  async function init() {
    try {
      await ensureFirebase();
      if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(firebaseConfig);
      window.firebaseAuth = firebase.auth();
      window.firebaseDb = firebase.firestore();
      window.firebaseApp = firebase.app();
      window.firebaseConfig = firebaseConfig;
      // Removed experimental settings to fix ERR_ABORTED
      try { window.dispatchEvent(new Event('firebase-ready')); } catch(_){ }
    } catch (e) {
      console.error('Firebase initialization error:', e);
    }
  }

  init();
})();
