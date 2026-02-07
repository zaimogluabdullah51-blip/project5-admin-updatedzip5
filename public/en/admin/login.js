const form = document.getElementById("login-form");
const errorEl = document.getElementById("login-error");

async function fetchJSON(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Login failed");
  return data;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.textContent = "";

  const payload = Object.fromEntries(new FormData(form).entries());

  try {
    await fetchJSON("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    window.location.href = "/admin/";
  } catch (err) {
    errorEl.textContent = err.message;
  }
});
