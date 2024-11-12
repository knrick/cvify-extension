import { fetchWithCSRF, CSRFProtection } from '../utils/csrf.js';
import { InputValidation } from '../utils/validation.js';
import { fetchWithRateLimit, debounce } from '../utils/rateLimiter.js';

let port = chrome.runtime.connect({name: "popup"});
let extractionInProgress = false;
let currentEmail = null;
let isLoggingIn = false;
let isRegistering = false;
let isVerifying = false;
let isResendingCode = false;
let isRequestingPasswordReset = false;
let isResettingPassword = false;
let isCancellingPasswordReset = false;

document.addEventListener('DOMContentLoaded', async function() {
  try {
    // Then continue with your existing initialization code
    document.getElementById('extension-name').textContent = chrome.i18n.getMessage('extensionName');
    document.getElementById('email').placeholder = chrome.i18n.getMessage('email');
    document.getElementById('password').placeholder = chrome.i18n.getMessage('password');
    document.getElementById('login').textContent = chrome.i18n.getMessage('login');
    document.getElementById('register').textContent = chrome.i18n.getMessage('register');
    document.getElementById('extract').textContent = chrome.i18n.getMessage('extractProfile');
    document.getElementById('open-cv-editor').textContent = chrome.i18n.getMessage('openCVEditor');
    document.getElementById('open-payments').textContent = chrome.i18n.getMessage('openPayments');
    document.getElementById('logout').textContent = chrome.i18n.getMessage('logout');
    document.getElementById('verification-title').textContent = chrome.i18n.getMessage('verifyEmail');
    document.getElementById('verification-code').placeholder = chrome.i18n.getMessage('enterVerificationCode');
    document.getElementById('verify-email').textContent = chrome.i18n.getMessage('verifyEmail');
    document.getElementById('resend-code').textContent = chrome.i18n.getMessage('resendCode');
    document.getElementById('back-to-login').textContent = chrome.i18n.getMessage('backToLogin');
    document.getElementById('reset-password').textContent = chrome.i18n.getMessage('resetPassword');
    document.getElementById('reset-password-code').placeholder = chrome.i18n.getMessage('enterResetCode');
    document.getElementById('reset-password-password').placeholder = chrome.i18n.getMessage('enterNewPassword');
    document.getElementById('reset-password-submit').textContent = chrome.i18n.getMessage('submit');
    document.getElementById('reset-password-resend').textContent = chrome.i18n.getMessage('resendCode');
    document.getElementById('reset-password-cancel').textContent = chrome.i18n.getMessage('cancel');
    document.getElementById('loading-message').textContent = chrome.i18n.getMessage('loadingMessage');

    showFormLoading();
    
    // Initialize CSRF protection first
    await CSRFProtection.initialize();

    chrome.storage.local.get(['user', 'emailVerified', 'passwordResetEmail'], function(result) {
      if (result.passwordResetEmail) {
        showResetPasswordForm();
      } else if (result.user) {
        if (result.emailVerified) {
          showMainContent();
        } else {
          currentEmail = result.user;
          showVerificationForm();
        }
      } else {
        showAuthForm();
      }
    });
  } catch (error) {
    console.error('Failed to initialize extension:', error);
    // Handle initialization error appropriately
  }
});

function showFormLoading() {
  document.getElementById('loading-message').style.display = 'block';
  document.getElementById('auth-form').style.display = 'none';
  document.getElementById('verification-form').style.display = 'none';
  document.getElementById('reset-password-form').style.display = 'none';
  document.getElementById('main-content').style.display = 'none';
}

function showAuthForm() {
  document.getElementById('loading-message').style.display = 'none';
  document.getElementById('auth-form').style.display = 'block';
  document.getElementById('verification-form').style.display = 'none';
  document.getElementById('reset-password-form').style.display = 'none';
  document.getElementById('main-content').style.display = 'none';
}

