# rbr-rally-creator-web — Claude instructions

## What this repo is

Frontend half of a two-repo project to fix rallysimfans.hu's (RSF) clunky, unpleasant
rally-creation wizard. This app is the nicer UI the user builds a rally in; it never talks to RSF
directly — it hands the actual work to [rbr-rally-creator-service](https://github.com/erikpantzar/rbr-rally-creator-service),
a Playwright automation backend that drives RSF's real site on the user's behalf.

The intention: let a rally organizer compose a rally the way this app frames it (a document built
up piece by piece, per `DESIGN_SPEC.md`), while RSF itself never has to change.

## Where to look

- `README.md` — current status, architecture, what's built vs. not yet built.
- `DESIGN_SPEC.md` — the design rationale ("document of bricks" model) behind the UI.
- `ideas-and-projects/active/rally-creation-automation/NOTES.md` (sibling repo) — the overall
  plan and phase breakdown spanning both this repo and the service.

Keep `README.md`'s Status section current as features land — that's the source of truth for
what's actually built, not this file.
