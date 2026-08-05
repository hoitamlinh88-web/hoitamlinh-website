import { supabase } from './supabase-client.js';
import { destinationForRole, getAccess } from './auth.js';

const form = document.querySelector('#auth-form');
const modeButton = document.querySelector('#auth-mode-toggle');
const submitButton = document.querySelector('#auth-submit');
const heading = document.querySelector('#auth-heading');
const description = document.querySelector('#auth-description');
const displayNameRow = document.querySelector('#display-name-row');
const status = document.querySelector('#auth-status');
let mode = 'login';

const showStatus = (message, type = '') => {
  status.textContent = message;
  status.className = `auth-status ${type}`;
  status.hidden = false;
};

const setBusy = busy => {
  submitButton.disabled = busy;
  modeButton.disabled = busy;
  submitButton.textContent = busy ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản';
};

modeButton.addEventListener('click', () => {
  mode = mode === 'login' ? 'signup' : 'login';
  const signup = mode === 'signup';
  heading.textContent = signup ? 'Tạo tài khoản hội viên' : 'Thông tin đăng nhập';
  description.textContent = signup
    ? 'Tài khoản mới được tạo với quyền hội viên. Quản trị viên sẽ cấp quyền Monitor khi cần đăng bài.'
    : 'Vui lòng nhập tài khoản được cấp để tiếp tục.';
  displayNameRow.hidden = !signup;
  submitButton.textContent = signup ? 'Tạo tài khoản' : 'Đăng nhập';
  modeButton.textContent = signup ? 'Quay lại đăng nhập' : 'Tạo tài khoản mới';
  status.hidden = true;
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const email = form.email.value.trim();
  const password = form.password.value;
  const displayName = form.display_name.value.trim();
  if (!email || password.length < 8) {
    showStatus('Vui lòng nhập email và mật khẩu từ 8 ký tự.', 'error');
    return;
  }

  setBusy(true);
  try {
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName || email.split('@')[0] } }
      });
      if (error) throw error;
      if (!data.session) {
        showStatus('Tài khoản đã được tạo. Vui lòng kiểm tra email để xác nhận.', 'success');
      } else {
        window.location.replace('index.html');
      }
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const access = await getAccess();
    window.location.replace(destinationForRole(access.profile?.role));
  } catch (error) {
    showStatus(error.message || 'Không thể xử lý yêu cầu đăng nhập.', 'error');
  } finally {
    setBusy(false);
  }
});

getAccess().then(access => {
  if (access.user && access.profile) {
    window.location.replace(destinationForRole(access.profile.role));
  }
}).catch(() => {});
