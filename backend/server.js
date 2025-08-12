require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const csv = require('csv-parser');
const fs = require('fs');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000;

app.use(bodyParser.json());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); 
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors({
  origin: '*', // Allow all origins (adjust for production)
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// MongoDB Models
const Driver = mongoose.model('Driver', new mongoose.Schema({
  name: String,
  shift_hours: Number,
  past_week_hours: [Number]
}));

const Route = mongoose.model('Route', new mongoose.Schema({
  route_id: Number,
  distance_km: Number,
  traffic_level: String,
  base_time_min: Number
}));

const Order = mongoose.model('Order', new mongoose.Schema({
  order_id: Number,
  value_rs: Number,
  route_id: Number,
  delivery_time: String
}));

const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, unique: true },
  password: String
}));

const Simulation = mongoose.model('Simulation', new mongoose.Schema({
  user_id: mongoose.Schema.Types.ObjectId,
  num_drivers: Number,
  start_time: String,
  max_hours: Number,
  total_profit: Number,
  efficiency_score: Number,
  on_time_deliveries: Number,
  late_deliveries: Number,
  total_bonus: Number,
  total_penalties: Number,
  total_fuel_cost: Number,
  created_at: { type: Date, default: Date.now }
}));

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// Load initial data from CSV files
async function loadInitialData() {
  try {
    // Load drivers
    if (await Driver.countDocuments() === 0) {
      const drivers = [];
      fs.createReadStream('data/drivers.csv')
        .pipe(csv())
        .on('data', (row) => {
          drivers.push({
            name: row.name,
            shift_hours: parseInt(row.shift_hours),
            past_week_hours: row.past_week_hours.split('|').map(Number)
          });
        })
        .on('end', async () => {
          await Driver.insertMany(drivers);
          console.log('Drivers data loaded');
        });
    }

    // Load routes
    if (await Route.countDocuments() === 0) {
      const routes = [];
      fs.createReadStream('data/routes.csv')
        .pipe(csv())
        .on('data', (row) => {
          routes.push({
            route_id: parseInt(row.route_id),
            distance_km: parseFloat(row.distance_km),
            traffic_level: row.traffic_level,
            base_time_min: parseInt(row.base_time_min)
          });
        })
        .on('end', async () => {
          await Route.insertMany(routes);
          console.log('Routes data loaded');
        });
    }

    // Load orders
    if (await Order.countDocuments() === 0) {
      const orders = [];
      fs.createReadStream('data/orders.csv')
        .pipe(csv())
        .on('data', (row) => {
          orders.push({
            order_id: parseInt(row.order_id),
            value_rs: parseFloat(row.value_rs),
            route_id: parseInt(row.route_id),
            delivery_time: row.delivery_time
          });
        })
        .on('end', async () => {
          await Order.insertMany(orders);
          console.log('Orders data loaded');
        });
    }
  } catch (err) {
    console.error('Error loading initial data:', err);
  }
}

loadInitialData();

// Helper function to convert HH:MM to minutes
function timeToMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// Authentication Middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Add this before your routes
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});


app.get('/', (req, res) => {
  res.send('GreenCart Logistics API is running');
});

