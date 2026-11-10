SONICFRAME FLOATING CHATBOT ICON ADD-ON

This add-on creates a fixed, bottom-right musical-note chatbot button.
It uses a silver/white gradient, soft pulsing glow, hover lift, tooltip,
keyboard focus styling, mobile sizing, and reduced-motion support.

INSTALL
1. Extract these two files into the root of your SonicFrame website folder:
   - sonicframe-chat-widget.js
   - sonicframe-chat-widget.css
2. Add this script tag immediately before </body> in:
   index.html, studio.html, motion.html, foley.html, timeline.html, mixer.html

   <script src="sonicframe-chat-widget.js" defer></script>

3. Do NOT add the script to chatbot.html. The script also checks the page name
   and will not show the button there.
4. Deploy the updated folder to Netlify.

The button links to chatbot.html in the same site folder.

NOTE
This is an installable add-on, not a rebuilt copy of the seven uploaded HTML
pages. The uploaded originals could not be materialized into the file-editing
workspace in this run, so their page contents have not been modified.
This add-on does not implement or alter OpenAI API integration.

FLOATING CHATBOT ICON - INTEGRATED
The musical-note floating launcher is now wired into:
index.html, studio.html, motion.html, foley.html, timeline.html, mixer.html.
The existing sonicframe-chat-widget.js and sonicframe-chat-widget.css files
are loaded from each of those pages. The launcher opens chatbot.html.
chatbot.html intentionally does not load the launcher script.

LOGIN / REGISTER (NEW)
All pages except index.html now require sign-in (email/password or Google).
Setup steps are in SETUP-AUTH.txt. Firebase details go in firebase-config.js.
