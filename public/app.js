// Notifications State
let notifications = [];
let notificationInterval = null;

// API Configuration
const API_BASE = 'http://localhost:5002/api';

// State Management
let currentUser = null;
let authToken = null;
let currentOrders = [];
let selectedMilestone = null;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is already logged in (SPA dashboard only)
    const savedToken = localStorage.getItem('authToken');
    const savedUser = localStorage.getItem('currentUser');

    // Start notification polling if dashboard is shown
    if (savedToken && savedUser && document.getElementById('dashboard-section')) {
        startNotificationPolling();
    }

    if (savedToken && savedUser && document.getElementById('dashboard-section')) {
        authToken = savedToken;
        currentUser = JSON.parse(savedUser);
        showDashboard();
    }

    // Setup form handlers (guard against missing elements when using EJS views)
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    const createOrderForm = document.getElementById('create-order-form');
    if (createOrderForm) {
        createOrderForm.addEventListener('submit', handleCreateOrder);
    }

    const completeMilestoneForm = document.getElementById('complete-milestone-form');
    if (completeMilestoneForm) {
        completeMilestoneForm.addEventListener('submit', handleCompleteMilestone);
    }

    const addMilestoneBtn = document.getElementById('add-milestone-btn');
    if (addMilestoneBtn) {
        addMilestoneBtn.addEventListener('click', addMilestoneRow);
        renderMilestoneRows();
    }
});

