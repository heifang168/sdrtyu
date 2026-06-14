function buildInquirySubject() {
  return encodeURIComponent("ALEO POWER inquiry from website");
}

function buildInquiryBody(form) {
  const data = new FormData(form);
  const lines = [
    "Name: " + (data.get("name") || ""),
    "Email: " + (data.get("email") || ""),
    "Phone / WhatsApp: " + (data.get("phone") || data.get("whatsapp") || ""),
    "Company: " + (data.get("company") || ""),
    "Country / Region: " + (data.get("country") || ""),
    "Product Requirement: " + (data.get("product") || data.get("power") || ""),
    "Application: " + (data.get("application") || ""),
    "Message: " + (data.get("message") || "")
  ];
  return encodeURIComponent(lines.join("\n"));
}

function setFormStatus(form, message, type) {
  const status = form.querySelector("[data-form-status]");
  if (!status) return;
  status.textContent = message;
  status.classList.remove("success", "error");
  if (type) status.classList.add(type);
}

function validateRfqForm(form) {
  const requiredFields = Array.from(form.querySelectorAll("[required]"));
  for (const field of requiredFields) {
    if (!field || !field.value.trim()) {
      field?.focus();
      return "Please complete all required fields marked with *.";
    }
  }

  const email = form.elements.email?.value.trim() || "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    form.elements.email.focus();
    return "Please enter a valid email address, e.g. name@company.com.";
  }

  const phone = form.elements.phone?.value.trim() || "";
  if (phone && !/^\+?[0-9\s\-()]{7,20}$/.test(phone)) {
    form.elements.phone.focus();
    return "Please enter a valid international phone or WhatsApp number.";
  }

  if (form.elements.website && form.elements.website.value.trim()) {
    return "Submission blocked. Please try again.";
  }

  return "";
}

document.addEventListener("submit", (event) => {
  if (!event.target.matches("[data-rfq-form]")) return;

  const form = event.target;
  const error = validateRfqForm(form);
  if (error) {
    event.preventDefault();
    setFormStatus(form, error, "error");
    return;
  }

  setFormStatus(form, "Submitting inquiry to ge50613386@gmail.com...", "success");
});

document.addEventListener("submit", (event) => {
  if (!event.target.matches("[data-inquiry-form]")) return;
  const form = event.target;
  const error = validateRfqForm(form);
  if (error) {
    event.preventDefault();
    setFormStatus(form, error, "error");
  }
});
