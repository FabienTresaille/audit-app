/**
 * ROKIA — Main Application Logic
 */

const API = '';
let currentAnalysisId = null;
let allResults = [];
let currentFilter = 'all';
let sortCol = -1;
let sortAsc = true;
let ticketFileId = null;

// ============================================
// AUTH GUARD
// ============================================
const TOKEN = localStorage.getItem('rokia_token');
if (!TOKEN) {
    window.location.href = '/';
}

function authHeaders() {
    return { 'Authorization': `Bearer ${TOKEN}` };
}

function logout() {
    localStorage.removeItem('rokia_token');
    localStorage.removeItem('rokia_user');
    window.location.href = '/';
}

// Set user info
(function initUser() {
    const user = localStorage.getItem('rokia_user') || 'Admin';
    const el = document.getElementById('userName');
    const av = document.getElementById('userAvatar');
    if (el) el.textContent = user;
    if (av) av.textContent = user.charAt(0).toUpperCase();
})();

// ============================================
// NAVIGATION
// ============================================
function showPage(page) {
    document.getElementById('analysisPage').style.display = page === 'analysis' ? 'block' : 'none';
    document.getElementById('historyPage').classList.toggle('show', page === 'history');

    document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.toggle('active', n.dataset.page === page);
    });

    if (page === 'history') loadHistory();
}

// ============================================
// REFERENCE FILE UPLOAD
// ============================================
(async function checkReference() {
    try {
        const res = await fetch(`${API}/api/reference/status`, { headers: authHeaders() });
        const data = await res.json();
        if (data.loaded) {
            showRefLoaded(data.categories_count, data.contracts_count);
        }
    } catch (e) { /* ignore */ }
})();

document.getElementById('refFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await uploadReference(file);
});

async function uploadReference(file) {
    const form = new FormData();
    form.append('file', file);
    try {
        const res = await fetch(`${API}/api/reference`, {
            method: 'POST', headers: authHeaders(), body: form
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);
        showRefLoaded(data.categories_count, data.contracts_count);
        showAlert('Fichier référentiel chargé avec succès !', 'success');
    } catch (err) {
        showAlert(err.message, 'error');
    }
}

function showRefLoaded(cats, conts) {
    document.getElementById('refUploadZone').classList.add('hidden');
    document.getElementById('refSuccess').classList.remove('hidden');
    document.getElementById('refSuccessText').textContent =
        `Référentiel chargé : ${cats} catégories, ${conts} contrats`;
    document.getElementById('refStatus').textContent = 'Chargé ✓';
    document.getElementById('refStatus').className = 'badge badge-yes';
}

// ============================================
// TICKET FILE UPLOAD
// ============================================
document.getElementById('ticketFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await uploadTickets(file);
});

async function uploadTickets(file) {
    const form = new FormData();
    form.append('file', file);
    try {
        const res = await fetch(`${API}/api/tickets`, {
            method: 'POST', headers: authHeaders(), body: form
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);
        ticketFileId = data.file_id;
        document.getElementById('ticketUploadZone').classList.add('hidden');
        document.getElementById('ticketSuccess').classList.remove('hidden');
        document.getElementById('ticketSuccessText').textContent =
            `Fichier chargé : ${data.filename}`;
    } catch (err) {
        showAlert(err.message, 'error');
    }
}

// ============================================
// DRAG & DROP
// ============================================
['refUploadZone', 'ticketUploadZone'].forEach(id => {
    const zone = document.getElementById(id);
    if (!zone) return;

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (id === 'refUploadZone') await uploadReference(file);
        else await uploadTickets(file);
    });
});