// Helper to load lenders into the SPA create-order modal
async function loadLendersForModal() {
    const select = document.getElementById('modal-lender-id');
    if (!select) return;

    if (!authToken) {
        select.innerHTML = '<option value=\"\">Please login first</option>';
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/lenders`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (res.status === 401) {
            select.innerHTML = '<option value="">Please login first</option>';
            return;
        }
        
        const data = await res.json();
        if (res.ok && data.lenders) {
            select.innerHTML = '<option value=\"\">Select a lender</option>';
            data.lenders.forEach((lender) => {
                const opt = document.createElement('option');
                opt.value = lender.id;
                opt.textContent = `${lender.name} (${lender.email})`;
                select.appendChild(opt);
            });
        } else {
            select.innerHTML = '<option value=\"\">Error loading lenders</option>';
        }
    } catch (err) {
        console.error('Error loading lenders for modal:', err);
        select.innerHTML = '<option value=\"\">Error loading lenders</option>';
    }
}

// Authentication
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    await login(email, password);
}

async function quickLogin(email, password) {
    await login(email, password);
}

async function login(email, password) {
    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        
        if (response.ok) {
            authToken = data.token;
            currentUser = data.user;
            
            // Save to localStorage
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            showDashboard();
        } else {
            document.getElementById('login-error').textContent = data.message || 'Login failed';
        }
    } catch (error) {
        document.getElementById('login-error').textContent = 'Error connecting to server';
        console.error('Login error:', error);
    }
}

function logout() {
    authToken = null;
    currentUser = null;
    currentOrders = [];
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('dashboard-section').style.display = 'none';
    document.getElementById('statistics-section').style.display = 'none';
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('login-error').textContent = '';
}

// Dashboard Display
function showDashboard() {
    startNotificationPolling();
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('dashboard-section').style.display = 'block';
    document.getElementById('statistics-section').style.display = 'none';
    document.getElementById('user-role').textContent = `Role: ${currentUser.role}`;
    
    // Update nav active state
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    document.querySelectorAll('#nav-dashboard').forEach(link => link.classList.add('active'));

    renderActionButtons();
    loadOrders();
    loadNotifications();
}

// Statistics Display
function showStatistics() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('dashboard-section').style.display = 'none';
    document.getElementById('statistics-section').style.display = 'block';
    document.getElementById('user-role-stats').textContent = `Role: ${currentUser.role}`;
    
    // Update nav active state
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    document.querySelectorAll('#nav-statistics').forEach(link => link.classList.add('active'));
    
    loadStatistics();
}

// Notification Polling
function startNotificationPolling() {
    if (notificationInterval) clearInterval(notificationInterval);
    loadNotifications();
    notificationInterval = setInterval(loadNotifications, 10000); // every 10s
}

function stopNotificationPolling() {
    if (notificationInterval) clearInterval(notificationInterval);
}

// Fetch notifications for current user
async function loadNotifications() {
    if (!authToken || !currentUser) return;
    try {
        const res = await fetch(`${API_BASE}/notifications`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            notifications = data.notifications || [];
            renderNotifications();
        } else if (res.status === 401) {
            // User not authenticated, stop polling
            stopNotificationPolling();
            notifications = [];
            renderNotifications();
        } else {
            notifications = [];
            renderNotifications();
        }
    } catch (err) {
        // Silently fail if notifications endpoint is not available
        notifications = [];
        renderNotifications();
    }
}

// Render notifications in dashboard
function renderNotifications() {
    const notifEl = document.getElementById('notifications-panel');
    if (!notifEl) return;
    if (!notifications.length) {
        notifEl.innerHTML = '<p class="empty-state">No notifications.</p>';
        return;
    }
    notifEl.innerHTML = notifications.map(n => `
        <div class="notification-card${n.read ? ' read' : ''}">
            <div class="notif-type">${n.type.replace(/_/g, ' ')}</div>
            <div class="notif-msg">${n.message}</div>
            <div class="notif-date">${new Date(n.createdAt).toLocaleString()}</div>
        </div>
    `).join('');
}

function renderActionButtons() {
    const actionButtons = document.getElementById('action-buttons');
    actionButtons.innerHTML = '';
    
    if (currentUser.role === 'SUPPLIER') {
        actionButtons.innerHTML = `
            <button onclick="openCreateOrderModal()">+ Create Order</button>
        `;
    } else if (currentUser.role === 'ADMIN') {
        actionButtons.innerHTML = `
            <p>Admin can approve orders, complete milestones, and repay orders.</p>
        `;
    } else if (currentUser.role === 'LENDER') {
        actionButtons.innerHTML = `
            <p>Lender can view orders and financing status.</p>
        `;
    }
}

// Orders Management
async function loadOrders() {
    if (!authToken || !currentUser) {
        console.log('Please login to view orders');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/orders`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.status === 401) {
            console.log('Authentication required. Please login.');
            // Clear stale auth data
            localStorage.removeItem('authToken');
            localStorage.removeItem('currentUser');
            authToken = null;
            currentUser = null;
            return;
        }

        if (response.ok) {
            const data = await response.json();
            currentOrders = data.orders || [];
            renderOrders();
            renderAnalyticsDashboard();
        } else {
            console.log('Unable to load orders. Please try again.');
        }
    } catch (error) {
        console.log('Error loading orders. Please check your connection.');
    }
}
// Analytics Dashboard Rendering
function renderAnalyticsDashboard() {
    // Total Orders
    const totalOrders = currentOrders.length;

    // Active Milestones (sum of milestones with status 'PENDING' or 'ACTIVE')
    let activeMilestones = 0;
    let completedMilestones = 0;
    let loanOutstanding = 0;

    currentOrders.forEach(order => {
        if (order.milestones && Array.isArray(order.milestones)) {
            activeMilestones += order.milestones.filter(m => m.status === 'PENDING' || m.status === 'ACTIVE').length;
            completedMilestones += order.milestones.filter(m => m.status === 'COMPLETED').length;
        }
        // Loan Outstanding: sum value of orders not closed
        if (order.status !== 'CLOSED') {
            loanOutstanding += order.value;
        }
    });

    document.getElementById('analytics-total-orders').textContent = totalOrders;
    document.getElementById('analytics-active-milestones').textContent = activeMilestones;
    document.getElementById('analytics-completed-milestones').textContent = completedMilestones;
    document.getElementById('analytics-loan-outstanding').textContent = `$${loanOutstanding.toLocaleString()}`;
}

function renderOrders() {
    const container = document.getElementById('orders-container');
    
    if (currentOrders.length === 0) {
        container.innerHTML = '<p class="empty-state">No orders found. Create an order to get started.</p>';
        return;
    }
    
    container.innerHTML = currentOrders.map(order => `
        <div class="order-card">
            <div class="order-header">
                <h3>${order.order_id}</h3>
                <span class="status-badge status-${order.status.toLowerCase()}">${order.status.replace(/_/g, ' ')}</span>
            </div>
            <div class="order-body">
                <p><strong>Buyer:</strong> ${order.buyer_name}</p>
                <p><strong>Value:</strong> $${order.value.toLocaleString()}</p>
                <p><strong>Delivery:</strong> ${new Date(order.delivery_date).toLocaleDateString()}</p>
                <p><strong>Funds Locked:</strong> ${order.funds_locked ? 'Yes' : 'No'}</p>
            </div>
            <div class="order-actions">
                ${renderOrderActions(order)}
            </div>
            ${order.status !== 'PENDING_VERIFICATION' ? `
                <button onclick="viewOrderDetails('${order.id}')">View Milestones & Transactions</button>
            ` : ''}
        </div>
    `).join('');
}

