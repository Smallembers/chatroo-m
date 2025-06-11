const socket = io();

const $window = $(window);
const $usernameInput = $('.usernameInput');
const $messages = $('.messages');
const $inputMessage = $('.inputMessage');
const $loginPage = $('.login.page');
const $chatPage = $('.chat.page');

const $usersSidebar = $('#users-sidebar');
const $usersList = $('#users-list');
const $usersBtn = $('#users-btn');
const $fileInput = $('#file-input'); // Add this input to your HTML for file upload

let username;
let connected = false;
let typing = false;
let lastTypingTime;
const TYPING_TIMER_LENGTH = 400;

const typingUsers = {};

// --- USER SETUP ---
const setUsername = () => {
  username = $usernameInput.val().trim();
  if (username) {
    $loginPage.fadeOut();
    $chatPage.show();
    $inputMessage.focus();
    socket.emit('add user', username);
  }
};

// --- SEND TEXT MESSAGE ---
const sendMessage = () => {
  let message = $inputMessage.val().trim();
  if (message && connected) {
    $inputMessage.val('');
    addChatMessage({ username, message }); // Show immediately
    socket.emit('new message', message);
  }
};

// --- SEND FILE ---
const sendFile = (file) => {
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    alert('File exceeds 5MB limit.');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('username', username);

  fetch('/upload', {
    method: 'POST',
    body: formData
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      alert('Upload failed: ' + data.error);
    }
    // The backend emits 'new message' with file data, so message will appear via socket event
  })
  .catch(() => {
    alert('Upload failed due to network error.');
  });
};

// --- LOG ---
const log = (message) => {
  const $el = $('<li>').addClass('log').text(message);
  $messages.append($el);
  scrollToBottom();
};

// --- ADD CHAT MESSAGE ---
const addChatMessage = (data, options = {}) => {
  const $usernameDiv = $('<span class="username"/>')
    .text(data.username)
    .css('color', getUsernameColor(data.username));

  let $messageBodyDiv;
  if (data.file) {
    // If message contains file, show a download link with file name
    $messageBodyDiv = $('<span class="messageBody">').append(
      $('<a>')
        .attr('href', `/uploads/${data.file.filename}`)
        .attr('target', '_blank')
        .text(data.file.originalname)
    );
  } else {
    $messageBodyDiv = $('<span class="messageBody">').text(data.message);
  }

  const $messageDiv = $('<li class="message"/>')
    .data('username', data.username)
    .append($usernameDiv, ': ', $messageBodyDiv);

  if (options.prepend) {
    $messages.prepend($messageDiv);
  } else {
    $messages.append($messageDiv);
  }
  scrollToBottom();
};

// --- SCROLL ---
const scrollToBottom = () => {
  $messages[0].scrollTop = $messages[0].scrollHeight;
};

// --- TYPING ---
const updateTyping = () => {
  if (connected) {
    if (!typing) {
      typing = true;
      socket.emit('typing');
    }
    lastTypingTime = Date.now();

    setTimeout(() => {
      const timeDiff = Date.now() - lastTypingTime;
      if (timeDiff >= TYPING_TIMER_LENGTH && typing) {
        socket.emit('stop typing');
        typing = false;
      }
    }, TYPING_TIMER_LENGTH);
  }
};

// --- COLOR FOR USERNAME ---
const getUsernameColor = (name) => {
  let hash = 7;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + (hash << 5) - hash;
  }
  const colors = [
    '#e21400', '#91580f', '#f8a700', '#f78b00',
    '#58dc00', '#287b00', '#a8f07a', '#4ae8c4',
    '#3b88eb', '#3824aa', '#a700ff', '#d300e7'
  ];
  return colors[Math.abs(hash) % colors.length];
};

// --- UPDATE USERS LIST ---
const updateUsersList = (users) => {
  $usersList.empty();
  users.forEach(user => {
    const $li = $('<li>').text(user).css('color', getUsernameColor(user));
    $usersList.append($li);
  });
};

// --- TOGGLE USERS SIDEBAR ---
const toggleUsersSidebar = () => {
  const isOpen = $usersSidebar.hasClass('open');
  $usersSidebar.toggleClass('open');
  $usersBtn.attr('aria-expanded', !isOpen);
  $usersBtn.toggleClass('open');
};

// --- TYPING MESSAGES ---
const addTypingMessage = (data) => {
  if (!typingUsers[data.username]) {
    const $typingMsg = $('<li class="message typing">')
      .text(`${data.username} is typing...`)
      .attr('id', `typing-${data.username}`);
    $messages.append($typingMsg);
    typingUsers[data.username] = true;
    scrollToBottom();
  }
};

const removeTypingMessage = (data) => {
  $(`#typing-${data.username}`).remove();
  delete typingUsers[data.username];
};

// --- EVENTS ---

// Username enter
$usernameInput.keydown(event => {
  if (event.which === 13) setUsername();
});

// Message enter
$inputMessage.keydown(event => {
  if (event.which === 13) {
    sendMessage();
    socket.emit('stop typing');
    typing = false;
  }
});

// Typing indicator
$inputMessage.on('input', updateTyping);

// Toggle user list sidebar
$usersBtn.on('click', toggleUsersSidebar);

// File input change handler
$fileInput.on('change', () => {
  if (!connected) {
    alert('Please set a username before uploading files.');
    $fileInput.val('');
    return;
  }
  const file = $fileInput[0].files[0];
  sendFile(file);
  $fileInput.val(''); // Clear after sending
});

// --- SOCKET EVENTS ---

socket.on('login', (data) => {
  connected = true;
  log(`Welcome to Socket.IO Chat – ${data.numUsers} users online`);
  updateUsersList(data.users || []);
});

socket.on('user joined', (data) => {
  log(`${data.username} joined`);
  updateUsersList(data.users || []);
});

socket.on('user left', (data) => {
  log(`${data.username} left`);
  updateUsersList(data.users || []);
});

socket.on('new message', (data) => {
  // Don't double-add messages sent by self via socket if already added locally
  if (data.username !== username || data.file) {
    addChatMessage(data);
  }
});

socket.on('typing', (data) => {
  addTypingMessage(data);
});

socket.on('stop typing', (data) => {
  removeTypingMessage(data);
});

// Load recent messages on connect
socket.on('recent messages', (messages) => {
  messages.forEach(msg => addChatMessage(msg, { prepend: false }));
});
