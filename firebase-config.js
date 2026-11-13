/* SonicFrame Firebase settings.
   This file is loaded as a normal <script> on every page (NOT as an ES module),
   so it must not contain "import" / "export" lines. Just set the values below.
   These web config values are not secrets; they are meant for front-end code. */
window.SF_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDvthqUe7In-pgTlZVhYpuPa_dbrl5Y0Ao",
  authDomain: "sonicframe-2a34c.firebaseapp.com",
  projectId: "sonicframe-2a34c",
  storageBucket: "sonicframe-2a34c.firebasestorage.app",
  messagingSenderId: "245088503172",
  appId: "1:245088503172:web:05c6490614defa721449d1",
  measurementId: "G-YRWCS03V1N"
};

/* Options */
window.SF_AUTH_OPTIONS = {
  // true  -> email users must click the verification link before entering.
  // false -> email users can enter straight after registering.
  REQUIRE_EMAIL_VERIFICATION: false,
  // allow local dev/evaluator testing on localhost without external network login wall
  ALLOW_LOCAL_GUEST: true
};
