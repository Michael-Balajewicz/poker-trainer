# Seat avatars

Drop a picture into this folder, named after a player, and it appears at that player's seat.
There is nothing else to edit, and it shows up straight away, even while the app is running.

| Seat | Name the file |
|---|---|
| You | `you` |
| Ava | `ava` |
| Ben | `ben` |
| Cleo | `cleo` |
| Dex | `dex` |
| Elle | `elle` |
| Finn | `finn` |
| Gus | `gus` |
| Hana | `hana` |

…followed by one of these extensions, in lower case: `.png` `.jpg` `.jpeg` `.webp` `.gif`
`.svg` `.avif`. For example `ava.png` or `ben.jpg`.

## Good to know

- **Square pictures look best.** Any size works. Each picture is cropped to fill a circle, so
  keep the face near the middle.
- **Missing pictures are fine.** A seat without a picture shows a placeholder: bots show their
  initial on a coloured circle, and your seat shows "You".
- **Your own seat.** Adding `you.png` replaces the "You" placeholder. Leave it out to keep "You".
- **Renaming a player.** Player names come from `NAMES` in `src/App.tsx`. If you rename one,
  rename their picture to match.
