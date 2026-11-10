/* SonicFrame chat widget controller - OpenAI integration */
(function () {
  'use strict';

  async function handleUserMessage(messageText) {
    try {
      const token = window.SFAuth ? await window.SFAuth.getToken() : '';

      // Permanently point to your live Netlify serverless function
      const response = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ message: messageText })
      });

      if (!response.ok) {
        throw new Error('Failed to communicate with AI chat endpoint.');
      }

      const data = await response.json();
      return data.reply || "I received your message.";

    } catch (err) {
      console.error('Chat widget error:', err);
      return "Sorry, I'm having trouble connecting to the AI assistant right now.";
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var trigger = document.getElementById('sfChatTrigger');
    var panel = document.getElementById('sfChatPanel');
    var closeBtn = document.getElementById('sfChatClose');
    var form = document.getElementById('sfChatForm');
    var input = document.getElementById('sfChatInput');
    var messagesContainer = document.getElementById('sfChatMessages');

    if (!panel || !form || !input) return;

    if (trigger) {
      trigger.addEventListener('click', function () {
        panel.classList.toggle('open');
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        panel.classList.remove('open');
      });
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text) return;

      appendMessage('user', text);
      input.value = '';

      var loadingId = appendMessage('assistant', 'Thinking...');
      var reply = await handleUserMessage(text);
      updateMessage(loadingId, reply);
    });

    function appendMessage(sender, text) {
      if (!messagesContainer) return '';
      var msgDiv = document.createElement('div');
      var msgId = 'msg_' + Math.random().toString(36).substr(2, 9);
      msgDiv.id = msgId;
      msgDiv.className = 'sf-chat-msg ' + sender;
      msgDiv.textContent = text;
      messagesContainer.appendChild(msgDiv);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      return msgId;
    }

    function updateMessage(id, text) {
      var msgDiv = document.getElementById(id);
      if (msgDiv) {
        msgDiv.textContent = text;
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }
    }
  });
})();