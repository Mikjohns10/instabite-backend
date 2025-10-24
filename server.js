const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/instabite_db', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB Connected Successfully'))
.catch(err => console.log('❌ MongoDB Connection Error:', err));

// Schemas
const restaurantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  password: { type: String, required: true },
  upiId: String,
  paymentQrCode: String,
  gstin: String,
  menu: [{
    name: String,
    price: Number,
    category: String,
    description: String,
    available: { type: Boolean, default: true }
  }],
  createdAt: { type: Date, default: Date.now }
});

const orderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true },
  restaurantId: { type: String, required: true },
  restaurantName: String,
  restaurantAddress: String,
  restaurantGSTIN: String,
  customerName: { type: String, required: true },
  customerPhone: { type: String, required: true },
  customerAddress: { type: String, required: true },
  customerEmail: String,
  items: [{
    name: String,
    price: Number,
    quantity: Number,
    itemTotal: Number
  }],
  totalAmount: Number,
  gstAmount: Number,
  grandTotal: Number,
  status: { type: String, default: 'pending' },
  specialInstructions: String,
  paymentMethod: { type: String, default: 'UPI' },
  orderDate: { type: Date, default: Date.now },
  billGenerated: { type: Boolean, default: false }
});

const Restaurant = mongoose.model('Restaurant', restaurantSchema);
const Order = mongoose.model('Order', orderSchema);

// Generate Order ID
function generateOrderId() {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `IB${timestamp}${random}`;
}

// 📊 RESTAURANT ENDPOINTS

