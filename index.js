// index.js (root)
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static client files
app.use(express.static(path.join(__dirname, 'public')));

// Setup uploads directory
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Track uploaded images
let uploadedFiles = [];

// Upload route
app.post('/upload', upload.single('file'), (req, res) => {
  const fileUrl = `/uploads/${req.file.filename}`;
  uploadedFiles.push(fileUrl);

  // Auto-delete oldest if more than 4
  if (uploadedFiles.length > 4) {
    const oldest = uploadedFiles.shift();
    fs.unlink(path.join(__dirname, 'public', oldest), err => {
      if (err) console.error('Deletion error:', err);
    });
  }

  // Send to all clients
  io.emit('chat message', {
    username: 'Upload',
    message: fileUrl,
    isFile: true
  });

  res.json({ success: true, url: fileUrl });
});

// Chatroom logic
let messageHistory = [];
let numUsers = 0;

io.on('connection', socket => {
  console.log('User connected');

  // Send recent history
  messageHistory.slice(-20).forEach(msg => {
    socket.emit('chat message', msg);
  });

  socket.on('add user', username => {
    socket.username = username;
    numUsers++;
    socket.emit('login', { numUsers });
    socket.broadcast.emit('user joined', {
      username,
      numUsers
    });
  });

  socket.on('new message', message => {
    const msgData = {
      username: socket.username,
      message,
      isFile: false
    };

    messageHistory.push(msgData);
    if (messageHistory.length > 100) messageHistory.shift();

    io.emit('chat message', msgData);
  });

  socket.on('typing', () => {
    socket.broadcast.emit('typing', { username: socket.username });
  });

  socket.on('stop typing', () => {
    socket.broadcast.emit('stop typing', { username: socket.username });
  });

  socket.on('disconnect', () => {
    if (socket.username) {
      numUsers--;
      socket.broadcast.emit('user left', {
        username: socket.username,
        numUsers
      });
    }
    console.log('User disconnected');
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
