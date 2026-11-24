import { supabase } from './supabase-client.js';

const form = document.getElementById('sms-signup');
const statusEl = document.getElementById('sms-status');
const consentText = document.getElementById('sms-consent-text').textContent.trim();

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = `sms-status ${kind || ''}`;
}

function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const fullName = form.full_name.value.trim();
  const phone = normalizePhone(form.phone.value);

  if (!fullName) return setStatus('Vui lòng nhập họ tên. / Please enter your name.', 'error');
  if (!phone) return setStatus('Số điện thoại Mỹ chưa đúng (10 số). / Please enter a valid 10-digit US mobile number.', 'error');
  if (!form.consent.checked) return setStatus('Vui lòng đánh dấu ô đồng ý để đăng ký. / Please check the consent box to sign up.', 'error');

  const button = form.querySelector('button');
  button.disabled = true;
  setStatus('Đang gửi... / Submitting...', '');

  const { error } = await supabase.from('sms_signups').insert({
    full_name: fullName,
    phone,
    consent: true,
    consent_text: consentText,
    source: 'website',
    page_url: location.href,
    user_agent: navigator.userAgent.slice(0, 400)
  });

  button.disabled = false;
  if (error) {
    console.error(error);
    setStatus('Chưa gửi được, vui lòng thử lại hoặc gọi +1 714-534-4210. / Something went wrong, please try again.', 'error');
    return;
  }
  form.reset();
  setStatus('Cảm ơn! Bạn đã đăng ký nhận tin SMS của Hội Tâm Linh. Nhắn STOP bất cứ lúc nào để ngừng. / Thank you! You are signed up. Reply STOP anytime to cancel.', 'ok');
});
