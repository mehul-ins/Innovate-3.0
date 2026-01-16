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
let currentOrderInModal = null; // Track order being viewed in details modal
let currentMilestoneIdForProof = null; // Track milestone for proof upload

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

    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignup);
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
    
    // Check if quick login role is selected
    const roleSelector = document.getElementById('role-selector');
    const role = roleSelector ? roleSelector.value : '';
    
    if (role) {
        // Use quick login credentials
        const credentials = {
            admin: { email: 'admin@test.com', password: 'password123' },
            supplier: { email: 'supplier@test.com', password: 'password123' },
            lender: { email: 'lender@test.com', password: 'password123' }
        };
        const { email, password } = credentials[role];
        await login(email, password);
    } else {
        // Use manual login credentials
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        if (!email || !password) {
            document.getElementById('login-error').textContent = 'Please enter email and password or select a role';
            return;
        }
        
        await login(email, password);
    }
}

async function quickLogin(email, password) {
    await login(email, password);
}

async function quickLoginByRole() {
    const roleSelector = document.getElementById('role-selector');
    const role = roleSelector.value;
    
    if (!role) {
        alert('Please select a role');
        return;
    }
    
    const credentials = {
        admin: { email: 'admin@test.com', password: 'password123' },
        supplier: { email: 'supplier@test.com', password: 'password123' },
        lender: { email: 'lender@test.com', password: 'password123' }
    };
    
    const { email, password } = credentials[role];
    await login(email, password);
}

async function login(email, password) {
    try {
        console.log('Attempting login with:', email);
        console.log('API URL:', `${API_BASE}/auth/login`);
        
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', data);
        
        if (response.ok) {
            authToken = data.token;
            currentUser = data.user;
            
            // Save to localStorage
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            showDashboard();
        } else {
            const errorMsg = data.message || 'Login failed';
            console.error('Login failed:', errorMsg);
            document.getElementById('login-error').textContent = errorMsg;
        }
    } catch (error) {
        console.error('Login error:', error);
        document.getElementById('login-error').textContent = 'Error connecting to server: ' + error.message;
    }
}

