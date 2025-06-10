
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

// Keep last 20 messages in memory (including files)
let messages = [];
let numUsers = 0;

app.use(express.static(path.join(__dirname, 'public')));

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Endpoint to upload files (max 5MB)
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded or file too large' });
  }

  // Save file info as a message with a special flag
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
    // Remove oldest message and delete file if it's a file message
    const removed = messages.shift();
    if (removed.file) {
      fs.unlink(path.join(uploadsDir, removed.file.filename), err => {
        if (err) console.error('Error deleting file:', err);
      });
    }
  }

  io.emit('new message', fileMsg);
  res.json({ success: true, file: fileMsg.file });
});

io.on('connection', (socket) => {
  let addedUser = false;

  // Send last 20 messages to new users
  socket.emit('message history', messages);

  socket.on('new message', (data) => {
    const msg = {
      username: socket.username,
      message: data
    };

    messages.push(msg);
    if (messages.length > 20) {
      const removed = messages.shift();
      if (removed.file) {
        fs.unlink(path.join(uploadsDir, removed.file.filename), err => {
          if (err) console.error('Error deleting file:', err);
        });
      }
    }

    io.emit('new message', msg);
  });

  socket.on('add user', (username) => {
    if (addedUser) return;

    socket.username = username;
    ++numUsers;
    addedUser = true;
    socket.emit('login', {
      numUsers: numUsers
    });
    socket.broadcast.emit('user joined', {
      username: socket.username,
      numUsers: numUsers
    });
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
      --numUsers;
      socket.broadcast.emit('user left', {
        username: socket.username,
        numUsers: numUsers
      });
    }
  });
});

http.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
