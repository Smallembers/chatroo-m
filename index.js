const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Track active users
const users = new Set();

// Ensure uploads directory exists
const UPLOAD_DIR = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file || !req.body.username) {
    return res.status(400).json({ error: 'Missing file or username' });
  }

  const fileData = {
    username: req.body.username,
    file: {
      originalname: req.file.originalname,
      filename: req.file.filename
    }
  };

  io.emit('new message', fileData); // Send file as a chat message
  res.json({ success: true });
});

// Socket.IO events
io.on('connection', (socket) => {
  let addedUser = false;

  socket.on('add user', (username) => {
    if (addedUser) return;
    socket.username = username;
    users.add(username);
    addedUser = true;

    socket.emit('login', {
      numUsers: users.size,
      users: Array.from(users)
    });

    socket.broadcast.emit('user joined', {
      username,
      users: Array.from(users)
    });
  });

  socket.on('new message', (message) => {
    if (socket.username) {
      io.emit('new message', {
        username: socket.username,
        message
      });
    }
  });

  socket.on('typing', () => {
    socket.broadcast.emit('typing', {
      username: socket.username
    });
  });

  socket.on('stop typing', () => {
    socket.broadcast.emit('stop typing', {
      username: socket.username
    });
  });

  socket.on('disconnect', () => {
    if (addedUser) {
      users.delete(socket.username);
      socket.broadcast.emit('user left', {
        username: socket.username,
        users: Array.from(users)
      });
    }
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
