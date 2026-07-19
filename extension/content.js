const BLOCKED_QUESTIONS = /gender|race|ethnic|disability|veteran|sexual|pronoun|religion|criminal|legal|attest|signature|captcha|sponsor|authorization|visa|salary|compensation/i;

function normalize(value = "") {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function fieldLabel(field) {
  const safeId = String(field.id || "").replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  const explicit = safeId ? document.querySelector(`label[for="${safeId}"]`) : null;
  const wrapper = field.closest("label, [data-automation-id*='formField'], .field, .application-question");
  return normalize([
    explicit?.textContent, wrapper?.querySelector("label")?.textContent,
    field.getAttribute("aria-label"), field.getAttribute("placeholder"),
    field.getAttribute("name"), field.id,
  ].filter(Boolean).join(" "));
}

function mapValue(label, profile) {
  const mappings = [
    [/first name|firstname|given name/, profile.firstName],
    [/last name|lastname|family name|surname/, profile.lastName],
    [/^(full name|your name|name)( required)?$/, `${profile.firstName || ""} ${profile.lastName || ""}`.trim()],
    [/email/, profile.email],
    [/phone|mobile/, profile.phone],
    [/current location|address.*city|city|location/, profile.location],
    [/country/, profile.country],
    [/postal|zip code|postcode/, profile.postalCode],
    [/current company|most recent company|employer/, profile.currentCompany],
    [/company name/, profile.currentCompany],
    [/current title|job title|most recent title|\btitle\b/, profile.currentTitle],
    [/school|college|university|institution/, profile.school],
    [/degree|field of study|major/, profile.degree],
    [/graduation|graduated/, profile.graduationYear],
    [/linkedin/, profile.linkedin],
    [/github/, profile.github],
    [/portfolio|personal website|website url/, profile.portfolio],
  ];
  for (const [pattern, value] of mappings) if (pattern.test(label) && value) return value;
  for (const saved of profile.answers || []) {
    const question = normalize(saved.question);
    if (question && (label.includes(question) || question.includes(label)) && saved.answer) return saved.answer;
  }
  return "";
}

function specialValue(field, profile) {
  if (/^start-date-month/.test(field.id || "")) return profile.currentStartMonth || "";
  if (/^start-date-year/.test(field.id || "")) return profile.currentStartYear || "";
  return "";
}

function setNativeValue(field, value) {
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(field, value); else field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.style.boxShadow = "0 0 0 2px rgba(45, 143, 82, .35)";
}

function extensionRequest(type) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type }, (response) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!response?.ok) return reject(new Error(response?.error || "JobPilot local service unavailable"));
      resolve(response);
    });
  });
}

async function fillApplication() {
  const profileResponse = await extensionRequest("JOBPILOT_PROFILE");
  const profile = profileResponse.profile;
  const fields = [...document.querySelectorAll("input:not([type='hidden']):not([type='submit']):not([type='button']), textarea, select")];
  let filled = 0; let skipped = 0;
  let resumeFile = null;

  for (const field of fields) {
    if (field.type === "checkbox" && /^current-role-/.test(field.id || "") && profile.currentCompany) {
      if (!field.checked) { field.click(); filled += 1; }
      continue;
    }
    if (field.disabled || field.readOnly || field.type === "checkbox" || field.type === "radio") { skipped += 1; continue; }
    const label = fieldLabel(field);
    if (!label || BLOCKED_QUESTIONS.test(label)) { skipped += 1; continue; }
    if (field.type === "file") {
      if (!/resume|résumé|cv|curriculum vitae/.test(label) && field.id !== "resume") { skipped += 1; continue; }
      try {
        if (!resumeFile) {
          const resumeResponse = await extensionRequest("JOBPILOT_RESUME");
          const binary = atob(resumeResponse.resume.base64);
          const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
          resumeFile = new File([bytes], resumeResponse.resume.filename, { type: "application/pdf" });
        }
        const transfer = new DataTransfer(); transfer.items.add(resumeFile); field.files = transfer.files;
        field.dispatchEvent(new Event("change", { bubbles: true })); filled += 1;
      } catch { skipped += 1; }
      continue;
    }
    const value = specialValue(field, profile) || mapValue(label, profile);
    if (!value) { skipped += 1; continue; }
    if (field instanceof HTMLSelectElement) {
      const option = [...field.options].find((item) => normalize(item.textContent).includes(normalize(value)) || normalize(item.value) === normalize(value));
      if (!option) { skipped += 1; continue; }
      field.value = option.value;
      field.dispatchEvent(new Event("change", { bubbles: true }));
      filled += 1;
    } else {
      try {
        setNativeValue(field, value);
        if (/select__input|start-date-month|candidate-location|country/.test(field.className || "") || /^start-date-/.test(field.id || "")) {
          field.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
          field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        }
        filled += 1;
      }
      catch { skipped += 1; }
    }
  }
  return { filled, skipped };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "JOBPILOT_FILL") return;
  fillApplication().then(sendResponse).catch((error) => sendResponse({ filled: 0, skipped: 0, error: error.message }));
  return true;
});