// Register Restaurant
app.post('/api/restaurant/register', async (req, res) => {
  try {
    const { name, email, phone, address, password, upiId, paymentQrCode, gstin } = req.body;
    
    // Check if restaurant already exists
    const existingRestaurant = await Restaurant.findOne({ email });
    if (existingRestaurant) {
      return res.status(400).json({ 
        success: false, 
        error: 'Restaurant with this email already exists' 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const restaurant = new Restaurant({
      name,
      email,
      phone,
      address,
      password: hashedPassword,
      upiId,
      paymentQrCode,
      gstin
    });
    
    await restaurant.save();
    
    res.status(201).json({ 
      success: true, 
      message: 'Restaurant registered successfully!', 
      restaurant: { 
        id: restaurant._id, 
        name: restaurant.name,
        email: restaurant.email
      } 
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Restaurant Login
app.post('/api/restaurant/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const restaurant = await Restaurant.findOne({ email });
    if (!restaurant) {
      return res.status(401).json({ 
        success: false, 
        error: 'Restaurant not found with this email' 
      });
    }
    
    const isPasswordValid = await bcrypt.compare(password, restaurant.password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid password' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Login successful!', 
      restaurant: { 
        id: restaurant._id, 
        name: restaurant.name,
        email: restaurant.email
      } 
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get Restaurant Details
app.get('/api/restaurant/:id', async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ success: false, error: 'Restaurant not found' });
    }
    
    // Don't send password
    const restaurantData = { ...restaurant._doc };
    delete restaurantData.password;
    
    res.json({ success: true, restaurant: restaurantData });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Update Restaurant Payment Info
app.put('/api/restaurant/:id/payment-info', async (req, res) => {
  try {
    const { upiId, paymentQrCode, gstin } = req.body;
    
    const restaurant = await Restaurant.findByIdAndUpdate(
      req.params.id,
      { upiId, paymentQrCode, gstin },
      { new: true }
    );
    
    if (!restaurant) {
      return res.status(404).json({ success: false, error: 'Restaurant not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'Payment information updated successfully!',
      restaurant: { 
        upiId: restaurant.upiId, 
        paymentQrCode: restaurant.paymentQrCode,
        gstin: restaurant.gstin
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Add Menu Item
app.post('/api/restaurant/:id/menu', async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ success: false, error: 'Restaurant not found' });
    }
    
    const menuItem = {
      name: req.body.name,
      price: req.body.price,
      category: req.body.category,
      description: req.body.description,
      available: true
    };
    
    restaurant.menu.push(menuItem);
    await restaurant.save();
    
    res.json({ 
      success: true, 
      message: 'Menu item added successfully!', 
      menu: restaurant.menu 
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get Restaurant Menu
app.get('/api/restaurant/:id/menu', async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ success: false, error: 'Restaurant not found' });
    }
    
    res.json({ success: true, menu: restaurant.menu });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 📦 ORDER ENDPOINTS

// Create New Order
app.post('/api/orders', async (req, res) => {
  try {
    const orderData = req.body;
    
    // Calculate item totals
    orderData.items = orderData.items.map(item => ({
      ...item,
      itemTotal: item.price * item.quantity
    }));
    
    // Calculate total amount
    orderData.totalAmount = orderData.items.reduce((sum, item) => sum + item.itemTotal, 0);
    
    // Generate unique order ID
    orderData.orderId = generateOrderId();
    
    // Get restaurant info for order
    const restaurant = await Restaurant.findById(orderData.restaurantId);
    if (restaurant) {
      orderData.restaurantName = restaurant.name;
      orderData.restaurantAddress = restaurant.address;
      orderData.restaurantGSTIN = restaurant.gstin;
    }
    
    const order = new Order(orderData);
    await order.save();
    
    // Bill URL for frontend
    const billUrl = `${req.protocol}://${req.get('host')}/api/orders/${order._id}/bill`;
    
    res.status(201).json({ 
      success: true, 
      message: 'Order placed successfully!', 
      order: {
        ...order.toObject(),
        billUrl
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get Orders for Restaurant
app.get('/api/restaurant/:id/orders', async (req, res) => {
  try {
    const orders = await Order.find({ restaurantId: req.params.id })
                            .sort({ orderDate: -1 });
    
    res.json({ success: true, orders });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Update Order Status
app.put('/api/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    const order = await Order.findByIdAndUpdate(
      req.params.id, 
      { status }, 
      { new: true }
    );
    
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'Order status updated successfully!', 
      order 
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get Single Order
app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    
    const billUrl = `${req.protocol}://${req.get('host')}/api/orders/${order._id}/bill`;
    
    res.json({ 
      success: true, 
      order: {
        ...order.toObject(),
        billUrl
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 🧾 BILL GENERATION ENDPOINT
app.get('/api/orders/:id/bill', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const restaurant = await Restaurant.findById(order.restaurantId);
    
    // Create PDF document
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    // Set response headers for PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=InstaBite-Bill-${order.orderId}.pdf`);
    
    // Pipe PDF to response
    doc.pipe(res);

    // 🏪 HEADER SECTION
    doc.fontSize(24).font('Helvetica-Bold')
       .fillColor('#ff6b6b')
       .text('🍕 INSTABITE.SHOP', 50, 50, { align: 'center' });
    
    doc.fontSize(12).font('Helvetica')
       .fillColor('#666')
       .text('Food Delivery Platform | instabitesecv.shop', 50, 80, { align: 'center' });
    
    // Line separator
    doc.moveTo(50, 100).lineTo(550, 100).strokeColor('#ff6b6b').lineWidth(2).stroke();

    // 📄 INVOICE TITLE
    doc.fontSize(18).font('Helvetica-Bold')
       .fillColor('#333')
       .text('TAX INVOICE', 50, 120);
    
    doc.fontSize(10).font('Helvetica')
       .fillColor('#666')
       .text(`Bill No: ${order.orderId}`, 400, 120, { align: 'right' })
       .text(`Date: ${order.orderDate.toLocaleDateString()}`, 400, 135, { align: 'right' })
       .text(`Time: ${order.orderDate.toLocaleTimeString()}`, 400, 150, { align: 'right' });

    // 🏪 RESTAURANT INFO
    doc.fontSize(12).font('Helvetica-Bold')
       .fillColor('#000')
       .text('Sold By:', 50, 180);
    
    doc.fontSize(10).font('Helvetica')
       .text(restaurant.name, 50, 200)
       .text(`Address: ${restaurant.address}`, 50, 215)
       .text(`Phone: ${restaurant.phone}`, 50, 230);
    
    if (restaurant.gstin) {
      doc.text(`GSTIN: ${restaurant.gstin}`, 50, 245);
    }

    // 👤 CUSTOMER INFO
    doc.fontSize(12).font('Helvetica-Bold')
       .text('Bill To:', 300, 180);
    
    doc.fontSize(10).font('Helvetica')
       .text(`Name: ${order.customerName}`, 300, 200)
       .text(`Phone: ${order.customerPhone}`, 300, 215)
       .text(`Address: ${order.customerAddress}`, 300, 230, { width: 200 });

    // Line separator
    doc.moveTo(50, 270).lineTo(550, 270).strokeColor('#ccc').lineWidth(1).stroke();

    // 📊 ORDER ITEMS TABLE HEADER
    const tableTop = 290;
    doc.fontSize(10).font('Helvetica-Bold')
       .fillColor('#fff')
       .rect(50, tableTop, 350, 20).fill('#ff6b6b')
       .rect(400, tableTop, 60, 20).fill('#ff6b6b')
       .rect(460, tableTop, 40, 20).fill('#ff6b6b')
       .rect(500, tableTop, 50, 20).fill('#ff6b6b');
    
    doc.fillColor('#fff')
       .text('Item Description', 60, tableTop + 5)
       .text('Price', 410, tableTop + 5)
       .text('Qty', 470, tableTop + 5)
       .text('Amount', 510, tableTop + 5);

    // 📝 ORDER ITEMS
    let yPosition = tableTop + 30;
    order.items.forEach((item, index) => {
      if (yPosition > 650) {
        doc.addPage();
        yPosition = 100;
      }
      
      doc.fontSize(9).font('Helvetica')
         .fillColor('#000')
         .text(item.name, 60, yPosition, { width: 330 })
         .text(`₹${item.price}`, 410, yPosition)
         .text(item.quantity.toString(), 470, yPosition)
         .text(`₹${item.itemTotal}`, 510, yPosition);
      
      yPosition += 20;
    });

    // Line separator before total
    doc.moveTo(50, yPosition + 10).lineTo(550, yPosition + 10).strokeColor('#ccc').stroke();

    // 💰 TOTAL CALCULATION
    const subtotal = order.totalAmount;
    const gstRate = 0.05; // 5% GST
    const gstAmount = Math.round(subtotal * gstRate);
    const grandTotal = subtotal + gstAmount;

    // Update order with calculated amounts
    order.gstAmount = gstAmount;
    order.grandTotal = grandTotal;
    order.billGenerated = true;
    await order.save();

    // TOTAL DISPLAY
    doc.fontSize(10).font('Helvetica')
       .text('Subtotal:', 400, yPosition + 30)
       .text(`₹${subtotal}`, 510, yPosition + 30);
    
    doc.text(`GST (5%):`, 400, yPosition + 45)
       .text(`₹${gstAmount}`, 510, yPosition + 45);

    doc.fontSize(12).font('Helvetica-Bold')
       .text('Grand Total:', 400, yPosition + 65)
       .text(`₹${grandTotal}`, 510, yPosition + 65);

    // 💳 PAYMENT INFO
    doc.fontSize(10).font('Helvetica')
       .text(`Payment Method: ${order.paymentMethod}`, 50, yPosition + 95);

    if (restaurant.upiId) {
      doc.text(`UPI ID: ${restaurant.upiId}`, 50, yPosition + 110);
    }

    // 📞 FOOTER
    doc.fontSize(8).font('Helvetica')
       .fillColor('#666')
       .text('Thank you for ordering with InstaBite!', 50, yPosition + 140, { align: 'center' })
       .text('For any queries, contact the restaurant directly or visit instabitesecv.shop', 50, yPosition + 155, { align: 'center' })
       .text('This is a computer-generated bill. No signature required.', 50, yPosition + 170, { align: 'center' });

    // Finalize PDF
    doc.end();

  } catch (error) {
    console.error('Bill generation error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate bill' });
  }
});

// 🏠 GENERAL ENDPOINTS

// Get All Restaurants (for customer browsing)
app.get('/api/restaurants', async (req, res) => {
  try {
    const restaurants = await Restaurant.find({}, 'name email phone address menu upiId paymentQrCode gstin');
    res.json({ success: true, restaurants });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: '🚀 InstaBite Backend is Running!', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Welcome to InstaBite Backend API!',
    endpoints: {
      health: '/api/health',
      restaurant: {
        register: '/api/restaurant/register [POST]',
        login: '/api/restaurant/login [POST]',
        get: '/api/restaurant/:id [GET]'
      },
      orders: {
        create: '/api/orders [POST]',
        get: '/api/orders/:id [GET]',
        bill: '/api/orders/:id/bill [GET]'
      }
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal Server Error',
    message: err.message 
  });
});

// ✅ FIXED: 404 handler - removed the problematic '*'
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'Endpoint not found',
    message: `Route ${req.originalUrl} does not exist` 
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🎯 InstaBite Backend Server running on port ${PORT}`);
  console.log(`📍 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});