// Signup Handler
async function handleSignup(e) {
    e.preventDefault();
    
    const errorDiv = document.getElementById('signup-error');
    errorDiv.textContent = '';
    
    // Get form values
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;
    
    // Validate password match
    if (password !== confirmPassword) {
        errorDiv.textContent = 'Passwords do not match';
        return;
    }
    
    // Validate terms acceptance
    if (!document.getElementById('signup-terms').checked ||
        !document.getElementById('signup-verify').checked ||
        !document.getElementById('signup-kyc').checked) {
        errorDiv.textContent = 'Please accept all terms and conditions';
        return;
    }
    
    // Prepare signup data
    const signupData = {
        name: document.getElementById('signup-name').value,
        email: document.getElementById('signup-email').value,
        password: password,
        phone: document.getElementById('signup-phone').value,
        role: document.getElementById('signup-role').value,
        businessName: document.getElementById('signup-business-name').value,
        businessType: document.getElementById('signup-business-type').value,
        taxId: document.getElementById('signup-tax-id').value,
        businessRegistrationNumber: document.getElementById('signup-registration-number').value,
        address: {
            street: document.getElementById('signup-street').value,
            city: document.getElementById('signup-city').value,
            state: document.getElementById('signup-state').value,
            pincode: document.getElementById('signup-pincode').value,
            country: document.getElementById('signup-country').value
        },
        bankDetails: {
            accountNumber: document.getElementById('signup-account-number').value,
            ifscCode: document.getElementById('signup-ifsc').value,
            bankName: document.getElementById('signup-bank-name').value,
            accountHolderName: document.getElementById('signup-account-holder').value
        }
    };
    
    try {
        const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(signupData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('Account created successfully! Please login with your credentials.');
            window.location.href = '/';
        } else {
            errorDiv.textContent = data.message || 'Signup failed. Please try again.';
        }
    } catch (error) {
        console.error('Signup error:', error);
        errorDiv.textContent = 'Error connecting to server. Please try again.';
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
    
    // Show/hide admin panel
    const adminPanel = document.getElementById('admin-all-orders-panel');
    if (adminPanel) {
        adminPanel.style.display = currentUser.role === 'ADMIN' ? 'block' : 'none';
    }
    
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
            headers: { 
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 401) {
            console.log('Authentication required. Session may have expired. Please login again.');
            // Clear stale auth data and show login
            localStorage.removeItem('authToken');
            localStorage.removeItem('currentUser');
            authToken = null;
            currentUser = null;
            currentOrders = [];
            
            // Show login section
            document.getElementById('login-section').style.display = 'block';
            document.getElementById('dashboard-section').style.display = 'none';
            document.getElementById('statistics-section').style.display = 'none';
            return;
        }

        if (response.ok) {
            const data = await response.json();
            currentOrders = data.orders || [];
            renderOrders();
            renderAnalyticsDashboard();
            
            // Render admin all orders section if user is admin
            if (currentUser && currentUser.role === 'ADMIN') {
                renderAdminAllOrders();
            }
            
            // Render supplier detailed orders if user is supplier
            if (currentUser && currentUser.role === 'SUPPLIER') {
                renderSupplierDetailedOrders();
            }
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
    
    if (!container) return;
    
    if (currentOrders.length === 0) {
        container.innerHTML = '<p class="empty-state">No orders found. Create an order to get started.</p>';
        return;
    }
    
    container.innerHTML = currentOrders.map(order => `
        <div class="order-card">
            <div class="order-header">
                <h3>${order.order_id}</h3>
                <span class="status-badge status-${order.status.toLowerCase().replace(/_/g, '-')}">${order.status.replace(/_/g, ' ')}</span>
            </div>
            <div class="order-body">
                <p><strong>Buyer:</strong> ${order.buyer_name}</p>
                <p><strong>Value:</strong> $${order.value.toLocaleString()}</p>
                <p><strong>Delivery:</strong> ${new Date(order.delivery_date).toLocaleDateString()}</p>
                <p><strong>Funds Locked:</strong> ${order.funds_locked ? 'Yes' : 'No'}</p>
            </div>
            <div class="order-actions" style="display: flex; flex-direction: column; gap: 0.75rem;">
                <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                    ${renderOrderActions(order)}
                </div>
                <button onclick="viewOrderDetails('${order.id}')" style="width: 100%;">View Milestones & Transactions</button>
            </div>
        </div>
    `).join('');
}

// Admin Complete Order Details View
async function renderAdminAllOrders() {
    console.log('=== renderAdminAllOrders called ===');
    const container = document.getElementById('admin-all-orders');
    console.log('Container found:', container);
    console.log('Current user:', currentUser);
    console.log('Current orders:', currentOrders.length);
    
    if (!container) {
        console.error('admin-all-orders container not found!');
        return;
    }
    
    if (!currentUser || currentUser.role !== 'ADMIN') {
        console.error('User is not admin');
        return;
    }
    
    if (currentOrders.length === 0) {
        container.innerHTML = '<p class="empty-state">No orders found.</p>';
        return;
    }
    
    console.log('Rendering admin order cards...');
    const cards = await Promise.all(currentOrders.map(async order => await renderAdminOrderCard(order)));
    container.innerHTML = `
        <div style="margin-bottom: 1rem;">
            <p style="color: #666; font-size: 0.9rem;">Showing all orders with complete timeline and milestone progress</p>
        </div>
        ${cards.join('')}
    `;
    console.log('Admin order cards rendered successfully');
}

async function renderAdminOrderCard(order) {
    // Fetch milestones and transactions for this order
    const milestonesResponse = await fetch(`${API_BASE}/orders/${order.id}/milestones`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const milestonesData = await milestonesResponse.json();
    const milestones = milestonesData.milestones || [];
    const summary = milestonesData.summary || { total_milestones: 0, completed: 0, pending: 0, locked: 0 };
    
    // Debug: Log milestone data to see if proof is included
    console.log('=== ADMIN DASHBOARD MILESTONE DATA ===');
    console.log('Order ID:', order.id);
    console.log('Milestones count:', milestones.length);
    console.log('Summary:', summary);
    console.log('Completed milestones:', summary.completed);
    milestones.forEach((m, idx) => {
        console.log(`Milestone ${idx}:`, m.name, 'status:', m.status, 'amount:', m.amount, 'has proof:', !!m.proof, 'proof status:', m.proof ? m.proof.status : 'N/A');
        if (m.proof) {
            console.log('  Proof details:', JSON.stringify(m.proof, null, 2));
        }
    });
    
    const transactionsResponse = await fetch(`${API_BASE}/orders/${order.id}/transactions`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const transactionsData = await transactionsResponse.json();
    const transactions = transactionsData.transactions || [];
    
    return `
        <div class="order-card-detailed" style="border: 2px solid rgba(255, 138, 51, 0.3); border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; background: rgba(26, 26, 26, 0.8);">
            <!-- Order Header -->
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 2px solid rgba(255, 138, 51, 0.2);">
                <div>
                    <h3 style="margin: 0 0 0.5rem 0; font-size: 1.3rem; color: #ff8a33;">${order.order_id}</h3>
                    <p style="margin: 0; color: #b8b8b8;"><strong>Buyer:</strong> ${order.buyer_name}</p>
                    <p style="margin: 0; color: #b8b8b8;"><strong>Value:</strong> $${order.value.toLocaleString()}</p>
                    <p style="margin: 0; color: #b8b8b8;"><strong>Delivery:</strong> ${new Date(order.delivery_date).toLocaleDateString()}</p>
                </div>
                <div style="text-align: right;">
                    <span class="status-badge status-${order.status.toLowerCase().replace(/_/g, '-')}" style="display: inline-block; padding: 0.5rem 1rem; border-radius: 4px; font-weight: 600; margin-bottom: 0.5rem;">
                        ${order.status.replace(/_/g, ' ')}
                    </span>
                    <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem; color: ${order.funds_locked ? '#4caf50' : '#999'};">
                        ${order.funds_locked ? `Funds Locked (Milestone ${order.current_unlocked_milestone} available)` : 'Funds Not Locked'}
                    </p>
                </div>
            </div>
            
            <!-- Timeline & Progress -->
            <div style="margin-bottom: 1rem;">
                <h4 style="margin: 0 0 0.75rem 0; font-size: 1.1rem; color: #ff8a33; font-weight: 700;">Order Timeline</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                    <div style="padding: 0.75rem; background: ${order.status === 'PENDING_LENDER_APPROVAL' ? 'rgba(255, 193, 7, 0.15)' : 'rgba(76, 175, 80, 0.15)'}; border-radius: 4px;">
                        <div style="font-size: 0.85rem; color: #b8b8b8; font-weight: 500;">Step 1: Lender Approval</div>
                        <div style="font-weight: 700; margin-top: 0.25rem; color: ${order.status === 'PENDING_LENDER_APPROVAL' ? '#ffc107' : '#4caf50'};">${order.status === 'PENDING_LENDER_APPROVAL' ? 'Pending' : 'Approved'}</div>
                    </div>
                    <div style="padding: 0.75rem; background: ${order.funds_locked ? 'rgba(76, 175, 80, 0.15)' : 'rgba(155, 155, 155, 0.15)'}; border-radius: 4px;">
                        <div style="font-size: 0.85rem; color: #b8b8b8; font-weight: 500;">Step 2: Admin Lock Funds</div>
                        <div style="font-weight: 700; margin-top: 0.25rem; color: ${order.funds_locked ? '#4caf50' : '#999'};">${order.funds_locked ? 'Locked' : 'Pending'}</div>
                    </div>
                    <div style="padding: 0.75rem; background: ${summary.completed > 0 ? 'rgba(76, 175, 80, 0.15)' : 'rgba(155, 155, 155, 0.15)'}; border-radius: 4px;">
                        <div style="font-size: 0.85rem; color: #b8b8b8; font-weight: 500;">Step 3: Milestones</div>
                        <div style="font-weight: 700; margin-top: 0.25rem; color: ${summary.completed > 0 ? '#4caf50' : '#999'};">${summary.completed}/${summary.total_milestones} Completed</div>
                    </div>
                    <div style="padding: 0.75rem; background: ${order.status === 'COMPLETED' || order.status === 'CLOSED' ? 'rgba(76, 175, 80, 0.15)' : 'rgba(155, 155, 155, 0.15)'}; border-radius: 4px;">
                        <div style="font-size: 0.85rem; color: #b8b8b8; font-weight: 500;">Step 4: Order Status</div>
                        <div style="font-weight: 700; margin-top: 0.25rem; color: ${order.status === 'COMPLETED' ? '#4caf50' : order.status === 'CLOSED' ? '#999' : '#999'};">${order.status === 'COMPLETED' ? 'Completed' : order.status === 'CLOSED' ? 'Closed' : 'In Progress'}</div>
                    </div>
                </div>
            </div>
            
            <!-- Milestones Section -->
            <div style="margin-bottom: 1rem;">
                <h4 style="margin: 0 0 0.75rem 0; font-size: 1.1rem; color: #ff8a33; font-weight: 700;">Milestones (${milestones.length})</h4>
                <div style="margin-bottom: 0.75rem; padding: 0.75rem; background: rgba(33, 150, 243, 0.15); border-radius: 4px; border-left: 3px solid #2196f3;">
                    <p style="margin: 0; font-size: 0.9rem; color: #64b5f6;"><strong>Stepwise Fund Release:</strong> Funds for each milestone become available only after the previous milestone is completed with approved invoice.</p>
                    ${order.funds_locked ? `<p style="margin: 0.25rem 0 0 0; font-size: 0.9rem; color: #64b5f6;">Currently unlocked: <strong>Milestone ${order.current_unlocked_milestone}</strong></p>` : ''}
                </div>
                ${milestones.length > 0 ? milestones.map(m => `
                    <div style="padding: 1rem; margin-bottom: 0.75rem; background: rgba(25, 25, 25, 0.8); border-left: 4px solid ${m.status === 'COMPLETED' ? '#4caf50' : m.status === 'PENDING' ? '#ffc107' : m.status === 'FROZEN' ? '#ef5350' : m.status === 'PAUSED' ? '#ff9800' : '#999'}; border-radius: 4px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                            <div>
                                <strong style="font-size: 1.05rem; color: #e8e8e8;">${m.name}</strong>
                                ${order.current_unlocked_milestone >= m.order ? `<span style="margin-left: 0.5rem; padding: 0.15rem 0.5rem; background: rgba(76, 175, 80, 0.2); color: #4caf50; border-radius: 3px; font-size: 0.75rem; font-weight: 600;">Funds Available</span>` : `<span style="margin-left: 0.5rem; padding: 0.15rem 0.5rem; background: rgba(155, 155, 155, 0.2); color: #999; border-radius: 3px; font-size: 0.75rem; font-weight: 600;">Funds Locked</span>`}
                            </div>
                            <div style="display: flex; gap: 0.5rem; align-items: center;">
                                <span style="padding: 0.25rem 0.75rem; background: ${m.status === 'COMPLETED' ? 'rgba(76, 175, 80, 0.2)' : m.status === 'PENDING' ? 'rgba(255, 193, 7, 0.2)' : m.status === 'FROZEN' ? 'rgba(244, 67, 54, 0.2)' : m.status === 'PAUSED' ? 'rgba(255, 152, 0, 0.2)' : 'rgba(155, 155, 155, 0.2)'}; color: ${m.status === 'COMPLETED' ? '#4caf50' : m.status === 'PENDING' ? '#ffc107' : m.status === 'FROZEN' ? '#ef5350' : m.status === 'PAUSED' ? '#ff9800' : '#999'}; border-radius: 4px; font-size: 0.85rem; font-weight: 600;">
                                    ${m.status}
                                </span>
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.5rem; font-size: 0.9rem; margin-bottom: 0.75rem;">
                            <div><span style="color: #b8b8b8; font-weight: 500;">Amount:</span> <strong style="color: #ff8a33;">$${m.amount.toLocaleString()}</strong></div>
                            <div><span style="color: #b8b8b8; font-weight: 500;">Percentage:</span> <strong style="color: #ff8a33;">${m.percentage}%</strong></div>
                            <div><span style="color: #b8b8b8; font-weight: 500;">Released:</span> <strong style="color: #ff8a33;">$${m.released_amount.toLocaleString()}</strong></div>
                            ${m.timeline_days ? `<div><span style="color: #b8b8b8; font-weight: 500;">Timeline:</span> <strong style="color: #ff8a33;">${m.timeline_days} days</strong></div>` : ''}
                        </div>
                        ${m.freeze_reason ? `<div style="padding: 0.75rem; background: rgba(244, 67, 54, 0.15); border-left: 3px solid #ef5350; border-radius: 4px; margin-bottom: 0.75rem;"><p style="margin: 0; font-size: 0.9rem; color: #ef5350;"><strong>Frozen:</strong> ${m.freeze_reason}</p></div>` : ''}
                        ${m.pause_reason ? `<div style="padding: 0.75rem; background: rgba(255, 152, 0, 0.15); border-left: 3px solid #ff9800; border-radius: 4px; margin-bottom: 0.75rem;"><p style="margin: 0; font-size: 0.9rem; color: #ff9800;"><strong>Paused:</strong> ${m.pause_reason}</p></div>` : ''}
                        
                        <!-- NEW PROOF SYSTEM: Check for proof object with status -->
                        ${m.proof && typeof m.proof === 'object' && m.proof.status ? `
                            <div style="margin-bottom: 0.75rem; padding: 0.75rem; background: rgba(26, 26, 26, 0.8); border-radius: 4px; border: 2px solid ${m.proof.status === 'APPROVED' ? '#4caf50' : m.proof.status === 'REJECTED' ? '#ef5350' : '#ffc107'};">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                                    <div>
                                        <span style="font-size: 0.9rem; font-weight: 600; color: #e8e8e8;">Document Proof</span>
                                        <div style="margin-top: 0.25rem; font-size: 0.85rem; color: #b8b8b8;">
                                            ${m.proof.originalname || 'Document uploaded'}
                                        </div>
                                    </div>
                                    <span style="padding: 0.25rem 0.75rem; background: ${m.proof.status === 'APPROVED' ? 'rgba(76, 175, 80, 0.2)' : m.proof.status === 'REJECTED' ? 'rgba(244, 67, 54, 0.2)' : 'rgba(255, 193, 7, 0.2)'}; color: ${m.proof.status === 'APPROVED' ? '#4caf50' : m.proof.status === 'REJECTED' ? '#ef5350' : '#ffc107'}; border-radius: 4px; font-size: 0.85rem; font-weight: 600;">
                                        ${m.proof.status === 'APPROVED' ? 'APPROVED' : m.proof.status === 'REJECTED' ? 'REJECTED' : 'PENDING REVIEW'}
                                    </span>
                                </div>
                                <div style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem;">
                                    <button onclick="openProofPreview('${order.id}', ${milestones.indexOf(m)}, '${m.name}', ${m.amount})" style="flex: 1; padding: 0.5rem; background: #2196f3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600;">
                                        Preview Document
                                    </button>
                                </div>
                                ${m.proof.status === 'PENDING_REVIEW' && m.status !== 'FROZEN' && m.status !== 'PAUSED' ? `
                                    <div style="display: flex; gap: 0.5rem;">
                                        <button onclick="openProofApprovalModal('${order.id}', ${milestones.indexOf(m)}, '${m.name}', ${m.amount})" style="flex: 1; padding: 0.5rem; background: #4caf50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600; font-weight: 700;">
                                            Approve & Release $${m.amount.toLocaleString()}
                                        </button>
                                        <button onclick="adminRejectProof('${order.id}', ${milestones.indexOf(m)}, '${m.name}')" style="flex: 1; padding: 0.5rem; background: #ef5350; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600;">
                                            Reject
                                        </button>
                                    </div>
                                ` : ''}
                                ${m.proof.status === 'REJECTED' && m.proof.rejectionReason ? `
                                    <div style="padding: 0.5rem; background: rgba(244, 67, 54, 0.15); border-radius: 3px; border-left: 3px solid #ef5350; margin-top: 0.5rem;">
                                        <p style="margin: 0; font-size: 0.85rem; color: #ef5350;"><strong>Reason:</strong> ${m.proof.rejectionReason}</p>
                                    </div>
                                ` : ''}
                                ${m.proof.status === 'APPROVED' && m.proof.approvalNotes ? `
                                    <div style="padding: 0.5rem; background: rgba(76, 175, 80, 0.15); border-radius: 3px; border-left: 3px solid #4caf50; margin-top: 0.5rem;">
                                        <p style="margin: 0; font-size: 0.85rem; color: #4caf50;"><strong>Notes:</strong> ${m.proof.approvalNotes}</p>
                                    </div>
                                ` : ''}
                            </div>
                        ` : m.proof_file_path ? `
                            <!-- OLD PROOF SYSTEM: Legacy proof_file_path -->
                            <div style="margin-bottom: 0.75rem; padding: 0.75rem; background: rgba(26, 26, 26, 0.8); border-radius: 4px; border: 1px solid rgba(255, 138, 51, 0.2);">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: ${m.proof_verification_status === 'PENDING' ? '0.75rem' : '0'};">
                                    <div>
                                        <span style="font-size: 0.9rem; font-weight: 600; color: #e8e8e8;">Invoice/Proof</span>
                                        <div style="margin-top: 0.25rem;">
                                            <a href="${m.proof_url}" target="_blank" style="color: #2196f3; font-size: 0.9rem;">View Document</a>
                                        </div>
                                    </div>
                                    <span style="padding: 0.25rem 0.75rem; background: ${m.proof_verification_status === 'VERIFIED' ? 'rgba(76, 175, 80, 0.2)' : m.proof_verification_status === 'REJECTED' ? 'rgba(244, 67, 54, 0.2)' : 'rgba(255, 193, 7, 0.2)'}; color: ${m.proof_verification_status === 'VERIFIED' ? '#4caf50' : m.proof_verification_status === 'REJECTED' ? '#ef5350' : '#ffc107'}; border-radius: 4px; font-size: 0.85rem; font-weight: 600;">
                                        ${m.proof_verification_status === 'VERIFIED' ? 'Verified' : m.proof_verification_status === 'REJECTED' ? 'Rejected' : 'Pending Review'}
                                    </span>
                                </div>
                                ${m.proof_verification_status === 'PENDING' && m.status !== 'FROZEN' && m.status !== 'PAUSED' ? `
                                    <div style="display: flex; gap: 0.5rem;">
                                        <button onclick="approveInvoice('${m.id}', '${m.name}')" style="flex: 1; padding: 0.5rem; background: #4caf50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600;">
                                            Approve & Complete Milestone
                                        </button>
                                        <button onclick="rejectInvoice('${m.id}', '${m.name}')" style="flex: 1; padding: 0.5rem; background: #ef5350; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600;">
                                            Reject Invoice
                                        </button>
                                    </div>
                                ` : ''}
                            </div>
                        ` : m.status !== 'COMPLETED' ? `<div style="padding: 0.75rem; background: rgba(255, 193, 7, 0.15); border-radius: 4px; border-left: 3px solid #ffc107; margin-bottom: 0.75rem;">
                                <p style="margin: 0; font-size: 0.9rem; color: #ffc107;"><strong>Waiting for Proof</strong> - Supplier needs to upload proof document</p>
                            </div>` : ''}
                        
                        <!-- Admin Control Buttons -->
                        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(255, 138, 51, 0.2);">
                            ${m.status === 'PENDING' ? `
                                <button onclick="pauseMilestoneAdmin('${m.id}', '${m.name}')" style="padding: 0.5rem 1rem; background: #ff9800; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: 600;">
                                    Pause
                                </button>
                            ` : ''}
                            ${m.status === 'PAUSED' ? `
                                <button onclick="resumeMilestoneAdmin('${m.id}', '${m.name}')" style="padding: 0.5rem 1rem; background: #4caf50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: 600;">
                                    Resume
                                </button>
                            ` : ''}
                            ${(m.status === 'PENDING' || m.status === 'PAUSED') ? `
                                <button onclick="freezeMilestoneAdmin('${m.id}', '${m.name}')" style="padding: 0.5rem 1rem; background: #ef5350; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: 600;">
                                    Freeze
                                </button>
                            ` : ''}
                            ${m.status === 'FROZEN' ? `
                                <button onclick="unfreezeMilestoneAdmin('${m.id}', '${m.name}')" style="padding: 0.5rem 1rem; background: #2196f3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: 600;">
                                    Unfreeze
                                </button>
                            ` : ''}
                            ${m.status !== 'COMPLETED' && m.proof_verification_status === 'VERIFIED' ? `
                                <button onclick="forceCompleteMilestoneAdmin('${m.id}', '${m.name}')" style="padding: 0.5rem 1rem; background: #9c27b0; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: 600;">
                                    Force Complete
                                </button>
                            ` : ''}
                            ${m.name.toLowerCase().includes('raw') || m.name.toLowerCase().includes('material') ? `
                                <button onclick="releaseFundsToLender('${m.id}', '${m.name}', ${m.amount})" style="padding: 0.5rem 1rem; background: #00bcd4; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: 600;">
                                    Release to Lender
                                </button>
                            ` : ''}
                            ${m.name.toLowerCase().includes('production') && m.status !== 'COMPLETED' ? `
                                <button onclick="releaseFundsToSupplier('${m.id}', '${m.name}', ${m.amount})" style="padding: 0.5rem 1rem; background: #4caf50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: 600;">
                                    Release to Supplier
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `).join('') : '<p style="color: #999;">No milestones created yet</p>'}
            </div>
            
            <!-- Transactions Section -->
            <div style="margin-bottom: 1rem;">
                <h4 style="margin: 0 0 0.75rem 0; font-size: 1.1rem; color: #ff8a33; font-weight: 700;">Transactions (${transactions.length})</h4>
                ${transactions.length > 0 ? transactions.map(t => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; margin-bottom: 0.5rem; background: ${t.type === 'LOCK' ? 'rgba(33, 150, 243, 0.15)' : 'rgba(76, 175, 80, 0.15)'}; border-radius: 4px;">
                        <div>
                            <span style="font-weight: 700; color: ${t.type === 'LOCK' ? '#2196f3' : '#4caf50'};">${t.type}</span>
                            <div style="font-size: 0.85rem; color: #b8b8b8; margin-top: 0.25rem; font-weight: 500;">${t.description}</div>
                            <div style="font-size: 0.8rem; color: #999; margin-top: 0.25rem;">${new Date(t.createdAt).toLocaleString()}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 1.1rem; font-weight: 700; color: ${t.type === 'LOCK' ? '#2196f3' : '#4caf50'};">
                                $${t.amount.toLocaleString()}
                            </div>
                        </div>
                    </div>
                `).join('') : '<p style="color: #999;">No transactions yet</p>'}
            </div>
            
            <!-- Admin Actions -->
            <div style="display: flex; gap: 0.75rem; margin-top: 1rem; padding-top: 1rem; border-top: 2px solid #e5e7eb;">
                ${order.status === 'LENDER_APPROVED' && !order.funds_locked ? `
                    <button onclick="lockFunds('${order.id}')" class="btn-success" style="padding: 0.75rem 1.5rem;">Lock Funds</button>
                ` : ''}
                ${order.status === 'COMPLETED' ? `
                    <button onclick="repayOrder('${order.id}')" class="btn-success" style="padding: 0.75rem 1.5rem;">Mark as Repaid & Close</button>
                ` : ''}
                <button onclick="viewOrderDetails('${order.id}')" style="padding: 0.75rem 1.5rem; background: #6b7280; color: white; border: none; border-radius: 4px; cursor: pointer;">View Full Details</button>
            </div>
        </div>
    `;
}

// Supplier Complete Order Details View
async function renderSupplierDetailedOrders() {
    const container = document.getElementById('supplier-orders-detailed');
    if (!container || currentUser.role !== 'SUPPLIER') return;
    
    if (currentOrders.length === 0) {
        container.innerHTML = '<p class="empty-state">No orders found. Create your first order above.</p>';
        return;
    }
    
    container.innerHTML = `
        <div style="margin-bottom: 1rem;">
            <p style="color: #666; font-size: 0.9rem;">Viewing all your orders with complete timeline and milestone details</p>
        </div>
        ${await Promise.all(currentOrders.map(async order => await renderSupplierOrderCard(order))).then(cards => cards.join(''))}
    `;
}

async function renderSupplierOrderCard(order) {
    // Fetch milestones and transactions for this order
    const milestonesResponse = await fetch(`${API_BASE}/orders/${order.id}/milestones`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const milestonesData = await milestonesResponse.json();
    const milestones = milestonesData.milestones || [];
    const summary = milestonesData.summary || { total_milestones: 0, completed: 0, pending: 0, locked: 0 };
    
    const transactionsResponse = await fetch(`${API_BASE}/orders/${order.id}/transactions`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const transactionsData = await transactionsResponse.json();
    const transactions = transactionsData.transactions || [];
    
    return `
        <div class="order-card-detailed" style="border: 2px solid #e5e7eb; border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; background: white;">
            <!-- Order Header -->
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 2px solid #e5e7eb;">
                <div>
                    <h3 style="margin: 0 0 0.5rem 0; font-size: 1.3rem;">${order.order_id}</h3>
                    <p style="margin: 0; color: #666;"><strong>Buyer:</strong> ${order.buyer_name}</p>
                    <p style="margin: 0; color: #666;"><strong>Value:</strong> $${order.value.toLocaleString()}</p>
                    <p style="margin: 0; color: #666;"><strong>Delivery:</strong> ${new Date(order.delivery_date).toLocaleDateString()}</p>
                </div>
                <div style="text-align: right;">
                    <span class="status-badge status-${order.status.toLowerCase().replace(/_/g, '-')}" style="display: inline-block; padding: 0.5rem 1rem; border-radius: 4px; font-weight: 600; margin-bottom: 0.5rem;">
                        ${order.status.replace(/_/g, ' ')}
                    </span>
                    <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem; color: ${order.funds_locked ? '#22c55e' : '#999'};">
                        ${order.funds_locked ? 'Funds Secured' : 'Awaiting Funding'}
                    </p>
                </div>
            </div>
            
            <!-- Timeline & Progress -->
            <div style="margin-bottom: 1rem;">
                <h4 style="margin: 0 0 0.75rem 0; font-size: 1.1rem;">Order Progress</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem;">
                    <div style="padding: 0.75rem; background: ${order.status === 'PENDING_LENDER_APPROVAL' ? '#fff3cd' : '#d4edda'}; border-radius: 4px;">
                        <div style="font-size: 0.8rem; color: #666;">Lender Approval</div>
                        <div style="font-weight: 600; margin-top: 0.25rem; font-size: 0.9rem;">${order.status === 'PENDING_LENDER_APPROVAL' ? 'Pending' : 'Approved'}</div>
                    </div>
                    <div style="padding: 0.75rem; background: ${order.funds_locked ? '#d4edda' : '#f8f9fa'}; border-radius: 4px;">
                        <div style="font-size: 0.8rem; color: #666;">Funds Locked</div>
                        <div style="font-weight: 600; margin-top: 0.25rem; font-size: 0.9rem;">${order.funds_locked ? 'Secured' : 'Awaiting'}</div>
                    </div>
                    <div style="padding: 0.75rem; background: ${summary.completed > 0 ? '#d4edda' : '#f8f9fa'}; border-radius: 4px;">
                        <div style="font-size: 0.8rem; color: #666;">Milestones</div>
                        <div style="font-weight: 600; margin-top: 0.25rem; font-size: 0.9rem;">${summary.completed}/${summary.total_milestones} Done</div>
                    </div>
                    <div style="padding: 0.75rem; background: ${order.status === 'COMPLETED' || order.status === 'CLOSED' ? '#d4edda' : '#f8f9fa'}; border-radius: 4px;">
                        <div style="font-size: 0.8rem; color: #666;">Order Status</div>
                        <div style="font-weight: 600; margin-top: 0.25rem; font-size: 0.9rem;">${order.status === 'COMPLETED' ? 'Complete' : order.status === 'CLOSED' ? 'Closed' : 'Active'}</div>
                    </div>
                </div>
            </div>
            
            <!-- Milestones Section -->
            <div style="margin-bottom: 1rem;">
                <h4 style="margin: 0 0 0.75rem 0; font-size: 1.1rem;">Your Milestones (${milestones.length})</h4>
                ${order.funds_locked ? `
                    <div style="margin-bottom: 0.75rem; padding: 0.75rem; background: #e3f2fd; border-radius: 4px; border-left: 3px solid #1976d2;">
                        <p style="margin: 0; font-size: 0.9rem; color: #1565c0;"><strong>Stepwise Fund Release:</strong> Funds become available for each milestone only after completing the previous one.</p>
                        <p style="margin: 0.25rem 0 0 0; font-size: 0.9rem; color: #1565c0;">Currently available: <strong>Milestone ${order.current_unlocked_milestone}</strong></p>
                    </div>
                ` : ''}
                ${milestones.length > 0 ? milestones.map(m => `
                    <div style="padding: 1rem; margin-bottom: 0.75rem; background: #f9fafb; border-left: 4px solid ${m.status === 'COMPLETED' ? '#22c55e' : m.status === 'PENDING' ? '#fbbf24' : '#9ca3af'}; border-radius: 4px;">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                            <div>
                                <strong style="font-size: 1.05rem;">${m.name}</strong>
                                ${order.current_unlocked_milestone >= m.order ? `<span style="margin-left: 0.5rem; padding: 0.15rem 0.5rem; background: #dcfce7; color: #166534; border-radius: 3px; font-size: 0.75rem; font-weight: 600;">Funds Available</span>` : `<span style="margin-left: 0.5rem; padding: 0.15rem 0.5rem; background: #f3f4f6; color: #666; border-radius: 3px; font-size: 0.75rem; font-weight: 600;">Funds Locked</span>`}
                            </div>
                            <span style="padding: 0.25rem 0.75rem; background: ${m.status === 'COMPLETED' ? '#dcfce7' : m.status === 'PENDING' ? '#fef3c7' : '#f3f4f6'}; color: ${m.status === 'COMPLETED' ? '#166534' : m.status === 'PENDING' ? '#92400e' : '#374151'}; border-radius: 4px; font-size: 0.85rem; font-weight: 600;">
                                ${m.status}
                            </span>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.5rem; font-size: 0.9rem; margin-bottom: 0.5rem;">
                            <div><span style="color: #666;">Amount:</span> <strong>$${m.amount.toLocaleString()}</strong></div>
                            <div><span style="color: #666;">Share:</span> <strong>${m.percentage}%</strong></div>
                            <div><span style="color: #666;">Released:</span> <strong style="color: ${m.released_amount > 0 ? '#22c55e' : '#999'};">$${m.released_amount.toLocaleString()}</strong></div>
                            ${m.timeline_days ? `<div><span style="color: #666;">Timeline:</span> <strong>${m.timeline_days} days</strong></div>` : ''}
                        </div>
                        ${m.status === 'PENDING' && (!m.proof_file_path || m.proof_verification_status === 'REJECTED') ? `
                            <button onclick="openProofUploadModal('${m.id}', '${m.name}')" style="width: 100%; padding: 0.75rem; margin-top: 0.5rem; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 1rem;">
                                Upload Invoice/Proof
                            </button>
                        ` : ''}
                        ${m.proof_file_path ? `
                            <div style="margin-top: 0.75rem; padding: 0.75rem; background: white; border-radius: 4px; border: 1px solid #e5e7eb;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <span style="font-size: 0.9rem; font-weight: 600;">Proof Uploaded</span>
                                        <div style="font-size: 0.85rem; color: #666; margin-top: 0.25rem;">
                                            <a href="${m.proof_url}" target="_blank" style="color: #0284c7;">View Document</a>
                                        </div>
                                    </div>
                                    <span style="padding: 0.25rem 0.75rem; background: ${m.proof_verification_status === 'VERIFIED' ? '#dcfce7' : m.proof_verification_status === 'REJECTED' ? '#fee2e2' : '#fef3c7'}; color: ${m.proof_verification_status === 'VERIFIED' ? '#166534' : m.proof_verification_status === 'REJECTED' ? '#991b1b' : '#92400e'}; border-radius: 4px; font-size: 0.85rem; font-weight: 600;">
                                        ${m.proof_verification_status === 'VERIFIED' ? 'Verified' : m.proof_verification_status === 'REJECTED' ? 'Rejected' : 'Under Review'}
                                    </span>
                                </div>
                            </div>
                        ` : ''}
                        ${m.status === 'LOCKED' ? `
                            <div style="margin-top: 0.75rem; padding: 0.75rem; background: #fef3c7; border-radius: 4px; border-left: 3px solid #fbbf24;">
                                <p style="margin: 0; font-size: 0.9rem; color: #92400e;">
                                    This milestone is locked. It's waiting for lender approval.
                                </p>
                            </div>
                        ` : ''}
                    </div>
                `).join('') : '<p style="color: #999;">No milestones created yet. Awaiting lender approval.</p>'}
            </div>
            
            <!-- Payments Received Section -->
            <div style="margin-bottom: 1rem;">
                <h4 style="margin: 0 0 0.75rem 0; font-size: 1.1rem;">Payments & Transactions (${transactions.length})</h4>
                ${transactions.length > 0 ? `
                    <div style="background: #f0f9ff; padding: 1rem; border-radius: 4px; margin-bottom: 0.75rem;">
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; font-size: 0.9rem;">
                            <div>
                                <div style="color: #666; font-size: 0.85rem;">Total Locked</div>
                                <div style="font-weight: 700; font-size: 1.1rem; color: #0284c7;">$${transactionsData.summary.total_locked.toLocaleString()}</div>
                            </div>
                            <div>
                                <div style="color: #666; font-size: 0.85rem;">Released</div>
                                <div style="font-weight: 700; font-size: 1.1rem; color: #22c55e;">$${transactionsData.summary.total_released.toLocaleString()}</div>
                            </div>
                            <div>
                                <div style="color: #666; font-size: 0.85rem;">In Escrow</div>
                                <div style="font-weight: 700; font-size: 1.1rem; color: #f59e0b;">$${transactionsData.summary.escrow_balance.toLocaleString()}</div>
                            </div>
                        </div>
                    </div>
                    ${transactions.map(t => `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; margin-bottom: 0.5rem; background: ${t.type === 'LOCK' ? '#dbeafe' : '#dcfce7'}; border-radius: 4px;">
                            <div>
                                <span style="font-weight: 600; color: ${t.type === 'LOCK' ? '#1e40af' : '#166534'};">${t.type}</span>
                                <div style="font-size: 0.85rem; color: #666; margin-top: 0.25rem;">${t.description}</div>
                                <div style="font-size: 0.8rem; color: #999; margin-top: 0.25rem;">${new Date(t.createdAt).toLocaleString()}</div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 1.1rem; font-weight: 700; color: ${t.type === 'LOCK' ? '#1e40af' : '#166534'};">
                                    $${t.amount.toLocaleString()}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                ` : '<p style="color: #999;">No transactions yet. Awaiting fund locking.</p>'}
            </div>
            
            <!-- View Full Details Button -->
            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 2px solid #e5e7eb;">
                <button onclick="viewOrderDetails('${order.id}')" style="width: 100%; padding: 0.75rem; background: #6b7280; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">
                    View Complete Details & History
                </button>
            </div>
        </div>
    `;
}

function renderOrderActions(order) {
    let actions = '';
    
    // LENDER: Approve pending lender approval orders
    if (currentUser.role === 'LENDER' && order.status === 'PENDING_LENDER_APPROVAL') {
        actions += `<button onclick="openLenderApprovalModal('${order.id}')" class="btn-success">Approve Order</button>`;
        actions += `<button onclick="rejectFundingRequest('${order.id}')" style="padding: 0.75rem 1.5rem; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">Reject</button>`;
    }
    
    // ADMIN: Lock funds for lender-approved orders
    if (currentUser.role === 'ADMIN' && order.status === 'LENDER_APPROVED' && !order.funds_locked) {
        actions += `<button onclick="lockFunds('${order.id}')" class="btn-success">Lock Funds</button>`;
    }
    
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
    
    if (order.status === 'PENDING_LENDER_APPROVAL' && currentUser.role !== 'LENDER') {
        actions += `<span class="info-text">Awaiting lender approval</span>`;
    }
    
    if (order.status === 'LENDER_APPROVED' && order.funds_locked) {
        actions += `<span class="info-text" style="color: green;">Funds Locked</span>`;
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

// Refresh admin orders view
function refreshAdminOrders() {
    if (currentUser && currentUser.role === 'ADMIN') {
        renderAdminAllOrders();
    }
}

// Refresh supplier orders view
function refreshSupplierOrders() {
    if (currentUser && currentUser.role === 'SUPPLIER') {
        renderSupplierDetailedOrders();
    }
}

// Create Order Modal
function openCreateOrderModal() {
    document.getElementById('create-order-modal').style.display = 'flex';
    
    // Auto-generate unique Order ID: ORD-TIMESTAMP-RANDOM
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    const orderId = `ORD-${timestamp}-${random}`;
    const orderIdInput = document.getElementById('order-id');
    if (orderIdInput) {
        orderIdInput.value = orderId;
        orderIdInput.readOnly = true;
        orderIdInput.style.backgroundColor = '#f5f5f5';
        orderIdInput.style.cursor = 'not-allowed';
    }
    
    // Auto-fill Buyer Name from logged-in user
    const buyerNameInput = document.getElementById('buyer-name');
    if (buyerNameInput && currentUser) {
        buyerNameInput.value = currentUser.name;
        buyerNameInput.readOnly = true;
        buyerNameInput.style.backgroundColor = '#f5f5f5';
        buyerNameInput.style.cursor = 'not-allowed';
    }
    
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
function getCurrentOrder() {
    return currentOrderInModal;
}

async function viewOrderDetails(orderId) {
    console.log('=== viewOrderDetails called ===');
    console.log('Order ID:', orderId);
    
    try {
        // Get order from currentOrders (already has milestone breakdown)
        const order = currentOrders.find(o => o.id === orderId);
        if (!order) {
            alert('Order not found');
            return;
        }
        
        console.log('Order found:', order);
        console.log('Order milestones:', order.milestones);
        
        // Track current order for proof upload modal
        currentOrderInModal = order;
        
        // Fetch transactions
        const transactionsResponse = await fetch(`${API_BASE}/transactions/order/${orderId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        console.log('Transactions response status:', transactionsResponse.status);
        
        if (transactionsResponse.ok) {
            const transactionsData = await transactionsResponse.json();
            console.log('Transactions data received:', transactionsData);
            
            renderOrderDetailsModal(order, transactionsData);
        } else {
            console.error('Failed to fetch transactions:', transactionsResponse.status);
            alert('Failed to load order transactions');
        }
    } catch (error) {
        console.error('Error in viewOrderDetails:', error);
        alert('Error loading order details');
    }
}

function renderOrderDetailsModal(order, transactionsData) {
    console.log('=== renderOrderDetailsModal called ===');
    console.log('Order:', order);
    console.log('Transactions data:', transactionsData);
    
    const content = document.getElementById('order-details-content');
    const transactions = transactionsData.transactions || [];
    const summary = transactionsData.summary || {
        total_locked: 0,
        total_released: 0,
        escrow_balance: 0
    };
    
    // Use milestones from the order directly
    const milestones = order.milestones || [];
    console.log('Order milestones:', milestones);
    
    // Get milestone descriptions
    const getMilestoneDescription = (milestoneName) => {
        const name = milestoneName.toLowerCase();
        if (name.includes('raw') || name.includes('material')) {
            return 'Funds needed to purchase raw materials and supplies required for production';
        } else if (name.includes('production') || name.includes('manufacturing')) {
            return 'Funds needed to cover production costs including labor, equipment, and facility expenses';
        } else if (name.includes('delivery') || name.includes('shipping') || name.includes('completion')) {
            return 'Final payment upon successful delivery and order completion';
        } else if (name.includes('design') || name.includes('planning')) {
            return 'Funds for design, planning, and initial setup work';
        } else if (name.includes('testing') || name.includes('quality')) {
            return 'Funds for quality assurance, testing, and final refinements';
        }
        return 'Payment for completion of this milestone stage';
    };
    
    content.innerHTML = `
        <div class="details-section">
            <div style="margin-bottom: 1.5rem; padding: 1rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; color: white;">
                <h2 style="margin: 0 0 0.5rem 0;">Order: ${order.order_id}</h2>
                <p style="margin: 0; opacity: 0.95;">Complete breakdown of milestones and payments</p>
            </div>
            
            <h3 style="color: #e8e8e8; margin-bottom: 1rem;">Payment Milestones (${milestones.length})</h3>
            <div style="display: flex; gap: 1.5rem; margin-bottom: 1.5rem; padding: 1rem; background: rgba(33, 150, 243, 0.15); border-radius: 8px;">
                <div style="flex: 1; text-align: center;">
                    <div style="font-size: 0.85rem; color: #999; margin-bottom: 0.25rem;">Status</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #2196f3;">${order.status}</div>
                </div>
                <div style="flex: 1; text-align: center;">
                    <div style="font-size: 0.85rem; color: #999; margin-bottom: 0.25rem;">Funds Status</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: ${order.funds_locked ? '#4caf50' : '#ffc107'};">${order.funds_locked ? 'Locked' : 'Pending'}</div>
                </div>
                <div style="flex: 1; text-align: center;">
                    <div style="font-size: 0.85rem; color: #999; margin-bottom: 0.25rem;">Total Value</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #ff8a33;">$${order.value.toLocaleString()}</div>
                </div>
            </div>
            
            ${milestones.length === 0 ? `
                <div style="padding: 2rem; text-align: center; background: rgba(255, 193, 7, 0.15); border-radius: 8px; border: 2px dashed #ffc107;">
                    <p style="margin: 0; font-size: 1.1rem; color: #ffc107; font-weight: 600;">No milestones defined yet</p>
                    <p style="margin: 0.5rem 0 0 0; color: #ffc107;">Supplier needs to define milestone breakdown when creating the order</p>
                </div>
            ` : milestones.map((m, idx) => {
                const amount = (order.value * m.percentage) / 100;
                const isFirst = idx === 0;
                const status = !order.funds_locked ? 'LOCKED' : (isFirst ? 'PENDING' : 'LOCKED');
                
                return `
                <div class="milestone-card" style="margin-bottom: 1.5rem; padding: 1.5rem; border: 3px solid ${status === 'PENDING' ? '#ffc107' : '#666'}; border-radius: 12px; background: rgba(26, 26, 26, 0.6); box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                        <div style="flex: 1;">
                            <h4 style="margin: 0 0 0.5rem 0; font-size: 1.2rem; color: #e8e8e8;">Milestone ${idx + 1}: ${m.name}</h4>
                            <p style="margin: 0; font-size: 0.95rem; color: #b8b8b8; line-height: 1.5;">
                                ${getMilestoneDescription(m.name)}
                            </p>
                        </div>
                        <span style="padding: 0.5rem 1rem; border-radius: 6px; font-weight: 700; font-size: 0.9rem; white-space: nowrap; margin-left: 1rem; background: ${status === 'PENDING' ? 'rgba(255, 193, 7, 0.15)' : 'rgba(100, 100, 100, 0.15)'}; color: ${status === 'PENDING' ? '#ffc107' : '#999'};">
                            ${status}
                        </span>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1rem; padding: 1rem; background: rgba(50, 50, 50, 0.5); border-radius: 8px;">
                        <div>
                            <div style="font-size: 0.85rem; color: #999; margin-bottom: 0.25rem;">Milestone Amount</div>
                            <div style="font-size: 1.3rem; font-weight: 700; color: #ff8a33;">$${amount.toLocaleString()}</div>
                            <div style="font-size: 0.85rem; color: #999;">${m.percentage}% of order value</div>
                        </div>
                        <div>
                            <div style="font-size: 0.85rem; color: #999; margin-bottom: 0.25rem;">Purpose</div>
                            <div style="font-size: 1rem; font-weight: 600; color: #e8e8e8;">${m.name}</div>
                        </div>
                    </div>
                    
                    ${status === 'LOCKED' && !order.funds_locked ? `
                        <div style="margin-top: 1rem; padding: 1rem; background: rgba(255, 193, 7, 0.15); border-radius: 8px; border-left: 4px solid #ffc107;">
                            <p style="margin: 0; font-weight: 600; color: #ffc107;">Awaiting Fund Lock</p>
                            <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem; color: #ffc107;">Admin needs to lock funds before work can begin</p>
                        </div>
                    ` : ''}
                    
                    ${status === 'LOCKED' && order.funds_locked && currentUser.role === 'SUPPLIER' ? `
                        <div style="margin-top: 1rem; padding: 1rem; background: rgba(244, 67, 54, 0.15); border-radius: 8px; border-left: 4px solid #ef5350;">
                            <p style="margin: 0; font-weight: 600; color: #ef5350;">Milestone Locked</p>
                            <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem; color: #ef5350;">Awaiting approval of previous milestone before you can upload for this one</p>
                        </div>
                    ` : ''}
                    
                    ${status === 'PENDING' && order.funds_locked && currentUser.role === 'SUPPLIER' ? `
                        <button onclick="openProofUploadModal(${idx}, '${m.name}')" style="margin-top: 1rem; width: 100%; padding: 1rem; background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 1.05rem;">
                            Upload Proof & Complete Milestone
                        </button>
                    ` : ''}
                </div>
            `;
            }).join('')}
            
        </div>
        
        <div class="details-section" style="margin-top: 2rem;">
            <h3 style="color: #ff8a33;">Transactions</h3>
            <div style="display: flex; gap: 2rem; margin-bottom: 1rem;">
                <p style="color: #b8b8b8;"><strong>Total Locked:</strong> $${summary.total_locked.toLocaleString()}</p>
                <p style="color: #b8b8b8;"><strong>Total Released:</strong> $${summary.total_released.toLocaleString()}</p>
                <p style="color: #b8b8b8;"><strong>Balance:</strong> $${summary.escrow_balance.toLocaleString()}</p>
            </div>
            
            ${transactions.length > 0 ? transactions.map(t => `
                <div style="display: flex; justify-content: space-between; padding: 0.75rem; border-bottom: 1px solid rgba(255, 138, 51, 0.2); align-items: center;">
                    <div style="flex: 1;">
                        <span style="padding: 0.25rem 0.5rem; border-radius: 4px; background: ${t.type === 'LOCK' ? 'rgba(33, 150, 243, 0.15)' : 'rgba(76, 175, 80, 0.15)'}; font-weight: 600; color: ${t.type === 'LOCK' ? '#2196f3' : '#4caf50'};">${t.type}</span>
                        <p style="margin: 0.25rem 0 0 0; font-size: 0.9rem; color: #b8b8b8;">${t.description}</p>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 600; font-size: 1.1rem; color: #ff8a33;">$${t.amount.toLocaleString()}</div>
                        <span style="font-size: 0.8rem; color: #999;">${new Date(t.createdAt).toLocaleString()}</span>
                    </div>
                </div>
            `).join('') : '<p>No transactions yet</p>'}
        </div>
    `;
    
    document.getElementById('order-details-modal').style.display = 'flex';
}

function renderMilestoneActions(milestone, index, allMilestones, order) {
    let actions = '';
    
    // SUPPLIER: Upload proof for PENDING milestones
    if (currentUser.role === 'SUPPLIER' && milestone.status === 'PENDING' && !milestone.proof_file_path) {
        actions += `
            <button onclick="openProofUploadModal('${milestone.id}', '${milestone.name}')" style="margin-top: 0.75rem; width: 100%; padding: 1rem; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 1.05rem; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);">
                Upload Invoice/Proof of Completion
            </button>
        `;
    }
    
    // SUPPLIER: Proof rejected - re-upload
    if (currentUser.role === 'SUPPLIER' && milestone.status === 'PENDING' && milestone.proof_verification_status === 'REJECTED') {
        actions += `
            <button onclick="openProofUploadModal('${milestone.id}', '${milestone.name}')" style="margin-top: 0.75rem; width: 100%; padding: 1rem; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 1.05rem; box-shadow: 0 2px 4px rgba(220, 38, 38, 0.3);">
                Re-upload Proof (Previous submission was rejected)
            </button>
        `;
    }
    
    // ADMIN: Verify proof
    if (currentUser.role === 'ADMIN' && milestone.proof_verification_status === 'PENDING') {
        actions += `
            <button onclick="openVerifyProofModal('${milestone.id}', '${milestone.name}')" style="margin-top: 0.75rem; width: 100%; padding: 1rem; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 1.05rem; box-shadow: 0 2px 4px rgba(139, 92, 246, 0.3);">
                Verify Submitted Proof
            </button>
        `;
    }
    
    // ADMIN: Complete milestone
    if (currentUser.role === 'ADMIN' && milestone.status === 'PENDING' && milestone.proof_verification_status === 'VERIFIED') {
        actions += `
            <button onclick="openCompleteMilestoneModal('${milestone.id}', '${milestone.name}', ${milestone.amount})" style="margin-top: 0.75rem; width: 100%; padding: 1rem; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 1.05rem; box-shadow: 0 2px 4px rgba(34, 197, 94, 0.3);">
                Complete Milestone & Release Funds
            </button>
        `;
    }
    
    return actions ? `<div style="margin-top: 0.75rem;">${actions}</div>` : '';
}

function canApproveNextMilestone(milestones, order) {
    if (!order || !order.milestones) return false;
    
    // Check if there are completed milestones
    const completedCount = milestones.filter(m => m.status === 'COMPLETED').length;
    
    // Check if next milestone exists in order but not yet created
    const nextMilestoneIndex = completedCount; // 0-indexed
    
    return nextMilestoneIndex < order.milestones.length && 
           !milestones.find(m => m.order === nextMilestoneIndex + 1);
}

async function approveNextMilestone(orderId) {
    const order = currentOrders.find(o => o.id === orderId);
    if (!order) {
        alert('Order not found');
        return;
    }
    
    // Fetch current milestones
    const response = await fetch(`${API_BASE}/orders/${orderId}/milestones`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await response.json();
    const milestones = data.milestones || [];
    
    // Find next milestone to approve
    const completedCount = milestones.filter(m => m.status === 'COMPLETED').length;
    const nextMilestone = order.milestones[completedCount];
    
    if (!nextMilestone) {
        alert('No more milestones to approve');
        return;
    }
    
    // Show approval modal for next milestone
    openNextMilestoneApprovalModal(orderId, nextMilestone, completedCount + 1);
}

function openNextMilestoneApprovalModal(orderId, milestone, milestoneNumber) {
    const order = currentOrders.find(o => o.id === orderId);
    const milestoneAmount = (order.value * milestone.percentage) / 100;
    
    let modal = document.getElementById('lender-approval-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'lender-approval-modal';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <h2>Approve Milestone ${milestoneNumber}</h2>
            <div style="background: #f5f5f5; padding: 1rem; border-radius: 4px; margin-bottom: 1rem;">
                <p><strong>Order:</strong> ${order.order_id}</p>
                <p><strong>Buyer:</strong> ${order.buyer_name}</p>
            </div>
            
            <div style="background: white; padding: 1rem; border: 2px solid #22c55e; border-radius: 4px; margin-bottom: 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong style="font-size: 1.1rem;">${milestone.name}</strong>
                        <div style="font-size: 0.9rem; color: #666; margin-top: 0.25rem;">
                            ${milestone.percentage}% of order value
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 1.3rem; font-weight: 700; color: #22c55e;">
                            $${milestoneAmount.toLocaleString()}
                        </div>
                    </div>
                </div>
                
                <div style="margin-top: 1rem;">
                    <label style="display: block; font-weight: 600; margin-bottom: 0.5rem;">
                        Set Delivery Timeline (Days):
                    </label>
                    <input type="number" 
                           id="next-milestone-days"
                           placeholder="Number of days" 
                           min="1" 
                           required 
                           value="7"
                           style="width: 100%; padding: 0.75rem; font-size: 1rem; border: 1px solid #ddd; border-radius: 4px;" />
                </div>
            </div>
            
            <div style="display: flex; gap: 1rem;">
                <button type="button" onclick="submitNextMilestoneApproval('${orderId}', '${milestone.name}')" class="btn-success" style="flex: 1; padding: 1rem;">
                    Approve Milestone
                </button>
                <button type="button" onclick="closeLenderApprovalModal()" style="flex: 1; padding: 1rem;">
                    Cancel
                </button>
            </div>
            <div id="approval-error-next" class="error" style="margin-top: 0.5rem;"></div>
        </div>
    `;
    
    modal.style.display = 'flex';
}

async function submitNextMilestoneApproval(orderId, milestoneName) {
    const errorEl = document.getElementById('approval-error-next');
    errorEl.textContent = '';
    
    const daysInput = document.getElementById('next-milestone-days');
    const days = parseInt(daysInput.value);
    
    if (!days || days < 1) {
        errorEl.textContent = 'Please enter a valid number of days (minimum 1)';
        return;
    }
    
    const milestone_timelines = [{
        milestone_name: milestoneName,
        timeline_days: days
    }];
    
    try {
        const response = await fetch(`${API_BASE}/orders/${orderId}/lender-approve`, {
            method: 'PATCH',
            headers: { 
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ milestone_timelines })
        });

        const data = await response.json();
        
        if (response.ok) {
            alert(`Milestone approved successfully!\\n\\nMilestone: ${milestoneName}\\nTimeline: ${days} days`);
            closeLenderApprovalModal();
            closeModal('order-details-modal');
            refreshOrders();
        } else {
            errorEl.textContent = data.message || 'Failed to approve milestone';
        }
    } catch (error) {
        errorEl.textContent = 'Error approving milestone';
        console.error(error);
    }
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

// Lender Approval Modal Functions
function openLenderApprovalModal(orderId) {
    const order = currentOrders.find(o => o.id === orderId);
    if (!order) {
        alert('Order not found');
        return;
    }
    
    // Check if milestones exist in order
    if (!order.milestones || order.milestones.length === 0) {
        alert('Error: Order does not have milestones defined. Please contact support.');
        console.error('Order missing milestones:', order);
        return;
    }
    
    // Check order status to determine which approval flow to show
    if (order.status === 'PENDING_LENDER_APPROVAL') {
        // First milestone approval
        openFirstMilestoneApprovalModal(orderId);
    } else if (order.status === 'LENDER_APPROVED') {
        // Subsequent milestone approval or waiting for supplier
        openNextMilestoneApprovalFlowModal(orderId);
    } else {
        alert(`Current status: ${order.status}`);
    }
}

function openFirstMilestoneApprovalModal(orderId) {
    const order = currentOrders.find(o => o.id === orderId);
    const firstMilestone = order.milestones[0];
    const firstMilestoneAmount = (order.value * firstMilestone.percentage) / 100;
    
    // Create modal if it doesn't exist
    let modal = document.getElementById('lender-approval-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'lender-approval-modal';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 700px;">
            <h2>Approve First Milestone</h2>
            <div style="background: rgba(26, 26, 26, 0.6); padding: 1rem; border-radius: 8px; margin-bottom: 1rem; border: 1px solid rgba(255, 138, 51, 0.3);">
                <p style="color: #e8e8e8;"><strong>Order:</strong> ${order.order_id}</p>
                <p style="color: #e8e8e8;"><strong>Buyer:</strong> ${order.buyer_name}</p>
                <p style="color: #e8e8e8;"><strong>Total Order Value:</strong> $${order.value.toLocaleString()}</p>
                <p style="color: #e8e8e8;"><strong>Delivery Date:</strong> ${new Date(order.delivery_date).toLocaleDateString()}</p>
            </div>
            
            <div style="background: rgba(255, 193, 7, 0.15); padding: 1rem; border-radius: 8px; margin-bottom: 1rem; border-left: 4px solid #ffc107;">
                <p style="margin: 0; font-weight: 600; color: #ffc107;">Milestone-wise Funding</p>
                <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem; color: #ffc107;">
                    You will approve ONE milestone at a time. After the supplier completes this milestone and provides proof, 
                    you can approve the next milestone.
                </p>
            </div>
            
            <div style="margin-bottom: 1rem;">
                <h3 style="margin-bottom: 0.5rem; color: #e8e8e8;">Approve: ${firstMilestone.name}</h3>
                <div style="background: rgba(26, 26, 26, 0.6); padding: 1rem; border: 2px solid #4caf50; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                        <div>
                            <strong style="font-size: 1.1rem; color: #e8e8e8;">${firstMilestone.name}</strong>
                            <div style="font-size: 0.9rem; color: #999; margin-top: 0.25rem;">
                                ${firstMilestone.percentage}% of order value
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 1.3rem; font-weight: 700; color: #4caf50;">
                                $${firstMilestoneAmount.toLocaleString()}
                            </div>
                        </div>
                    </div>
                    
                    <div style="margin-top: 1rem;">
                        <label style="display: block; font-weight: 600; margin-bottom: 0.5rem; color: #e8e8e8;">
                            Set Delivery Timeline (Days):
                        </label>
                        <input type="number" 
                               id="first-milestone-days"
                               placeholder="Number of days" 
                               min="1" 
                               required 
                               value="7"
                               style="width: 100%; padding: 0.75rem; font-size: 1rem; border: 2px solid rgba(255, 138, 51, 0.3); border-radius: 8px; background: #0a0a0a; color: #e8e8e8;" />
                        <p style="margin: 0.5rem 0 0 0; font-size: 0.85rem; color: #999;">
                            Supplier must complete this milestone within this timeframe
                        </p>
                    </div>
                </div>
            </div>
            
            <div style="background: rgba(33, 150, 243, 0.15); padding: 1rem; border-radius: 8px; margin-bottom: 1rem; border-left: 4px solid #2196f3;">
                <p style="margin: 0; font-size: 0.9rem; color: #2196f3;">
                    ℹ️ <strong>Next Steps:</strong><br>
                    1. You approve this first milestone<br>
                    2. Supplier receives materials and completes milestone<br>
                    3. Supplier uploads proof of completion<br>
                    4. After verification, you can approve the next milestone
                </p>
            </div>
            
            <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                <button type="button" onclick="submitFirstMilestoneApproval('${orderId}')" class="btn-success" style="flex: 1; padding: 1rem; font-size: 1rem;">
                    Approve First Milestone
                </button>
                <button type="button" onclick="rejectFundingRequest('${orderId}')" style="flex: 1; padding: 1rem; font-size: 1rem; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">
                    Reject Request
                </button>
                <button type="button" onclick="closeLenderApprovalModal()" style="flex: 1; padding: 1rem; font-size: 1rem;">
                    Cancel
                </button>
            </div>
            <div id="first-milestone-approval-error" class="error" style="margin-top: 0.5rem;"></div>
        </div>
    `;
    
    modal.style.display = 'flex';
}

function openNextMilestoneApprovalFlowModal(orderId) {
    const order = currentOrders.find(o => o.id === orderId);
    
    // Create modal if it doesn't exist
    let modal = document.getElementById('lender-approval-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'lender-approval-modal';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <h2>Milestone Approval Status</h2>
            
            <div style="background: #f5f5f5; padding: 1rem; border-radius: 4px; margin-bottom: 1rem;">
                <p><strong>Order:</strong> ${order.order_id}</p>
                <p><strong>Status:</strong> First milestone approved - awaiting supplier completion</p>
            </div>
            
            <div style="background: #e3f2fd; padding: 1rem; border-radius: 4px; margin-bottom: 1rem; border-left: 4px solid #1976d2;">
                <p style="margin: 0; font-weight: 600; color: #1565c0;">Current Workflow:</p>
                <ol style="margin: 0.5rem 0 0 0; padding-left: 1.5rem; color: #1565c0;">
                    <li>First milestone approved</li>
                    <li>Supplier working on milestone...</li>
                    <li>Awaiting supplier to upload proof</li>
                    <li>Admin will verify proof</li>
                    <li>➜ Then you can approve next milestone</li>
                </ol>
            </div>
            
            <div style="background: #fff3cd; padding: 1rem; border-radius: 4px; margin-bottom: 1rem;">
                <p style="margin: 0; font-weight: 600; color: #856404;">ℹ️ What happens next?</p>
                <ul style="margin: 0.5rem 0 0 0; padding-left: 1.5rem; font-size: 0.95rem; color: #856404;">
                    <li>The supplier is now working on the first milestone</li>
                    <li>They will upload proof documents when complete</li>
                    <li>The admin will review and verify the proof</li>
                    <li>Once verified, you will be able to approve the next milestone</li>
                </ul>
            </div>
            
            <div style="display: flex; gap: 1rem;">
                <button type="button" onclick="closeLenderApprovalModal()" style="flex: 1; padding: 1rem; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Close
                </button>
                <button type="button" onclick="refreshOrders()" style="flex: 1; padding: 1rem; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">
                    Refresh Status
                </button>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
}

async function submitFirstMilestoneApproval(orderId) {
    const order = currentOrders.find(o => o.id === orderId);
    if (!order) {
        alert('Order not found');
        return;
    }
    
    const errorEl = document.getElementById('first-milestone-approval-error');
    if (errorEl) errorEl.textContent = '';
    
    const daysInput = document.getElementById('first-milestone-days');
    const days = parseInt(daysInput.value);
    
    if (!days || days < 1) {
        errorEl.textContent = 'Please enter a valid number of days (minimum 1)';
        return;
    }
    
    // Create milestone_timelines for first milestone only
    const firstMilestone = order.milestones[0];
    const milestone_timelines = [{
        milestone_name: firstMilestone.name,
        timeline_days: days
    }];
    
    try {
        const response = await fetch(`${API_BASE}/orders/${orderId}/lender-approve`, {
            method: 'PATCH',
            headers: { 
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ milestone_timelines })
        });

        const data = await response.json();
        
        if (response.ok) {
            alert(`First milestone approved successfully!\\n\\nMilestone: ${firstMilestone.name}\\nTimeline: ${days} days\\n\\nThe supplier can now begin work on this milestone.`);
            closeLenderApprovalModal();
            refreshOrders();
        } else {
            if (errorEl) errorEl.textContent = data.message || 'Failed to approve milestone';
        }
    } catch (error) {
        if (errorEl) errorEl.textContent = 'Error approving milestone';
        console.error(error);
    }
}

async function rejectFundingRequest(orderId) {
    const reason = prompt('Please provide a reason for rejecting this funding request (optional):');
    
    if (reason === null) {
        // User cancelled
        return;
    }
    
    const errorEl = document.getElementById('first-milestone-approval-error');
    if (errorEl) errorEl.textContent = '';
    
    try {
        const response = await fetch(`${API_BASE}/lenders/orders/${orderId}/reject`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ rejection_reason: reason || 'No reason provided' })
        });

        const data = await response.json();
        
        if (response.ok) {
            alert('Funding request rejected successfully. The supplier has been notified.');
            closeLenderApprovalModal();
            refreshOrders();
        } else {
            if (errorEl) errorEl.textContent = data.message || 'Failed to reject funding request';
            else alert(data.message || 'Failed to reject funding request');
        }
    } catch (error) {
        if (errorEl) errorEl.textContent = 'Error rejecting funding request';
        else alert('Error rejecting funding request');
        console.error(error);
    }
}

function closeLenderApprovalModal() {
    const modal = document.getElementById('lender-approval-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Proof Upload Functions for Supplier
let proofUploadOrderId = null; // Store order ID in proof modal
let proofUploadMilestoneIndex = null; // Store milestone index

function openProofUploadModal(milestoneIndex, milestoneName) {
    // Store current order info for proof upload
    const currentOrder = getCurrentOrder();
    if (!currentOrder || !currentOrder.id) {
        alert('Error: Order information not available. Please close this and try again.');
        return;
    }
    
    proofUploadOrderId = currentOrder.id;
    proofUploadMilestoneIndex = milestoneIndex;
    
    // Create modal if it doesn't exist
    let modal = document.getElementById('proof-upload-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'proof-upload-modal';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <h2>Upload Invoice/Proof</h2>
            <div style="background: #f5f5f5; padding: 1rem; border-radius: 4px; margin-bottom: 1rem;">
                <p style="margin: 0;"><strong>Milestone:</strong> ${milestoneName}</p>
            </div>
            <form id="proof-upload-form" enctype="multipart/form-data">
                <div class="form-group">
                    <label>Upload Invoice/Proof Document:</label>
                    <input type="file" id="proof-file" name="proofFile" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" required style="width: 100%; padding: 0.75rem; margin-top: 0.5rem;" />
                    <small style="color: #666; font-size: 0.85rem; display: block; margin-top: 0.5rem;">
                        Accepted formats: PDF, JPG, PNG, DOC, DOCX, XLS, XLSX (Max 10MB)
                    </small>
                </div>
                <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                    <button type="submit" class="btn-success" style="flex: 1; padding: 0.75rem;">Upload</button>
                    <button type="button" onclick="closeProofUploadModal()" style="flex: 1; padding: 0.75rem;">Cancel</button>
                </div>
                <div id="upload-error" class="error" style="margin-top: 0.75rem;"></div>
            </form>
        </div>
    `;
    
    modal.style.display = 'flex';
    
    // Attach form handler
    const form = document.getElementById('proof-upload-form');
    form.onsubmit = async function(e) {
        e.preventDefault();
        await handleProofUpload();
    };
}

function closeProofUploadModal() {
    const modal = document.getElementById('proof-upload-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    // Clear stored values
    proofUploadOrderId = null;
    proofUploadMilestoneIndex = null;
    currentMilestoneIdForProof = null;
}

async function handleProofUpload() {
    const errorEl = document.getElementById('upload-error');
    errorEl.textContent = '';
    
    const fileInput = document.getElementById('proof-file');
    if (!fileInput || !fileInput.files[0]) {
        errorEl.textContent = 'Please select a file.';
        return;
    }
    
    // Use stored order and milestone info from modal
    const orderId = proofUploadOrderId;
    const milestoneIndex = proofUploadMilestoneIndex;
    
    console.log('[handleProofUpload] Using stored values:', { orderId, milestoneIndex });
    
    if (!orderId || typeof milestoneIndex !== 'number') {
        errorEl.textContent = 'Modal data invalid. Please close and try again.';
        console.error('[handleProofUpload] Invalid stored data:', { orderId, milestoneIndex });
        return;
    }
    
    const formData = new FormData();
    formData.append('proofFile', fileInput.files[0]);
    
    console.log('[handleProofUpload] Uploading to:', `${API_BASE}/proofs/upload/${orderId}/${milestoneIndex}`);
    
    try {
        const response = await fetch(`${API_BASE}/proofs/upload/${orderId}/${milestoneIndex}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert(`Invoice/proof uploaded successfully!\n\nMilestone: ${data.milestone.name}\nYour document is now awaiting admin verification.`);
            closeProofUploadModal();
            refreshOrders();
        } else {
            errorEl.textContent = data.message || 'Failed to upload proof';
        }
    } catch (error) {
        errorEl.textContent = 'Error uploading proof. Please try again.';
        console.error('[handleProofUpload] Error:', error);
    }
}

// Admin Invoice Approval Functions
// Admin Proof Approval Functions
async function adminApproveProof(orderId, milestoneIndex, milestoneName) {
    const notes = prompt(`Approve proof for milestone "${milestoneName}"?\n\nOptionally add approval notes:`, '');
    
    if (notes === null) {
        return; // User cancelled
    }
    
    try {
        const response = await fetch(`${API_BASE}/proofs/approve/${orderId}/${milestoneIndex}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ approvalNotes: notes || '' })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert(`Proof approved successfully!\n\nMilestone: ${data.milestone.name}\nAmount Released: $${data.milestone.amount.toLocaleString()}\n\nFunds have been transferred to the supplier.`);
            refreshOrders();
        } else {
            alert(data.message || 'Failed to approve proof');
        }
    } catch (error) {
        alert('Error approving proof. Please try again.');
        console.error(error);
    }
}

async function adminRejectProof(orderId, milestoneIndex, milestoneName) {
    const reason = prompt(`Reject proof for milestone "${milestoneName}"?\n\nPlease provide a reason for rejection:`, '');
    
    if (reason === null) {
        return; // User cancelled
    }
    
    if (!reason.trim()) {
        alert('Please provide a reason for rejection');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/proofs/reject/${orderId}/${milestoneIndex}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ rejectionReason: reason })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert(`Proof rejected.\n\nReason: ${reason}\n\nThe supplier has been notified and can resubmit a corrected proof.`);
            refreshOrders();
        } else {
            alert(data.message || 'Failed to reject proof');
        }
    } catch (error) {
        alert('Error rejecting proof. Please try again.');
        console.error(error);
    }
}

async function adminViewProof(orderId, milestoneIndex) {
    try {
        const response = await fetch(`${API_BASE}/proofs/view/${orderId}/${milestoneIndex}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            // File download will be handled by fetch
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            window.open(url, '_blank');
        } else {
            alert('Failed to download proof document');
        }
    } catch (error) {
        alert('Error downloading proof. Please try again.');
        console.error(error);
    }
}

// Open proof preview modal
async function openProofPreview(orderId, milestoneIndex, milestoneName, amount) {
    try {
        // Fetch the document
        const response = await fetch(`${API_BASE}/proofs/view/${orderId}/${milestoneIndex}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            alert('Failed to load document');
            return;
        }
        
        const blob = await response.blob();
        const objectUrl = window.URL.createObjectURL(blob);
        const contentType = blob.type;
        
        // Create modal
        let previewContent = '';
        if (contentType.includes('pdf')) {
            previewContent = `<iframe src="${objectUrl}" style="width: 100%; height: 500px; border: none; border-radius: 4px;"></iframe>`;
        } else if (contentType.includes('image')) {
            previewContent = `<img src="${objectUrl}" style="max-width: 100%; max-height: 500px; border-radius: 4px;">`;
        } else {
            previewContent = `<p style="text-align: center; color: #6b7280; padding: 2rem;">
                Document preview not available for this file type.
                <br><br>
                <button onclick="window.open('${objectUrl}', '_blank')" style="padding: 0.5rem 1rem; background: #0284c7; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Download Document
                </button>
            </p>`;
        }
        
        const modalHtml = `
            <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">
                <div style="background: white; border-radius: 8px; padding: 2rem; max-width: 90%; max-height: 90vh; overflow-y: auto; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 1rem;">
                        <div>
                            <h3 style="margin: 0; color: #111; font-size: 1.3rem;">Document Preview</h3>
                            <p style="margin: 0.25rem 0 0 0; color: #6b7280; font-size: 0.9rem;">Milestone: <strong>${milestoneName}</strong> | Amount: <strong>$${amount}</strong></p>
                        </div>
                        <button onclick="document.querySelectorAll('[data-proof-modal]').forEach(el => el.remove())" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #9ca3af;">×</button>
                    </div>
                    
                    <div style="margin-bottom: 1.5rem; background: #f9fafb; padding: 1rem; border-radius: 4px;">
                        ${previewContent}
                    </div>
                    
                    <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
                        <button onclick="document.querySelectorAll('[data-proof-modal]').forEach(el => el.remove())" style="padding: 0.75rem 1.5rem; background: #9ca3af; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600;">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        const modal = document.createElement('div');
        modal.setAttribute('data-proof-modal', 'true');
        modal.innerHTML = modalHtml;
        document.body.appendChild(modal);
        
    } catch (error) {
        alert('Error loading document preview');
        console.error(error);
    }
}

// Open approval modal with fund confirmation
function openProofApprovalModal(orderId, milestoneIndex, milestoneName, amount) {
    const modalHtml = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10001;">
            <div style="background: white; border-radius: 8px; padding: 2rem; max-width: 500px; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
                <div style="margin-bottom: 1.5rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 1rem;">
                    <h3 style="margin: 0 0 0.5rem 0; color: #111; font-size: 1.3rem;">Approve & Release Funds</h3>
                    <p style="margin: 0; color: #6b7280; font-size: 0.9rem;">Approving this proof will release funds to the supplier</p>
                </div>
                
                <div style="margin-bottom: 1.5rem; padding: 1rem; background: #dcfce7; border-left: 4px solid #22c55e; border-radius: 4px;">
                    <p style="margin: 0; color: #166534; font-size: 0.9rem;"><strong>Milestone:</strong></p>
                    <p style="margin: 0.5rem 0 0 0; color: #111; font-size: 1.1rem; font-weight: 700;">${milestoneName}</p>
                </div>
                
                <div style="margin-bottom: 1.5rem; padding: 1rem; background: #dbeafe; border-left: 4px solid #0284c7; border-radius: 4px;">
                    <p style="margin: 0; color: #1e40af; font-size: 0.9rem;"><strong>Fund Transfer Amount:</strong></p>
                    <p style="margin: 0.5rem 0 0 0; color: #111; font-size: 1.5rem; font-weight: 700;">$${amount.toLocaleString()}</p>
                    <p style="margin: 0.5rem 0 0 0; color: #1e40af; font-size: 0.85rem;">This amount will be released to the supplier upon approval</p>
                </div>
                
                <div style="margin-bottom: 1.5rem;">
                    <label style="display: block; margin-bottom: 0.5rem; color: #111; font-weight: 600;">Approval Notes (Optional):</label>
                    <textarea id="approvalNotes" placeholder="Add any notes about this approval..." style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 4px; font-family: inherit; font-size: 0.9rem; resize: vertical; min-height: 80px; box-sizing: border-box;"></textarea>
                </div>
                
                <div style="display: flex; gap: 0.75rem;">
                    <button onclick="document.querySelectorAll('[data-approval-modal]').forEach(el => el.remove())" style="flex: 1; padding: 0.75rem 1.5rem; background: #9ca3af; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600;">
                        Cancel
                    </button>
                    <button onclick="confirmProofApproval('${orderId}', ${milestoneIndex}, '${milestoneName}', ${amount})" style="flex: 1; padding: 0.75rem 1.5rem; background: #22c55e; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600; font-weight: 700;">
                        ✓ Approve & Release Funds
                    </button>
                </div>
            </div>
        </div>
    `;
    
    const modal = document.createElement('div');
    modal.setAttribute('data-approval-modal', 'true');
    modal.innerHTML = modalHtml;
    document.body.appendChild(modal);
}

// Confirm and submit proof approval
async function confirmProofApproval(orderId, milestoneIndex, milestoneName, amount) {
    const notes = document.getElementById('approvalNotes')?.value || '';
    
    try {
        const response = await fetch(`${API_BASE}/proofs/approve/${orderId}/${milestoneIndex}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ approvalNotes: notes })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Close modal
            document.querySelectorAll('[data-approval-modal]').forEach(el => el.remove());
            
            // Show success message
            alert(`✓ Proof Approved!\n\nMilestone: ${milestoneName}\nAmount Released: $${amount.toLocaleString()}\n\nFunds have been transferred to the supplier.`);
            refreshOrders();
        } else {
            alert(data.message || 'Failed to approve proof');
        }
    } catch (error) {
        alert('Error approving proof. Please try again.');
        console.error(error);
    }
}

// Legacy function - kept for backward compatibility
async function approveInvoice(milestoneId, milestoneName) {
    if (!confirm(`Approve invoice for milestone "${milestoneName}"?\\n\\nThis will:\\n- Mark the invoice as VERIFIED\\n- Complete the milestone\\n- Release funds to the appropriate recipient`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/milestones/${milestoneId}/verify-proof`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ verified: true })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert(`Invoice approved successfully!\\n\\nMilestone "${milestoneName}" has been verified.\\n\\nYou can now complete this milestone to release funds.`);
            refreshOrders();
        } else {
            alert(data.message || 'Failed to approve invoice');
        }
    } catch (error) {
        alert('Error approving invoice. Please try again.');
        console.error(error);
    }
}

async function rejectInvoice(milestoneId, milestoneName) {
    const reason = prompt(`Reject invoice for milestone "${milestoneName}"\\n\\nPlease provide a reason for rejection:`);
    
    if (reason === null) {
        return; // User cancelled
    }
    
    if (!reason.trim()) {
        alert('Please provide a reason for rejection');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/milestones/${milestoneId}/verify-proof`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                verified: false,
                rejection_reason: reason
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert(`Invoice rejected.\\n\\nReason: ${reason}\\n\\nThe supplier will need to re-upload a new invoice.`);
            refreshOrders();
        } else {
            alert(data.message || 'Failed to reject invoice');
        }
    } catch (error) {
        alert('Error rejecting invoice. Please try again.');
        console.error(error);
    }
}

// Admin Complete Milestone Function
async function completeMilestoneAction(milestoneId, milestoneName) {
    if (!confirm(`Complete milestone "${milestoneName}"?\\n\\nThis will:\\n• Mark milestone as COMPLETED\\n• Release funds to recipient (LENDER for 1st milestone, SUPPLIER for subsequent)\\n\\nAre you sure?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/milestones/${milestoneId}/complete`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert(`Milestone "${milestoneName}" completed!\n\nFunds have been released to the recipient.`);
            refreshOrders();
        } else {
            alert(data.message || 'Failed to complete milestone');
        }
    } catch (error) {
        alert('Error completing milestone. Please try again.');
        console.error(error);
    }
}

// Admin Lock Funds Function
async function lockFunds(orderId) {
    if (!confirm('Lock funds for this order? This will create a LOCK transaction in the ledger.')) return;
    
    try {
        const response = await fetch(`${API_BASE}/orders/${orderId}/lock-funds`, {
            method: 'PATCH',
            headers: { 
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        
        if (response.ok) {
            const txnDate = new Date(data.transaction.createdAt).toLocaleDateString();
            alert(`Funds locked successfully!\\n\\nTransaction Details:\\n- Type: ${data.transaction.type}\\n- Amount: $${data.transaction.amount.toLocaleString()}\\n- Date: ${txnDate}\\n\\nOrder is now active and supplier can begin work.`);
            refreshOrders();
        } else {
            alert(data.message || 'Failed to lock funds');
        }
    } catch (error) {
        alert('Error locking funds');
        console.error(error);
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

// Fix missing milestones for an order
async function fixMissingMilestones(orderId) {
    try {
        const response = await fetch(`${API_BASE}/admin/fix/recreate-milestones/${orderId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (response.ok) {
            alert(`✓ Success!\n\nCreated ${data.milestones.length} milestones for this order.\n\nRefreshing...`);
            // Close modal and reload order details
            closeModal('order-details-modal');
            await refreshOrders();
            // Reopen the modal with fresh data
            setTimeout(() => viewOrderDetails(orderId), 500);
        } else {
            alert(`Failed to fix milestones: ${data.message}`);
        }
    } catch (error) {
        console.error('Error fixing milestones:', error);
        alert('Error fixing milestones. Please try again.');
    }
}