// ============================================
// LAUNCH ANALYSIS
// ============================================
async function launchAnalysis() {
    const clientName = document.getElementById('clientName').value.trim();
    const copilDate = document.getElementById('copilDate').value;

    if (!clientName) return showAlert('Veuillez saisir le nom du client', 'error');
    if (!copilDate) return showAlert('Veuillez saisir la date du COPIL', 'error');
    if (!ticketFileId) return showAlert('Veuillez charger un fichier de tickets', 'error');

    const btn = document.getElementById('launchBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Lancement...';

    try {
        const params = new URLSearchParams({
            client_name: clientName,
            copil_date: copilDate,
            file_id: ticketFileId
        });

        const res = await fetch(`${API}/api/process?${params}`, {
            method: 'POST', headers: authHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);

        currentAnalysisId = data.analysis_id;
        showProgress();
        pollProgress(data.analysis_id);

    } catch (err) {
        showAlert(err.message, 'error');
        btn.disabled = false;
        btn.innerHTML = '🚀 Lancer l\'analyse IA';
    }
}

// ============================================
// PROGRESS TRACKING
// ============================================
function showProgress() {
    document.getElementById('progressSection').classList.add('show');
    document.getElementById('resultsSection').classList.remove('show');
}

async function pollProgress(analysisId) {
    try {
        const es = new EventSource(`${API}/api/process/${analysisId}/progress`);
        
        es.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.status === 'processing' && data.total > 0) {
                const pct = Math.round((data.processed / data.total) * 100);
                document.getElementById('progressBar').style.width = pct + '%';
                document.getElementById('progressPercent').textContent = pct + '%';
                document.getElementById('progressLabel').textContent =
                    `${data.processed} / ${data.total} tickets traités`;
            }

            if (data.status === 'completed') {
                es.close();
                document.getElementById('progressBar').style.width = '100%';
                document.getElementById('progressPercent').textContent = '100%';
                document.getElementById('progressLabel').textContent = 'Terminé !';
                setTimeout(() => loadResults(analysisId), 500);
            }

            if (data.status === 'error') {
                es.close();
                showAlert('Erreur lors du traitement : ' + (data.error || 'Inconnue'), 'error');
                resetLaunchBtn();
            }
        };

        es.onerror = () => {
            es.close();
            // Fallback: poll with fetch
            pollProgressFallback(analysisId);
        };
    } catch (e) {
        pollProgressFallback(analysisId);
    }
}

async function pollProgressFallback(analysisId) {
    const interval = setInterval(async () => {
        try {
            const res = await fetch(`${API}/api/process/${analysisId}/results`, {
                headers: authHeaders()
            });
            const data = await res.json();
            if (data.status === 'completed') {
                clearInterval(interval);
                document.getElementById('progressBar').style.width = '100%';
                document.getElementById('progressPercent').textContent = '100%';
                loadResults(analysisId);
            } else if (data.status === 'error') {
                clearInterval(interval);
                showAlert('Erreur: ' + (data.error_message || 'Inconnue'), 'error');
                resetLaunchBtn();
            }
        } catch (e) { /* keep polling */ }
    }, 2000);
}

