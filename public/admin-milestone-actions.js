// Admin Milestone Management Functions

async function pauseMilestoneAdmin(milestoneId, milestoneName) {
    const reason = prompt(`Pause milestone "${milestoneName}"?\n\nPlease provide a reason for pausing:`);
    
    if (reason === null) return;
    
    if (!reason.trim()) {
        alert('Please provide a reason for pausing the milestone.');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/admin/milestones/${milestoneId}/pause`, {
            method: 'PATCH',
            headers: { 
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason: reason.trim() })
        });

        const data = await response.json();
        
        if (response.ok) {
            alert(`Milestone paused successfully!\n\nMilestone: ${milestoneName}\nReason: ${reason}`);
            refreshOrders();
        } else {
            alert(data.message || 'Failed to pause milestone');
        }
    } catch (error) {
        alert('Error pausing milestone');
        console.error(error);
    }
}

async function resumeMilestoneAdmin(milestoneId, milestoneName) {
    if (!confirm(`Resume milestone "${milestoneName}"?\n\nThis will allow the supplier to continue work on this milestone.`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/admin/milestones/${milestoneId}/resume`, {
            method: 'PATCH',
            headers: { 
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        
        if (response.ok) {
            alert(`Milestone resumed successfully!\n\nMilestone: ${milestoneName}`);
            refreshOrders();
        } else {
            alert(data.message || 'Failed to resume milestone');
        }
    } catch (error) {
        alert('Error resuming milestone');
        console.error(error);
    }
}

async function freezeMilestoneAdmin(milestoneId, milestoneName) {
    const reason = prompt(`⚠️ FREEZE milestone "${milestoneName}"?\n\nThis is a serious action for suspicious activity.\nPlease provide a detailed reason:`);
    
    if (reason === null) return;
    
    if (!reason.trim()) {
        alert('Please provide a reason for freezing the milestone.');
        return;
    }
    
    if (!confirm(`Are you sure you want to FREEZE this milestone?\n\nMilestone: ${milestoneName}\nReason: ${reason}\n\nThis will stop all activities and alert all parties.`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/admin/milestones/${milestoneId}/freeze`, {
            method: 'PATCH',
            headers: { 
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason: reason.trim() })
        });

        const data = await response.json();
        
        if (response.ok) {
            alert(`Milestone FROZEN successfully!\n\nMilestone: ${milestoneName}\nReason: ${reason}\n\nAll parties have been notified.`);
            refreshOrders();
        } else {
            alert(data.message || 'Failed to freeze milestone');
        }
    } catch (error) {
        alert('Error freezing milestone');
        console.error(error);
    }
}

async function unfreezeMilestoneAdmin(milestoneId, milestoneName) {
    if (!confirm(`Unfreeze milestone "${milestoneName}"?\n\nThis will allow normal operations to resume.`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/admin/milestones/${milestoneId}/unfreeze`, {
            method: 'PATCH',
            headers: { 
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        
        if (response.ok) {
            alert(`Milestone unfrozen successfully!\n\nMilestone: ${milestoneName}`);
            refreshOrders();
        } else {
            alert(data.message || 'Failed to unfreeze milestone');
        }
    } catch (error) {
        alert('Error unfreezing milestone');
        console.error(error);
    }
}

async function forceCompleteMilestoneAdmin(milestoneId, milestoneName) {
    const reason = prompt(`Force complete milestone "${milestoneName}"?\n\nThis will bypass normal completion process.\nPlease provide a reason:`);
    
    if (reason === null) return;
    
    if (!reason.trim()) {
        alert('Please provide a reason for force completing the milestone.');
        return;
    }
    
    if (!confirm(`Are you sure you want to FORCE COMPLETE this milestone?\n\nMilestone: ${milestoneName}\nReason: ${reason}\n\nThis will release funds immediately.`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/admin/milestones/${milestoneId}/force-complete`, {
            method: 'PATCH',
            headers: { 
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason: reason.trim() })
        });

        const data = await response.json();
        
        if (response.ok) {
            alert(`Milestone force completed successfully!\n\nMilestone: ${milestoneName}\nFunds released: $${data.milestone.released_amount.toLocaleString()}`);
            refreshOrders();
        } else {
            alert(data.message || 'Failed to force complete milestone');
        }
    } catch (error) {
        alert('Error force completing milestone');
        console.error(error);
    }
}

async function releaseFundsToLender(milestoneId, milestoneName, amount) {
    const releaseAmount = prompt(`Release funds to LENDER for "${milestoneName}"?\n\nFull amount: $${amount.toLocaleString()}\n\nEnter amount to release (or leave blank for full amount):`);
    
    if (releaseAmount === null) return;
    
    const finalAmount = releaseAmount.trim() ? parseFloat(releaseAmount) : amount;
    
    if (isNaN(finalAmount) || finalAmount <= 0) {
        alert('Please enter a valid amount.');
        return;
    }
    
    if (finalAmount > amount) {
        alert('Release amount cannot exceed milestone amount.');
        return;
    }
    
    if (!confirm(`Release $${finalAmount.toLocaleString()} to LENDER?\n\nMilestone: ${milestoneName}\n\nThis transaction will be recorded.`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/admin/milestones/${milestoneId}/release-to-lender`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                amount: finalAmount,
                reason: `Raw materials purchase for ${milestoneName}`
            })
        });

        const data = await response.json();
        
        if (response.ok) {
            alert(`Funds released to lender successfully!\n\nAmount: $${finalAmount.toLocaleString()}\nMilestone: ${milestoneName}`);
            refreshOrders();
        } else {
            alert(data.message || 'Failed to release funds to lender');
        }
    } catch (error) {
        alert('Error releasing funds to lender');
        console.error(error);
    }
}

async function releaseFundsToSupplier(milestoneId, milestoneName, amount) {
    const releaseAmount = prompt(`Release funds to SUPPLIER for "${milestoneName}"?\n\nFull amount: $${amount.toLocaleString()}\n\nEnter amount to release (or leave blank for full amount):`);
    
    if (releaseAmount === null) return;
    
    const finalAmount = releaseAmount.trim() ? parseFloat(releaseAmount) : amount;
    
    if (isNaN(finalAmount) || finalAmount <= 0) {
        alert('Please enter a valid amount.');
        return;
    }
    
    if (finalAmount > amount) {
        alert('Release amount cannot exceed milestone amount.');
        return;
    }
    
    if (!confirm(`Release $${finalAmount.toLocaleString()} to SUPPLIER?\n\nMilestone: ${milestoneName}\n\nThis transaction will be recorded.`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/admin/milestones/${milestoneId}/release-to-supplier`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                amount: finalAmount,
                reason: `Production costs for ${milestoneName}`
            })
        });

        const data = await response.json();
        
        if (response.ok) {
            alert(`Funds released to supplier successfully!\n\nAmount: $${finalAmount.toLocaleString()}\nMilestone: ${milestoneName}\nTotal released: $${data.transaction.total_released.toLocaleString()}`);
            refreshOrders();
        } else {
            alert(data.message || 'Failed to release funds to supplier');
        }
    } catch (error) {
        alert('Error releasing funds to supplier');
        console.error(error);
    }
}