// Routes
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: 'User registered', userId: user._id });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id, username }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, userId: user._id, username });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// CRUD Endpoints for Drivers
app.get('/api/drivers', authenticate, async (req, res) => {
  try {
    const drivers = await Driver.find();
    res.json(drivers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch drivers' });
  }
});

app.post('/api/drivers', authenticate, async (req, res) => {
  const { name, shift_hours, past_week_hours } = req.body;
  if (!name || !shift_hours || !past_week_hours) {
    return res.status(400).json({ error: 'All fields required' });
  }

  try {
    const driver = new Driver({ name, shift_hours, past_week_hours });
    await driver.save();
    res.status(201).json(driver);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create driver' });
  }
});

app.put('/api/drivers/:id', authenticate, async (req, res) => {
  try {
    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    res.json(driver);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update driver' });
  }
});

app.delete('/api/drivers/:id', authenticate, async (req, res) => {
  try {
    const driver = await Driver.findByIdAndDelete(req.params.id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    res.json({ message: 'Driver deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete driver' });
  }
});

// CRUD Endpoints for Routes
app.get('/api/routes', authenticate, async (req, res) => {
  try {
    const routes = await Route.find();
    res.json(routes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch routes' });
  }
});

app.post('/api/routes', authenticate, async (req, res) => {
  try {
    const route = new Route(req.body);
    await route.save();
    res.status(201).json(route);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create route' });
  }
});

app.put('/api/routes/:id', authenticate, async (req, res) => {
  try {
    const route = await Route.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!route) return res.status(404).json({ error: 'Route not found' });
    res.json(route);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update route' });
  }
});

app.delete('/api/routes/:id', authenticate, async (req, res) => {
  try {
    const route = await Route.findByIdAndDelete(req.params.id);
    if (!route) return res.status(404).json({ error: 'Route not found' });
    res.json({ message: 'Route deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete route' });
  }
});

// CRUD Endpoints for Orders
app.get('/api/orders', authenticate, async (req, res) => {
  try {
    const orders = await Order.find();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.post('/api/orders', authenticate, async (req, res) => {
  try {
    const order = new Order(req.body);
    await order.save();
    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create order' });
  }
});

app.put('/api/orders/:id', authenticate, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order' });
  }
});

app.delete('/api/orders/:id', authenticate, async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ message: 'Order deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

// Simulation Endpoint
app.post('/api/simulate', authenticate, async (req, res) => {
  const { num_drivers, start_time, max_hours } = req.body;
  const userId = req.user.id;

  // Validation
  if (!num_drivers || !start_time || !max_hours) {
    return res.status(400).json({ error: 'All parameters required' });
  }
  if (num_drivers <= 0 || max_hours <= 0) {
    return res.status(400).json({ error: 'Parameters must be positive numbers' });
  }
  if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(start_time)) {
    return res.status(400).json({ error: 'Invalid start time format (HH:MM)' });
  }

  try {
    // Get all orders and routes
    const orders = await Order.find();
    const routes = await Route.find();
    const routesMap = new Map(routes.map(route => [route.route_id, route]));

    // Assign orders to drivers (round-robin)
    const driverOrders = Array.from({ length: num_drivers }, () => []);
    orders.forEach((order, index) => {
      driverOrders[index % num_drivers].push(order);
    });

    // Simulation variables
    let totalProfit = 0;
    let totalBonus = 0;
    let totalPenalties = 0;
    let totalFuelCost = 0;
    let onTimeDeliveries = 0;
    let lateDeliveries = 0;
    const fatiguedDrivers = [];

    // Process each driver
    for (let i = 0; i < num_drivers; i++) {
      let currentTime = timeToMinutes(start_time);
      let driverWorkTime = 0;
      let driverFatigued = false;

      for (const order of driverOrders[i]) {
        const route = routesMap.get(order.route_id);
        if (!route) continue;

        // Calculate fuel cost
        let fuelCost = route.distance_km * 5;
        if (route.traffic_level === 'High') {
          fuelCost += route.distance_km * 2;
        }
        totalFuelCost += fuelCost;

        // Calculate delivery time
        const baseDeliveryTime = route.base_time_min;
        const expectedDeliveryTime = timeToMinutes(order.delivery_time);
        const actualDeliveryTime = currentTime + baseDeliveryTime;

        // Check if order would exceed max hours
        if ((driverWorkTime + baseDeliveryTime) > max_hours * 60) {
          // Skip this order and mark driver as fatigued if over 8 hours
          if (driverWorkTime > 8 * 60 && !driverFatigued) {
            fatiguedDrivers.push(`Driver ${i + 1}`);
            driverFatigued = true;
          }
          continue;
        }

        // Apply company rules
        let penalty = 0;
        let bonus = 0;

        // Rule 1: Late Delivery Penalty
        if (actualDeliveryTime > expectedDeliveryTime + 10) {
          penalty = 50;
          totalPenalties += penalty;
          lateDeliveries++;
        } else {
          onTimeDeliveries++;
        }

        // Rule 3: High-Value Bonus
        if (order.value_rs > 1000 && actualDeliveryTime <= expectedDeliveryTime) {
          bonus = order.value_rs * 0.1;
          totalBonus += bonus;
        }

        // Update profit
        const orderProfit = order.value_rs + bonus - penalty - fuelCost;
        totalProfit += orderProfit;

        // Update driver time
        currentTime = actualDeliveryTime;
        driverWorkTime += baseDeliveryTime;
      }

      // Check driver fatigue for next day
      if (driverWorkTime > 8 * 60 && !driverFatigued) {
        fatiguedDrivers.push(`Driver ${i + 1}`);
      }
    }

    // Calculate efficiency score
    const totalDeliveries = onTimeDeliveries + lateDeliveries;
    const efficiencyScore = totalDeliveries > 0 ? 
      (onTimeDeliveries / totalDeliveries) * 100 : 0;

    // Save simulation results
    const simulation = new Simulation({
      user_id: userId,
      num_drivers,
      start_time,
      max_hours,
      total_profit: totalProfit,
      efficiency_score: efficiencyScore,
      on_time_deliveries: onTimeDeliveries,
      late_deliveries: lateDeliveries,
      total_bonus: totalBonus,
      total_penalties: totalPenalties,
      total_fuel_cost: totalFuelCost
    });
    await simulation.save();

    // Return results
    res.json({
      total_profit: totalProfit,
      efficiency_score: efficiencyScore,
      on_time_deliveries: onTimeDeliveries,
      late_deliveries: lateDeliveries,
      total_bonus: totalBonus,
      total_penalties: totalPenalties,
      total_fuel_cost: totalFuelCost,
      fatigued_drivers: fatiguedDrivers,
      simulation_id: simulation._id
    });
  } catch (err) {
    console.error('Simulation error:', err);
    res.status(500).json({ error: 'Simulation failed' });
  }
});

// Get simulation history
app.get('/api/simulations', authenticate, async (req, res) => {
  try {
    const simulations = await Simulation.find({ user_id: req.user.id }).sort({ created_at: -1 });
    res.json(simulations);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch simulations' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});