const debouncedShowAuthForm = debounce(showAuthForm);
document.getElementById('back-to-login').addEventListener('click', debouncedShowAuthForm);

function showMainContent() {
  showFormLoading();
  fetchUserInfo().then(() => {
    document.getElementById('loading-message').style.display = 'none';
    document.getElementById('auth-form').style.display = 'none';
    document.getElementById('verification-form').style.display = 'none';
    document.getElementById('reset-password-form').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
  }).catch(error => {
    console.error('Failed to show main content:', error.message);
    alert(chrome.i18n.getMessage(error.message) || chrome.i18n.getMessage('errorLoadingUserInfo')); 
  });
}

function fetchUserInfo() {
  return fetchWithRateLimit(fetch, 'https://cvify.xyz/user-info', {
    method: 'GET',
    credentials: 'include'
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    return response.json();
  })
  .then(data => {
    const userInfo = document.getElementById('user-info');
    userInfo.textContent = `${chrome.i18n.getMessage('tier')}: ${data.tier}, ${chrome.i18n.getMessage('extractionsLeft')}: ${data.total_extractions}`;

    chrome.storage.local.set({isPremium: data.is_premium});
    
    const extractBtn = document.getElementById('extract');
    extractBtn.disabled = data.total_extractions === 0;
  })
  .catch(error => {
    console.error('Error fetching user info:', error);
    alert('Failed to fetch user information. Please try again.');
  });
}

function login() {
  if (isLoggingIn) return;
  
  const loginBtn = document.getElementById('login');
  const registerBtn = document.getElementById('register');
  const resetPasswordBtn = document.getElementById('reset-password');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  
  if (!InputValidation.isValidLogin(email.value, password.value)) {
    alert(chrome.i18n.getMessage('invalidLoginMessage'));
    return;
  }

  isLoggingIn = true;
  loginBtn.classList.add('loading');
  registerBtn.disabled = true;
  resetPasswordBtn.disabled = true;
  email.disabled = true;
  password.disabled = true;
  
  return fetchWithRateLimit(fetchWithCSRF, 'https://cvify.xyz/login', {
    method: 'POST',
    body: JSON.stringify({ email: email.value, password: password.value })
  })
  .then(response => response.json())
  .then(data => {
    if (data.message === 'loggedInSuccessfully') {
      return fetchWithRateLimit(fetch, 'https://cvify.xyz/user-info', {
        credentials: 'include'
      })
      .then(response => response.json())
      .then(userInfo => {
        chrome.storage.local.set({
          user: email.value,
          emailVerified: userInfo.email_verified
        }, function() {
          if (userInfo.email_verified) {
            showMainContent();
          } else {
            currentEmail = email.value;
            showVerificationForm();
          }
        });
      });
    } else {
      alert(chrome.i18n.getMessage(data.message) || chrome.i18n.getMessage('loginError'));
    }
  })
  .catch(error => {
    console.error('Login error:', error.message);
    alert(chrome.i18n.getMessage(error.message) || chrome.i18n.getMessage('loginError'));
  })
  .finally(() => {
    isLoggingIn = false;
    loginBtn.classList.remove('loading');
    registerBtn.disabled = false;
    resetPasswordBtn.disabled = false;
    email.disabled = false;
    password.disabled = false;
  });
}

const debouncedLogin = debounce(login);
document.getElementById('login').addEventListener('click', debouncedLogin);

