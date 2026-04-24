- Bernice — Mr. Satan's AI Idea Notebook

A mobile-first, voice-driven note app where Mr. Satan can dump ideas on the fly. Bernice (the AI assistant) transcribes, organizes, and talks back with a friendly Wisconsin flavor. Built lean to fit within the $25/month Pro plan budget.

### Core experience

- **Big mic button on the home screen.** Tap and hold to dictate; release to save.
- Bernice transcribes the audio, **auto-classifies** the idea, and **speaks a short confirmation** back ("Ope, got that one filed under Inventions for ya").
- Wisconsin persona baked into Bernice's voice + word choice ("ope", "you betcha", "real quick there").

### Capturing ideas

- Hold-to-talk mic (primary input).
- Optional text input fallback for quiet places.
- Each idea is saved with: original transcript, timestamp, auto-assigned status, auto-assigned topic tag.

### Auto-organization (Bernice's job)

When an idea comes in, Bernice automatically assigns:

- **Status** (one of): Grow • Rethink • Trash • Parking Lot
- **Topic tag**: Business, Invention, Personal, Family, Training, Other (Bernice picks the best fit; Mr. Satan can rename/add tags later)

Mr. Satan can tap any idea to override the status or tag.

### The board

- **Kanban view** with 4 columns: Grow, Rethink, Trash, Parking Lot.
- Filter chips along the top to narrow by topic tag.
- Drag (or tap → move) ideas between columns.
- Tap an idea to open its detail view.

### Idea detail view

- Full transcript, timestamp, status, tag.
- Edit text, change status/tag.
- "Read aloud" button (Bernice reads it back in her voice).
- Delete.
- **If status = Grow:** Bernice generates a short development pack — action steps, key questions to answer, potential risks. Saved with the idea so it doesn't regenerate (saves AI usage).

### Bernice's voice

- Voice playback uses a friendly female voice with Wisconsin-style phrasing in the script (true regional accent depends on available voice models — we'll pick the closest natural-sounding option and lean on word choice/cadence for the Wisconsin feel).
- Confirmations are short (1 sentence) to keep voice usage minimal.

### Visual design

- Dark design with Mr. Satan's brand color scheme (I can attach) and easily legible font but in a gothic style.  
- Mobile-first layout, large tap targets, one-handed friendly.
- Bright color coding for the 4 status columns.

### What's intentionally out of scope (to protect your budget)

- No real-time back-and-forth voice conversations (much more expensive).
- No per-idea ongoing chat threads.
- No multi-user / sharing.
- No reminders/notifications.

These can be added later if you want to invest more.

### Cost notes

- Build mode is usage-based — I'll work in small steps so you can stop anytime.
- Voice (text-to-speech) and AI categorization run on Lovable Cloud & AI balance, which is **separate from your subscription credits** and has a small free monthly allowance. We'll keep responses short and only run AI on new ideas + Grow promotion to keep this minimal.