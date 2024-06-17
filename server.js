const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const Message = require('./models/Message');
const User = require('./models/User');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/index'); // Make sure to import user routes

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const users = {}; // Store users and their socket IDs

// Connect to MongoDB
const mongoUri = 'mongodb+srv://iamkazakh02:jNZhGFVP0FqIJHlE@cluster0.yfibvkd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('Failed to connect to MongoDB', err);
});

// Middleware
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api', userRoutes); // Ensure this route is correct

// Socket.io authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }
  jwt.verify(token, 'secretKey', (err, decoded) => {
    if (err) {
      return next(new Error('Authentication error'));
    }
    socket.userId = decoded.userId;
    next();
  });
});

// Socket.io setup
io.on('connection', async (socket) => {
  const user = await User.findById(socket.userId);
  if (user) {
    user.status = 'online';
    await user.save();
    users[socket.userId] = socket.id; // Store socket ID for the user
    io.emit('user connected', user); // Emit user connected event
  }

  socket.on('private message', async (msg, receiverId) => {
    try {
      const sender = await User.findById(socket.userId);
      const receiver = await User.findById(receiverId);

      if (!receiver) return;

      const message = new Message({
        content: msg,
        client_offset: `${socket.userId}-${Date.now()}`,
        username: sender.username,
        timestamp: Date.now(),
      });

      await message.save();
      
      const receiverSocketId = users[receiverId]; // Get receiver's socket ID
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('private message', {
          content: msg,
          username: sender.username,
          timestamp: message.timestamp,
        });
      }

      socket.emit('private message', { // Send message to sender as well
        content: msg,
        username: sender.username,
        timestamp: message.timestamp,
      });

    } catch (error) {
      console.error(error);
    }
  });

  socket.on('typing', (receiverId) => {
    const receiverSocketId = users[receiverId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('typing', { username: user.username });
    }
  });

  socket.on('stop typing', (receiverId) => {
    const receiverSocketId = users[receiverId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('stop typing', { username: user.username });
    }
  });

  socket.on('disconnect', async () => {
    if (user) {
      user.status = 'offline';
      await user.save();
      io.emit('user disconnected', user); // Emit user disconnected event
    }
    delete users[socket.userId]; // Remove user from online users
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
