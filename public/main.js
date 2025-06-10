$(function () {
  const FADE_TIME = 150;
  const TYPING_TIMER_LENGTH = 400;
  const COLORS = [
    '#e21400', '#91580f', '#f8a700', '#f78b00',
    '#58dc00', '#287b00', '#a8f07a', '#4ae8c4',
    '#3b88eb', '#3824aa', '#a700ff', '#d300e7'
  ];

  const $window = $(window);
  const $usernameInput = $('.usernameInput');
  const $messages = $('.messages');
  const $inputMessage = $('.inputMessage');

  const $loginPage = $('.login.page');
  const $chatPage = $('.chat.page');

  const socket = io();

  let username;
  let connected = false;
  let typing = false;
  let lastTypingTime;
  let $currentInput = $usernameInput.focus();

  // Map to keep track of temp messages by their tempId
  const tempMessages = new Map();

  // Generate unique tempId for temp messages
  const generateTempId = () => `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const addParticipantsMessage = (data) => {
    let message = '';
    if (data.numUsers === 1) {
      message = "there's 1 participant";
    } else {
      message = `there are ${data.numUsers} participants`;
    }
    log(message);
  };

  const setUsername = () => {
    username = cleanInput($usernameInput.val().trim());
    if (username) {
      $loginPage.fadeOut();
      $chatPage.show();
      $loginPage.off('click');
      $currentInput = $inputMessage.focus();
      socket.emit('add user', username);
    }
  };

  const sendMessage = () => {
    let message = $inputMessage.val();
    message = cleanInput(message);
    if (message && connected) {
      $inputMessage.val('');

      // Create a tempId for this message
      const tempId = generateTempId();

      // Add temp message to UI immediately
      addChatMessage({ username, message, tempId }, { fade: true, isTemp: true });

      // Send the message along with tempId to the server
      socket.emit('new message', { message, tempId });

      socket.emit('stop typing');
      typing = false;
    }
  };

  const log = (message, options) => {
    const $el = $('<li>').addClass('log').text(message);
    addMessageElement($el, options);
  };

  // Modified addChatMessage to handle temp messages
  const addChatMessage = (data, options = {}) => {
    const { tempId, username: dataUsername, message: dataMessage, typing } = data;
    const $typingMessages = getTypingMessages(data);
    if ($typingMessages.length !== 0) {
      options.fade = false;
      $typingMessages.remove();
    }

    const $usernameDiv = $('<span class="username"/>')
      .text(dataUsername)
      .css('color', getUsernameColor(dataUsername));
    const $messageBodyDiv = $('<span class="messageBody">')
      .text(dataMessage);

    const typingClass = typing ? 'typing' : '';
    const $messageDiv = $('<li class="message"/>')
      .data('username', dataUsername)
      .addClass(typingClass)
      .append($usernameDiv, $messageBodyDiv);

    if (tempId) {
      // Mark as temporary and store for replacement later
      $messageDiv.attr('data-temp-id', tempId).addClass('temp-message');
      tempMessages.set(tempId, $messageDiv);
    }

    addMessageElement($messageDiv, options);
  };

  const addChatTyping = (data) => {
    data.typing = true;
    data.message = 'is typing';
    addChatMessage(data);
  };

  const removeChatTyping = (data) => {
    getTypingMessages(data).fadeOut(function () {
      $(this).remove();
    });
  };

  const addMessageElement = (el, options = {}) => {
    const $el = $(el);
    if (typeof options.fade === 'undefined') options.fade = true;
    if (typeof options.prepend === 'undefined') options.prepend = false;

    if (options.fade) $el.hide().fadeIn(FADE_TIME);
    if (options.prepend) {
      $messages.prepend($el);
    } else {
      $messages.append($el);
    }

    $messages[0].scrollTop = $messages[0].scrollHeight;
  };

  const cleanInput = (input) => {
    return $('<div/>').text(input).html();
  };

  const updateTyping = () => {
    if (connected) {
      if (!typing) {
        typing = true;
        socket.emit('typing');
      }
      lastTypingTime = (new Date()).getTime();

      setTimeout(() => {
        const timeDiff = (new Date()).getTime() - lastTypingTime;
        if (timeDiff >= TYPING_TIMER_LENGTH && typing) {
          socket.emit('stop typing');
          typing = false;
        }
      }, TYPING_TIMER_LENGTH);
    }
  };

  const getTypingMessages = (data) => {
    return $('.typing.message').filter(function () {
      return $(this).data('username') === data.username;
    });
  };

  const getUsernameColor = (username) => {
    let hash = 7;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + (hash << 5) - hash;
    }
    const index = Math.abs(hash % COLORS.length);
    return COLORS[index];
  };

  $window.keydown(event => {
    if (!(event.ctrlKey || event.metaKey || event.altKey)) {
      $currentInput.focus();
    }
    if (event.which === 13) {
      if (username) {
        sendMessage();
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

  $inputMessage.click(() => {
    $inputMessage.focus();
  });

  // Socket events
  socket.on('login', (data) => {
    connected = true;
    log('Welcome to Socket.IO Chat – ', { prepend: true });
    addParticipantsMessage(data);
  });

  // Here is the key change: on 'new message' event, replace temp message if tempId matches
  socket.on('new message', (data) => {
    const { tempId, username: msgUsername, message: msgText } = data;

    if (tempId && tempMessages.has(tempId)) {
      // Replace temp message with confirmed message
      const $tempEl = tempMessages.get(tempId);
      $tempEl.removeClass('temp-message').removeAttr('data-temp-id');
      $tempEl.find('.messageBody').text(msgText);
      tempMessages.delete(tempId);
    } else {
      // Just add message normally (for other users)
      addChatMessage(data);
    }
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

  socket.io.on('reconnect', () => {
    log('you have been reconnected');
    if (username) {
      socket.emit('add user', username);
    }
  });

  socket.io.on('reconnect_error', () => {
    log('attempt to reconnect has failed');
  });

  // Receive message history
  socket.on('message history', (messages) => {
    messages.forEach((msg) => {
      addChatMessage(msg);
    });
  });
});
