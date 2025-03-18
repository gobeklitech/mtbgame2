# Bicycle Rider Game

A basic open-world Three.js game with procedurally generated terrain featuring a bicycle rider.

## Setup and Run

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Start the development server:
   ```
   npm run dev
   ```
4. For production build:
   ```
   npm run build
   npm run preview
   ```

## Controls

- **W key**: Move forward (accelerate)
- **S key**: Brake (slow down quickly)
- **C key**: Toggle speed cap (limits to one-third maximum speed)
- **Left Arrow**: Steer left
- **Right Arrow**: Steer right
- **Up Arrow**: Lean forward
- **Down Arrow**: Do a wheelie (pop a wheelie by holding down)
- **Space Bar**: Jump

## Features

- Massive procedurally generated terrain (1000x1000 units)
- Enhanced terrain elevation with multi-octave noise
- Advanced slope-based physics system:
  - Steep uphills dramatically slow the bicycle (up to 95% reduction)
  - Downhills provide speed boosts (up to 40% increase)
  - Harder braking on downhill sections
  - Realistic coasting on slopes
- Realistic acceleration physics (slow build-up of speed)
- Camera that follows the bicycle
- Jump and wheelie mechanics for stunts
- Togglable speed cap for controlled riding

## Technical Details

This game uses:
- Three.js for 3D rendering
- Vite for bundling and development
- SimplexNoise for terrain generation
- OrbitControls for camera management

## Development

To modify the game:
- Edit `js/game.js` to change game mechanics
- Adjust terrain generation parameters in the `createTerrain()` function
- Modify the bicycle model in the `createBicycle()` function 