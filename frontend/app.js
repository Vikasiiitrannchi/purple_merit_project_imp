// API Configuration
const API_BASE_URL = "http://localhost:5000/api";
let authToken = null;

// DOM Elements
const loginForm = document.getElementById('loginForm');
const logoutBtn = document.getElementById('logoutBtn');
const runSimulationBtn = document.getElementById('runSimulation');

// Check authentication on page load
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is already logged in
    const token = localStorage.getItem('authToken');
    if (token) {
        authToken = token;
        updateUIAfterLogin();
    }
    
    // Setup event listeners
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    if (runSimulationBtn) {
        runSimulationBtn.addEventListener('click', runSimulation);
    }
});

// Handle login
async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username, password})
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Login failed');
        }
        
        const data = await response.json();
        authToken = data.token;
        localStorage.setItem('authToken', authToken);
        updateUIAfterLogin();
    } catch (error) {
        alert(`Login failed: ${error.message}`);
    }
}

// Handle logout
function handleLogout() {
    authToken = null;
    localStorage.removeItem('authToken');
    updateUIAfterLogout();
    // Show login form
    document.getElementById('loginSection').style.display = 'block';
}

// Update UI after login
function updateUIAfterLogin() {
    // Hide login form, show app content
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('appContent').style.display = 'block';
    
    // Enable simulation button
    if (runSimulationBtn) {
        runSimulationBtn.disabled = false;
    }
    
    // Update user info
    const usernameSpan = document.getElementById('usernameDisplay');
    if (usernameSpan) {
        usernameSpan.textContent = localStorage.getItem('username') || 'User';
    }
}

// Update UI after logout
function updateUIAfterLogout() {
    // Show login form, hide app content
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('appContent').style.display = 'none';
    
    // Disable simulation button
    if (runSimulationBtn) {
        runSimulationBtn.disabled = true;
    }
}

// Run simulation
async function runSimulation() {
    const driverCount = document.getElementById('driverCount').value;
    const maxHours = document.getElementById('maxHours').value;
    const startTime = document.getElementById('startTime').value;
    const orderValue = document.getElementById('orderValue').value;
    
    // Show loading state
    const originalBtnContent = runSimulationBtn.innerHTML;
    runSimulationBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Running Simulation...';
    runSimulationBtn.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE_URL}/simulate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                num_drivers: driverCount,
                start_time: startTime,
                max_hours: maxHours
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Simulation failed');
        }
        
        const data = await response.json();
        displaySimulationResults(data);
    } catch (error) {
        alert(`Simulation error: ${error.message}`);
    } finally {
        // Restore button state
        runSimulationBtn.innerHTML = originalBtnContent;
        runSimulationBtn.disabled = false;
    }
}

// Display simulation results
function displaySimulationResults(data) {
    // Update metrics
    document.getElementById('totalProfit').textContent = `$${data.total_profit.toFixed(2)}`;
    document.getElementById('efficiencyScore').textContent = `${data.efficiency_score.toFixed(1)}%`;
    document.getElementById('fuelCost').textContent = `$${data.total_fuel_cost.toFixed(2)}`;
    document.getElementById('onTimeDeliveries').textContent = data.on_time_deliveries;
    document.getElementById('lateDeliveries').textContent = data.late_deliveries;
    
    // Update charts (you'll need to implement these functions)
    updateDriverChart(data.driver_allocation);
    updateEfficiencyChart(data.route_efficiency);
    
    // Generate recommendations
    generateRecommendations(data);
    
    // Show results
    document.getElementById('simulationResult').style.display = 'block';
    
    // Scroll to results
    document.getElementById('simulationResult').scrollIntoView({ behavior: 'smooth' });
}

// Generate recommendations based on simulation results
function generateRecommendations(data) {
    const recommendationsList = document.getElementById('recommendationsList');
    recommendationsList.innerHTML = '';
    
    // Add recommendations based on simulation results
    if (data.late_deliveries > 0) {
        const li = document.createElement('li');
        li.textContent = `Add more drivers to reduce late deliveries (currently ${data.late_deliveries} late)`;
        recommendationsList.appendChild(li);
    }
    
    if (data.fatigued_drivers && data.fatigued_drivers.length > 0) {
        const li = document.createElement('li');
        li.textContent = `Reduce hours for drivers: ${data.fatigued_drivers.join(', ')} to prevent fatigue`;
        recommendationsList.appendChild(li);
    }
    
    if (data.total_fuel_cost > 3000) {
        const li = document.createElement('li');
        li.textContent = 'Optimize routes to reduce fuel costs';
        recommendationsList.appendChild(li);
    }
    
    if (data.efficiency_score < 85) {
        const li = document.createElement('li');
        li.textContent = 'Reassign drivers to different routes to improve efficiency';
        recommendationsList.appendChild(li);
    }
    
    // Add default recommendation if no specific ones
    if (recommendationsList.children.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Current operations are efficient. No major changes needed';
        recommendationsList.appendChild(li);
    }
}

// Example chart update functions (implement based on your chart libraries)
function updateDriverChart(allocationData) {
    // Implement using Chart.js or your preferred library
    console.log('Updating driver chart with:', allocationData);
}

function updateEfficiencyChart(efficiencyData) {
    // Implement using Chart.js or your preferred library
    console.log('Updating efficiency chart with:', efficiencyData);
}