function register() {
  if (isRegistering) return;
  
  const loginBtn = document.getElementById('login');
  const registerBtn = document.getElementById('register');
  const resetPasswordBtn = document.getElementById('reset-password');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  
  if (!InputValidation.isValidEmail(email.value)) {
    alert(chrome.i18n.getMessage('invalidEmailMessage'));
    return;
  }

  const passwordValidation = InputValidation.isValidPassword(password.value);
  if (!passwordValidation) {
    console.log(password.value, passwordValidation);
    alert(chrome.i18n.getMessage('invalidPasswordMessage'));
    return;
  }
  
  isRegistering = true;
  registerBtn.classList.add('loading');
  loginBtn.disabled = true;
  resetPasswordBtn.disabled = true;
  email.disabled = true;
  password.disabled = true;
  
  return fetchWithRateLimit(fetchWithCSRF, 'https://cvify.xyz/register', {
    method: 'POST',
    body: JSON.stringify({ email: email.value, password: password.value })
  })
  .then(response => response.json())
  .then(data => {
    if (data.requiresVerification) {
      currentEmail = email.value;
      chrome.storage.local.set({
        user: email.value,
        emailVerified: false
      }, function() {
        showVerificationForm();
      });
    } else {
      alert(chrome.i18n.getMessage(data.message) || chrome.i18n.getMessage('registrationError'));
    }
  })
  .catch(error => {
    console.error('Registration error:', error.message);
    alert(chrome.i18n.getMessage(error.message) || chrome.i18n.getMessage('registrationError'));
  })
  .finally(() => {
    isRegistering = false;
    registerBtn.classList.remove('loading');
    loginBtn.disabled = false;
    resetPasswordBtn.disabled = false;
    email.disabled = false;
    password.disabled = false;
  });
}

const debouncedRegister = debounce(register);
document.getElementById('register').addEventListener('click', debouncedRegister);

function logout() {
  return fetchWithCSRF('https://cvify.xyz/logout', {
    method: 'POST',
    credentials: 'include'
  })
  .then(response => response.json())
  .then(data => {
    chrome.storage.local.remove(['user', 'emailVerified'], function() {
      currentEmail = null;
      showAuthForm();
    });
  });
}

const debouncedLogout = debounce(logout);
document.getElementById('logout').addEventListener('click', debouncedLogout);

function extractProfile() {
  if (extractionInProgress) return;
  
  const extractButton = document.getElementById('extract');
  const loadingMessage = document.getElementById('loading-message');
  
  extractButton.classList.add('loading');
  loadingMessage.textContent = chrome.i18n.getMessage('extractionMessage');
  loadingMessage.style.display = 'block';
  extractionInProgress = true;
  
  chrome.runtime.sendMessage({action: "extractionStarted"});

  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (!tabs[0]) {
      handleError(chrome.i18n.getMessage('errorNoActiveTab'));
      resetExtractionState();
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, {action: "extractHTML"}, function(response) {
      if (chrome.runtime.lastError) {
        handleError(`${chrome.i18n.getMessage('errorCommunicatingWithPage')}: ${chrome.runtime.lastError.message}`);
        resetExtractionState();
        return;
      }

      if (!response || !response.html) {
        handleError(chrome.i18n.getMessage('failedToExtractHTML'));
        resetExtractionState();
        return;
      }

      sendToBackend(response.html)
        .then((response) => {
          console.log(response);
          if (response.status === 200) {
            openCVEditor(true);
          }
        })
        .catch((error) => {
          handleError(`${chrome.i18n.getMessage('errorProcessingData')}: ${error.message}`);
        })
        .finally(() => {
          resetExtractionState();
        });
    });
  });
}

function resetExtractionState() {
  extractionInProgress = false;
  const extractButton = document.getElementById('extract');
  const loadingMessage = document.getElementById('loading-message');
  extractButton.classList.remove('loading');
  loadingMessage.style.display = 'none';
  loadingMessage.textContent = chrome.i18n.getMessage('loadingMessage');
  chrome.runtime.sendMessage({action: "extractionStopped"});
}

const debouncedExtractProfile = debounce(extractProfile);
document.getElementById('extract').addEventListener('click', debouncedExtractProfile);

