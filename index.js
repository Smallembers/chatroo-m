const express = require('express');
const app = express();
const path = require('path');
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const multer = require('multer');
const fs = require('fs');

const PORT = process.env.PORT || 3000;

// Ensure images folder exists within public
const imagesDir = path.join(__dirname, 'public/images');
if (!fs.existsSync(imagesDir)){
    fs.mkdirSync(imagesDir, { recursive: true });
}

// Setup multer for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, imagesDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 15 * 1024 * 1024 } // CHANGED: Limit is now 15MB
});

// Store last 50 messages
let messages = [];

// --- MIDDLEWARE ---
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));


// --- ROUTES ---
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded or file is too large.' });
    }

    const fileMsg = {
        username: req.body.username,
        file: {
            url: `/images/${req.file.filename}`,
            name: req.file.originalname
        }
    };

    messages.push(fileMsg);
    if (messages.length > 50) {
        const oldMsg = messages.shift();
        if (oldMsg.file) {
            // Note: This only deletes files when the message history overflows.
            // The new cleanup function below handles time-based deletion.
            fs.unlink(path.join(imagesDir, path.basename(oldMsg.file.url)), (err) => {
                if (err) console.error('Error deleting old file from history:', err);
            });
        }
    }

    io.emit('new message', fileMsg);
    res.json({ success: true });
});


// --- SOCKET.IO LOGIC ---
const users = new Set();
// (Socket.IO connection logic remains the same as before...)
io.on('connection', (socket) => {
    let addedUser = false;

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
                    if (err) console.error('Error deleting old file from history:', err);
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


// --- NEW: AUTOMATIC FILE CLEANUP ---
const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;

const cleanupOldFiles = () => {
    console.log('Running cleanup task for old files...');
    fs.readdir(imagesDir, (err, files) => {
        if (err) {
            console.error('Could not list the directory.', err);
            return;
        }

        files.forEach((file, index) => {
            const filePath = path.join(imagesDir, file);
            fs.stat(filePath, (err, stat) => {
                if (err) {
                    console.error(`Could not get stats for file: ${file}`, err);
                    return;
                }

                const now = Date.now();
                const fileAge = now - stat.birthtimeMs;

                if (fileAge > thirtyDaysInMs) {
                    fs.unlink(filePath, (err) => {
                        if (err) {
                            console.error(`Could not delete old file: ${file}`, err);
                        } else {
                            console.log(`Successfully deleted old file: ${file}`);
                        }
                    });
                }
            });
        });
    });
};

// Run the cleanup task once a day
setInterval(cleanupOldFiles, 24 * 60 * 60 * 1000); 
// Run once on server start
cleanupOldFiles(); 


http.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
