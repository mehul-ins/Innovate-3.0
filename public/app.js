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
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('login-error').textContent = '';
}

// Dashboard Display
function showDashboard() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('dashboard-section').style.display = 'block';
    document.getElementById('user-role').textContent = `Role: ${currentUser.role}`;
    
    renderActionButtons();
    loadOrders();
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
    try {
        const response = await fetch(`${API_BASE}/orders`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            const data = await response.json();
            currentOrders = data.orders || [];
            renderOrders();
        } else {
            console.error('Failed to load orders');
        }
    } catch (error) {
        console.error('Error loading orders:', error);
    }
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
                <span class="status-badge status-${order.status.toLowerCase()}">${order.status}</span>
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
        actions += `<button onclick="approveOrder('${order.id}')">✓ Approve Order</button>`;
    }
    
    // ADMIN: Can repay COMPLETED orders
    if (currentUser.role === 'ADMIN' && order.status === 'COMPLETED') {
        actions += `<button onclick="repayOrder('${order.id}')" class="btn-success">💰 Repay & Close</button>`;
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
            <input type="text" class="milestone-name" placeholder="Milestone name" value="${milestone.name || ''}" required style="width: 40%"> 
            <input type="number" class="milestone-amount" placeholder="Amount" value="${milestone.amount || ''}" min="1" required style="width: 30%"> 
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
    
    content.innerHTML = `
        <div class="details-section">
            <h3>Milestones (${milestonesData.summary.total_milestones})</h3>
            <p><strong>Completed:</strong> ${milestonesData.summary.completed_milestones} | 
               <strong>Pending:</strong> ${milestonesData.summary.pending_milestones} | 
               <strong>Locked:</strong> ${milestonesData.summary.locked_milestones}</p>
            
            ${milestones.map(m => `
                <div class="milestone-card">
                    <div class="milestone-header">
                        <strong>${m.name}</strong>
                        <span class="status-badge status-${m.status.toLowerCase()}">${m.status}</span>
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
                    <span class="tx-type tx-${t.type.toLowerCase()}">${t.type}</span>
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

// Close modal when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}
