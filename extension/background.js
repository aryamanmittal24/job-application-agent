const API = "http://127.0.0.1:4010/api";

async function readResume() {
  const [metadataResponse, fileResponse] = await Promise.all([fetch(`${API}/resume`), fetch(`${API}/resume/file`)]);
  if (!metadataResponse.ok || !fileResponse.ok) throw new Error("Résumé unavailable in JobPilot");
  const metadata = await metadataResponse.json();
  const bytes = new Uint8Array(await fileResponse.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return { filename: metadata.filename || "resume.pdf", base64: btoa(binary) };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "JOBPILOT_PROFILE") {
    fetch(`${API}/profile`).then((response) => { if (!response.ok) throw new Error("Profile unavailable"); return response.json(); }).then((profile) => sendResponse({ ok: true, profile })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "JOBPILOT_RESUME") {
    readResume().then((resume) => sendResponse({ ok: true, resume })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return false;
});
