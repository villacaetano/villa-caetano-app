import { auth, provider, signInWithPopup } from "./firebase.js";

const button = document.getElementById("googleLoginBtn");
const status = document.getElementById("loginStatus");

function setStatus(message) {
  if (status) { status.textContent = message; status.classList.remove("hidden"); }
}

if (button) {
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (button.disabled) return;
    button.disabled = true;
    const label = button.querySelector("span:last-child");
    if (label) label.textContent = "Opening Google…";
    try {
      await signInWithPopup(auth, provider);
      setStatus("Signed in successfully. Loading your dashboard…");
    } catch (error) {
      console.error("Google sign-in error", error);
      const code = error?.code || "unknown";
      const message = {
        "auth/unauthorized-domain": "This website is not authorised in Firebase yet.",
        "auth/popup-blocked": "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.",
        "auth/popup-closed-by-user": "The Google sign-in window was closed. Please try again.",
        "auth/operation-not-allowed": "Google Sign-In is not enabled in Firebase Authentication.",
        "auth/network-request-failed": "Network error. Check your connection and try again."
      }[code] || `Sign-in error: ${code}`;
      setStatus(message);
      alert(`${message}\n\nFirebase code: ${code}`);
    } finally {
      button.disabled = false;
      if (label) label.textContent = "Continue with Google";
    }
  });
}