// ============================================
// RESULTS
// ============================================
async function loadResults(analysisId) {
    try {
        const res = await fetch(`${API}/api/process/${analysisId}/results`, {
            headers: authHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);

        currentAnalysisId = analysisId;
        allResults = data.results || [];

        // Update stats
        const total = allResults.length;
        const recat = allResults.filter(r => r.was_recategorized).length;
        document.getElementById('statTotal').textContent = total;
        document.getElementById('statRecat').textContent = recat;
        document.getElementById('statKept').textContent = total - recat;

        // Show results
        document.getElementById('progressSection').classList.remove('show');
        document.getElementById('resultsSection').classList.add('show');
        
        renderTable(allResults);
        resetLaunchBtn();

    } catch (err) {
        showAlert(err.message, 'error');
        resetLaunchBtn();
    }
}

function renderTable(data) {
    const tbody = document.getElementById('resultsBody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding:32px">Aucun résultat</td></tr>';
        return;
    }

    data.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${esc(r.ticket_number)}</td>
            <td>${esc(r.dit_no_interne)}</td>
            <td>${esc(r.dit_etat)}</td>
            <td>${esc(r.old_category)}</td>
            <td><strong>${esc(r.new_category)}</strong></td>
            <td>${esc(r.new_contract)}</td>
            <td>${esc(r.new_delay)}</td>
            <td>${r.was_recategorized 
                ? '<span class="badge badge-yes">✅ Oui</span>' 
                : '<span class="badge badge-no">➖ Non</span>'}</td>
        `;
        tr.title = r.ai_reasoning || '';
        tbody.appendChild(tr);
    });
}

function esc(s) {
    if (!s) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

// ============================================
// FILTERING & SORTING
// ============================================
function filterResults(filter, btn) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    let filtered = allResults;
    if (filter === 'yes') filtered = allResults.filter(r => r.was_recategorized);
    if (filter === 'no') filtered = allResults.filter(r => !r.was_recategorized);
    renderTable(filtered);
}

function sortTable(colIndex) {
    if (sortCol === colIndex) {
        sortAsc = !sortAsc;
    } else {
        sortCol = colIndex;
        sortAsc = true;
    }

    const keys = ['ticket_number', 'dit_no_interne', 'dit_etat', 'old_category',
                  'new_category', 'new_contract', 'new_delay', 'was_recategorized'];
    const key = keys[colIndex];

    const sorted = [...allResults].sort((a, b) => {
        let va = a[key] || '';
        let vb = b[key] || '';
        if (typeof va === 'boolean') { va = va ? 1 : 0; vb = vb ? 1 : 0; }
        if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
        if (va < vb) return sortAsc ? -1 : 1;
        if (va > vb) return sortAsc ? 1 : -1;
        return 0;
    });

    allResults = sorted;
    filterResults(currentFilter, document.querySelector(`.filter-btn[data-filter="${currentFilter}"]`));

    // Update sort indicators
    document.querySelectorAll('.results-table th').forEach((th, i) => {
        th.classList.toggle('sorted', i === colIndex);
        const icon = th.querySelector('.sort-icon');
        if (icon) icon.textContent = i === colIndex ? (sortAsc ? '↑' : '↓') : '↕';
    });
}

// ============================================
// EXPORT
// ============================================
async function exportResults() {
    if (!currentAnalysisId) return;
    try {
        const res = await fetch(`${API}/api/export/${currentAnalysisId}`, {
            headers: authHeaders()
        });
        if (!res.ok) throw new Error('Erreur lors de l\'export');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ROKIA_resultats_${currentAnalysisId}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (err) {
        showAlert(err.message, 'error');
    }
}

// ============================================
// HISTORY
// ============================================
async function loadHistory() {
    const container = document.getElementById('historyContent');
    try {
        const res = await fetch(`${API}/api/history`, { headers: authHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);

        const clients = data.clients || {};
        if (Object.keys(clients).length === 0) {
            container.innerHTML = '<p class="text-muted text-center mt-3">Aucune analyse enregistrée</p>';
            return;
        }

        let html = '';
        for (const [clientName, analyses] of Object.entries(clients)) {
            html += `<div class="client-group">
                <div class="client-group-title">🏢 ${esc(clientName)}</div>`;

            analyses.forEach(a => {
                const statusBadge = a.status === 'completed'
                    ? '<span class="badge badge-yes">Terminé</span>'
                    : a.status === 'error'
                    ? '<span class="badge badge-error">Erreur</span>'
                    : '<span class="badge badge-status">En cours</span>';

                html += `<div class="history-item" onclick="viewAnalysis(${a.id})">
                    <div class="history-item-info">
                        <h4>COPIL ${esc(a.copil_date)} ${statusBadge}</h4>
                        <p>${esc(a.created_at || '')}</p>
                    </div>
                    <div class="history-item-stats">
                        <div class="history-item-stat">
                            <div class="val">${a.total_tickets}</div>
                            <div class="lbl">Tickets</div>
                        </div>
                        <div class="history-item-stat">
                            <div class="val">${a.recategorized_count}</div>
                            <div class="lbl">Recatégorisés</div>
                        </div>
                        <button class="btn btn-danger btn-sm btn-icon" title="Supprimer"
                                onclick="event.stopPropagation(); deleteAnalysis(${a.id})">🗑</button>
                    </div>
                </div>`;
            });

            html += '</div>';
        }
        container.innerHTML = html;

    } catch (err) {
        container.innerHTML = `<p class="text-muted text-center mt-3">Erreur : ${esc(err.message)}</p>`;
    }
}

async function viewAnalysis(id) {
    showPage('analysis');
    await loadResults(id);
}

async function deleteAnalysis(id) {
    if (!confirm('Supprimer cette analyse ?')) return;
    try {
        await fetch(`${API}/api/history/${id}`, {
            method: 'DELETE', headers: authHeaders()
        });
        loadHistory();
    } catch (e) {
        showAlert('Erreur lors de la suppression', 'error');
    }
}

// ============================================
// UTILITIES
// ============================================
function showAlert(msg, type) {
    const el = document.getElementById('mainAlert');
    el.textContent = msg;
    el.className = `alert alert-${type} show`;
    setTimeout(() => el.classList.remove('show'), 6000);
}

function resetLaunchBtn() {
    const btn = document.getElementById('launchBtn');
    btn.disabled = false;
    btn.innerHTML = '🚀 Lancer l\'analyse IA';
}