function sendToBackend(html) {
  const sourceUrl = window.location.href;
  return fetchWithRateLimit(fetchWithCSRF, 'https://cvify.xyz/process', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({html: html, source_url: sourceUrl}),
    credentials: 'include'
  })
  .then(response => {
    if (!response.ok) {
      console.error('Response not OK:', response.status, response.statusText);
      return response.text().then(text => {
        console.error('Response body:', text);
        throw new Error(`HTTP error! status: ${response.status}`);
      });
    }
    return response;
  })
  .catch(error => {
    console.error('Error:', error.message);
    alert(chrome.i18n.getMessage(error.message) || chrome.i18n.getMessage('errorProcessingHTML'));
  });
}

function openCVEditor(updateList = false) {
  chrome.runtime.sendMessage({action: "openCVEditor", updateList: updateList}, (response) => {
    if (response && response.success) {
      window.close();
    }
  });
}

const debouncedOpenCVEditor = debounce(openCVEditor);
document.getElementById('open-cv-editor').addEventListener('click', debouncedOpenCVEditor);

function handleError(message) {
  console.error(message);
  alert(message);
}

function generatePaymentToken() {
  return new Promise((resolve, reject) => {
    fetchWithRateLimit(fetchWithCSRF, 'https://cvify.xyz/generate-payment-token', {
      method: 'POST',
      credentials: 'include'
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to generate token');
      }
      return response.json();
    })
    .then(data => {
      resolve(data.token);
    })
    .catch(error => {
      console.error('Error generating token:', error);
      reject(error);
    });
  });
}

function openPaymentsPage() {
  // First find and close any existing payments tabs
  chrome.tabs.query({url: 'https://cvify.xyz/payments*'}, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.remove(tabs[0].id);
    }
    
    // Then generate token and open new payments page
    generatePaymentToken()
      .then(token => {
        chrome.tabs.create({ url: `https://cvify.xyz/payments?token=${token}` });
      })
      .catch(error => {
        console.error('Error opening payments page:', error.message);
        alert(chrome.i18n.getMessage(error.message) || chrome.i18n.getMessage('failedToOpenPaymentsPage'));
      });
  });
}

const debouncedOpenPaymentsPage = debounce(openPaymentsPage);
document.getElementById('open-payments').addEventListener('click', debouncedOpenPaymentsPage);

function showVerificationForm() {
  document.getElementById('loading-message').style.display = 'none';
  document.getElementById('auth-form').style.display = 'none';
  document.getElementById('verification-form').style.display = 'block';
  document.getElementById('reset-password-form').style.display = 'none';
  document.getElementById('main-content').style.display = 'none';
  document.getElementById('verification-message').textContent = 
    chrome.i18n.getMessage('verificationCodeSent', currentEmail);
}

function verifyEmail() {
  if (isVerifying) return;
  
  const verifyBtn = document.getElementById('verify-email');
  const codeInput = document.getElementById('verification-code');
  const code = codeInput.value.trim();
  
  if (!InputValidation.isValidVerificationCode(code)) {
    alert(chrome.i18n.getMessage('invalidVerificationCodeMessage'));
    return;
  }
  
  isVerifying = true;
  verifyBtn.classList.add('loading');
  codeInput.disabled = true;
  
  return fetchWithRateLimit(fetchWithCSRF, 'https://cvify.xyz/verify-email', {
    method: 'POST',
    body: JSON.stringify({ 
      email: currentEmail,
      code: code 
    }),
    credentials: 'include'
  })
  .then(response => response.json())
  .then(data => {
    if (data.message === 'emailVerifiedSuccessfully') {
      chrome.storage.local.set({
        emailVerified: true
      }, function() {
        showMainContent();
      });
    } else {
      alert(chrome.i18n.getMessage(data.message) || chrome.i18n.getMessage('verificationError'));
    }
  })
  .catch(error => {
    console.error('Verification error:', error.message);
    alert(chrome.i18n.getMessage(error.message) || chrome.i18n.getMessage('verificationError'));
  })
  .finally(() => {
    isVerifying = false;
    verifyBtn.classList.remove('loading');
    codeInput.disabled = false;
  });
}

