$(function() {
  const FADE_TIME = 150; // ms
  const TYPING_TIMER_LENGTH = 400; // ms
  const COLORS = [
    '#e21400', '#91580f', '#f8a700', '#f78b00',
    '#58dc00', '#287b00', '#a8f07a', '#4ae8c4',
    '#3b88eb', '#3824aa', '#a700ff', '#d300e7'
  ];

  // Initialize variables
  const $window = $(window);
  const $usernameInput = $('.usernameInput');
  const $messages = $('.messages');
  const $inputMessage = $('.inputMessage');
  const $loginPage = $('.login.page');
  const $chatPage = $('.chat.page');
  const $fileInput = $('#fileInput');

  // --- ADDED BACK: Sidebar variables ---
  const $usersSidebar = $('#users-sidebar');
  const $usersList = $('#users-list');
  const $usersBtn = $('#users-btn');

  const socket = io();

  let username;
  let connected = false;
  let typing = false;
  let lastTypingTime;
  let $currentInput = $usernameInput.focus();
  
  const isImage = (filename) => {
    return /\.(jpeg|jpg|gif|png|webp|bmp|svg)$/i.test(filename);
  };

  const addParticipantsMessage = (data) => {
    let message = '';
    if (data.numUsers === 1) {
      message += `there's 1 participant`;
    } else {
      message += `there are ${data.numUsers} participants`;
    }
    log(message);
  }

  const setUsername = () => {
    username = $usernameInput.val().trim();
    if (username) {
      $loginPage.fadeOut();
      $chatPage.show();
      $loginPage.off('click');
      $currentInput = $inputMessage.focus();
      socket.emit('add user', username);
    }
  }

  const sendMessage = () => {
    let message = $inputMessage.val();
    message = message.trim();
    if (message && connected) {
      $inputMessage.val('');
      addChatMessage({ username, message });
      socket.emit('new message', message);
    }
  }

  const log = (message, options) => {
    const $el = $('<li>').addClass('log').text(message);
    addMessageElement($el, options);
  }
  
  const addChatMessage = (data, options = {}) => {
    const $usernameDiv = $('<span class="username"/>')
        .text(data.username)
        .css('color', getUsernameColor(data.username));

    let $messageBodyDiv;

    if (data.file) {
      if (isImage(data.file.name)) {
        const $fileLink = $('<a>').attr('href', data.file.url).attr('target', '_blank').text(data.file.name);
        const $image = $('<img>').addClass('embedded-image').attr('src', data.file.url);
        $messageBodyDiv = $('<span class="messageBody">').append($fileLink, '<br>', $image);
      } else {
        const $fileLink = $('<a>').attr('href', data.file.url).attr('target', '_blank').text(data.file.name);
        const $downloadIcon = $(`
            <a href="${data.file.url}" download="${data.file.name}" class="download-link" title="Download">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
            </a>
        `);
        $messageBodyDiv = $('<span class="messageBody">').append('Uploaded: ', $fileLink, $downloadIcon);
      }
    } else {
      $messageBodyDiv = $('<span class="messageBody">').text(data.message);
    }

    const typingClass = options.typing ? 'typing' : '';
    const $messageDiv = $('<li class="message"/>')
        .data('username', data.username)
        .addClass(typingClass)
        .append($usernameDiv, $messageBodyDiv);

    addMessageElement($messageDiv, options);
  };
  
  // --- ADDED BACK: Sidebar functions ---
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
  // ---

  const addChatTyping = (data) => {
    data.typing = true;
    data.message = 'is typing';
    addChatMessage(data);
  }

  const removeChatTyping = (data) => {
    getTypingMessages(data).fadeOut(function() {
      $(this).remove();
    });
  }

  const addMessageElement = (el, options) => {
    const $el = $(el);
    if (!options) {
      options = {};
    }
    if (typeof options.fade === 'undefined') {
      options.fade = true;
    }
    if (typeof options.prepend === 'undefined') {
      options.prepend = false;
    }
    if (options.fade) {
      $el.hide().fadeIn(FADE_TIME);
    }
    if (options.prepend) {
      $messages.prepend($el);
    } else {
      $messages.append($el);
    }
    $messages[0].scrollTop = $messages[0].scrollHeight;
  }

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
  }

  const getTypingMessages = (data) => {
    return $('.typing.message').filter(function(i) {
      return $(this).data('username') === data.username;
    });
  }

  const getUsernameColor = (username) => {
    let hash = 7;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + (hash << 5) - hash;
    }
    const index = Math.abs(hash % COLORS.length);
    return COLORS[index];
  }
  
  const uploadFile = (file) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('username', username);

      fetch('/upload', {
          method: 'POST',
          body: formData
      })
      .then(response => response.json())
      .then(data => {
          if (!data.success) {
              log('File upload failed.');
          }
      })
      .catch(error => {
          console.error('Error uploading file:', error);
          log('Error uploading file.');
      });
  };

  $window.keydown(event => {
    if (!(event.ctrlKey || event.metaKey || event.altKey)) {
      $currentInput.focus();
    }
    if (event.which === 13) {
      if (username) {
        sendMessage();
        socket.emit('stop typing');
        typing = false;
      } else {
        setUsername();
      }
    }
  });

  $inputMessage.on('input', () => {
    updateTyping();
  });

  $loginPage.click(() => {
    $currentInput.focus();
  });

  $fileInput.on('change', function() {
    const file = this.files[0];
    if (file && username) {
        uploadFile(file);
    }
    $(this).val('');
  });
  
  // --- ADDED BACK: Sidebar click event ---
  $usersBtn.on('click', toggleUsersSidebar);

  socket.on('login', (data) => {
    connected = true;
    log("Welcome to the Chatroom!");
    addParticipantsMessage(data);
    // --- ADDED BACK: Update user list on login ---
    updateUsersList(data.users || []);
  });
  
  socket.on('recent messages', (messages) => {
    messages.forEach(msg => addChatMessage(msg, { prepend: false }));
  });

  socket.on('new message', (data) => {
    addChatMessage(data);
  });

  socket.on('user joined', (data) => {
    log(`${data.username} joined`);
    addParticipantsMessage(data);
    // --- ADDED BACK: Update user list on join ---
    updateUsersList(data.users || []);
  });

  socket.on('user left', (data) => {
    log(`${data.username} left`);
    addParticipantsMessage(data);
    removeChatTyping(data);
    // --- ADDED BACK: Update user list on leave ---
    updateUsersList(data.users || []);
  });

  socket.on('typing', (data) => {
    addChatTyping(data);
  });

  socket.on('stop typing', (data) => {
    removeChatTyping(data);
  });

  socket.on('disconnect', () => {
    log('you have been disconnected');
  });

  socket.on('reconnect', () => {
    log('you have been reconnected');
    if (username) {
      socket.emit('add user', username);
    }
  });

  socket.on('reconnect_error', () => {
    log('attempt to reconnect has failed');
  });
});
