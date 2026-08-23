# LinkedIn posts — CDD Stoich Tools

Announcement posts about the extension, kept here so the drafts and the thinking
behind them aren't lost in a chat window. Written for practising scientists who
use CDD Vault daily, **not** for a developer audience — the engineering detail
lives in `CHANGELOG.md`, this is the human-facing version.

## What works, learned the hard way

- **The first two lines carry the whole post.** LinkedIn collapses everything
  after ~2 lines behind a "see more". The hook has to land before that click, so
  it opens on a concrete scene or a concrete number, never on "Excited to
  announce…".
- **A scene beats an announcement.** People stop for a story about friction they
  recognise, not for a version number. Versions are never mentioned in the copy —
  a user cares that the annoyance is gone, not whether it's 11.0 or 11.1.
- **Don't oversell the bug.** An early draft (and, embarrassingly, the real
  10.1.0 release notes) claimed a forgotten project "lost the whole form". It
  doesn't — CDD keeps what you typed. Anyone who'd actually hit the error would
  know the copy was lying. Overstating the problem oversells the fix. The notes
  were corrected; see the commit "Correct the 10.1.0 notes".
- **Never claim demand that didn't happen.** No "the feature everyone asked for"
  unless people actually asked. The honest "why" (below) is stronger anyway.
- **One post, one idea.** These started as a single post trying to carry the
  project fix *and* the settings/ordering work. It was doing too much, so it was
  split in two: Post 1 is a story, Post 2 is the "for you" features. Post them a
  few days apart — the story pulls the eyes, the follow-up converts them.

---

## Post 1 — the talk story (published)

The strongest hook we had, because it actually happened: mid-talk, live, the
author forgot to select the project — which was, of course, "Monomers".

> **Yesterday I gave a talk on non-standard monomers.**
>
> **Live, in front of the room, I registered a compound in Collaborative Drug
> Discovery - CDD Vault and forgot to select the project — which was, of course,
> "Monomers".**
>
> The talk itself landed well. The point I wanted to make is that CDD Vault is
> genuinely strong at the part everyone assumes is hard: editing non-trivial
> entities — modified peptides, nucleotides, the messy building blocks that are
> everyday reality in research now. It handles them properly.
>
> Which makes the punchline better: what tripped me up wasn't the hard part. It
> was picking a project.
>
> CDD did what it always does — rejected the submit, told me the project was
> missing. Nothing lost, but I scrolled back to the top, picked it, scrolled
> down, submitted again. In front of everyone, 5 times in a row. If you use CDD
> Vault, you know that bounce. The project dropdown lives at the top of the form;
> the Create button a screenful below.
>
> So my free browser extension now puts the project picker right next to the
> Create button — and keeps Create disabled until you've chosen one. The trip to
> the top doesn't happen.
>
> At PharmTheon and Ústav organické chemie a biochemie AV ČR, CDD Vault is my
> daily lab notebook — so I keep fixing the small things that get in the way.
> Free, open source, Chrome and Firefox:
> https://xaviersvk.github.io/CDD-Stoich-Tools/
>
> #CDDVault #Cheminformatics #Monomers

**How we got here**

- The "Monomers" punchline is a gift you can't invent — the forgotten project
  literally was the project named *Monomers*. Everyone who knows CDD gets it
  instantly.
- The talk-success paragraph isn't politeness; it's the **setup**. "CDD is
  strong at the hard part (modified peptides, nucleotides) — and the *trivial*
  part is what tripped me" is a sharper joke than "I forgot something". It also
  keeps the post pro-CDD rather than reading as a complaint about their product.
- "Nothing lost" stays in, right after the jab — sounds confident, not like an
  excuse, and it's the honest version (see the data-loss lesson above).
- **Affiliation goes in the middle, not the top.** At the top ("I work at X")
  it reads like a title card; in the middle it explains *why* he fixes these
  things — he lives in CDD all day. Reworded from an earlier "I live in CDD" that
  could be misread as working *for* CDD; he's a user, and CDD Vault is his "daily
  lab notebook". PharmTheon and ÚOCHB (Ústav organické chemie a biochemie AV ČR)
  should be tagged as organisations when posting so LinkedIn links them.

---

## Post 2 — settings + registration-form order (draft, ready to post)

Stands on its own — no dependency on Post 1, so it reaches people who missed the
first. The deeper point is the author's own: in a shared multi-entity vault, a
group is many people each working a different slice, and each wants the comfort
of a personalised setup over one fixed shared one.

> **Every time you register something in CDD Vault, you pick an entity type from
> a list of fifteen. Sorted alphabetically. You use two of them.**
>
> A shared vault holds a whole group — and everyone works a different slice of
> it. A chemist reaches for Molecule, someone on peptides for another type, a
> biologist for Protein. Same list, same order, and it fits none of them. You
> scroll past the thirteen you never touch, every time.
>
> That's the thing about a shared platform: one fixed order can't suit everyone.
> So the order should be personal — one vault, but each person gets it their way.
>
> My free CDD extension now lets you **put the Registration Form list in your own
> order** — drag the types you use to the top. It also remembers the last one you
> picked, per vault, and preselects it next time, so most days you don't touch
> the list at all.
>
> While I was at it, settings finally got a real home: a proper settings page,
> opened straight from CDD's own user menu instead of a cramped popup. And every
> release is now written up in plain language.
>
> Free, open source, Chrome and Firefox:
> https://xaviersvk.github.io/CDD-Stoich-Tools/
>
> #CDDVault #ELN #DrugDiscovery

