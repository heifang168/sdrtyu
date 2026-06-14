import { useState } from "react";

export default function RfqForm({ endpoint = "https://formsubmit.co/ajax/ge50613386@gmail.com" }) {
  const [status, setStatus] = useState("Please complete required fields marked with *.");
  const [statusType, setStatusType] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));

    if (data.website) {
      setStatusType("error");
      setStatus("Submission blocked. Please try again.");
      return;
    }

    if (!data.name || !data.email || !data.phone) {
      setStatusType("error");
      setStatus("Please complete all required fields marked with *.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      setStatusType("error");
      setStatus("Please enter a valid email address.");
      return;
    }

    if (!/^\+?[0-9\s\-()]{7,20}$/.test(data.phone)) {
      setStatusType("error");
      setStatus("Please enter a valid international phone or WhatsApp number.");
      return;
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          _subject: "New ALEO POWER inquiry from heifun6.asia",
          _template: "table",
          _captcha: "false",
        }),
      });

      if (!response.ok) throw new Error("Request failed");
      setStatusType("success");
      setStatus("Submitted successfully. Our sales team will contact you soon.");
      form.reset();
    } catch {
      setStatusType("error");
      setStatus("Submission failed. Please email ge50613386@gmail.com or try again.");
    }
  }

  return (
    <form className="rfq-form-card form" onSubmit={handleSubmit} noValidate>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="name">Name<span className="required">*</span></label>
          <input id="name" name="name" placeholder="Your full name" required />
          <small>Please enter your name.</small>
        </div>
        <div className="field">
          <label htmlFor="email">Email<span className="required">*</span></label>
          <input id="email" name="email" type="email" placeholder="name@company.com" required />
          <small>Use a valid business email format.</small>
        </div>
        <div className="field">
          <label htmlFor="phone">Phone / WhatsApp<span className="required">*</span></label>
          <input id="phone" name="phone" type="tel" placeholder="+971 50 123 4567" pattern="^\\+?[0-9\\s\\-()]{7,20}$" required />
          <small>International format is supported.</small>
        </div>
        <div className="field">
          <label htmlFor="company">Company Name</label>
          <input id="company" name="company" placeholder="Your company name" />
          <small>Optional, but helpful for B2B qualification.</small>
        </div>
        <div className="field">
          <label htmlFor="country">Country / Region</label>
          <input id="country" name="country" placeholder="UAE, Saudi Arabia, Nigeria..." />
        </div>
        <div className="field">
          <label htmlFor="product">Product Requirement</label>
          <input id="product" name="product" placeholder="700kW gas generator, diesel generator set..." />
        </div>
        <div className="field field-full">
          <label htmlFor="message">Message</label>
          <textarea id="message" name="message" placeholder="Application, fuel type, voltage, frequency, quantity, timeline or OEM/ODM needs." />
        </div>
      </div>
      <input className="honeypot" name="website" tabIndex={-1} autoComplete="off" />
      <p className={`form-status ${statusType}`}>{status}</p>
      <button type="submit">Submit Inquiry</button>
    </form>
  );
}
