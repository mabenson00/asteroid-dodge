# Asteroid Dodge

A fast-paced browser game where you dodge asteroids that periodically surge in speed. How long can you survive?

## How to Play

1. Open `index.html` in any modern browser
2. Press **Enter** or **Space** to start
3. Use **Arrow Keys** or **WASD** to move your ship
4. Dodge the asteroids — one hit and it's over
5. Watch for the **SURGE** warning — asteroids briefly speed up every few seconds

## Deploying to GitHub Pages

1. Push this folder to a GitHub repository
2. Go to **Settings → Pages**
3. Set source to your main branch
4. Your game will be live at `https://<username>.github.io/<repo-name>/`

## Tweaking Difficulty

All gameplay parameters are in the `CONFIG` object at the top of `game.js`. You can adjust:

- `shipSpeed` — how fast your ship moves
- `asteroidBaseSpeed` / `asteroidSpeedVariance` — normal asteroid speed
- `asteroidSpawnInterval` / `asteroidBatchSize` — how many asteroids appear and how often
- `surgeInterval` — how frequently speed surges happen
- `surgeDuration` — how long each surge lasts
- `surgeMultiplier` — how much faster asteroids go during a surge
- `surgeWarningTime` — how much warning you get before a surge

## Tech

Pure HTML5 Canvas + vanilla JavaScript. No dependencies, no build step.