const debouncedVerifyEmail = debounce(verifyEmail);
document.getElementById('verify-email').addEventListener('click', debouncedVerifyEmail);

function resendVerificationCode() {
  if (isResendingCode) return;
  
  const resendBtn = document.getElementById('resend-code');
  
  isResendingCode = true;
  resendBtn.classList.add('loading');
  
  return fetchWithRateLimit(fetchWithCSRF, 'https://cvify.xyz/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email: currentEmail }),
    credentials: 'include'
  })
  .then(response => response.json())
  .then(data => {
    alert(chrome.i18n.getMessage('verificationCodeResent'));
  })
  .catch(error => {
    console.error('Resend code error:', error.message);
    alert(chrome.i18n.getMessage(error.message) || chrome.i18n.getMessage('resendCodeError'));
  })
  .finally(() => {
    isResendingCode = false;
    resendBtn.classList.remove('loading');
  });
}

const debouncedResendVerificationCode = debounce(resendVerificationCode);
document.getElementById('resend-code').addEventListener('click', debouncedResendVerificationCode);

function showResetPasswordForm() {
  document.getElementById('loading-message').style.display = 'none';
  document.getElementById('auth-form').style.display = 'none';
  document.getElementById('verification-form').style.display = 'none';
  document.getElementById('reset-password-form').style.display = 'block';
  document.getElementById('main-content').style.display = 'none';
}

function requestPasswordReset() {
  if (isRequestingPasswordReset) return;

  isRequestingPasswordReset = true;

  const loginBtn = document.getElementById('login');
  const registerBtn = document.getElementById('register');
  const resetPasswordBtn = document.getElementById('reset-password');
  const email = document.getElementById('email');
  const password = document.getElementById('password');

  if (!InputValidation.isValidEmail(email.value)) {
    alert(chrome.i18n.getMessage('invalidEmailMessage'));
    return;
  }

  loginBtn.disabled = true;
  registerBtn.disabled = true;
  resetPasswordBtn.classList.add('loading');
  email.disabled = true;
  password.disabled = true;

  return fetchWithRateLimit(fetchWithCSRF, 'https://cvify.xyz/request-password-reset', {
    method: 'POST',
    body: JSON.stringify({ email: email.value }),
    credentials: 'include'
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Failed to request password reset');
    }
    return response.json();
  })
  .then(data => {
    chrome.storage.local.set({
      passwordResetEmail: email.value
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error saving password reset email:', chrome.runtime.lastError);
      }
    });
    showResetPasswordForm();
  })
  .catch(error => {
    console.error('Error requesting password reset:', error.message);
    alert(chrome.i18n.getMessage(error.message) || chrome.i18n.getMessage('requestPasswordResetError'));
  })
  .finally(() => {
    isRequestingPasswordReset = false;
    loginBtn.disabled = false;
    registerBtn.disabled = false;
    resetPasswordBtn.classList.remove('loading');
    email.disabled = false;
    password.disabled = false;
  });
}

const debouncedRequestPasswordReset = debounce(requestPasswordReset);
document.getElementById('reset-password').addEventListener('click', debouncedRequestPasswordReset);

