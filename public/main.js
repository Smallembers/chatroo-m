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
const $fileInput = $('#fileInput');

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
    addChatMessage({ username, message });
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

  let $messageBodyDiv;
  if (data.file) {
    const fileBlob = new Blob([new Uint8Array(data.file.data)], { type: data.file.type });
    const fileUrl = URL.createObjectURL(fileBlob);
    const fileLink = $('<a target="_blank" download>')
      .attr('href', fileUrl)
      .text(data.file.name);
    $messageBodyDiv = $('<span class="messageBody">').append(' uploaded ', fileLink);
  } else {
    $messageBodyDiv = $('<span class="messageBody">').text(data.message);
  }

  const $messageDiv = $('<li class="message"/>')
    .data('username', data.username)
    .append($usernameDiv, $messageBodyDiv);

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

// Event Listeners
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

// File upload handling using ArrayBuffer
$fileInput.on('change', () => {
  const file = $fileInput[0].files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const arrayBuffer = reader.result;
    socket.emit('file upload', {
      username,
      name: file.name,
      type: file.type,
      size: file.size,
      data: Array.from(new Uint8Array(arrayBuffer))
    });
  };
  reader.readAsArrayBuffer(file);
});

// Socket Events
socket.on('login', (data) => {
  connected = true;
  log(`Welcome to Chatroo-m – ${data.numUsers} users online`);
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

socket.on('recent messages', (messages) => {
  messages.forEach(msg => addChatMessage(msg, { prepend: false }));
});

socket.on('file uploaded', (data) => {
  addChatMessage({ username: data.username, file: data.file });
});
