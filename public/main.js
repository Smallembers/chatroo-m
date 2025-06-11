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

let username;
let connected = false;
let typing = false;
let lastTypingTime;
const TYPING_TIMER_LENGTH = 400;

const typingUsers = {};

const setUsername = () => {
  username = $usernameInput.val().trim();
  if (username) {
    $loginPage.fadeOut();
    $chatPage.show();
    $inputMessage.focus();
    socket.emit('add user', username);
  }
};

const sendMessage = () => {
  let message = $inputMessage.val().trim();
  if (message && connected) {
    $inputMessage.val('');
    addChatMessage({ username, message }); // Add immediately
    socket.emit('new message', message);
  }
};

const log = (message) => {
  const $el = $('<li>').addClass('log').text(message);
  $messages.append($el);
  scrollToBottom();
};

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

const scrollToBottom = () => {
  $messages[0].scrollTop = $messages[0].scrollHeight;
};

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

const updateUsersList = (users) => {
  $usersList.empty();
  users.forEach(user => {
    const $li = $('<li>').text(user).css('color', getUsernameColor(user));
    $usersList.append($li);
  });
};

const toggleUsersSidebar = () => {
  const isOpen = $usersSidebar.hasClass('open');
  $usersSidebar.toggleClass('open');
  $usersBtn.attr('aria-expanded', !isOpen);
  $usersBtn.toggleClass('open');
};

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

// THEME SWITCHER INTEGRATION

$(function() {
  // Apply saved theme on load
  const savedTheme = localStorage.getItem('chat-theme');
  if (savedTheme) {
    $('body').removeClass(function(index, className) {
      return (className.match(/(^|\s)theme-\S+/g) || []).join(' ');
    });
    $('body').addClass('theme-' + savedTheme);
    $(`#theme-menu input[value="${savedTheme}"]`).prop('checked', true);
  }

  // Toggle theme menu panel when hamburger clicked
  $('#theme-btn').on('click', () => {
    const isOpen = $('#theme-menu').toggleClass('open').hasClass('open');
    $('#theme-btn').attr('aria-expanded', isOpen);
  });

  // Listen for theme radio changes
  $('#theme-menu input[name="theme"]').on('change', function() {
    if (this.checked) {
      const theme = $(this).val();
      $('body').removeClass(function(index, className) {
        return (className.match(/(^|\s)theme-\S+/g) || []).join(' ');
      });
      $('body').addClass('theme-' + theme);
      localStorage.setItem('chat-theme', theme);
    }
  });
});

// Events
$usernameInput.keydown(event => {
  if (event.which === 13) setUsername();
});

$inputMessage.keydown(event => {
  if (event.which === 13) {
    sendMessage();
    socket.emit('stop typing');
    typing = false;
  }
});

$inputMessage.on('input', updateTyping);
$usersBtn.on('click', toggleUsersSidebar);

// Socket events
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
  if (data.username !== username) {
    addChatMessage(data);
  }
});

socket.on('typing', (data) => {
  addTypingMessage(data);
});

socket.on('stop typing', (data) => {
  removeTypingMessage(data);
});

// NEW: Load last 20 messages on connect
socket.on('recent messages', (messages) => {
  messages.forEach(msg => addChatMessage(msg, { prepend: false }));
});