**How we got here**

- **Hook is a concrete number** (fifteen types, alphabetical, you use two) — a
  fact every CDD user feels immediately, and it fits inside the two lines before
  the "see more" fold. Fifteen is the real count from the author's vault.
- **The thesis sits in the middle, where it's visible:** "one fixed order can't
  suit everyone. So the order should be personal — one vault, but each person
  gets it their way." That's the multi-entity / personalised-access idea, said
  in plain language rather than marketing-speak. The hook lets the reader *feel*
  it first; the thesis then names it.
- **No invented demand.** The honest framing (how multidisciplinary teams
  actually share a vault) is a better reason than "people asked", so an earlier
  "the one people kept asking for" line was dropped.
- **Settings + docs are a subordinate clause, not a second headline.** The hero
  of Post 2 is the ordering; "while I was at it" pins the settings home and the
  docs on without letting them compete for the point.
- Entity names (Molecule, Protein, …) are standard CDD types, not the author's
  internal names, so they're safe to show. "someone on peptides" can become "a
  peptide chemist" if a tighter register is wanted.

---

## Post 3 — HPLC injection (published)

The tooling post that isn't about tooling. Column life and ion-source
cleanliness are what the audience feels; the plugin is the answer to it.

> A standard analytical column takes about 0.2 nmol of reaction mixture per
> injection. On a day with thirty samples in the queue, nobody stops to work out
> what that means in microlitres — so you inject what you injected last time, and
> hope.
>
> Overload it and you pay twice: the column loses resolution, and the MS ion
> source fouls, so it wants cleaning sooner and drifts in between. Neither
> failure announces itself. Performance just quietly degrades until the peaks
> aren't what they used to be.
>
> My free @Collaborative Drug Discovery - CDD Vault plugin extension now puts
> that number in the notebook, right beside the stoichiometry, for every
> reaction. When it falls outside what your injector can comfortably deliver, one
> sentence says what to change — another drop, a 250 µL insert, or dilute it —
> and one click applies it. The defaults come from our own bench, Waters and
> Thermo, down to the sample loop's 0.1–10 µL, and every one is editable.
>
> Thank you, @Pavel Kraina of IOCB Prague, who explained which fix is cheap and
> which one costs five minutes you don't have. At @Ústav organické chemie a
> biochemie AV ČR and @PharmTheon, instrument lifetime and performance are a
> standing priority — the column and the source are shared, and a careless
> injection is paid for by whoever runs next. Which is why this belongs in the
> notebook, where the decision is actually made.
>
> Free, open source, Chrome and Firefox — link in the comments.
>
> #HPLC #LCMS #CDDVault #ELN #DrugDiscovery

**How we got here**

- **The hook fuses the number and the behaviour.** Drafts kept them apart: one
  paragraph on the 0.2 nmol limit, another, later, on nobody doing the
  arithmetic. Joined into the opening, "so you inject what you injected last
  time, and hope" lands inside the two lines before the "see more" fold, and the
  reader recognises themselves before they've decided whether to keep reading.
- **Thirty samples, not hundreds.** An earlier draft said hundreds, taken from
  Pavel Kraina's remark about high-throughput days. Thirty is the ordinary
  queue, and the ordinary queue is where the reader lives — an inflated number
  would let them off the hook ("that's not my lab").
- **The consequence comes second, unhurried.** Once the hook has them, the
  column and the source get a paragraph to themselves without competing for
  attention.
- **The plugin arrives as the answer, in paragraph three** — not as the
  announcement. It gets the longest paragraph, which is right for the hero.
- **"Many times further" was cut.** It was the payoff line of an earlier draft
  and the softest claim in it; "you pay twice" already implies it, and no
  multiplier survives contact with a real method. Same lesson as the 10.1.0
  notes.
- **The three fixes named are the three the optimiser actually offers** (drops →
  vessel → dilution, `hplc-optimizer.js`). Naming a fourth would read better and
  be false.
- **The affiliation paragraph carries an argument, not a title card.** Instrument
  lifetime being a standing priority at IOCB and PharmTheon is the reason the
  feature exists; the shared column and shared source make it concrete — the cost
  of a careless injection lands on a colleague, not on whoever made it. "Which is
  why this belongs in the notebook, where the decision is actually made" is the
  line that earns the post.
- **Pavel Kraina is placed at IOCB Prague in his own credit line**, so the thanks
  and the affiliation sentence reinforce each other rather than reading as two
  unrelated name-drops. The English name is used for him and the Czech one for
  the institute's @-tag, which is how LinkedIn resolves them.
- **Waters and Thermo are our bench, not endorsements** — and "every one is
  editable" in the same sentence blocks the "only works on their kit" reading.
- **The link went to the first comment.** LinkedIn suppresses reach on posts with
  an outbound link in the body; Posts 1 and 2 carried it inline. Worth watching
  whether this one travels further.

---

## Backlog — angles not yet written

- The plate tooling (location column, CSV export, Plate Map structure tooltips) —
  a whole post's worth, aimed at anyone managing physical inventory.
- The floating ELN sample panel + click-to-copy — the everyday quality-of-life
  layer, probably the broadest-appeal story of all.
