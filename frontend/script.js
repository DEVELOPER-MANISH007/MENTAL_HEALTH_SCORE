(() => {
  "use strict";

  const localHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const API_BASE = (window.API_BASE_URL || (localHost ? "http://127.0.0.1:8000" : "/api")).replace(/\/$/, "");

  const form = document.getElementById("predict-form");
  const submitBtn = document.getElementById("submit-btn");
  const clearBtn = document.getElementById("clear-btn");
  const resetBtn = document.getElementById("reset-btn");
  const errorRetryBtn = document.getElementById("error-retry-btn");
  const reviewBtn = document.getElementById("review-btn");
  const stateIdle = document.getElementById("state-idle");
  const stateLoading = document.getElementById("state-loading");
  const stateResult = document.getElementById("state-result");
  const stateError = document.getElementById("state-error");
  const scoreNumberEl = document.getElementById("score-number");
  const gaugeFill = document.getElementById("gauge-fill");
  const errorLabelEl = document.getElementById("error-label");
  const errorCopyEl = document.getElementById("error-copy");
  const segGroup = document.getElementById("stress_level_group");
  const stressHiddenInput = document.getElementById("stress_level");
  const GAUGE_ARC_LENGTH = Math.PI * 93;
  let hasCurrentResult = false;

  function drawTicks() {
    document.querySelectorAll(".gauge-ticks").forEach((group) => {
      group.replaceChildren();
      for (let i = 0; i <= 10; i += 2) {
        const angle = Math.PI - (i / 10) * Math.PI;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", (120 + 93 * Math.cos(angle)).toFixed(1));
        line.setAttribute("y1", (132 - 93 * Math.sin(angle)).toFixed(1));
        line.setAttribute("x2", (120 + 84 * Math.cos(angle)).toFixed(1));
        line.setAttribute("y2", (132 - 84 * Math.sin(angle)).toFixed(1));
        group.appendChild(line);
      }
    });
  }

  function fieldWrapper(input) {
    return input.closest(".field");
  }

  function setFieldError(input, message) {
    const wrapper = fieldWrapper(input);
    if (!wrapper) return;
    wrapper.classList.add("field-error");
    const control = input === stressHiddenInput ? segGroup : input;
    control.setAttribute("aria-invalid", "true");
    const messageElement = wrapper.querySelector(".error-msg");
    if (messageElement) messageElement.textContent = message;
  }

  function clearFieldError(input) {
    const wrapper = fieldWrapper(input);
    if (!wrapper) return;
    wrapper.classList.remove("field-error");
    const control = input === stressHiddenInput ? segGroup : input;
    control.removeAttribute("aria-invalid");
    const messageElement = wrapper.querySelector(".error-msg");
    if (messageElement) messageElement.textContent = "";
  }

  function clearAllErrors() {
    form.querySelectorAll(".field").forEach((field) => field.classList.remove("field-error"));
    form.querySelectorAll(".error-msg").forEach((message) => (message.textContent = ""));
    form.querySelectorAll("[aria-invalid]").forEach((input) => input.removeAttribute("aria-invalid"));
  }

  function showState(name) {
    [stateIdle, stateLoading, stateResult, stateError].forEach((element) => {
      element.hidden = true;
    });
    ({ idle: stateIdle, loading: stateLoading, result: stateResult, error: stateError }[name]).hidden = false;
  }

  function setSubmitting(isSubmitting) {
    submitBtn.disabled = isSubmitting;
    submitBtn.classList.toggle("loading", isSubmitting);
    submitBtn.setAttribute("aria-busy", String(isSubmitting));
  }

  function invalidateResult() {
    if (!hasCurrentResult) return;
    hasCurrentResult = false;
    showState("idle");
  }

  function validate(payload) {
    const errors = [];
    const numericChecks = [
      ["age", 10, 100, true],
      ["avg_daily_usage_hours", 0, 24, false],
      ["daily_unlocks", 0, Infinity, true],
      ["study_hours", 0, 24, false],
      ["physical_activity_hours", 0, 24, false],
      ["sleep_hours_per_night", 0, 24, false],
    ];

    numericChecks.forEach(([key, min, max, integer]) => {
      const input = document.getElementById(key);
      const value = payload[key];
      if (!Number.isFinite(value)) {
        errors.push([input, "Enter a valid number."]);
      } else if (integer && !Number.isInteger(value)) {
        errors.push([input, "Enter a whole number."]);
      } else if (value < min || value > max) {
        errors.push([input, `Enter a value from ${min} to ${max === Infinity ? "0 or more" : max}.`]);
      }
    });

    ["gender", "country", "academic_level", "most_used_platform", "purpose_of_use"].forEach((key) => {
      const input = document.getElementById(key);
      if (!payload[key] || String(payload[key]).trim() === "") {
        errors.push([input, "This field is required."]);
      }
    });

    if (!payload.stress_level) {
      errors.push([stressHiddenInput, "Choose a perceived stress level."]);
    }
    return errors;
  }

  function collectPayload() {
    const data = new FormData(form);
    const numberValue = (name) => {
      const value = data.get(name);
      return value === "" ? NaN : Number(value);
    };
    return {
      age: numberValue("age"),
      gender: data.get("gender") || "",
      country: String(data.get("country") || "").trim(),
      academic_level: data.get("academic_level") || "",
      most_used_platform: data.get("most_used_platform") || "",
      purpose_of_use: data.get("purpose_of_use") || "",
      avg_daily_usage_hours: numberValue("avg_daily_usage_hours"),
      daily_unlocks: numberValue("daily_unlocks"),
      study_hours: numberValue("study_hours"),
      physical_activity_hours: numberValue("physical_activity_hours"),
      sleep_hours_per_night: numberValue("sleep_hours_per_night"),
      stress_level: data.get("stress_level") || "",
    };
  }

  function renderResult(score) {
    const gaugeScore = Math.max(0, Math.min(10, score));
    scoreNumberEl.textContent = score.toFixed(2);
    gaugeFill.style.transition = "none";
    gaugeFill.style.strokeDashoffset = String(GAUGE_ARC_LENGTH);
    showState("result");
    hasCurrentResult = true;
    requestAnimationFrame(() => {
      gaugeFill.style.transition = "";
      gaugeFill.style.strokeDashoffset = String(GAUGE_ARC_LENGTH * (1 - gaugeScore / 10));
    });
  }

  function renderError(label, copy) {
    errorLabelEl.textContent = label;
    errorCopyEl.textContent = copy;
    showState("error");
    hasCurrentResult = false;
  }

  function applyServerValidationErrors(detail) {
    if (!Array.isArray(detail)) return false;
    let matched = false;
    detail.forEach((error) => {
      const field = Array.isArray(error.loc) ? error.loc[error.loc.length - 1] : null;
      const input = field ? document.getElementById(field) : null;
      const target = field === "stress_level" ? stressHiddenInput : input;
      if (target) {
        setFieldError(target, error.msg || "Invalid value.");
        matched = true;
      }
    });
    return matched;
  }

  async function requestPrediction(payload) {
    let response;
    try {
      response = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      renderError("Can't reach the prediction service", "Check your connection and try again. If the problem continues, the prediction service may be unavailable.");
      return;
    }

    let data;
    try {
      data = await response.json();
    } catch {
      renderError("Unexpected response", "The prediction service returned a response that could not be read. Please try again.");
      return;
    }

    if (response.status === 422) {
      const matched = applyServerValidationErrors(data.detail);
      renderError(
        "Check your answers",
        matched
          ? "The service asked for a few changes. The relevant fields are marked on the form."
          : "The service could not use these answers. Please review the form and try again."
      );
      return;
    }

    if (!response.ok) {
      const detail = typeof data.detail === "string" ? data.detail : `The service responded with status ${response.status}.`;
      renderError("Prediction failed", detail);
      return;
    }

    if (typeof data.predicted_mental_health_score !== "number" || !Number.isFinite(data.predicted_mental_health_score)) {
      renderError("Unexpected response", "The prediction service did not return a valid score. Please try again.");
      return;
    }

    renderResult(data.predicted_mental_health_score);
  }

  drawTicks();

  segGroup.querySelectorAll(".stress-option").forEach((button) => {
    button.addEventListener("click", () => {
      segGroup.querySelectorAll(".stress-option").forEach((option) => {
        const selected = option === button;
        option.classList.toggle("selected", selected);
        option.setAttribute("aria-pressed", String(selected));
      });
      stressHiddenInput.value = button.dataset.value;
      clearFieldError(stressHiddenInput);
      invalidateResult();
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitBtn.disabled) return;
    clearAllErrors();
    const payload = collectPayload();
    const errors = validate(payload);

    if (errors.length > 0) {
      errors.forEach(([input, message]) => input && setFieldError(input, message));
      const firstInvalid = errors[0][0];
      (firstInvalid === stressHiddenInput ? segGroup.querySelector(".stress-option") : firstInvalid)?.focus();
      return;
    }

    setSubmitting(true);
    showState("loading");
    hasCurrentResult = false;
    try {
      await requestPrediction(payload);
    } finally {
      setSubmitting(false);
    }
  });

  form.querySelectorAll("input:not([type='hidden']), select").forEach((input) => {
    input.addEventListener("input", () => {
      clearFieldError(input);
      invalidateResult();
    });
    input.addEventListener("change", () => {
      clearFieldError(input);
      invalidateResult();
    });
  });

  clearBtn.addEventListener("click", () => {
    form.reset();
    clearAllErrors();
    segGroup.querySelectorAll(".stress-option").forEach((button) => {
      button.classList.remove("selected");
      button.setAttribute("aria-pressed", "false");
    });
    hasCurrentResult = false;
    showState("idle");
    document.getElementById("age").focus();
  });

  errorRetryBtn.addEventListener("click", () => form.requestSubmit());
  reviewBtn.addEventListener("click", () => {
    document.getElementById("age").focus({ preventScroll: true });
  });
})();
