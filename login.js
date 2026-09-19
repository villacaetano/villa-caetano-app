import { auth, provider, signInWithPopup, onAuthStateChanged } from "./firebase.js";

const button = document.getElementById("googleLoginBtn");
const loginScreen = document.getElementById("loginScreen");
const appScreen = document.getElementById("app");

function showApp(user) {
  if (!user) return;
  loginScreen?.classList.add("hidden");
  appScreen?.classList.remove("hidden");
}

function showLogin() {
  loginScreen?.classList.remove("hidden");
  appScreen?.classList.add("hidden");
}

// This listener is deliberately kept in the small login module so the
// login UI still transitions even if a non-login dashboard feature has an error.
onAuthStateChanged(auth, (user) => {
  if (user) showApp(user);
  else showLogin();
});

button?.addEventListener("click", async (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (button.disabled) return;

  button.disabled = true;
  const label = button.querySelector("span:last-child");
  if (label) label.textContent = "Opening Google…";

  try {
    const result = await signInWithPopup(auth, provider);
    // Don't wait for app.js to change the screen.
    showApp(result.user);
  } catch (error) {
    console.error("Google sign-in error:", error);
    const code = error?.code || "unknown";
    const messages = {
      "auth/unauthorized-domain": "This website is not authorised in Firebase. Add villacaetano.com under Authentication → Settings → Authorized domains.",
      "auth/popup-blocked": "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.",
      "auth/popup-closed-by-user": "The Google sign-in window was closed before sign-in finished.",
      "auth/operation-not-allowed": "Google Sign-In is not enabled in Firebase Authentication.",
      "auth/network-request-failed": "A network error stopped Google sign-in. Check your connection and try again.",
      "auth/cancelled-popup-request": "Another Google sign-in window is already open. Finish or close it and try again."
    };
    const message = messages[code] || `Google sign-in failed (${code}). Open F12 → Console and send me the red error if this continues.`;
    alert(`${message}\n\nFirebase code: ${code}`);
  } finally {
    button.disabled = false;
    if (label) label.textContent = "Continue with Google";
  }
});
