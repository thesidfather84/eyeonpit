# EyeOnPit — Operator Manual

This is the practical, day-one guide for using EyeOnPit at the table. It
describes exactly what's in the app today — no planned features, no
placeholders. Terminology here matches the app's own buttons and voice
words exactly, so if something here doesn't match what you see on screen,
the app is right and this page needs fixing, not the other way around.

For the product's architecture and design principles, see
`docs/EYEONPIT_PRODUCT_SPEC.md`. For how the counting math itself is
validated, see `docs/VALIDATION.md`. This manual only covers *using* the
app.

---

## Your supervisor just handed you EyeOnPit

You've never used this before. Here's the whole job, start to finish.

1. **Open EyeOnPit.**
2. **Tap Floor.** This is the hands-free mode built for standing at a
   table — your phone can stay in your pocket.
3. **Put in your headset or AirPods**, if you're going to use voice.
4. **Turn voice on** — tap the microphone button. It keeps listening on
   its own; you don't tap it again between commands.
5. **Watch the table.**
6. **Say the dealer and player cards naturally**, as you see them —
   there's no rigid script to memorize. For example: *"Dealer king five.
   Player one seven three. Player two ace king."*
7. **Say "Done" when the hand finishes** (or tap Done if you'd rather).
8. **Listen for the count** — EyeOnPit saves the hand, speaks the count
   back through your headset, and is already waiting for the next hand's
   cards. You don't need to say anything else to move on.
9. **Say "Status" any time you want to hear the count again** — it never
   changes anything, so there's no wrong time to ask.
10. **Say "New Shoe" when the dealer shuffles.** If EyeOnPit isn't sure
    you meant it, it will ask you to confirm — just say what it asks for.
11. **Keep counting** — repeat steps 5–10 for the rest of the shift.
12. **Say "End Investigation" (then confirm), or use End & Review in the
    Menu, when the whole investigation is finished.** Nothing you recorded
    is ever deleted — you land straight on that investigation's own
    review, with everything you counted right there.

That's the entire job — watch the hand, say "Done," hear the count,
watch the next hand. Everything below is reference material for the
situations that come up along the way — noisy floors, corrections, taking
a break, and so on.

---

## Starting

From the home screen you have four ways to begin:

- **Quick** — starts immediately with your last-used table settings, opens
  the full Surveillance screen.
- **Floor** — starts immediately the same way, opens the hands-free Floor
  screen instead. This is the one most operators want most of the time.
- **Advanced** — lets you set the table/deck/rules details before
  starting.
- **Practice** — a training investigation that's kept completely separate
  from real cases (it never shows up mixed into your History).

Floor and Surveillance are **two views of the same investigation** — the
same cards, the same count, the same everything. Switching between them
(the "Surveillance" link in Floor, or "Floor Mode" in Surveillance's Menu)
never creates a second copy of anything and never loses data.

---

## What Floor shows you

Floor is deliberately compact — voice does the heavy lifting, the screen
is there to confirm what EyeOnPit heard, not to be a second full table.

- **The count**, always visible at the top — the number that matters most.
- **A compact play field** — dealer and every seat, which are occupied,
  which is active, and their current cards at a glance.
- **The active target** — exactly one line telling you what card entry
  currently applies to ("SPOT 2 · P1" / "ENTER CARDS", or "DEALER" /
  "ENTER CARDS"). Floor Mode always says "Spot" — Surveillance's own
  equivalent header says "Seat" instead; same seat, different word, see
  below.
- **Done / Next / Undo** and the manual card keypad, always available —
  voice is the fast path, not the only path.
- **The microphone button**, showing whether voice is currently listening.

---

## Talking to EyeOnPit

You don't need exact phrasing. Say things the way you'd naturally say
them at the table.

**Naming a target and its cards together:**

> "Dealer king five. Player one seven three. Player two ace king."

This produces exactly what it sounds like: the dealer gets a king and a
five, seat 1 gets a seven and a three, seat 2 gets an ace and a king —
every card recorded as its own entry.

**Naming a target once, then just the cards:**

> "Player one." … "Seven." … "Three."

Once you've named a target, plain card words that follow (in the same
sentence or later ones) keep applying to it until you name a different
target or say a workflow word (Done/Next/Undo/New Shoe).

**Seat/Spot/Player/C-form all mean the same thing** — "Seat 2", "Spot 2",
"Player 2", and "C2" are the exact same seat. Use whichever feels natural
when *speaking* — this is about what EyeOnPit understands, not what it
shows you. On screen, Floor Mode always displays "Spot 2" and Surveillance
always displays "Seat 2" for that identical seat; neither ever shows the
bare internal shorthand "S2."

**Naming an empty seat occupies it.** You don't need a separate "enable"
step — saying "Seat 2" (or naming it with a card) is the same as tapping
that seat on the table.

**Casino talk is safely ignored.** Ordinary conversation — "seat three
raised his bet," "I ordered five pizzas" — is never mistaken for cards.
When EyeOnPit genuinely can't tell what you meant, it says so rather than
guessing, and nothing gets recorded.

---

## Asking EyeOnPit a question — voice command cheat sheet

**Questions are read-only. Card narration changes the investigation.**
Those are the only two kinds of thing EyeOnPit's voice understands — a
question never adds a card, never completes a hand, never advances
anything. It's always safe to ask.

You don't need exact wording for questions either — any of these work:

**The count**, in general:
> "Status" · "Count" · "What is the count?" · "What's the count?" ·
> "Give me the count." · "Tell me the count." · "Current count." ·
> "Where is the count?"

**A specific counting system** — Hi-Lo, KO, Zen, or Omega (Omega II):
> "What's the Hi-Lo?" · "Hi-Lo?" · "What's the KO?" · "KO?" ·
> "What's the Zen?" · "Zen?" · "What's the Omega?" · "Omega?" · "Omega two?"

**Running count / true count specifically:**
> "Running count?" · "RC?" · "True count?" · "TC?"

**Aces and decks:**
> "How many aces?" · "Aces seen?" · "Decks remaining?" · "How many decks
> left?"

**Hear it again:**
> "Repeat"

"Repeat" says the exact last thing EyeOnPit said, word for word — it
never redoes anything. Say "Repeat" right after Done and it just says the
count again; it doesn't complete another hand. If EyeOnPit hasn't said
anything yet, it says "No previous message."

**Card narration** is everything else — an actual card, next to a target:
"Dealer king five," "Player one seven three." That's the only thing that
writes to the investigation; see "Talking to EyeOnPit" above.

---

## Done, Next, and New Shoe — what they actually mean

- **Done** = *this hand is finished.* Say or tap it once the round is
  over. In Floor, Done does the whole job in one step: it saves the hand,
  speaks the count (if spoken feedback is on), and is already listening
  for the next hand's cards — there is nothing else to say or tap.
- **Next** — you won't normally need this in Floor. It's there for two
  narrower situations: mid-hand, it manually steps the active target
  forward seat by seat, if you ever want to skip ahead without narrating
  a seat by name; and as a recovery control, if a hand ever ends up
  "locked" without automatically moving on (that's not the normal flow —
  if you see it, something needs a second look, not just a tap through
  it). In Surveillance, Done and Next stay two separate, deliberate steps
  — that screen is built for closer review, not hands-free speed.
- **New Shoe** = the dealer shuffled. Say "New Shoe." If the shoe already
  has cards recorded, EyeOnPit asks you to confirm before resetting the
  count — say **"Confirm New Shoe"**. Nothing from the old shoe is ever
  deleted; only the *current* count resets, exactly the way a real reshuffle
  works.

If "New Shoe" tells you the round isn't complete, finish the hand (Done)
first, or use the New Shoe button in the Menu, which offers a couple of
extra options for an in-progress round.

---

## Hearing the count

See the voice command cheat sheet above for every natural way to ask —
this section covers what gets spoken and how to configure it.

- **"Status"** (or any of its natural phrasings, e.g. "What's the
  count?") speaks the count right now, any time, without changing
  anything. By default it's just the primary system's running count —
  for example, *"Hi-Lo minus three."*
- **"Full Status"** always speaks everything available (every enabled
  counting system, plus true count where it applies), regardless of your
  spoken-feedback setting.
- **After Done**, EyeOnPit automatically speaks the count using whatever
  your spoken-feedback setting says to include (see below) — you don't
  have to ask.
- **After Undo**, if spoken feedback is on, EyeOnPit confirms with the
  count *after* the correction — e.g. *"Undone. Hi-Lo plus three."*

### Choosing what gets spoken

In Settings → **Floor Spoken Count**, choose:

- **Hi-Lo RC** (default) — just the running count, e.g. *"Hi-Lo minus
  three."*
- **Hi-Lo RC + TC** — adds the true count, e.g. *"Hi-Lo minus three. True
  count minus zero point five."*
- **All enabled counts** — every counting system EyeOnPit is tracking.
- **Off** — Done and Status stay silent (you still see the number on
  screen); this doesn't affect anything else EyeOnPit speaks.

This is separate from the **Spoken voice feedback** switch, which is the
master on/off for all spoken output. Turn that off entirely if you want
text only.

**EyeOnPit never hears itself.** While it's speaking a count back to you,
it automatically stops listening for that moment and picks back up the
instant it's done — saying "Hi-Lo minus three" back to you can't
accidentally get recorded as if you'd said it.

---

## Correcting a mistake

Say or tap **"Undo"**. It reverses whatever you most recently entered for
the target you're currently on, or the last action overall if that target
has nothing of its own to undo. It's always safe to check what it will
undo before you tap — the button's own label tells you (e.g. "Undo
Dealer").

---

## Taking a break

Say **"Pause Investigation"**, or use Pause in the Menu (Floor and
Surveillance both have it). Card entry is blocked while paused — the
keypad will tell you why if you try. Say **"Resume Investigation"**, or
use Resume in the Menu, to continue. Nothing recorded is ever affected by
pausing.

---

## If something looks locked or grayed out

EyeOnPit always tells you why, right above the keypad:

- **"Investigation paused — resume to continue."**
- **"Seat not enabled — tap the seat, or say its name, to enable it."**
- **"Hand locked — result already recorded."**
- **"Round complete — say or tap Next for the next hand."** In Floor
  this one shouldn't come up during normal play — Done already moves you
  into the next hand by itself. Seeing it there means something
  interrupted the normal flow; Next gets you unstuck.

If you ever see disabled buttons with no explanation, something is
wrong — that shouldn't happen.

---

## If voice isn't working

Nothing about EyeOnPit depends on voice working. The seat/dealer targets,
the full card keypad, and Done/Next/Undo are always there to tap — a
failed or noisy microphone never locks you out of recording the game. If
voice genuinely can't reach the recognition service (offline, no signal),
EyeOnPit tells you clearly and switches to manual-only rather than
retrying silently forever.

---

## End & Review

This is different from Done — Done finishes a *hand*, End & Review
finishes and reviews the *whole investigation*.

- **Voice:** say **"End Investigation."** EyeOnPit will ask you to
  confirm — say **"Confirm End Investigation."** It never closes the case
  from a single thing you say; it always waits for that second,
  deliberate phrase.
- **Manual:** open the Menu → **End & Review** → confirm.

Nothing you recorded is ever deleted. You land directly on that
investigation's own review — the same **Reports** view, opened
automatically, showing the executive summary, notes, and full
round-by-round evidence for the investigation you just finished. From
there:

- **Return Home** — the **"+ New"** button, always visible once an
  investigation is closed.
- **Export** — download everything (every round, every card, every event)
  as a JSON file.
- **Preview / Export Report** — a print-ready, shareable version of the
  report, with a **Print / Save as PDF** button and an **Export
  (Word/RTF)** button, opened as its own full-screen page. Every section
  is clearly marked as either an observed fact, a narrative you wrote, or
  derived analysis — if a section has nothing to show yet, it says so
  rather than leaving a confusing blank. This is available any time from
  the Reports view, not only right after closing an investigation.
- **History** — every past investigation, to come back to this one (or
  any other) again later.

---

## Starting the next one

From the home screen, Quick/Floor/Advanced/Practice all work exactly the
same as the first time — nothing about a finished investigation limits
what you can start next.
