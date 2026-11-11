/* SonicFrame Creative Co-Pilot Widget & Live Timeline Controller */
(function () {
  'use strict';

  // Standalone chatbot page already has its own full UI; do not double-inject
  var path = (window.location && window.location.pathname) || '';
  if (path.endsWith('chatbot.html') || path.includes('/chatbot')) {
    return;
  }

  // Ensure CSS is injected even if omitted from page HTML
  function ensureCSS() {
    if (!document.querySelector('link[href*="sonicframe-chat-widget.css"]')) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.type = 'text/css';
      link.href = 'sonicframe-chat-widget.css';
      (document.head || document.documentElement).appendChild(link);
    }
  }

  // Auto-import SonicFrameCopilot if not already present on window
  async function ensureCopilot() {
    if (window.SonicFrameCopilot) return window.SonicFrameCopilot;
    try {
      var mod = await import('./sonicframe-copilot.js');
      if (mod && (mod.default || mod.SonicFrameCopilot)) {
        window.SonicFrameCopilot = mod.default || mod.SonicFrameCopilot;
        return window.SonicFrameCopilot;
      }
    } catch (e) {
      // Dynamic import fallback
    }
    return window.SonicFrameCopilot || null;
  }

  function getActiveState() {
    if (window.SonicFrameCopilot) {
      return window.SonicFrameCopilot.getActiveState();
    }
    return { telemetry: null, cueSheet: null, mood: 'cinematic_dark' };
  }

  async function handleUserMessage(messageText) {
    var Copilot = await ensureCopilot();
    var state = getActiveState();

    // 1. Check if input is a natural language command that mutates the score or cue sheet
    if (Copilot && typeof Copilot.handleCommand === 'function') {
      var cmdResult = Copilot.handleCommand(messageText, state.cueSheet, state.telemetry);
      if (cmdResult && cmdResult.executed) {
        return {
          reply: cmdResult.message,
          action: cmdResult.action,
          executed: true
        };
      }
    }

    // 2. If not a mutating sound command, send to chat endpoint or fall back to copilot advice
    try {
      var token = window.SFAuth ? await window.SFAuth.getToken() : '';
      var response = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        },
        body: JSON.stringify({
          message: messageText,
          context: {
            hasTelemetry: !!state.telemetry,
            hasCueSheet: !!state.cueSheet,
            cues: state.cueSheet && state.cueSheet.foley_events ? state.cueSheet.foley_events.length : 0,
            key: state.cueSheet && state.cueSheet.composition_profile ? state.cueSheet.composition_profile.key_root : 'D'
          }
        })
      });

      if (response.ok) {
        var data = await response.json();
        if (data.reply) return { reply: data.reply, executed: false };
      }
    } catch (err) {
      console.warn('Chat endpoint unavailable, falling back to local copilot guidance:', err.message);
    }

    // 3. Fallback response from local CoPilot assistant
    if (Copilot && typeof Copilot.handleCommand === 'function') {
      var fallbackCmd = Copilot.handleCommand(messageText, state.cueSheet, state.telemetry);
      return { reply: fallbackCmd.message, executed: false };
    }

    return {
      reply: "✦ SonicFrame Co-Pilot ready. Try commanding sound mutations:\n• 'Make footsteps sound heavier / like wet cobblestone'\n• 'Increase score tension in the final 3 seconds'\n• 'Double the decay time on all metallic clashes'\n• 'Set key to D minor / cinematic dark'\n• 'Mute the atmosphere stem'",
      executed: false
    };
  }

  function ensureWidgetDOM() {
    ensureCSS();

    if (!document.body) return;

    var trigger = document.getElementById('sfChatTrigger');
    var panel = document.getElementById('sfChatPanel');

    if (!trigger) {
      trigger = document.createElement('button');
      trigger.id = 'sfChatTrigger';
      trigger.className = 'sf-chat-launcher';
      trigger.setAttribute('aria-label', 'Open SonicFrame AI Co-Pilot');
      trigger.innerHTML =
        '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M9 18V5l12-2v13"></path>' +
          '<circle cx="6" cy="18" r="3" fill="currentColor"></circle>' +
          '<circle cx="18" cy="16" r="3" fill="currentColor"></circle>' +
        '</svg>' +
        '<span class="sf-chat-tooltip">AI CO-PILOT ✦</span>';
      document.body.appendChild(trigger);
    }

    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'sfChatPanel';
      panel.className = 'sf-chat-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'SonicFrame Co-Pilot Assistant');
      panel.innerHTML =
        '<div class="sf-chat-head">' +
          '<div class="sf-chat-title">' +
            '<span>✦ &nbsp; SonicFrame Co-Pilot</span>' +
            '<span class="sf-chat-status">● LIVE</span>' +
          '</div>' +
          '<div class="sf-chat-actions">' +
            '<a href="chatbot.html" class="sf-chat-popout" title="Open Fullscreen Co-Pilot" aria-label="Open Fullscreen Co-Pilot in new tab" target="_blank" rel="noopener">↗</a>' +
            '<button id="sfChatClose" class="sf-chat-close" title="Close Co-Pilot" aria-label="Close Co-Pilot">&times;</button>' +
          '</div>' +
        '</div>' +
        '<div id="sfChatMessages" class="sf-chat-messages" role="log" aria-live="polite" aria-label="Co-Pilot chat history">' +
          '<div class="sf-chat-msg assistant">' +
            'Hi! I am your SonicFrame Creative Co-Pilot. I can modify foley, re-tune scales, and automate stems in real-time.<br><br>' +
            'Try asking:<br>' +
            '• <em>"Make footsteps sound heavier / like wet cobblestone"</em><br>' +
            '• <em>"Increase score tension in the final 3 seconds"</em><br>' +
            '• <em>"Double the decay time on all metallic clashes"</em><br>' +
            '• <em>"Set key to D minor / cinematic dark"</em><br>' +
            '• <em>"Mute the atmosphere stem"</em>' +
          '</div>' +
        '</div>' +
        '<div class="sf-chat-chips" role="group" aria-label="Quick sound commands">' +
          '<button class="sf-chip" data-cmd="Make footsteps sound heavier / like wet cobblestone" aria-label="Prompt: Wet cobblestone footsteps">Wet cobblestone footsteps</button>' +
          '<button class="sf-chip" data-cmd="Increase score tension in the final 3 seconds" aria-label="Prompt: Final 3s tension">Final 3s tension</button>' +
          '<button class="sf-chip" data-cmd="Double the decay time on all metallic clashes" aria-label="Prompt: Double metal decay">Double metal decay</button>' +
          '<button class="sf-chip" data-cmd="Set key to D minor / cinematic dark" aria-label="Prompt: Key: D minor">Key: D minor</button>' +
          '<button class="sf-chip" data-cmd="Mute the atmosphere stem" aria-label="Prompt: Mute atmosphere">Mute atmosphere</button>' +
        '</div>' +
        '<form id="sfChatForm" class="sf-chat-form" aria-label="Co-Pilot command form">' +
          '<textarea id="sfChatInput" class="sf-chat-input" placeholder="Type a sound command (Enter to send, Shift+Enter for new line)…" rows="1" autocomplete="off" aria-label="Sound command message" required></textarea>' +
          '<button type="submit" class="sf-chat-send" aria-label="Send sound command">Send ↗</button>' +
        '</form>';
      document.body.appendChild(panel);
    }
  }

  function initWidget() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', initWidget);
      return;
    }

    ensureWidgetDOM();

    var trigger = document.getElementById('sfChatTrigger');
    var panel = document.getElementById('sfChatPanel');
    var closeBtn = document.getElementById('sfChatClose');
    var form = document.getElementById('sfChatForm');
    var input = document.getElementById('sfChatInput');
    var messagesContainer = document.getElementById('sfChatMessages');

    if (!panel || !form || !input) return;

    ensureCopilot();

    if (trigger) {
      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        panel.classList.toggle('open');
        if (panel.classList.contains('open')) {
          setTimeout(function () { input.focus(); }, 120);
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        panel.classList.remove('open');
        if (trigger) trigger.focus();
      });
    }

    // Close on Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('open')) {
        panel.classList.remove('open');
        if (trigger) trigger.focus();
      }
    });

    // Close when clicking outside panel and launcher
    document.addEventListener('click', function (e) {
      if (panel.classList.contains('open')) {
        if (!panel.contains(e.target) && !trigger.contains(e.target)) {
          panel.classList.remove('open');
        }
      }
    });

    // Auto-grow textarea on typing without premature scrollbars
    input.addEventListener('input', function () {
      this.style.height = 'auto';
      var nextH = Math.min(120, Math.max(48, this.scrollHeight));
      this.style.height = nextH + 'px';
      this.style.overflowY = this.scrollHeight > 120 ? 'auto' : 'hidden';
    });

    // Enter sends, Shift+Enter adds newline
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        if (e.shiftKey) {
          // Allow default Shift+Enter to create a newline
          return;
        }
        e.preventDefault();
        var text = input.value.trim();
        if (text) {
          if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
          } else {
            form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
          }
        }
      }
    });

    // Quick command suggestion chips
    var chips = panel.querySelectorAll('.sf-chip');
    chips.forEach(function (chip) {
      chip.addEventListener('click', function (e) {
        e.preventDefault();
        var cmd = chip.getAttribute('data-cmd');
        if (cmd) {
          input.value = cmd;
          if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
          } else {
            form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
          }
        }
      });
    });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text) return;

      appendMessage('user', text, false);
      input.value = '';
      input.style.height = '48px';
      input.style.overflowY = 'hidden';

      var loadingId = appendMessage('assistant', 'Analyzing telemetry and processing command...', false);
      var result = await handleUserMessage(text);
      updateMessage(loadingId, (result.executed ? '✦ ' : '') + result.reply, result.executed);
    });

    function appendMessage(sender, text, isCommand) {
      if (!messagesContainer) return '';
      var msgDiv = document.createElement('div');
      var msgId = 'msg_' + Math.random().toString(36).substr(2, 9);
      msgDiv.id = msgId;
      msgDiv.className = 'sf-chat-msg ' + sender + (isCommand ? ' command-executed' : '');
      msgDiv.textContent = text;
      messagesContainer.appendChild(msgDiv);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      return msgId;
    }

    function updateMessage(id, text, isCommand) {
      var msgDiv = document.getElementById(id);
      if (msgDiv) {
        msgDiv.textContent = text;
        if (isCommand) {
          msgDiv.className = 'sf-chat-msg assistant command-executed';
        }
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }
})();
