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

  const socket = io();

  let username;
  let connected = false;
  let typing = false;
  let lastTypingTime;
  let $currentInput = $usernameInput.focus();
  
  // NEW: Helper function to check for image file extensions
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

    // --- THIS IS THE MODIFIED SECTION ---
    if (data.file) {
      // Check if the uploaded file is an image
      if (isImage(data.file.name)) {
        // If it is, create an <img> tag to embed it
        const $fileLink = $('<a>').attr('href', data.file.url).attr('target', '_blank').text(data.file.name);
        const $image = $('<img>').addClass('embedded-image').attr('src', data.file.url);
        $messageBodyDiv = $('<span class="messageBody">').append($fileLink, '<br>', $image);
      } else {
        // If it's not an image, create the standard link with a download icon
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
      // It's a regular text message
      $messageBodyDiv = $('<span class="messageBody">').text(data.message);
    }
    // --- END OF MODIFIED SECTION ---

    const typingClass = options.typing ? 'typing' : '';
    const $messageDiv = $('<li class="message"/>')
        .data('username', data.username)
        .addClass(typingClass)
        .append($usernameDiv, $messageBodyDiv);

    addMessageElement($messageDiv, options);
  };

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

  socket.on('login', (data) => {
    connected = true;
    log("Welcome to Socket.IO Chat!");
    addParticipantsMessage(data);
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
  });

  socket.on('user left', (data) => {
    log(`${data.username} left`);
    addParticipantsMessage(data);
    removeChatTyping(data);
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