function resetPassword() {
  if (isResettingPassword) return;

  const resetPasswordBtn = document.getElementById('reset-password-submit');
  const resetPasswordCode = document.getElementById('reset-password-code');
  const resetPasswordPassword = document.getElementById('reset-password-password');

  if (!InputValidation.isValidVerificationCode(resetPasswordCode.value)) {
    alert(chrome.i18n.getMessage('invalidResetCodeMessage'));
    return;
  }

  if (!InputValidation.isValidPassword(resetPasswordPassword.value)) {
    alert(chrome.i18n.getMessage('invalidPasswordMessage'));
    return;
  }

  chrome.storage.local.get('passwordResetEmail', (result) => {
    if (!result.passwordResetEmail) {
      alert(chrome.i18n.getMessage('userNotFound'));
      return;
    }

    isResettingPassword = true;
    resetPasswordBtn.classList.add('loading');
    resetPasswordCode.disabled = true;
    resetPasswordPassword.disabled = true;

    return fetchWithRateLimit(fetchWithCSRF, 'https://cvify.xyz/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email: result.passwordResetEmail, code: resetPasswordCode.value, password: resetPasswordPassword.value }),
      credentials: 'include'
    })
    .then(response => response.json())
    .then(data => {
      if (data.message === 'passwordResetSuccessfully') {
        chrome.storage.local.remove('passwordResetEmail', () => {
          alert(chrome.i18n.getMessage('passwordResetSuccessfully'));
          showAuthForm();
        });
      } else {
        alert(chrome.i18n.getMessage(data.message) || chrome.i18n.getMessage('resetPasswordError'));
      }
    })
    .catch(error => {
      console.error('Error resetting password:', error.message);
      alert(chrome.i18n.getMessage(error.message) || chrome.i18n.getMessage('resetPasswordError'));
    })
    .finally(() => {
      isResettingPassword = false;
      resetPasswordBtn.classList.remove('loading');
      resetPasswordCode.disabled = false;
      resetPasswordPassword.disabled = false;
    });
  });
}

const debouncedResetPassword = debounce(resetPassword);
document.getElementById('reset-password-submit').addEventListener('click', debouncedResetPassword);


function resendPasswordResetCode() {
  if (isResendingCode) return;
  
  const resendBtn = document.getElementById('reset-password-resend');

  chrome.storage.local.get('passwordResetEmail', (result) => {
    if (!result.passwordResetEmail) {
      alert(chrome.i18n.getMessage('userNotFound'));
      return;
    }

    isResendingCode = true;
    resendBtn.classList.add('loading');
    
    return fetchWithRateLimit(fetchWithCSRF, 'https://cvify.xyz/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: result.passwordResetEmail }),
      credentials: 'include'
    })
    .then(response => response.json())
    .then(data => {
      alert(chrome.i18n.getMessage('verificationCodeResent'));
    })
    .catch(error => {
      console.error('Resend code error:', error.message);
      alert(chrome.i18n.getMessage(error.message) || chrome.i18n.getMessage('resendCodeError'));
    })
    .finally(() => {
      isResendingCode = false;
      resendBtn.classList.remove('loading');
    });
  });
}

const debouncedResendPasswordResetCode = debounce(resendPasswordResetCode);
document.getElementById('reset-password-resend').addEventListener('click', debouncedResendPasswordResetCode);

function cancelPasswordReset() {
  if (isCancellingPasswordReset) return;

  isCancellingPasswordReset = true;

  chrome.storage.local.get('passwordResetEmail', (result) => {
    if (!result.passwordResetEmail) {
      alert(chrome.i18n.getMessage('userNotFound'));
      return;
    }

    const cancelBtn = document.getElementById('reset-password-cancel');
    cancelBtn.classList.add('loading');

    return fetchWithRateLimit(fetchWithCSRF, 'https://cvify.xyz/cancel-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email: result.passwordResetEmail }),
      credentials: 'include'
    })
    .then(response => response.json())
    .then(data => {
    })
    .catch(error => {
      console.error('Error cancelling password reset:', error.message);
      alert(chrome.i18n.getMessage(error.message) || chrome.i18n.getMessage('errorCancellingPasswordReset'));
    })
    .finally(() => {
      isCancellingPasswordReset = false;
      cancelBtn.classList.remove('loading');
      chrome.storage.local.remove('passwordResetEmail', () => {
        showAuthForm();
      });
    });
  });
}

const debouncedCancelPasswordReset = debounce(cancelPasswordReset);
document.getElementById('reset-password-cancel').addEventListener('click', debouncedCancelPasswordReset);

