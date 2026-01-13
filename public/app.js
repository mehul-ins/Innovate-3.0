// API Configuration
const API_BASE = 'http://localhost:5002/api';

// State Management
let currentUser = null;
let authToken = null;
let currentOrders = [];
let selectedMilestone = null;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is already logged in
    const savedToken = localStorage.getItem('authToken');
    const savedUser = localStorage.getItem('currentUser');
    
    if (savedToken && savedUser) {
        authToken = savedToken;
        currentUser = JSON.parse(savedUser);
        showDashboard();
    }

    // Setup form handlers
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('create-order-form').addEventListener('submit', handleCreateOrder);
    document.getElementById('complete-milestone-form').addEventListener('submit', handleCompleteMilestone);
});

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
}

async function handleCreateOrder(e) {
    e.preventDefault();
    
    const orderData = {
        order_id: document.getElementById('order-id').value,
        buyer_name: document.getElementById('buyer-name').value,
        value: parseFloat(document.getElementById('order-value').value),
        delivery_date: document.getElementById('delivery-date').value
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
            refreshOrders();
        } else {
            document.getElementById('create-order-error').textContent = data.message || 'Failed to create order';
        }
    } catch (error) {
        document.getElementById('create-order-error').textContent = 'Error creating order';
        console.error(error);
    }
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
