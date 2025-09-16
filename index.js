const express = require('express');
const app = express();
const path = require('path');
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const multer = require('multer');
const fs = require('fs');

const PORT = process.env.PORT || 3000;

// Ensure images folder exists within public
const imagesDir = path.join(__dirname, 'public/images'); // CHANGED
if (!fs.existsSync(imagesDir)){
    fs.mkdirSync(imagesDir, { recursive: true });
}

// Setup multer for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, imagesDir); // CHANGED
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Store last 50 messages
let messages = [];

// --- MIDDLEWARE ---
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
// Make the 'images' directory accessible
app.use('/images', express.static(path.join(__dirname, 'public/images'))); // CHANGED


// --- ROUTES ---
// File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded or file is too large.' });
    }

    // Create a message object for the file
    const fileMsg = {
        username: req.body.username,
        file: {
            url: `/images/${req.file.filename}`, // CHANGED
            name: req.file.originalname
        }
    };

    // Store message and manage history
    messages.push(fileMsg);
    if (messages.length > 50) {
        const oldMsg = messages.shift();
        // If the old message was a file, delete it from the server
        if (oldMsg.file) {
            fs.unlink(path.join(imagesDir, path.basename(oldMsg.file.url)), (err) => {
                if (err) console.error('Error deleting old file:', err);
            });
        }
    }

    // Broadcast the file message to all users
    io.emit('new message', fileMsg);

    res.json({ success: true });
});


// --- SOCKET.IO LOGIC ---
const users = new Set();

io.on('connection', (socket) => {
    let addedUser = false;

    // Send recent messages to new user
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
            username: socket.username,
            users: Array.from(users)
        });
    });

    socket.on('new message', (text) => {
        const msg = {
            username: socket.username,
            message: text
        };

        messages.push(msg);
        if (messages.length > 50) {
            const oldMsg = messages.shift();
            if (oldMsg.file) {
                fs.unlink(path.join(imagesDir, path.basename(oldMsg.file.url)), (err) => {
                    if (err) console.error('Error deleting old file:', err);
                });
            }
        }
        
        socket.broadcast.emit('new message', msg);
    });

    socket.on('typing', () => {
        socket.broadcast.emit('typing', { username: socket.username });
    });

    socket.on('stop typing', () => {
        socket.broadcast.emit('stop typing', { username: socket.username });
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

http.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
