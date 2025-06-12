const express = require('express');
const app = express();
const path = require('path');
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const multer = require('multer');
const fs = require('fs');

const PORT = process.env.PORT || 3000;

// Setup multer for uploads with 5MB limit
const upload = multer({
  dest: path.join(__dirname, 'uploads/'),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Store last 20 messages (including uploaded files)
let messages = [];
const users = new Set();

app.use(express.static(path.join(__dirname, 'public')));

// File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded or file too large' });
  }

  const fileMsg = {
    username: req.body.username || 'Anonymous',
    message: '',
    file: {
      filename: req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    }
  };

  messages.push(fileMsg);
  if (messages.length > 20) {
    const removed = messages.shift();
    if (removed.file) {
      fs.unlink(path.join(uploadsDir, removed.file.filename), err => {
        if (err) console.error('Error deleting old file:', err);
      });
    }
  }

  io.emit('new message', fileMsg);
  res.json({ success: true, file: fileMsg.file });
});

io.on('connection', (socket) => {
  let addedUser = false;

  // Send last 20 messages to new user
  socket.emit('recent messages', messages);

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
      username: username,
      numUsers: users.size,
      users: Array.from(users)
    });
  });

  socket.on('new message', (text) => {
    if (!addedUser || typeof text !== 'string') return;

    const msg = {
      username: socket.username,
      message: text
    };

    messages.push(msg);
    if (messages.length > 20) {
      const removed = messages.shift();
      if (removed.file) {
        fs.unlink(path.join(uploadsDir, removed.file.filename), err => {
          if (err) console.error('Error deleting old file:', err);
        });
      }
    }

    io.emit('new message', msg);
  });

  socket.on('typing', () => {
    if (!addedUser) return;
    socket.broadcast.emit('typing', { username: socket.username });
  });

  socket.on('stop typing', () => {
    if (!addedUser) return;
    socket.broadcast.emit('stop typing', { username: socket.username });
  });

  socket.on('disconnect', () => {
    if (addedUser) {
      users.delete(socket.username);

      socket.broadcast.emit('user left', {
        username: socket.username,
        numUsers: users.size,
        users: Array.from(users)
      });
    }
  });
});

http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
