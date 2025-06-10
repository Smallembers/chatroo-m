const express = require('express');
const app = express();
const http = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(http);

app.use(express.static('public'));

// Store up to 20 recent messages
const messageHistory = [];
const MAX_MESSAGES = 20;

let numUsers = 0;

io.on('connection', (socket) => {
  let addedUser = false;

  console.log('a user connected');

  socket.on('add user', (username) => {
    if (addedUser) return;

    socket.username = username;
    ++numUsers;
    addedUser = true;

    // Send message history to the new user
    socket.emit('message history', messageHistory);

    // Let the user know they've logged in
    socket.emit('login', {
      numUsers: numUsers
    });

    // Broadcast that a user joined
    socket.broadcast.emit('user joined', {
      username: socket.username,
      numUsers: numUsers
    });
  });

  socket.on('new message', (message) => {
    const chatMessage = {
      username: socket.username,
      message: message
    };

    // Save message to history
    messageHistory.push(chatMessage);
    if (messageHistory.length > MAX_MESSAGES) {
      messageHistory.shift();
    }

    // Broadcast the message
    socket.broadcast.emit('new message', chatMessage);
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

    console.log('user disconnected');
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});
