# Drop-in sounds

Every sound in Mighty Men o' War is made live by the game's code. To use a
real recording instead, put an audio file in this folder with **exactly one
of the names below**, as `.ogg` (preferred) or `.mp3`. For example,
`bear_roar.ogg`.

The game looks for these files a moment after the first tap or key press.
When it finds one, it plays that file instead of its own sound, with a tiny
random change in pitch so repeats don't sound identical. If a file is
missing or can't be played, the game uses its own sound.

After adding files, run `node tools/stamp-version.mjs`. This adds them to
the offline list, so they work without a connection. Files you add without
stamping are still saved for offline play the first time they are played.

Use recordings you are allowed to use, such as your own, public-domain
recordings, or CC0 recordings. Keep them short and trimmed: no silence at
the start, and normalised to about −3 dB.

| File name | What it is | Suggested length |
|---|---|---|
| `gunshot_pistol` | Pistol / revolver shot (close) | 0.6–1.2 s |
| `gunshot_rifle` | Bolt-action rifle shot | 1–2 s (with echo) |
| `gunshot_sniper` | Sniper rifle shot | 1.5–2.5 s |
| `gunshot_smg` | One submachine-gun shot (played for each round) | 0.2–0.4 s |
| `gunshot_shotgun` | Double-barrel shotgun | 1–2 s |
| `gunshot_suppressed` | Suppressed pistol | 0.2–0.4 s |
| `explosion` | Grenade / TNT explosion | 2–4 s |
| `bear_roar` | Bear roar (before a charge, when hurt) | 1.2–2 s |
| `bear_growl` | Low bear growl (before an attack) | 0.8–1.5 s |
| `wolf_howl` | One wolf howl | 2–3.5 s |
| `wolf_snarl` | Wolf snarl / growl before biting | 0.4–0.9 s |
| `wolf_yelp` | Wolf yelp when hit | 0.2–0.5 s |
| `bite` | Animal bite landing | 0.2–0.4 s |
| `claw` | Claw swipe tearing cloth | 0.3–0.6 s |
| `impact` | Heavy body impact / thud | 0.2–0.5 s |
| `pain` | Short pain grunt (you) | 0.2–0.5 s |
| `heartbeat` | One heartbeat (lub-dub) | 0.4–0.6 s |
| `splash` | Splash in water | 0.4–0.9 s |
| `fish_cast` | Fishing line cast (whoosh and reel click) | 0.4–0.8 s |
| `fish_plop` | Bobber landing on water | 0.2–0.4 s |
| `fish_bite` | Fish taking the bait (splash) | 0.3–0.7 s |
| `fish_reel` | Reeling in a fish | 0.6–1 s |
| `death` | Your death (low, fading) | 2–3 s |
| `thunder` | Thunder roll | 2.5–5 s |
| `footstep` | One footstep (all surfaces) | 0.1–0.25 s |