function renderOrderActions(order) {
    let actions = '';
    
    // ADMIN: Can approve PENDING_VERIFICATION orders
    if (currentUser.role === 'ADMIN' && order.status === 'PENDING_VERIFICATION') {
        actions += `<button onclick="approveOrder('${order.id}')">Approve Order</button>`;
    }
    
    // ADMIN: Can repay COMPLETED orders
    if (currentUser.role === 'ADMIN' && order.status === 'COMPLETED') {
        actions += `<button onclick="repayOrder('${order.id}')" class="btn-success">Repay & Close</button>`;
    }
    
    // Status messages
    if (order.status === 'CLOSED') {
        actions += `<span class="info-text">Order closed - No further actions</span>`;
    }
    
    return actions;
}

async function approveOrder(orderId) {
    if (!confirm('Approve this order? This will lock funds and generate milestones.')) return;
    
    try {
        const response = await fetch(`${API_BASE}/orders/${orderId}/approve`, {
            method: 'PATCH',
            headers: { 
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        
        if (response.ok) {
            alert('Order approved successfully! Milestones generated.');
            refreshOrders();
        } else {
            alert(data.message || 'Failed to approve order');
        }
    } catch (error) {
        alert('Error approving order');
        console.error(error);
    }
}

async function repayOrder(orderId) {
    if (!confirm('Mark this order as REPAID and CLOSE it? This action is final.')) return;
    
    try {
        const response = await fetch(`${API_BASE}/orders/${orderId}/repay`, {
            method: 'PATCH',
            headers: { 
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        
        if (response.ok) {
            alert(`Order closed successfully!\n\nEscrow Summary:\n- Locked: $${data.escrow_summary.total_locked}\n- Released: $${data.escrow_summary.total_released}\n- Balance: $${data.escrow_summary.final_balance}`);
            refreshOrders();
        } else {
            alert(data.message || 'Failed to close order');
        }
    } catch (error) {
        alert('Error closing order');
        console.error(error);
    }
}

function refreshOrders() {
    loadOrders();
}

// Create Order Modal
function openCreateOrderModal() {
    document.getElementById('create-order-modal').style.display = 'flex';
    // Set min date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('delivery-date').setAttribute('min', today);
    // Load lenders into the dropdown if present
    if (typeof loadLendersForModal === 'function') {
        loadLendersForModal();
    }
    renderMilestoneRows();
}

async function handleCreateOrder(e) {
    e.preventDefault();
    
    // Collect milestone data (convert amounts to percentages expected by backend)
    const milestoneRows = document.querySelectorAll('.milestone-row');
    const milestones = [];
    milestoneRows.forEach(row => {
        const name = row.querySelector('.milestone-name').value.trim();
        const amount = parseFloat(row.querySelector('.milestone-amount').value);
        if (name && !isNaN(amount)) {
            milestones.push({ name, amount });
        }
    });

    const orderValue = parseFloat(document.getElementById('order-value').value);
    if (isNaN(orderValue) || orderValue <= 0) {
        createOrderErrorEl.textContent = 'Order value must be a positive number.';
        return;
    }

    // Basic client-side validation: ensure milestone amounts sum to order value
    const totalMilestoneAmount = milestones.reduce((sum, m) => sum + m.amount, 0);
    const createOrderErrorEl = document.getElementById('create-order-error');

    if (totalMilestoneAmount !== orderValue) {
        createOrderErrorEl.textContent = `Sum of milestone amounts ($${totalMilestoneAmount}) must equal order value ($${orderValue}).`;
        return;
    } else {
        createOrderErrorEl.textContent = '';
    }

    // Lender selection validation
    const lenderSelect = document.getElementById('modal-lender-id');
    if (!lenderSelect || !lenderSelect.value) {
        createOrderErrorEl.textContent = 'Please select a lender.';
        return;
    }

    // Convert to percentages for backend
    const milestonesWithPct = milestones.map(m => ({
        name: m.name,
        percentage: Number(((m.amount / orderValue) * 100).toFixed(2))
    }));

    const orderData = {
        order_id: document.getElementById('order-id').value,
        buyer_name: document.getElementById('buyer-name').value,
        value: orderValue,
        delivery_date: document.getElementById('delivery-date').value,
        lender_id: lenderSelect.value,
        milestones: milestonesWithPct
    };
    
    try {
        const response = await fetch(`${API_BASE}/orders`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(orderData)
        });

        const data = await response.json();
        
        if (response.ok) {
            alert('Order created successfully!');
            closeModal('create-order-modal');
            document.getElementById('create-order-form').reset();
            renderMilestoneRows();
            refreshOrders();
        } else {
            document.getElementById('create-order-error').textContent = data.message || 'Failed to create order';
        }
    } catch (error) {
        document.getElementById('create-order-error').textContent = 'Error creating order';
        console.error(error);
    }
}

// Milestone UI helpers
function renderMilestoneRows() {
    const milestoneList = document.getElementById('milestone-list');
    milestoneList.innerHTML = '';
    // Start with one row if none exist
    if (!window.milestoneRowsState || window.milestoneRowsState.length === 0) {
        window.milestoneRowsState = [ { name: '', amount: '' } ];
    }
    window.milestoneRowsState.forEach((milestone, idx) => {
        const row = document.createElement('div');
        row.className = 'milestone-row';
        row.innerHTML = `
            <input type="text" class="milestone-name" placeholder="Milestone name" value="${milestone.name || ''}" required> 
            <input type="number" class="milestone-amount" placeholder="Amount" value="${milestone.amount || ''}" min="1" required> 
            <button type="button" class="remove-milestone-btn" data-idx="${idx}">Remove</button>
        `;
        row.querySelector('.remove-milestone-btn').onclick = function() {
            window.milestoneRowsState.splice(idx, 1);
            renderMilestoneRows();
        };
        // Keep state in sync with user input to avoid clearing values when adding rows
        row.querySelector('.milestone-name').addEventListener('input', function () {
            window.milestoneRowsState[idx].name = this.value;
        });
        row.querySelector('.milestone-amount').addEventListener('input', function () {
            const val = parseFloat(this.value);
            window.milestoneRowsState[idx].amount = isNaN(val) ? '' : val;
        });
        milestoneList.appendChild(row);
    });
}

function addMilestoneRow() {
    if (!window.milestoneRowsState) window.milestoneRowsState = [];
    window.milestoneRowsState.push({ name: '', amount: '' });
    renderMilestoneRows();
}

// Order Details & Milestones
async function viewOrderDetails(orderId) {
    try {
        // Fetch milestones
        const milestonesResponse = await fetch(`${API_BASE}/orders/${orderId}/milestones`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        // Fetch transactions
        const transactionsResponse = await fetch(`${API_BASE}/transactions/order/${orderId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (milestonesResponse.ok && transactionsResponse.ok) {
            const milestonesData = await milestonesResponse.json();
            const transactionsData = await transactionsResponse.json();
            
            renderOrderDetailsModal(orderId, milestonesData, transactionsData);
        } else {
            alert('Failed to load order details');
        }
    } catch (error) {
        alert('Error loading order details');
        console.error(error);
    }
}

function renderOrderDetailsModal(orderId, milestonesData, transactionsData) {
    const content = document.getElementById('order-details-content');
    const milestones = milestonesData.milestones || [];
    const transactions = transactionsData.transactions || [];
    const summary = milestonesData.summary || { 
        total_milestones: 0, 
        completed: 0, 
        pending: 0, 
        locked: 0 
    };
    
    content.innerHTML = `
        <div class="details-section">
            <h3>Milestones (${summary.total_milestones})</h3>
            <p><strong>Completed:</strong> ${summary.completed} | 
               <strong>Pending:</strong> ${summary.pending} | 
               <strong>Locked:</strong> ${summary.locked}</p>
            
            ${milestones.map(m => `
                <div class="milestone-card">
                    <div class="milestone-header">
                        <strong>${m.name}</strong>
                        <span class="status-badge status-${m.status.toLowerCase()}">${m.status.replace(/_/g, ' ')}</span>
                    </div>
                    <p>Amount: $${m.amount.toLocaleString()} (${m.percentage}%)</p>
                    <p>Released: $${m.released_amount.toLocaleString()}</p>
                    ${m.proof ? `<p><em>Proof: ${m.proof}</em></p>` : ''}
                    ${m.status === 'PENDING' ? `
                        <button onclick="openCompleteMilestoneModal('${m.id}', '${m.name}', ${m.amount})">
                            Complete Milestone
                        </button>
                    ` : ''}
                </div>
            `).join('')}
        </div>
        
        <div class="details-section">
            <h3>Transactions</h3>
            <p><strong>Total Locked:</strong> $${transactionsData.summary.total_locked.toLocaleString()} | 
               <strong>Total Released:</strong> $${transactionsData.summary.total_released.toLocaleString()} | 
               <strong>Balance:</strong> $${transactionsData.summary.escrow_balance.toLocaleString()}</p>
            
            ${transactions.map(t => `
                <div class="transaction-item">
                    <span class="tx-type tx-${t.type.toLowerCase()}">${t.type.replace(/_/g, ' ')}</span>
                    <span>$${t.amount.toLocaleString()}</span>
                    <span class="tx-date">${new Date(t.createdAt).toLocaleString()}</span>
                    <p class="tx-desc">${t.description}</p>
                </div>
            `).join('')}
        </div>
    `;
    
    document.getElementById('order-details-modal').style.display = 'flex';
}

// Complete Milestone Modal
function openCompleteMilestoneModal(milestoneId, milestoneName, milestoneAmount) {
    selectedMilestone = { id: milestoneId, name: milestoneName, amount: milestoneAmount };
    
    document.getElementById('milestone-info').innerHTML = `
        <p><strong>Milestone:</strong> ${milestoneName}</p>
        <p><strong>Amount:</strong> $${milestoneAmount.toLocaleString()}</p>
    `;
    
    document.getElementById('complete-milestone-modal').style.display = 'flex';
}

async function handleCompleteMilestone(e) {
    e.preventDefault();
    
    const proof = document.getElementById('milestone-proof').value;
    
    try {
        const response = await fetch(`${API_BASE}/milestones/${selectedMilestone.id}/complete`, {
            method: 'PATCH',
            headers: { 
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ proof })
        });

        const data = await response.json();
        
        if (response.ok) {
            alert(`Milestone completed successfully!\n\nReleased: $${data.milestone.released_amount}\n\n${data.next_milestone.message}`);
            closeModal('complete-milestone-modal');
            closeModal('order-details-modal');
            document.getElementById('complete-milestone-form').reset();
            refreshOrders();
        } else {
            document.getElementById('complete-milestone-error').textContent = data.message || 'Failed to complete milestone';
        }
    } catch (error) {
        document.getElementById('complete-milestone-error').textContent = 'Error completing milestone';
        console.error(error);
    }
}

// Modal Management
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    // Clear any error messages
    const errorElements = document.querySelectorAll(`#${modalId} .error`);
    errorElements.forEach(el => el.textContent = '');
}

function openNotificationsModal() {
    loadNotifications();
    document.getElementById('notifications-modal').style.display = 'flex';
}

// Close modal when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}

// Statistics Functions
async function loadStatistics() {
    try {
        // Load all orders and transactions
        const ordersResponse = await fetch(`${API_BASE}/orders`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (!ordersResponse.ok) {
            console.error('Failed to load statistics');
            return;
        }
        
        const ordersData = await ordersResponse.json();
        const orders = ordersData.orders || [];
        
        // Calculate overall statistics
        const stats = calculateStatistics(orders);
        renderStatistics(stats);
        
        // Load role-specific stats
        renderRoleSpecificStats(orders);
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

function calculateStatistics(orders) {
    const stats = {
        totalOrders: orders.length,
        totalValue: 0,
        statusBreakdown: {},
        totalMilestones: 0,
        completedMilestones: 0,
        pendingMilestones: 0,
        lockedMilestones: 0,
        totalTransactions: 0,
        fundsLocked: 0,
        fundsReleased: 0,
        escrowBalance: 0
    };
    
    orders.forEach(order => {
        stats.totalValue += order.value || 0;
        
        // Status breakdown
        const status = order.status || 'UNKNOWN';
        stats.statusBreakdown[status] = (stats.statusBreakdown[status] || 0) + 1;
        
        // Milestone stats
        if (order.milestones && Array.isArray(order.milestones)) {
            stats.totalMilestones += order.milestones.length;
            order.milestones.forEach(m => {
                if (m.status === 'COMPLETED') stats.completedMilestones++;
                else if (m.status === 'PENDING') stats.pendingMilestones++;
                else if (m.status === 'LOCKED') stats.lockedMilestones++;
                
                stats.fundsReleased += m.released_amount || 0;
            });
        }
        
        // Financial stats
        if (order.funds_locked && order.status !== 'CLOSED') {
            stats.fundsLocked += order.value || 0;
        }
    });
    
    stats.escrowBalance = stats.fundsLocked - stats.fundsReleased;
    stats.avgOrderValue = stats.totalOrders > 0 ? stats.totalValue / stats.totalOrders : 0;
    
    return stats;
}

function renderStatistics(stats) {
    // Overall stats
    document.getElementById('stats-total-orders').textContent = stats.totalOrders;
    document.getElementById('stats-orders-breakdown').textContent = 
        `${Object.keys(stats.statusBreakdown).length} different statuses`;
    
    document.getElementById('stats-total-value').textContent = 
        `$${stats.totalValue.toLocaleString()}`;
    document.getElementById('stats-value-breakdown').textContent = 
        `Avg: $${Math.round(stats.avgOrderValue).toLocaleString()} per order`;
    
    document.getElementById('stats-total-milestones').textContent = stats.totalMilestones;
    document.getElementById('stats-milestone-breakdown').textContent = 
        `Complete: ${stats.completedMilestones} | Pending: ${stats.pendingMilestones} | Locked: ${stats.lockedMilestones}`;
    
    document.getElementById('stats-total-transactions').textContent = 
        stats.totalMilestones + stats.totalOrders;
    document.getElementById('stats-transaction-breakdown').textContent = 
        `${stats.totalOrders} locks + ${stats.completedMilestones} releases`;
    
    // Financial overview
    document.getElementById('stats-funds-locked').textContent = 
        `$${stats.fundsLocked.toLocaleString()}`;
    document.getElementById('stats-funds-released').textContent = 
        `$${stats.fundsReleased.toLocaleString()}`;
    document.getElementById('stats-escrow-balance').textContent = 
        `$${stats.escrowBalance.toLocaleString()}`;
    document.getElementById('stats-avg-order').textContent = 
        `$${Math.round(stats.avgOrderValue).toLocaleString()}`;
    
    // Status breakdown chart
    renderStatusChart(stats.statusBreakdown);
}

function renderStatusChart(breakdown) {
    const container = document.getElementById('stats-status-chart');
    container.innerHTML = Object.entries(breakdown)
        .sort((a, b) => b[1] - a[1])
        .map(([status, count]) => `
            <div class="status-item-compact">
                <div class="status-label">${status.replace(/_/g, ' ')}</div>
                <div class="status-count">${count}</div>
            </div>
        `).join('');
    
    // Render visual charts
    renderDonutChart(breakdown);
    renderFinancialBarChart();
    renderMilestoneProgressChart();
}

function renderDonutChart(breakdown) {
    const container = document.getElementById('status-donut-chart');
    const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
    const colors = ['#ff8a33', '#ff6b1a', '#ffa04d', '#ffb366', '#ffc280'];
    
    let cumulativePercent = 0;
    const segments = Object.entries(breakdown)
        .sort((a, b) => b[1] - a[1])
        .map(([status, count], i) => {
            const percent = (count / total) * 100;
            const segment = {
                status: status.replace(/_/g, ' '),
                count,
                percent: percent.toFixed(1),
                color: colors[i % colors.length],
                offset: cumulativePercent
            };
            cumulativePercent += percent;
            return segment;
        });
    
    container.innerHTML = `
        <svg viewBox="0 0 200 200" class="donut-svg">
            <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(255,138,51,0.1)" stroke-width="40"/>
            ${segments.map(seg => {
                const angle = (seg.percent / 100) * 360;
                const startAngle = (seg.offset / 100) * 360 - 90;
                const endAngle = startAngle + angle;
                const largeArc = angle > 180 ? 1 : 0;
                
                const x1 = 100 + 80 * Math.cos(startAngle * Math.PI / 180);
                const y1 = 100 + 80 * Math.sin(startAngle * Math.PI / 180);
                const x2 = 100 + 80 * Math.cos(endAngle * Math.PI / 180);
                const y2 = 100 + 80 * Math.sin(endAngle * Math.PI / 180);
                
                return `
                    <path d="M 100 100 L ${x1} ${y1} A 80 80 0 ${largeArc} 1 ${x2} ${y2} Z" 
                          fill="${seg.color}" opacity="0.8"/>
                `;
            }).join('')}
            <circle cx="100" cy="100" r="50" fill="#0a0a0a"/>
            <text x="100" y="95" text-anchor="middle" fill="#ff8a33" font-size="28" font-weight="700">${total}</text>
            <text x="100" y="115" text-anchor="middle" fill="#888" font-size="12">Orders</text>
        </svg>
        <div class="chart-legend">
            ${segments.map(seg => `
                <div class="legend-item">
                    <span class="legend-color" style="background: ${seg.color}"></span>
                    <span class="legend-text">${seg.status}</span>
                    <span class="legend-value">${seg.count} (${seg.percent}%)</span>
                </div>
            `).join('')}
        </div>
    `;
}

function renderFinancialBarChart() {
    const container = document.getElementById('financial-bar-chart');
    const locked = parseFloat(document.getElementById('stats-funds-locked').textContent.replace(/[$,]/g, '')) || 0;
    const released = parseFloat(document.getElementById('stats-funds-released').textContent.replace(/[$,]/g, '')) || 0;
    const escrow = parseFloat(document.getElementById('stats-escrow-balance').textContent.replace(/[$,]/g, '')) || 0;
    
    const max = Math.max(locked, released, escrow, 1);
    
    container.innerHTML = `
        <div class="bar-chart-container">
            <div class="bar-item">
                <div class="bar-label">Locked</div>
                <div class="bar-wrapper">
                    <div class="bar-fill" style="width: ${(locked/max)*100}%">
                        <span class="bar-value">$${locked.toLocaleString()}</span>
                    </div>
                </div>
            </div>
            <div class="bar-item">
                <div class="bar-label">Released</div>
                <div class="bar-wrapper">
                    <div class="bar-fill" style="width: ${(released/max)*100}%; background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);">
                        <span class="bar-value">$${released.toLocaleString()}</span>
                    </div>
                </div>
            </div>
            <div class="bar-item">
                <div class="bar-label">Escrow</div>
                <div class="bar-wrapper">
                    <div class="bar-fill" style="width: ${(escrow/max)*100}%; background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);">
                        <span class="bar-value">$${escrow.toLocaleString()}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderMilestoneProgressChart() {
    const container = document.getElementById('milestone-progress-chart');
    const completed = parseInt(document.getElementById('stats-milestone-breakdown').textContent.match(/Complete: (\d+)/)?.[1] || 0);
    const pending = parseInt(document.getElementById('stats-milestone-breakdown').textContent.match(/Pending: (\d+)/)?.[1] || 0);
    const locked = parseInt(document.getElementById('stats-milestone-breakdown').textContent.match(/Locked: (\d+)/)?.[1] || 0);
    const total = completed + pending + locked;
    
    const completedPercent = total > 0 ? (completed / total) * 100 : 0;
    const pendingPercent = total > 0 ? (pending / total) * 100 : 0;
    const lockedPercent = total > 0 ? (locked / total) * 100 : 0;
    
    container.innerHTML = `
        <div class="progress-ring-container">
            <svg viewBox="0 0 200 200" class="progress-svg">
                <circle cx="100" cy="100" r="85" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="30"/>
                <circle cx="100" cy="100" r="85" fill="none" stroke="#22c55e" stroke-width="30" 
                        stroke-dasharray="${completedPercent * 5.34} 534" 
                        stroke-dashoffset="0" 
                        transform="rotate(-90 100 100)"
                        stroke-linecap="round"/>
                <circle cx="100" cy="100" r="85" fill="none" stroke="#fbbf24" stroke-width="30" 
                        stroke-dasharray="${pendingPercent * 5.34} 534" 
                        stroke-dashoffset="${-completedPercent * 5.34}" 
                        transform="rotate(-90 100 100)"
                        stroke-linecap="round"/>
                <circle cx="100" cy="100" r="85" fill="none" stroke="#6b7280" stroke-width="30" 
                        stroke-dasharray="${lockedPercent * 5.34} 534" 
                        stroke-dashoffset="${-(completedPercent + pendingPercent) * 5.34}" 
                        transform="rotate(-90 100 100)"
                        stroke-linecap="round"/>
                <text x="100" y="95" text-anchor="middle" fill="#ff8a33" font-size="32" font-weight="700">${total}</text>
                <text x="100" y="120" text-anchor="middle" fill="#888" font-size="14">Total Milestones</text>
            </svg>
            <div class="progress-stats">
                <div class="progress-stat">
                    <span class="progress-dot" style="background: #22c55e"></span>
                    <span class="progress-label">Completed</span>
                    <span class="progress-value">${completed}</span>
                </div>
                <div class="progress-stat">
                    <span class="progress-dot" style="background: #fbbf24"></span>
                    <span class="progress-label">Pending</span>
                    <span class="progress-value">${pending}</span>
                </div>
                <div class="progress-stat">
                    <span class="progress-dot" style="background: #6b7280"></span>
                    <span class="progress-label">Locked</span>
                    <span class="progress-value">${locked}</span>
                </div>
            </div>
        </div>
    `;
}

function renderRoleSpecificStats(orders) {
    const container = document.getElementById('role-stats-content');
    
    if (currentUser.role === 'ADMIN') {
        const pendingApprovals = orders.filter(o => o.status === 'PENDING_VERIFICATION').length;
        const completedOrders = orders.filter(o => o.status === 'COMPLETED').length;
        const closedOrders = orders.filter(o => o.status === 'CLOSED').length;
        
        container.innerHTML = `
            <div class="role-stat-item">
                <h4>Pending Approvals</h4>
                <p><strong>${pendingApprovals}</strong> orders awaiting verification</p>
            </div>
            <div class="role-stat-item">
                <h4>Completed Orders</h4>
                <p><strong>${completedOrders}</strong> orders ready for repayment</p>
            </div>
            <div class="role-stat-item">
                <h4>Closed Orders</h4>
                <p><strong>${closedOrders}</strong> orders fully processed and closed</p>
            </div>
        `;
    } else if (currentUser.role === 'SUPPLIER') {
        const myOrders = orders.filter(o => o.supplier_id === currentUser.id);
        const myValue = myOrders.reduce((sum, o) => sum + (o.value || 0), 0);
        const activeMilestones = myOrders.reduce((sum, o) => 
            sum + (o.milestones?.filter(m => m.status === 'PENDING').length || 0), 0);
        
        container.innerHTML = `
            <div class="role-stat-item">
                <h4>My Orders</h4>
                <p><strong>${myOrders.length}</strong> orders created</p>
            </div>
            <div class="role-stat-item">
                <h4>Total Value</h4>
                <p><strong>$${myValue.toLocaleString()}</strong> in order value</p>
            </div>
            <div class="role-stat-item">
                <h4>Active Milestones</h4>
                <p><strong>${activeMilestones}</strong> milestones ready to complete</p>
            </div>
        `;
    } else if (currentUser.role === 'LENDER') {
        const fundedOrders = orders.filter(o => o.lender_id === currentUser.id && o.funds_locked);
        const totalFunded = fundedOrders.reduce((sum, o) => sum + (o.value || 0), 0);
        const activeLoans = fundedOrders.filter(o => o.status !== 'CLOSED').length;
        
        container.innerHTML = `
            <div class="role-stat-item">
                <h4>Funded Orders</h4>
                <p><strong>${fundedOrders.length}</strong> orders financed</p>
            </div>
            <div class="role-stat-item">
                <h4>Total Funded</h4>
                <p><strong>$${totalFunded.toLocaleString()}</strong> in financing</p>
            </div>
            <div class="role-stat-item">
                <h4>Active Loans</h4>
                <p><strong>${activeLoans}</strong> loans currently outstanding</p>
            </div>
        `;
    }
}
