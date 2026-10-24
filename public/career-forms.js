const recaptchaSiteKey = '6LcN0C0qAAAAALg8kFcAO16OSOwvvFGLGEdBI2DW';
let recaptchaLoader;

function loadRecaptcha() {
  if (!recaptchaLoader) {
    recaptchaLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(recaptchaSiteKey)}`;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
  }
  return recaptchaLoader;
}

async function recaptchaToken() {
  // The existing site key is registered for the production domain.
  if (window.location.hostname !== 'next-genium.com') return '';
  await loadRecaptcha();
  return new Promise((resolve, reject) => {
    window.grecaptcha.ready(() => {
      window.grecaptcha.execute(recaptchaSiteKey, { action: 'contactform' }).then(resolve, reject);
    });
  });
}

document.querySelectorAll('[data-career-form]').forEach((form) => {
  const status = form.querySelector('.career-form-status');
  const button = form.querySelector('button[type="submit"]');
  const originalButton = button.innerHTML;

  form.addEventListener('input', (event) => {
    if (event.target instanceof HTMLElement && 'setCustomValidity' in event.target) {
      event.target.setCustomValidity('');
      event.target.removeAttribute('aria-invalid');
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    button.disabled = true;
    button.textContent = form.dataset.sending;
    status.textContent = '';
    status.classList.remove('is-error', 'is-success');

    try {
      const payload = new FormData(form);
      payload.set('_wpcf7_recaptcha_response', await recaptchaToken());
      const response = await fetch(form.action, {
        method: 'POST',
        body: payload,
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Request failed');
      const result = await response.json();

      if (result.status === 'mail_sent') {
        form.reset();
        status.textContent = form.dataset.success;
        status.classList.add('is-success');
      } else if (result.status === 'validation_failed') {
        for (const issue of result.invalid_fields || []) {
          const field = [...form.elements].find((item) => item.name === issue.field);
          if (field && 'setCustomValidity' in field) {
            field.setCustomValidity(issue.message || form.dataset.invalid);
            field.setAttribute('aria-invalid', 'true');
          }
        }
        status.textContent = form.dataset.invalid;
        status.classList.add('is-error');
        form.reportValidity();
      } else {
        status.textContent = form.dataset.fail;
        status.classList.add('is-error');
      }
    } catch {
      status.textContent = form.dataset.fail;
      status.classList.add('is-error');
    } finally {
      button.disabled = false;
      button.innerHTML = originalButton;
    }
  });
});
