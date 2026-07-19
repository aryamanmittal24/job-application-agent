const status = document.getElementById("status");
const fillButton = document.getElementById("fill");
const result = document.getElementById("result");

async function checkProfile() {
  try {
    const response = await fetch("http://127.0.0.1:4010/api/profile");
    if (!response.ok) throw new Error();
    const profile = await response.json();
    const ready = Boolean(profile.firstName && profile.email);
    status.className = ready ? "status ready" : "status checking";
    status.querySelector("span").textContent = ready ? "Profile connected and ready" : "Add your name and email in JobPilot";
    fillButton.disabled = !ready;
  } catch {
    status.className = "status";
    status.querySelector("span").textContent = "Start JobPilot on this computer";
    fillButton.disabled = true;
  }
}

fillButton.addEventListener("click", async () => {
  fillButton.disabled = true;
  fillButton.textContent = "Filling known fields…";
  result.textContent = "";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { type: "JOBPILOT_FILL" });
    result.textContent = response?.error || `Filled ${response.filled} fields. ${response.skipped} fields need your review.`;
  } catch {
    result.textContent = "This page is not supported yet. Try a Greenhouse, Lever, Workday, Ashby, or Workable application.";
  } finally {
    fillButton.disabled = false;
    fillButton.textContent = "Fill application";
  }
});

checkProfile();
