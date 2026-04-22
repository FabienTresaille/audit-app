/**
 * ROKIA — Authentication Logic
 */

const API_BASE = '';
let captchaToken = '';

// Check if already authenticated
(function checkAuth() {
    const token = localStorage.getItem('rokia_token');
    if (token) {
        window.location.href = '/app';
    }
})();

// Load CAPTCHA
async function loadCaptcha() {
    try {
        const res = await fetch(`${API_BASE}/api/auth/captcha`);
        const data = await res.json();
        document.getElementById('captchaQuestion').textContent = data.question;
        captchaToken = data.token;
        document.getElementById('captchaAnswer').value = '';
    } catch (e) {
        console.error('Failed to load CAPTCHA:', e);
    }
}

// Refresh CAPTCHA button
document.getElementById('refreshCaptcha').addEventListener('click', loadCaptcha);

// Login form submission
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('loginBtn');
    const alert = document.getElementById('loginAlert');
    
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Connexion...';
    alert.classList.remove('show');

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const captchaAnswer = parseInt(document.getElementById('captchaAnswer').value, 10);

    try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username,
                password,
                captcha_answer: captchaAnswer,
                captcha_token: captchaToken
            })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.detail || 'Erreur de connexion');
        }

        // Store token and redirect
        localStorage.setItem('rokia_token', data.token);
        localStorage.setItem('rokia_user', data.username);
        window.location.href = '/app';

    } catch (err) {
        alert.textContent = err.message;
        alert.classList.add('show');
        loadCaptcha(); // Refresh CAPTCHA on error
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Se connecter';
    }
});

// Load initial CAPTCHA
loadCaptcha();
