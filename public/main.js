const socket = io();

const $window = $(window);
const $usernameInput = $('.usernameInput'); // Input for username
const $messages = $('.messages');           // Messages area
const $inputMessage = $('.inputMessage');   // Input message box
const $loginPage = $('.login.page');        // Login page div
const $chatPage = $('.chat.page');          // Chat page div

// New elements for users sidebar and toggle button
const $usersSidebar = $('#users-sidebar');
const $usersList = $('#users-list');
const $usersBtn = $('#users-btn');

let username;
let connected = false;
let typing = false;
let lastTypingTime;
const TYPING_TIMER_LENGTH = 400; // ms

// Prompt for setting username
const setUsername = () => {
  username = $usernameInput.val().trim();

  if (username) {
    $loginPage.fadeOut();
    $chatPage.show();
    $inputMessage.focus();

    socket.emit('add user', username);
  }
};

// Send message
const sendMessage = () => {
  let message = $inputMessage.val();
  message = message.trim();

  if (message && connected) {
    $inputMessage.val('');
    addChatMessage({
      username,
      message
    });
    socket.emit('new message', message);
  }
};

// Log message helper
const log = (message) => {
  const $el = $('<li>').addClass('log').text(message);
  $messages.append($el);
  scrollToBottom();
};

// Adds chat message to messages list
const addChatMessage = (data, options = {}) => {
  const $usernameDiv = $('<span class="username"/>')
    .text(data.username)
    .css('color', getUsernameColor(data.username));
  const $messageBodyDiv = $('<span class="messageBody">').text(data.message);

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

// Helper to scroll chat to bottom
const scrollToBottom = () => {
  $messages[0].scrollTop = $messages[0].scrollHeight;
};

// Updates typing event
const updateTyping = () => {
  if (connected) {
    if (!typing) {
      typing = true;
      socket.emit('typing');
    }
    lastTypingTime = (new Date()).getTime();

    setTimeout(() => {
      const typingTimer = (new Date()).getTime();
      const timeDiff = typingTimer - lastTypingTime;
      if (timeDiff >= TYPING_TIMER_LENGTH && typing) {
        socket.emit('stop typing');
        typing = false;
      }
    }, TYPING_TIMER_LENGTH);
  }
};

// Returns a consistent color for username
const getUsernameColor = (name) => {
  // Generate hash code
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

// Updates users list sidebar
const updateUsersList = (users) => {
  $usersList.empty();
  users.forEach(user => {
    const $li = $('<li>').text(user).css('color', getUsernameColor(user));
    $usersList.append($li);
  });
};

// Toggle sidebar open/close
const toggleUsersSidebar = () => {
  const isOpen = $usersSidebar.hasClass('open');
  $usersSidebar.toggleClass('open');
  $usersBtn.attr('aria-expanded', !isOpen);
  $usersBtn.toggleClass('open');
};

// Keyboard and click event handlers

// On username input enter
$usernameInput.keydown(event => {
  if (event.which === 13) { // Enter key
    setUsername();
  }
});

// On message input enter
$inputMessage.keydown(event => {
  if (event.which === 13) { // Enter key
    sendMessage();
    socket.emit('stop typing');
    typing = false;
  }
});

// On typing input
$inputMessage.on('input', () => {
  updateTyping();
});

// Toggle users sidebar button click
$usersBtn.on('click', () => {
  toggleUsersSidebar();
});

// Socket events

socket.on('login', (data) => {
  connected = true;
  const message = `Welcome to Socket.IO Chat – ${data.numUsers} users online`;
  log(message);
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
  addChatMessage(data);
});

socket.on('typing', (data) => {
  addTypingMessage(data);
});

socket.on('stop typing', (data) => {
  removeTypingMessage(data);
});

// Typing messages management
const typingUsers = {};

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
