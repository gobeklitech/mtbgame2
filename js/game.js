import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

// Main game variables
let scene, camera, renderer, clock;
let terrain, bicycle, controls;
let keys = { w: false, left: false, right: false, up: false, down: false, space: false, s: false, e: false };
let gameSpeed = 0;
const MAX_SPEED = 3.0;
const SPEED_CAP = 0.6;
let steerAngle = 0;
let leanAngle = 0;
let trailCurves = []; // Added global declaration for trail curves
let obstacles = []; // Array to track all obstacles for collision detection
let collisionOccurred = false;
let collisionCooldown = 0;

// Scoring system variables
let playerScore = 0;
let objectiveBeam = null;
let scoreDisplay = null;

// UI control variables
let gameStarted = false;
let introPopup = null;

// Physics variables
let isJumping = false;
let jumpVelocity = 0;
const JUMP_FORCE = 0.5;
const GRAVITY = 0.02;
const BRAKE_FORCE = 0.2; // Added missing brake force constant
let isWheelieMode = false;
let wheelieAngle = 0;
const MAX_SAFE_WHEELIE_ANGLE = Math.PI / 6; // 30 degrees - safe threshold
const CRITICAL_WHEELIE_ANGLE = Math.PI / 3; // 60 degrees - will fall if exceeded
const WHEELIE_DIFFICULTY = 1.5; // Higher = harder to balance
let twistAngle = 0; // Track rotation for mid-air tricks
const TWIST_SPEED = 0.2; // Rotation speed per frame
let originalDirection = new THREE.Vector3(); // Store original direction during twists
let isWipingOut = false; // Track if player is currently falling
let wipeOutTime = 0; // Track wipeout animation time

// Initialize the game
function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue
    
    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);
    
    // Create clock for timing
    clock = new THREE.Clock();
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(250, 300, 250);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 4096;
    directionalLight.shadow.mapSize.height = 4096;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 1000;
    directionalLight.shadow.camera.left = -500;
    directionalLight.shadow.camera.right = 500;
    directionalLight.shadow.camera.top = 500;
    directionalLight.shadow.camera.bottom = -500;
    scene.add(directionalLight);
    
    // Create bicycle first
    createBicycle();
    
    // Create procedural terrain
    createTerrain();
    
    // Create spawn point with light beam
    createSpawnPoint();
    
    // Add obstacles
    createObstacles();
    
    // Setup controls
    setupControls();
    
    // Create score display
    createScoreDisplay();
    
    // Create initial objective beam
    createObjectiveBeam();
    
    // Show intro popup with game objectives and controls
    createIntroPopup();
    
    // Event listeners
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // Start game loop
    animate();
}

// Create procedural terrain
function createTerrain() {
    const simplex = new SimplexNoise();
    const geometry = new THREE.PlaneGeometry(1000, 1000, 200, 200);
    geometry.rotateX(-Math.PI / 2);
    
    // Define trail paths using bezier curves
    // Each path is defined as a series of control points for a bezier curve
    const trailPaths = [
        // Main circular trail loop
        [
            new THREE.Vector2(-300, 0),
            new THREE.Vector2(-250, 200),
            new THREE.Vector2(0, 250),
            new THREE.Vector2(250, 200),
            new THREE.Vector2(300, 0),
            new THREE.Vector2(250, -200),
            new THREE.Vector2(0, -250),
            new THREE.Vector2(-250, -200),
            new THREE.Vector2(-300, 0)
        ],
        // Cross trail 1 (East-West)
        [
            new THREE.Vector2(-400, 100),
            new THREE.Vector2(-200, 120),
            new THREE.Vector2(0, 100),
            new THREE.Vector2(200, 80),
            new THREE.Vector2(400, 100)
        ],
        // Cross trail 2 (North-South)
        [
            new THREE.Vector2(100, 400),
            new THREE.Vector2(80, 200),
            new THREE.Vector2(100, 0),
            new THREE.Vector2(120, -200),
            new THREE.Vector2(100, -400)
        ]
    ];
    
    // Convert trail paths to curves for easier distance calculation
    trailCurves = trailPaths.map(path => {
        const curve = new THREE.CatmullRomCurve3();
        curve.points = path.map(p => new THREE.Vector3(p.x, 0, p.y));
        return curve;
    });
    
    // Define trail width and influence
    const TRAIL_WIDTH = 15;
    const TRAIL_SMOOTHING = 25;
    
    // Define height thresholds for different biomes
    const SNOW_LEVEL = 45;
    const ROCK_LEVEL = 25;
    const FOREST_LEVEL = 15;
    const GRASS_LEVEL = 0;
    const SAND_LEVEL = -10;
    const WATER_LEVEL = -20;
    
    // Create color array for vertices
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    
    // Generate height map
    const vertices = geometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
        const x = vertices[i];
        const z = vertices[i + 2];
        
        // Generate base extreme height using simplex noise
        // Increased amplitude for more dramatic terrain
        let height = 
            40 * simplex.noise(x * 0.003, z * 0.003) + // Large scale mountains (increased amplitude)
            15 * simplex.noise(x * 0.01, z * 0.01) +   // Medium details
            5 * simplex.noise(x * 0.05, z * 0.05);     // Small details
        
        // Make extreme cliffs at certain thresholds
        if (height > 20) {
            height = 20 + (height - 20) * 2; // Make high areas even higher
        }
        if (height < -10) {
            height = -10 + (height + 10) * 2; // Make low areas even lower
        }
        
        // Calculate slope by sampling nearby points
        const sampleDistance = 3;
        const hx1 = 40 * simplex.noise((x + sampleDistance) * 0.003, z * 0.003) + 
                    15 * simplex.noise((x + sampleDistance) * 0.01, z * 0.01) +
                    5 * simplex.noise((x + sampleDistance) * 0.05, z * 0.05);
        const hz1 = 40 * simplex.noise(x * 0.003, (z + sampleDistance) * 0.003) + 
                    15 * simplex.noise(x * 0.01, (z + sampleDistance) * 0.01) +
                    5 * simplex.noise(x * 0.05, (z + sampleDistance) * 0.05);
                    
        const slopeX = Math.abs(height - hx1) / sampleDistance;
        const slopeZ = Math.abs(height - hz1) / sampleDistance;
        const slope = Math.max(slopeX, slopeZ);
        
        // Calculate distance to nearest trail
        let minTrailDistance = Infinity;
        let nearestTrailHeight = 0;
        
        trailCurves.forEach((curve, index) => {
            // Find the closest point on the curve to this vertex
            const closestPoint = closestPointOnCurve(new THREE.Vector3(x, 0, z), curve);
            const distance = Math.sqrt(
                Math.pow(x - closestPoint.x, 2) + 
                Math.pow(z - closestPoint.z, 2)
            );
            
            // If this is closer than previous trails, update min distance
            if (distance < minTrailDistance) {
                minTrailDistance = distance;
                
                // Generate trail height based on path position (gently following terrain)
                const baseTrailNoise = 
                    8 * simplex.noise(closestPoint.x * 0.005, closestPoint.z * 0.005) + 
                    2 * simplex.noise(closestPoint.x * 0.02, closestPoint.z * 0.02);
                
                // Add gentle slope along trail length for variety
                const t = curve.getUtoTmapping(closestPoint.u);
                const pathVariation = Math.sin(t * Math.PI * 4) * 3;
                
                nearestTrailHeight = baseTrailNoise + pathVariation;
            }
        });
        
        // Apply trail deformation to terrain
        if (minTrailDistance < TRAIL_WIDTH) {
            // On the trail - flatten completely
            height = nearestTrailHeight;
        } else if (minTrailDistance < TRAIL_WIDTH + TRAIL_SMOOTHING) {
            // Transition zone - blend between trail and terrain
            const blend = (minTrailDistance - TRAIL_WIDTH) / TRAIL_SMOOTHING;
            height = nearestTrailHeight * (1 - blend) + height * blend;
        }
        
        vertices[i + 1] = height;
        
        // Determine vertex color based on height, slope, and distance to trail
        let r, g, b;
        
        // Add some variation with noise
        const colorNoise = simplex.noise(x * 0.02, z * 0.02) * 0.1;
        
        // On trail - use path colors
        if (minTrailDistance < TRAIL_WIDTH) {
            // Dirt path with some variation
            const pathMoisture = simplex.noise(x * 0.05, z * 0.05) * 0.3 + 0.5; // 0.2 to 0.8
            r = 0.55 + colorNoise * 0.3; // Brown-tan
            g = 0.35 + colorNoise * 0.2 + (0.15 * (1 - pathMoisture));
            b = 0.15 + colorNoise * 0.1 + (0.15 * (1 - pathMoisture));
        }
        // Snow caps
        else if (height > SNOW_LEVEL) {
            r = 0.95 + colorNoise;
            g = 0.95 + colorNoise;
            b = 0.99 + colorNoise * 0.01;
        }
        // Rocky areas - based on height and slope
        else if (height > ROCK_LEVEL || slope > 0.6) {
            // Gray rock color
            r = 0.5 + colorNoise * 0.4;
            g = 0.5 + colorNoise * 0.4;
            b = 0.5 + colorNoise * 0.4;
        }
        // Forest
        else if (height > FOREST_LEVEL) {
            // Dark green
            const forestDensity = simplex.noise(x * 0.03, z * 0.03) * 0.5 + 0.5; // 0 to 1
            r = 0.05 + colorNoise * 0.05;
            g = 0.35 + colorNoise * 0.1 + forestDensity * 0.05;
            b = 0.05 + colorNoise * 0.05;
        }
        // Grass
        else if (height > GRASS_LEVEL) {
            // Varied green
            const grassMoisture = simplex.noise(x * 0.04, z * 0.04) * 0.4 + 0.6; // 0.2 to 1
            r = 0.15 + colorNoise * 0.05;
            g = 0.55 + colorNoise * 0.2 * grassMoisture;
            b = 0.1 + colorNoise * 0.05 * grassMoisture;
        }
        // Sand
        else if (height > SAND_LEVEL) {
            // Tan/beige
            r = 0.85 + colorNoise * 0.15;
            g = 0.8 + colorNoise * 0.1;
            b = 0.5 + colorNoise * 0.1;
        }
        // Shallow water
        else if (height > WATER_LEVEL) {
            // Light blue/turquoise
            const waterDepth = Math.abs((height - SAND_LEVEL) / (WATER_LEVEL - SAND_LEVEL));
            r = 0.1 + colorNoise * 0.05;
            g = 0.5 + colorNoise * 0.1 - (waterDepth * 0.3);
            b = 0.8 + colorNoise * 0.2 - (waterDepth * 0.1);
        }
        // Deep water
        else {
            // Darker blue
            const waterDepth = Math.min(1.0, Math.abs(height - WATER_LEVEL) / 10);
            r = 0.0 + colorNoise * 0.05;
            g = 0.2 + colorNoise * 0.05 - (waterDepth * 0.2);
            b = 0.6 + colorNoise * 0.1 - (waterDepth * 0.2);
        }
        
        // Store color in array
        const vertexIndex = i / 3;
        colors[vertexIndex * 3] = r;
        colors[vertexIndex * 3 + 1] = g;
        colors[vertexIndex * 3 + 2] = b;
    }
    
    // Need to update the normals for proper lighting
    geometry.computeVertexNormals();
    
    // Apply the colors to the geometry
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    // Create vertex-colored material
    const terrainMaterial = new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
    });
    
    // Create merged mesh
    terrain = new THREE.Mesh(geometry, terrainMaterial);
    terrain.receiveShadow = true;
    scene.add(terrain);
    
    // Set the player at the starting point of the main trail
    const startingPoint = trailCurves[0].getPoint(0);
    bicycle.position.set(startingPoint.x, 0, startingPoint.z);
}

// Helper function to find closest point on a curve to a target point
function closestPointOnCurve(target, curve, subdivisions = 200) {
    let minDistance = Infinity;
    let closestPoint = null;
    let closestU = 0;
    
    for (let i = 0; i <= subdivisions; i++) {
        const u = i / subdivisions;
        const point = curve.getPoint(u);
        const distance = target.distanceTo(point);
        
        if (distance < minDistance) {
            minDistance = distance;
            closestPoint = point;
            closestU = u;
        }
    }
    
    // Add u parameter to the point for later use
    closestPoint.u = closestU;
    return closestPoint;
}

// Create bicycle model
function createBicycle() {
    // Create a group to hold all bicycle parts
    bicycle = new THREE.Group();

    // Create bicycle frame (simple for now)
    const frameGeometry = new THREE.BoxGeometry(0.8, 0.4, 2);
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    frame.position.y = 0.7;
    frame.castShadow = true;
    bicycle.add(frame);
    
    // Create wheels
    const wheelGeometry = new THREE.TorusGeometry(0.6, 0.1, 16, 32);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
    
    const frontWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    frontWheel.position.set(0, 0.6, -0.8);
    frontWheel.rotation.y = Math.PI / 2;
    frontWheel.castShadow = true;
    bicycle.add(frontWheel);
    
    const backWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    backWheel.position.set(0, 0.6, 0.8);
    backWheel.rotation.y = Math.PI / 2;
    backWheel.castShadow = true;
    bicycle.add(backWheel);
    
    // Create handlebar
    const handlebarGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.8);
    const handlebarMaterial = new THREE.MeshStandardMaterial({ color: 0xC0C0C0 });
    const handlebar = new THREE.Mesh(handlebarGeometry, handlebarMaterial);
    handlebar.position.set(0, 0.9, -0.8);
    handlebar.rotation.z = Math.PI / 2;
    handlebar.castShadow = true;
    bicycle.add(handlebar);
    
    // Create seat
    const seatGeometry = new THREE.BoxGeometry(0.3, 0.1, 0.5);
    const seatMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
    const seat = new THREE.Mesh(seatGeometry, seatMaterial);
    seat.position.set(0, 0.95, 0.4);
    seat.castShadow = true;
    bicycle.add(seat);
    
    // Add a rider (simple representation)
    const riderBodyGeometry = new THREE.CapsuleGeometry(0.25, 0.5, 4, 8);
    const riderMaterial = new THREE.MeshStandardMaterial({ color: 0x2196F3 });
    const riderBody = new THREE.Mesh(riderBodyGeometry, riderMaterial);
    riderBody.position.set(0, 1.5, 0.1);
    riderBody.castShadow = true;
    bicycle.add(riderBody);
    
    const headGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const head = new THREE.Mesh(headGeometry, riderMaterial);
    head.position.set(0, 2, 0);
    head.castShadow = true;
    bicycle.add(head);
    
    // Position bicycle at origin
    bicycle.position.set(0, 0, 0);
    scene.add(bicycle);
}

// Setup camera controls
function setupControls() {
    // Create orbit controls for debugging/viewing
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 5;
    controls.maxDistance = 200; // Increased to accommodate larger terrain
    controls.maxPolarAngle = Math.PI / 2 - 0.1;
    
    // Position camera behind bicycle
    updateCameraPosition();
}

// Update camera to follow bicycle
function updateCameraPosition() {
    // Position camera closer with a lower angle
    const offset = new THREE.Vector3(0, 5, 8);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), bicycle.rotation.y);
    
    // Calculate camera position
    const cameraX = bicycle.position.x + offset.x;
    const cameraZ = bicycle.position.z + offset.z;
    
    // Get terrain height at camera position
    const terrainHeightAtCamera = getTerrainHeight(cameraX, cameraZ);
    
    // Calculate the proposed camera Y position
    let cameraY = bicycle.position.y + offset.y;
    
    // Check if camera would be too close to or below terrain
    const minClearance = 2.0; // Minimum desired height above terrain
    if (cameraY < terrainHeightAtCamera + minClearance) {
        // Adjust camera height to be above terrain with clearance
        cameraY = terrainHeightAtCamera + minClearance;
    }
    
    // Disable orbit controls temporarily to reposition camera
    controls.enabled = false;
    
    // Apply the adjusted camera position
    camera.position.x = cameraX;
    camera.position.y = cameraY;
    camera.position.z = cameraZ;
    
    // Look at bicycle
    camera.lookAt(bicycle.position.x, bicycle.position.y + 1, bicycle.position.z);
    
    // Re-enable controls
    controls.target.set(bicycle.position.x, bicycle.position.y + 1, bicycle.position.z);
    controls.enabled = true;
}

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Handle key press
function handleKeyDown(event) {
    // If game hasn't started yet, check for Enter key to dismiss popup
    if (!gameStarted) {
        if (event.key === 'Enter') {
            // Remove popup and start game if Enter key is pressed
            if (introPopup && introPopup.parentNode) {
                document.body.removeChild(introPopup);
                gameStarted = true;
            }
        }
        return; // Ignore other key presses until game starts
    }
    
    switch(event.key) {
        case 'w':
        case 'W':
            keys.w = true;
            break;
        case 's':
        case 'S':
            keys.s = true;
            break;
        case 'r':
        case 'R':
            // Respawn the bicycle
            respawnBicycle();
            break;
        case 'ArrowLeft':
            keys.left = true;
            break;
        case 'ArrowRight':
            keys.right = true;
            break;
        case 'ArrowUp':
            keys.up = true;
            break;
        case 'ArrowDown':
            keys.down = true;
            isWheelieMode = true;
            break;
        case ' ':
            keys.space = true;
            if (!isJumping) {
                isJumping = true;
                jumpVelocity = JUMP_FORCE;
            }
            break;
        case 'e':
        case 'E':
            keys.e = true;
            break;
    }
}

// Handle key release
function handleKeyUp(event) {
    switch(event.key) {
        case 'w':
        case 'W':
            keys.w = false;
            break;
        case 's':
        case 'S':
            keys.s = false;
            break;
        case 'ArrowLeft':
            keys.left = false;
            break;
        case 'ArrowRight':
            keys.right = false;
            break;
        case 'ArrowUp':
            keys.up = false;
            break;
        case 'ArrowDown':
            keys.down = false;
            isWheelieMode = false;
            break;
        case ' ':
            keys.space = false;
            break;
        case 'e':
        case 'E':
            keys.e = false;
            break;
    }
}

// Update bicycle position and rotation
function updateBicycle(deltaTime) {
    // Don't update physics during a wipeout animation
    if (isWipingOut) {
        updateWipeOutAnimation(deltaTime);
        return;
    }
    
    // If game hasn't started yet, don't update bicycle physics
    if (!gameStarted) {
        return;
    }
    
    // Check for collisions first
    checkCollisions();
    
    // Calculate forward direction vector
    const moveDirection = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), bicycle.rotation.y);
    
    // Calculate slope factor by checking terrain height ahead vs current position
    const currentHeight = getTerrainHeight(bicycle.position.x, bicycle.position.z);
    const aheadPosition = new THREE.Vector3()
        .copy(bicycle.position)
        .add(moveDirection.clone().multiplyScalar(1.5)); // Check further ahead (1.5 units)
    
    const aheadHeight = getTerrainHeight(aheadPosition.x, aheadPosition.z);
    const heightDifference = aheadHeight - currentHeight;
    
    // Also check even further ahead to detect transitions
    const farAheadPosition = new THREE.Vector3()
        .copy(bicycle.position)
        .add(moveDirection.clone().multiplyScalar(3.0)); // Check twice as far
    
    const farAheadHeight = getTerrainHeight(farAheadPosition.x, farAheadPosition.z);
    const farHeightDifference = farAheadHeight - aheadHeight;
    
    // Calculate slope factor - can be positive (uphill) or negative (downhill)
    let slopeFactor = 0;
    let isUphillSlope = false;
    let isDownhillSlope = false;
    
    if (heightDifference > 0) { // Uphill
        isUphillSlope = true;
        // Calculate steepness (range limit to avoid extreme values, but lower threshold for more sensitivity)
        const steepness = Math.min(heightDifference, 3) / 3; // More sensitive to smaller height changes
        // Stronger exponential factor to make steep slopes have an even stronger effect
        slopeFactor = steepness * steepness * steepness; // Cube instead of square
    } else if (heightDifference < 0) { // Downhill
        isDownhillSlope = true;
        // For downhill, use absolute value but cap at smaller value for safety
        const steepness = Math.min(Math.abs(heightDifference), 4) / 4;
        slopeFactor = steepness;
    }
    
    // Detect transition from uphill to downhill (crest of a hill)
    const isHillCrest = heightDifference > 0 && farHeightDifference < -0.5;
    
    // Apply slope resistance for uphill (up to 95% speed reduction on steepest slopes)
    // or speed boost for downhill (up to 40% speed increase on steepest slopes)
    let slopeEffect = 1.0;
    if (isUphillSlope) {
        slopeEffect = 1 - (slopeFactor * 0.95); // Increased from 0.8 to 0.95
    } else if (isDownhillSlope) {
        slopeEffect = 1 + (slopeFactor * 0.4); // Up to 40% speed boost going downhill
    }
    
    // Visual feedback for debugging - can be removed later
    if (isUphillSlope && slopeFactor > 0.3) {
        console.log(`Steep uphill! Speed reduced to ${Math.round(slopeEffect * 100)}%`);
    } else if (isDownhillSlope && slopeFactor > 0.3) {
        console.log(`Steep downhill! Speed boosted to ${Math.round(slopeEffect * 100)}%`);
    }
    
    // Update speed with slope factor
    if (keys.w) {
        // Apply speed cap and slope effect
        const targetSpeed = SPEED_CAP * slopeEffect;
        
        // Increased acceleration
        const baseAcceleration = 0.08; // Faster acceleration (increased from 0.06)
        const accelerationFactor = isUphillSlope ? baseAcceleration * slopeEffect : baseAcceleration * slopeEffect;
        gameSpeed = Math.min(gameSpeed + deltaTime * accelerationFactor, targetSpeed);
    } else if (keys.s) {
        // Apply braking force (harder to brake on steep downhills)
        const brakingForce = isDownhillSlope ? BRAKE_FORCE * (1 - slopeFactor * 0.5) : BRAKE_FORCE;
        gameSpeed = Math.max(gameSpeed - deltaTime * brakingForce, 0);
    } else {
        // Apply friction (less friction on downhills for coasting)
        const frictionFactor = isDownhillSlope ? 0.05 : 0.1;
        gameSpeed = Math.max(gameSpeed - deltaTime * frictionFactor, 0);
    }
    
    // Update steering
    const MAX_STEER = 0.12; // Increased from 0.05 to 0.12 (more than doubled)
    if (keys.left) {
        steerAngle = Math.min(steerAngle + deltaTime * 0.3, MAX_STEER); // Increased from 0.1 to 0.3 (3x faster)
    } else if (keys.right) {
        steerAngle = Math.max(steerAngle - deltaTime * 0.3, -MAX_STEER); // Increased from 0.1 to 0.3 (3x faster)
    } else {
        // Return to center
        steerAngle *= 0.85; // Slower return to center (changed from 0.9 to 0.85)
    }
    
    // Update lean (tilt forward/back for normal riding)
    const MAX_LEAN = 0.3;
    if (keys.up) {
        leanAngle = Math.min(leanAngle + deltaTime * 0.2, MAX_LEAN);
    } else if (keys.down && !isWheelieMode) {
        leanAngle = Math.max(leanAngle - deltaTime * 0.2, -MAX_LEAN);
    } else {
        // Return to upright if not doing a wheelie
        if (!isWheelieMode) {
            leanAngle *= 0.9;
        }
    }
    
    // Update wheelie with balancing mechanics
    if (isWheelieMode) {
        // Calculate balance difficulty based on speed and slope
        const speedFactor = Math.min(gameSpeed / MAX_SPEED, 1) * WHEELIE_DIFFICULTY;
        const slopeFactor = isUphillSlope ? 0.5 : (isDownhillSlope ? 1.5 : 1.0);
        const balanceDifficulty = speedFactor * slopeFactor;
        
        // Random balance factor to make it challenging
        const randomBalance = (Math.random() - 0.5) * 0.02 * balanceDifficulty;
        
        // Increase wheelie angle when down arrow is pressed - no max limit anymore
        wheelieAngle += (deltaTime * 0.8) + randomBalance;
        
        // Check if we've gone past the point of no return
        if (wheelieAngle > CRITICAL_WHEELIE_ANGLE) {
            // We've fallen over backward!
            startWipeOut("wheelie");
            return;
        }
    } else {
        // Gradually return to normal position, but harder to recover from extreme wheelie
        const recoveryRate = wheelieAngle > MAX_SAFE_WHEELIE_ANGLE ? 0.6 : 1.2;
        wheelieAngle = Math.max(wheelieAngle - deltaTime * recoveryRate, 0);
    }
    
    // Handle jumping (manual jumps or from terrain transitions)
    if (isJumping) {
        // Apply gravity to jump velocity
        jumpVelocity -= GRAVITY;
        
        // Update position based on jump velocity
        bicycle.position.y += jumpVelocity;
        
        // Apply twist if E key is pressed and we're in the air
        if (keys.e) {
            // When E is first pressed in a jump, store the original direction
            if (twistAngle === 0) {
                // Store the current forward direction vector and Y rotation
                originalDirection = moveDirection.clone();
            }
            
            // Increment twist angle (barrel roll around forward axis)
            twistAngle += TWIST_SPEED;
            
            // Save original Y rotation
            const originalYRotation = bicycle.rotation.y;
            
            // Reset rotation before applying quaternion to avoid compounding rotations
            bicycle.rotation.set(0, originalYRotation, 0);
            
            // Create quaternion for barrel roll (rotate around local Z axis - the bike's forward direction)
            const rollAxis = new THREE.Vector3(0, 0, 1);
            const rollQuat = new THREE.Quaternion().setFromAxisAngle(rollAxis, twistAngle);
            
            // Apply quaternion to bike
            bicycle.quaternion.multiply(rollQuat);
            
            // Move in the original direction
            bicycle.position.add(originalDirection.clone().multiplyScalar(gameSpeed * deltaTime * 60));
        } else {
            // Normal movement when not twisting
            bicycle.position.add(moveDirection.clone().multiplyScalar(gameSpeed * deltaTime * 60));
        }
        
        // Check if landed
        const terrainHeight = getTerrainHeight(bicycle.position.x, bicycle.position.z);
        if (bicycle.position.y <= terrainHeight + 0.6 && jumpVelocity < 0) {
            isJumping = false;
            bicycle.position.y = terrainHeight + 0.6;
            
            // Reset twist angle when landing
            twistAngle = 0;
            
            // Reset to original direction when landing
            if (originalDirection.length() > 0) {
                // Calculate rotation from original direction vector
                const targetYRotation = Math.atan2(-originalDirection.x, -originalDirection.z);
                bicycle.quaternion.identity(); // Clear all rotation
                bicycle.rotation.y = targetYRotation; // Apply only Y rotation
                bicycle.rotation.z = leanAngle; // Restore lean angle
                
                // Clear original direction
                originalDirection.set(0, 0, 0);
            }
        }
    } else {
        // Check for hill crest transitions to automatically catch air
        if (isHillCrest && gameSpeed > 0.3) {
            // Scale jump force based on speed and hill steepness
            const hillJumpForce = JUMP_FORCE * 
                (gameSpeed / MAX_SPEED) * // Faster speed = higher jump
                Math.max(0.5, Math.min(2.0, Math.abs(farHeightDifference) * 2)); // Steeper transition = higher jump
                
            // Start a jump from the hill crest
            isJumping = true;
            jumpVelocity = hillJumpForce;
            
            console.log(`Catching air from hill crest! Jump force: ${hillJumpForce.toFixed(2)}`);
        } else {
            // Apply rotation based on steering when not jumping
            bicycle.rotation.y += steerAngle * gameSpeed;
            
            // Apply tilt (rotation along z-axis)
            bicycle.rotation.z = leanAngle;
            
            // Apply wheelie (rotation along x-axis)
            bicycle.rotation.x = wheelieAngle;
            
            // Normal terrain following when not jumping
            const terrainHeight = getTerrainHeight(bicycle.position.x, bicycle.position.z);
            bicycle.position.y = terrainHeight + 0.6; // 0.6 is wheel radius
            
            // Move bike forward
            const currentMoveDirection = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), bicycle.rotation.y);
            bicycle.position.add(currentMoveDirection.multiplyScalar(gameSpeed * deltaTime * 60));
        }
    }
    
    // Update camera to follow bicycle
    updateCameraPosition();
}

// Handle wipeout animation and respawn
function updateWipeOutAnimation(deltaTime) {
    wipeOutTime += deltaTime;
    
    // Falling backward animation (first 1 second)
    if (wipeOutTime < 1.0) {
        // Rotate bicycle backward
        wheelieAngle = Math.min(wheelieAngle + deltaTime * 3, Math.PI * 0.9); // Almost fully tipped over
        bicycle.rotation.x = wheelieAngle;
        
        // Slow down
        gameSpeed = Math.max(gameSpeed - deltaTime * 2, 0);
        
        // Move slightly in the direction of travel
        const moveDirection = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), bicycle.rotation.y);
        bicycle.position.add(moveDirection.multiplyScalar(gameSpeed * deltaTime * 30)); // Reduced movement
    } 
    // Start tumble animation (next 1 second)
    else if (wipeOutTime < 2.0) {
        // Add some random rotation for tumbling effect
        bicycle.rotation.x += deltaTime * 5;
        bicycle.rotation.z += deltaTime * (Math.random() - 0.5) * 2;
        
        // Hop up slightly then fall
        if (wipeOutTime < 1.3) {
            bicycle.position.y += deltaTime * 5;
        } else {
            bicycle.position.y -= deltaTime * 10;
        }
    } 
    // Respawn after 2 seconds
    else {
        console.log("Crashed! Respawning...");
        isWipingOut = false;
        wipeOutTime = 0;
        respawnBicycle();
    }
    
    // Update camera to follow the crash
    updateCameraPosition();
}

// Start a wipeout sequence
function startWipeOut(reason) {
    isWipingOut = true;
    wipeOutTime = 0;
    console.log(`Wiping out! Reason: ${reason}`);
}

// Get terrain height at specific x,z position
function getTerrainHeight(x, z) {
    // Convert world coordinates to terrain coordinates
    const terrainSize = 1000;
    const gridSize = 200;
    
    // Check if position is outside terrain bounds
    if (x < -terrainSize/2 || x > terrainSize/2 || 
        z < -terrainSize/2 || z > terrainSize/2) {
        return 0;
    }
    
    // Map to 0-1 range
    const tx = (x + terrainSize/2) / terrainSize;
    const tz = (z + terrainSize/2) / terrainSize;
    
    // Map to grid indices
    const ix = Math.floor(tx * gridSize);
    const iz = Math.floor(tz * gridSize);
    
    // Get vertices for this grid cell
    const position = terrain.geometry.attributes.position;
    const index = terrain.geometry.index;
    
    // Find the right triangle in the grid cell
    const cellWidth = terrainSize / gridSize;
    const cellX = (tx * gridSize - ix) * cellWidth;
    const cellZ = (tz * gridSize - iz) * cellWidth;
    
    // Determine if we're in the upper or lower triangle of the grid cell
    // Simple approximation
    let height = 0;
    
    // Bilinear interpolation (simplified)
    const vertexPerRow = gridSize + 1;
    const v1 = iz * vertexPerRow + ix;
    const v2 = iz * vertexPerRow + (ix + 1);
    const v3 = (iz + 1) * vertexPerRow + ix;
    const v4 = (iz + 1) * vertexPerRow + (ix + 1);
    
    // Get heights at each corner
    const h1 = position.array[v1 * 3 + 1];
    const h2 = position.array[v2 * 3 + 1];
    const h3 = position.array[v3 * 3 + 1];
    const h4 = position.array[v4 * 3 + 1];
    
    // Interpolate
    const fx = (x - (-terrainSize/2 + ix * cellWidth)) / cellWidth;
    const fz = (z - (-terrainSize/2 + iz * cellWidth)) / cellWidth;
    
    const h12 = h1 * (1 - fx) + h2 * fx;
    const h34 = h3 * (1 - fx) + h4 * fx;
    
    height = h12 * (1 - fz) + h34 * fz;
    
    return height;
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    const deltaTime = clock.getDelta();
    
    // Update bicycle
    updateBicycle(deltaTime);
    
    // Check for objective collection
    checkObjectiveCollision();
    
    // Animate objective beam
    animateObjectiveBeam(deltaTime);
    
    // Update controls
    controls.update();
    
    // Render scene
    renderer.render(scene, camera);
}

// Create obstacles around the terrain
function createObstacles() {
    const simplex = new SimplexNoise();
    
    // Create tree model function
    function createTree(size) {
        const tree = new THREE.Group();
        
        // Tree trunk
        const trunkGeometry = new THREE.CylinderGeometry(size * 0.1, size * 0.15, size * 1.2, 8);
        const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.castShadow = true;
        trunk.position.y = size * 0.6;
        tree.add(trunk);
        
        // Tree foliage
        const foliageGeometry = new THREE.ConeGeometry(size * 0.6, size * 1.8, 8);
        const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x2E8B57 });
        const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
        foliage.castShadow = true;
        foliage.position.y = size * 1.8;
        tree.add(foliage);
        
        return tree;
    }
    
    // Create rock model function
    function createRock(size) {
        const rock = new THREE.Group();
        
        // Create irregular rock shape
        const rockGeometry = new THREE.DodecahedronGeometry(size, 1);
        
        // Randomly distort vertices for more natural look
        const vertices = rockGeometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            vertices[i] += (Math.random() - 0.5) * size * 0.3;
            vertices[i + 1] += (Math.random() - 0.5) * size * 0.3;
            vertices[i + 2] += (Math.random() - 0.5) * size * 0.3;
        }
        
        rockGeometry.computeVertexNormals();
        
        // Create material with slight variation in color
        const grayValue = 0.4 + Math.random() * 0.3;
        const rockMaterial = new THREE.MeshStandardMaterial({ 
            color: new THREE.Color(grayValue, grayValue, grayValue),
            flatShading: true
        });
        
        const rockMesh = new THREE.Mesh(rockGeometry, rockMaterial);
        rockMesh.castShadow = true;
        rock.add(rockMesh);
        
        return rock;
    }
    
    // Create ramp model function
    function createRamp(width, height, depth) {
        const ramp = new THREE.Group();
        
        // Create ramp geometry (custom shape)
        const rampShape = new THREE.Shape();
        rampShape.moveTo(0, 0);
        rampShape.lineTo(depth, height);
        rampShape.lineTo(depth, 0);
        rampShape.lineTo(0, 0);
        
        const extrudeSettings = {
            steps: 1,
            depth: width,
            bevelEnabled: false
        };
        
        const rampGeometry = new THREE.ExtrudeGeometry(rampShape, extrudeSettings);
        rampGeometry.rotateX(Math.PI / 2);
        rampGeometry.rotateY(Math.PI);
        
        const rampMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const rampMesh = new THREE.Mesh(rampGeometry, rampMaterial);
        rampMesh.castShadow = true;
        rampMesh.receiveShadow = true;
        
        ramp.add(rampMesh);
        
        return ramp;
    }
    
    // Create log model function
    function createLog(length, radius) {
        const log = new THREE.Group();
        
        // Create log geometry
        const logGeometry = new THREE.CylinderGeometry(radius, radius, length, 8);
        logGeometry.rotateZ(Math.PI / 2);
        
        const logMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x8B4513,
            flatShading: true
        });
        
        const logMesh = new THREE.Mesh(logGeometry, logMaterial);
        logMesh.castShadow = true;
        log.add(logMesh);
        
        return log;
    }
    
    // Define terrain boundaries
    const terrainSize = 1000;
    const boundary = terrainSize / 2;
    
    // Place trees in forest areas (increased from 2500 to 25000)
    for (let i = 0; i < 25000; i++) {
        // Random position within terrain bounds
        const x = (Math.random() * terrainSize) - boundary;
        const z = (Math.random() * terrainSize) - boundary;
        
        // Get terrain height at this position
        const height = getTerrainHeight(x, z);
        
        // Only place trees in forest areas (between 15 and 25 units elevation)
        if (height > 15 && height < 25) {
            // Use simplex noise to cluster trees naturally
            const noiseValue = simplex.noise(x * 0.01, z * 0.01);
            
            // Only place trees where noise value is positive (creates natural clearings)
            if (noiseValue > 0) {
                const size = 1.5 + Math.random() * 2; // Random tree size
                const tree = createTree(size);
                
                // Position tree on terrain
                tree.position.set(x, height, z);
                
                // Random rotation
                tree.rotation.y = Math.random() * Math.PI * 2;
                
                // Add collision data
                tree.userData.type = 'tree';
                tree.userData.collisionRadius = size * 0.5;
                
                // Add to scene and obstacles array
                scene.add(tree);
                obstacles.push(tree);
            }
        }
    }
    
    // Place rocks in rocky areas (increased from 1500 to 15000)
    for (let i = 0; i < 15000; i++) {
        // Random position within terrain bounds
        const x = (Math.random() * terrainSize) - boundary;
        const z = (Math.random() * terrainSize) - boundary;
        
        // Get terrain height and slope at this position
        const height = getTerrainHeight(x, z);
        
        // Calculate approximate slope by sampling nearby points
        const sampleDistance = 3;
        const heightNearby = getTerrainHeight(x + sampleDistance, z);
        const slope = Math.abs(height - heightNearby) / sampleDistance;
        
        // Place rocks on high elevations or steep slopes
        if (height > 25 || slope > 0.6) {
            const size = 0.8 + Math.random() * 1.5; // Random rock size
            const rock = createRock(size);
            
            // Position rock on terrain
            rock.position.set(x, height, z);
            
            // Random rotation
            rock.rotation.y = Math.random() * Math.PI * 2;
            
            // Add collision data
            rock.userData.type = 'rock';
            rock.userData.collisionRadius = size * 0.8;
            
            // Add to scene and obstacles array
            scene.add(rock);
            obstacles.push(rock);
        }
    }
    
    // Place ramps along trails - procedurally generate 400 ramps (increased from 40)
    // Keep original ramps
    const rampLocations = [
        { x: -150, z: 120, rotation: Math.PI / 4 },
        { x: 200, z: -50, rotation: Math.PI / -2 },
        { x: -50, z: -200, rotation: Math.PI * 1.25 },
        { x: 150, z: 150, rotation: Math.PI / 2 },
    ];
    
    // Generate additional ramps along terrain using noise-based placement
    for (let i = 0; i < 396; i++) { // 396 more ramps for a total of 400
        // Place ramps along area where trails are likely to be (mid elevations)
        // Try to find suitable locations by testing random spots
        let attempts = 0;
        let placed = false;
        
        while (!placed && attempts < 20) {
            attempts++;
            
            // Generate random position
            const x = (Math.random() * terrainSize) - boundary;
            const z = (Math.random() * terrainSize) - boundary;
            
            // Get height at this position
            const height = getTerrainHeight(x, z);
            
            // Check if this is a good position for a ramp (mid elevations where trails might be)
            if (height > 5 && height < 30) {
                // Use simplex noise to create some clustering
                const noiseValue = simplex.noise(x * 0.02, z * 0.02);
                
                if (noiseValue > 0.2) {
                    rampLocations.push({
                        x: x,
                        z: z,
                        rotation: Math.random() * Math.PI * 2, // Random rotation
                    });
                    placed = true;
                }
            }
        }
    }
    
    // Create all ramps
    rampLocations.forEach(location => {
        const height = getTerrainHeight(location.x, location.z);
        // Vary ramp sizes
        const width = 2 + Math.random() * 2;
        const rampHeight = 1 + Math.random();
        const depth = 4 + Math.random() * 3;
        
        const ramp = createRamp(width, rampHeight, depth);
        
        // Position ramp on terrain
        ramp.position.set(location.x, height, location.z);
        ramp.rotation.y = location.rotation;
        
        // Add collision data (for ramps, we'll do special handling during jumps)
        ramp.userData.type = 'ramp';
        ramp.userData.collisionRadius = width * 0.7;
        ramp.userData.rampParams = { width, height: rampHeight, depth };
        
        // Add to scene and obstacles array
        scene.add(ramp);
        obstacles.push(ramp);
    });
    
    // Place fallen logs as obstacles - Original 3 plus 297 more for a total of 300
    const logLocations = [
        { x: -220, z: 80, rotation: Math.PI / 6, length: 8 },
        { x: 120, z: -180, rotation: Math.PI / -3, length: 6 },
        { x: 30, z: 240, rotation: Math.PI / 2, length: 7 },
    ];
    
    // Generate additional logs distributed across the terrain
    for (let i = 0; i < 297; i++) { // 297 more logs for a total of 300
        // Place logs in various locations for challenging obstacles
        const x = (Math.random() * terrainSize) - boundary;
        const z = (Math.random() * terrainSize) - boundary;
        const height = getTerrainHeight(x, z);
        
        // Logs look good on trails and moderate terrain
        if (height > -5 && height < 30) {
            logLocations.push({
                x: x,
                z: z,
                rotation: Math.random() * Math.PI, // Random rotation
                length: 4 + Math.random() * 6 // Various lengths 4-10
            });
        }
    }
    
    // Create all logs
    logLocations.forEach(location => {
        const height = getTerrainHeight(location.x, location.z);
        const radius = 0.3 + Math.random() * 0.4; // Various thicknesses
        const log = createLog(location.length, radius);
        
        // Position log on terrain
        log.position.set(location.x, height + radius, location.z);
        log.rotation.y = location.rotation;
        
        // Add collision data
        log.userData.type = 'log';
        log.userData.collisionRadius = radius * 1.5;
        log.userData.length = location.length;
        log.userData.direction = new THREE.Vector2(
            Math.cos(location.rotation),
            Math.sin(location.rotation)
        );
        
        // Add to scene and obstacles array
        scene.add(log);
        obstacles.push(log);
    });
}

// Create a spawn point with a beam of light
function createSpawnPoint() {
    // Get the starting point of the main trail
    const spawnCurve = trailCurves[0];
    const spawnPoint = spawnCurve.getPoint(0);
    const spawnHeight = getTerrainHeight(spawnPoint.x, spawnPoint.z);
    
    // Create a platform at the spawn point
    const platformGeometry = new THREE.CylinderGeometry(5, 6, 0.5, 16);
    const platformMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xFFD700, // Gold color
        metalness: 0.7,
        roughness: 0.3,
        emissive: 0x996515,
        emissiveIntensity: 0.3
    });
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.position.set(spawnPoint.x, spawnHeight + 0.25, spawnPoint.z);
    platform.receiveShadow = true;
    scene.add(platform);
    
    // Create outer ring
    const ringGeometry = new THREE.TorusGeometry(5.5, 0.3, 16, 32);
    const ringMaterial = new THREE.MeshStandardMaterial({
        color: 0x00FFFF, // Cyan
        emissive: 0x00FFFF,
        emissiveIntensity: 0.7,
        transparent: true,
        opacity: 0.8
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.set(spawnPoint.x, spawnHeight + 0.7, spawnPoint.z);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    
    // Create beam of light (using cylinder with transparent material)
    const beamGeometry = new THREE.CylinderGeometry(1, 3, 100, 16, 10, true);
    const beamMaterial = new THREE.MeshBasicMaterial({
        color: 0xFFFFFF,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide
    });
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.position.set(spawnPoint.x, spawnHeight + 50, spawnPoint.z);
    scene.add(beam);
    
    // Add particles inside the beam for more effect
    const particleGeometry = new THREE.BufferGeometry();
    const particleCount = 500;
    const particlePositions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 2;
        const height = Math.random() * 100;
        
        particlePositions[i3] = Math.cos(angle) * radius + spawnPoint.x;
        particlePositions[i3 + 1] = height + spawnHeight;
        particlePositions[i3 + 2] = Math.sin(angle) * radius + spawnPoint.z;
    }
    
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    
    const particleMaterial = new THREE.PointsMaterial({
        color: 0xFFFFFF,
        size: 0.3,
        transparent: true,
        opacity: 0.8
    });
    
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);
    
    // Add point light in the center of the beam
    const pointLight = new THREE.PointLight(0xFFFFFF, 1, 50);
    pointLight.position.set(spawnPoint.x, spawnHeight + 3, spawnPoint.z);
    scene.add(pointLight);
    
    // Add animation for the beam and ring
    function animateSpawnPoint() {
        // Make the ring rotate
        ring.rotation.z += 0.01;
        
        // Animate particles
        const positions = particles.geometry.attributes.position.array;
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            positions[i3 + 1] += 0.1; // Move particles upward
            
            // Reset particles that go too high
            if (positions[i3 + 1] > spawnHeight + 100) {
                positions[i3 + 1] = spawnHeight;
            }
        }
        particles.geometry.attributes.position.needsUpdate = true;
        
        // Pulse the light intensity
        const time = Date.now() * 0.001;
        pointLight.intensity = 1 + Math.sin(time * 2) * 0.5;
        
        requestAnimationFrame(animateSpawnPoint);
    }
    
    // Start the animation
    animateSpawnPoint();
    
    // Store spawn point information globally for respawn functionality
    window.spawnPosition = {
        x: spawnPoint.x,
        y: spawnHeight + 0.6, // Adjust for bicycle wheel height
        z: spawnPoint.z
    };
}

// Add respawn function to reset bicycle to spawn point
function respawnBicycle() {
    if (window.spawnPosition) {
        // Reset bicycle position to spawn point
        bicycle.position.set(
            window.spawnPosition.x,
            window.spawnPosition.y,
            window.spawnPosition.z
        );
        
        // Reset bicycle rotation and physics
        bicycle.rotation.set(0, 0, 0);
        gameSpeed = 0;
        isJumping = false;
        jumpVelocity = 0;
        isWheelieMode = false;
        wheelieAngle = 0;
        steerAngle = 0;
        leanAngle = 0;
        
        // Reset player score to 0
        playerScore = 0;
        updateScoreDisplay();
        
        // Update camera
        updateCameraPosition();
        
        console.log("Player respawned at start. Score reset to 0.");
    }
}

// Check for collisions between bicycle and obstacles
function checkCollisions() {
    if (collisionCooldown > 0) {
        collisionCooldown -= clock.getDelta();
        return false;
    }
    
    // Get bicycle position and create bounding circle
    const bicyclePosition = new THREE.Vector2(bicycle.position.x, bicycle.position.z);
    const bicycleRadius = 1.0; // Approximate radius of the bicycle
    
    // Check against all obstacles
    for (const obstacle of obstacles) {
        // Only check obstacles within a reasonable distance
        const obstaclePosition = new THREE.Vector2(obstacle.position.x, obstacle.position.z);
        const distance = bicyclePosition.distanceTo(obstaclePosition);
        
        // Quick distance check before detailed collision
        if (distance > 20) continue;
        
        // Get collision data from obstacle
        const collisionRadius = obstacle.userData.collisionRadius || 1.0;
        
        // Special handling for different obstacle types
        switch (obstacle.userData.type) {
            case 'tree':
            case 'rock':
                // Simple circle-circle collision
                if (distance < bicycleRadius + collisionRadius) {
                    // Create collision response
                    handleCollision(obstacle);
                    return true;
                }
                break;
                
            case 'log':
                // For logs, check distance to the line segment
                // Get log direction and length
                const logDirection = obstacle.userData.direction;
                const logLength = obstacle.userData.length;
                
                // Log endpoints
                const logStart = new THREE.Vector2(
                    obstacle.position.x - logDirection.x * logLength/2,
                    obstacle.position.z - logDirection.y * logLength/2
                );
                const logEnd = new THREE.Vector2(
                    obstacle.position.x + logDirection.x * logLength/2,
                    obstacle.position.z + logDirection.y * logLength/2
                );
                
                // Calculate distance from bicycle to log line segment
                const distToLog = distanceToLineSegment(
                    bicyclePosition, 
                    logStart, 
                    logEnd
                );
                
                if (distToLog < bicycleRadius + collisionRadius) {
                    handleCollision(obstacle);
                    return true;
                }
                break;
                
            case 'ramp':
                // Ramps can be jumped over if the bicycle is in the air
                if (isJumping) {
                    // No collision when jumping
                    break;
                }
                
                // Check circle collision when not jumping
                if (distance < bicycleRadius + collisionRadius) {
                    // For ramps, we'll apply a different effect - slow down but allow passage
                    gameSpeed *= 0.5;
                    return false;
                }
                break;
        }
    }
    
    return false;
}

// Helper function to calculate distance from point to line segment
function distanceToLineSegment(point, lineStart, lineEnd) {
    const line = new THREE.Vector2().subVectors(lineEnd, lineStart);
    const pointToLineStart = new THREE.Vector2().subVectors(point, lineStart);
    
    // Calculate projection
    const lineLength = line.length();
    const lineDirection = line.clone().normalize();
    const projection = pointToLineStart.dot(lineDirection);
    
    // Check if projection is outside line segment
    if (projection <= 0) {
        return pointToLineStart.length();
    } else if (projection >= lineLength) {
        return new THREE.Vector2().subVectors(point, lineEnd).length();
    }
    
    // Calculate perpendicular distance
    const projectionPoint = lineStart.clone().add(
        lineDirection.clone().multiplyScalar(projection)
    );
    return new THREE.Vector2().subVectors(point, projectionPoint).length();
}

// Handle collision response
function handleCollision(obstacle) {
    if (collisionOccurred) return;
    
    collisionOccurred = true;
    collisionCooldown = 1.5; // Increased from 1.0 to 1.5 seconds
    
    // Calculate collision response
    const pushDirection = new THREE.Vector2(
        bicycle.position.x - obstacle.position.x,
        bicycle.position.z - obstacle.position.z
    ).normalize();
    
    // Calculate impact velocity based on current speed
    const impactForce = gameSpeed * 5; // Scale based on current speed
    
    // Apply effects based on collision type
    switch (obstacle.userData.type) {
        case 'tree':
            // Hard stop when hitting a tree
            gameSpeed = 0;
            
            // Strong pushback based on current speed
            bicycle.position.x += pushDirection.x * 3.0; // Increased from 1.5 to 3.0
            bicycle.position.z += pushDirection.y * 3.0; // Increased from 1.5 to 3.0
            
            // Add rotational impact - random tilt based on impact
            bicycle.rotation.z += (Math.random() - 0.5) * 0.5;
            
            // Add a strong bounce
            if (!isJumping) {
                isJumping = true;
                jumpVelocity = JUMP_FORCE * 0.8;
            }
            break;
            
        case 'rock':
            // Much stronger speed reduction
            gameSpeed *= 0.1; // Reduced from 0.2 to 0.1 (90% reduction)
            
            // Stronger pushback
            bicycle.position.x += pushDirection.x * 2.5; // Increased from 1.0 to 2.5
            bicycle.position.z += pushDirection.y * 2.5; // Increased from 1.0 to 2.5
            
            // Add rotational impact - smaller tilt
            bicycle.rotation.z += (Math.random() - 0.5) * 0.3;
            
            // Medium bounce
            if (!isJumping) {
                isJumping = true;
                jumpVelocity = JUMP_FORCE * 0.6;
            }
            break;
            
        case 'log':
            // Stronger speed reduction
            gameSpeed *= 0.2; // Reduced from 0.4 to 0.2 (80% reduction)
            
            // Add pushback (was missing before)
            bicycle.position.x += pushDirection.x * 1.5;
            bicycle.position.z += pushDirection.y * 1.5;
            
            // Add rotational impact - wheelie effect
            bicycle.rotation.x += 0.2; // Forward tilt
            
            // Stronger bounce
            if (!isJumping) {
                isJumping = true;
                jumpVelocity = JUMP_FORCE * 0.7; // Increased from 0.5 to 0.7
            }
            break;
    }
    
    // Play collision sound or effect (could be added later)
    console.log(`Strong collision with ${obstacle.userData.type}! Impact force: ${impactForce.toFixed(2)}`);
    
    // Reset collision flag after cooldown
    setTimeout(() => {
        collisionOccurred = false;
    }, 500);
}

// Create score display
function createScoreDisplay() {
    // Create a container div for the score
    const scoreContainer = document.createElement('div');
    scoreContainer.style.position = 'absolute';
    scoreContainer.style.top = '20px';
    scoreContainer.style.left = '20px';
    scoreContainer.style.padding = '10px 20px';
    scoreContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    scoreContainer.style.color = 'white';
    scoreContainer.style.borderRadius = '10px';
    scoreContainer.style.fontFamily = 'Arial, sans-serif';
    scoreContainer.style.fontSize = '24px';
    scoreContainer.style.fontWeight = 'bold';
    scoreContainer.style.userSelect = 'none';
    scoreContainer.style.zIndex = '1000';
    
    // Set initial score text
    scoreContainer.textContent = 'Score: 0';
    
    // Add to document
    document.body.appendChild(scoreContainer);
    
    // Store reference
    scoreDisplay = scoreContainer;
}

// Create objective beam at random location
function createObjectiveBeam() {
    // Remove existing beam if it exists
    if (objectiveBeam) {
        scene.remove(objectiveBeam);
    }
    
    // Create a group for the beam
    objectiveBeam = new THREE.Group();
    
    // Generate random position within the terrain bounds
    const terrainSize = 1000;
    const boundary = terrainSize / 2 - 50; // Keep away from edges
    
    let x, z, height;
    let validPosition = false;
    let attempts = 0;
    const maxAttempts = 100; // Prevent infinite loops
    
    // Decide if we want a mountain peak (50% chance)
    const wantMountainPeak = Math.random() < 0.5;
    
    // Keep trying until we find a valid position
    while (!validPosition && attempts < maxAttempts) {
        attempts++;
        
        // Generate random position
        x = (Math.random() * (boundary * 2)) - boundary;
        z = (Math.random() * (boundary * 2)) - boundary;
        
        // Get terrain height at this position
        height = getTerrainHeight(x, z);
        
        // Check if this is a valid position (not in water)
        if (height > -10) {
            // For mountain peaks, check if this is a suitable location
            if (wantMountainPeak) {
                // Sample nearby heights to check if this is a peak
                const sampleDistance = 5;
                const nearbyHeights = [
                    getTerrainHeight(x + sampleDistance, z),
                    getTerrainHeight(x - sampleDistance, z),
                    getTerrainHeight(x, z + sampleDistance),
                    getTerrainHeight(x, z - sampleDistance)
                ];
                
                // Calculate if this is a peak (higher than surrounding terrain)
                const isPeak = nearbyHeights.every(nearbyHeight => height > nearbyHeight);
                
                // Only accept if it's a peak and high enough
                if (isPeak && height > 20) {
                    validPosition = true;
                }
            } else {
                // For non-peak locations, check for obstacles
                let tooCloseToObstacle = false;
                
                for (const obstacle of obstacles) {
                    const distance = Math.sqrt(
                        Math.pow(x - obstacle.position.x, 2) + 
                        Math.pow(z - obstacle.position.z, 2)
                    );
                    
                    // If too close to obstacle, try again
                    if (distance < 10) {
                        tooCloseToObstacle = true;
                        break;
                    }
                }
                
                if (!tooCloseToObstacle) {
                    validPosition = true;
                }
            }
        }
    }
    
    // If we couldn't find a valid position after max attempts, try one last time with relaxed criteria
    if (!validPosition) {
        console.log("Could not find ideal position, using fallback position");
        x = (Math.random() * (boundary * 2)) - boundary;
        z = (Math.random() * (boundary * 2)) - boundary;
        height = getTerrainHeight(x, z);
    }
    
    // Create beam base (disc)
    const baseGeometry = new THREE.CylinderGeometry(4, 4, 0.3, 32);
    const baseMaterial = new THREE.MeshStandardMaterial({
        color: 0x00FF00, // Green
        emissive: 0x00FF00,
        emissiveIntensity: 0.7,
        transparent: true,
        opacity: 0.8
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = height + 0.15;
    objectiveBeam.add(base);
    
    // Create outer ring
    const ringGeometry = new THREE.TorusGeometry(4.5, 0.3, 16, 32);
    const ringMaterial = new THREE.MeshStandardMaterial({
        color: 0x00FF00, // Green
        emissive: 0x00FF00,
        emissiveIntensity: 0.7,
        transparent: true,
        opacity: 0.8
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.y = height + 0.5;
    ring.rotation.x = Math.PI / 2;
    objectiveBeam.add(ring);
    
    // Create beam of light
    const beamGeometry = new THREE.CylinderGeometry(2, 4, 50, 16, 10, true);
    const beamMaterial = new THREE.MeshBasicMaterial({
        color: 0x00FF00, // Green
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide
    });
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.position.y = height + 25;
    objectiveBeam.add(beam);
    
    // Add particles inside the beam for more effect
    const particleGeometry = new THREE.BufferGeometry();
    const particleCount = 300;
    const particlePositions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 3;
        const particleHeight = Math.random() * 50;
        
        particlePositions[i3] = Math.cos(angle) * radius;
        particlePositions[i3 + 1] = particleHeight + height;
        particlePositions[i3 + 2] = Math.sin(angle) * radius;
    }
    
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    
    const particleMaterial = new THREE.PointsMaterial({
        color: 0x00FF00, // Green
        size: 0.3,
        transparent: true,
        opacity: 0.8
    });
    
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    objectiveBeam.add(particles);
    
    // Add point light in the center of the beam
    const pointLight = new THREE.PointLight(0x00FF00, 1, 30);
    pointLight.position.y = height + 3;
    objectiveBeam.add(pointLight);
    
    // Position the entire beam group
    objectiveBeam.position.set(x, 0, z);
    
    // Add animation for beam elements
    objectiveBeam.userData = {
        animation: {
            ring: { rotation: 0 },
            particles: {
                positions: particlePositions,
                count: particleCount
            },
            light: { intensity: 1 }
        },
        collisionRadius: 5, // Radius for collision detection
    };
    
    // Add to scene
    scene.add(objectiveBeam);
    
    console.log(`New objective beam placed at x:${x.toFixed(2)}, z:${z.toFixed(2)}`);
}

// Check for collisions with objective beam
function checkObjectiveCollision() {
    if (!objectiveBeam) return;
    
    // Get bicycle position
    const bicyclePosition = new THREE.Vector2(bicycle.position.x, bicycle.position.z);
    
    // Get beam position
    const beamPosition = new THREE.Vector2(
        objectiveBeam.position.x,
        objectiveBeam.position.z
    );
    
    // Check distance
    const distance = bicyclePosition.distanceTo(beamPosition);
    
    // If within collision radius, player collects objective
    if (distance < objectiveBeam.userData.collisionRadius) {
        collectObjective();
    }
}

// Handle objective collection
function collectObjective() {
    // Increment score
    playerScore++;
    
    // Update score display
    updateScoreDisplay();
    
    // Create collection effect (particle explosion)
    createCollectionEffect(
        objectiveBeam.position.x,
        getTerrainHeight(objectiveBeam.position.x, objectiveBeam.position.z) + 2,
        objectiveBeam.position.z
    );
    
    // Create new objective beam at different location
    createObjectiveBeam();
}

// Create collection effect
function createCollectionEffect(x, y, z) {
    // Create particle explosion
    const particleGeometry = new THREE.BufferGeometry();
    const particleCount = 200;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleVelocities = [];
    
    // Initialize particles at center
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        particlePositions[i3] = 0;
        particlePositions[i3 + 1] = 0;
        particlePositions[i3 + 2] = 0;
        
        // Random velocity for each particle
        particleVelocities.push({
            x: (Math.random() - 0.5) * 2,
            y: Math.random() * 2,
            z: (Math.random() - 0.5) * 2
        });
    }
    
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    
    // Create bright green particles
    const particleMaterial = new THREE.PointsMaterial({
        color: 0x00FF00,
        size: 0.5,
        transparent: true,
        opacity: 1
    });
    
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    particles.position.set(x, y, z);
    scene.add(particles);
    
    // Animation for particle explosion
    let time = 0;
    const duration = 1.5; // seconds
    
    function animateExplosion() {
        time += clock.getDelta();
        
        // Update particle positions
        const positions = particles.geometry.attributes.position.array;
        
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            const velocity = particleVelocities[i];
            
            // Move particles outward
            positions[i3] += velocity.x * 0.5;
            positions[i3 + 1] += velocity.y * 0.5 - 0.05; // Slight gravity
            positions[i3 + 2] += velocity.z * 0.5;
        }
        
        particles.geometry.attributes.position.needsUpdate = true;
        
        // Fade out particles
        particleMaterial.opacity = 1 - (time / duration);
        
        if (time < duration) {
            requestAnimationFrame(animateExplosion);
        } else {
            // Remove particles after animation completes
            scene.remove(particles);
            particles.geometry.dispose();
            particleMaterial.dispose();
        }
    }
    
    // Start animation
    animateExplosion();
    
    // Add a flash of light
    const flashLight = new THREE.PointLight(0x00FF00, 5, 50);
    flashLight.position.set(x, y, z);
    scene.add(flashLight);
    
    // Fade out the flash light
    let flashTime = 0;
    const flashDuration = 0.5;
    
    function animateFlash() {
        flashTime += clock.getDelta();
        
        // Fade out light
        flashLight.intensity = 5 * (1 - (flashTime / flashDuration));
        
        if (flashTime < flashDuration) {
            requestAnimationFrame(animateFlash);
        } else {
            // Remove light after animation completes
            scene.remove(flashLight);
        }
    }
    
    // Start flash animation
    animateFlash();
    
    // Play sound effect (if we add sound later)
    console.log("Objective collected! Score: " + playerScore);
}

// Update score display
function updateScoreDisplay() {
    if (scoreDisplay) {
        scoreDisplay.textContent = `Score: ${playerScore}`;
        
        // Add a highlight effect
        scoreDisplay.style.backgroundColor = 'rgba(0, 255, 0, 0.7)';
        setTimeout(() => {
            scoreDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        }, 300);
    }
}

// Animate objective beam
function animateObjectiveBeam(deltaTime) {
    if (!objectiveBeam) return;
    
    const userData = objectiveBeam.userData.animation;
    
    // Rotate ring
    userData.ring.rotation += deltaTime * 2;
    objectiveBeam.children[1].rotation.z = userData.ring.rotation;
    
    // Animate particles
    const positions = userData.particles.positions;
    const particleCount = userData.particles.count;
    
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        positions[i3 + 1] += deltaTime * 5; // Move particles upward
        
        // Reset particles that go too high
        const height = getTerrainHeight(
            objectiveBeam.position.x,
            objectiveBeam.position.z
        );
        
        if (positions[i3 + 1] > height + 50) {
            positions[i3 + 1] = height;
        }
    }
    
    objectiveBeam.children[3].geometry.attributes.position.needsUpdate = true;
    
    // Pulse the light intensity
    const time = Date.now() * 0.001;
    objectiveBeam.children[4].intensity = 1 + Math.sin(time * 3) * 0.5;
}

// Create intro popup with game objectives and controls
function createIntroPopup() {
    // Create popup container
    introPopup = document.createElement('div');
    introPopup.style.position = 'absolute';
    introPopup.style.top = '50%';
    introPopup.style.left = '50%';
    introPopup.style.transform = 'translate(-50%, -50%)';
    introPopup.style.width = '500px';
    introPopup.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    introPopup.style.color = 'white';
    introPopup.style.padding = '30px';
    introPopup.style.borderRadius = '15px';
    introPopup.style.boxShadow = '0 0 20px rgba(0, 255, 0, 0.5)';
    introPopup.style.fontFamily = 'Arial, sans-serif';
    introPopup.style.zIndex = '2000';
    introPopup.style.textAlign = 'center';
    
    // Add heading
    const heading = document.createElement('h1');
    heading.textContent = 'Bicycle Game';
    heading.style.color = '#00FF00';
    heading.style.marginTop = '0';
    introPopup.appendChild(heading);
    
    // Add objective text
    const objective = document.createElement('p');
    objective.textContent = 'Get to the green beams around the map to score points!';
    objective.style.fontSize = '18px';
    objective.style.marginBottom = '20px';
    introPopup.appendChild(objective);
    
    // Add controls section
    const controlsHeading = document.createElement('h2');
    controlsHeading.textContent = 'Controls:';
    controlsHeading.style.color = '#00FFFF';
    controlsHeading.style.marginBottom = '10px';
    introPopup.appendChild(controlsHeading);
    
    // Create controls list
    const controlsList = document.createElement('div');
    controlsList.style.textAlign = 'left';
    controlsList.style.marginBottom = '25px';
    controlsList.style.fontSize = '16px';
    
    const controls = [
        { key: 'W', action: 'Accelerate' },
        { key: 'S', action: 'Brake' },
        { key: '← →', action: 'Steer' },
        { key: 'Space', action: 'Jump' },
        { key: '↓', action: 'Wheelie (careful, you can crash!)' },
        { key: 'E', action: 'Barrel Roll (in the air)' },
        { key: 'R', action: 'Respawn' }
    ];
    
    controls.forEach(control => {
        const controlItem = document.createElement('div');
        controlItem.style.margin = '8px 0';
        
        const keySpan = document.createElement('span');
        keySpan.textContent = control.key;
        keySpan.style.display = 'inline-block';
        keySpan.style.width = '80px';
        keySpan.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        keySpan.style.padding = '3px 8px';
        keySpan.style.borderRadius = '5px';
        keySpan.style.marginRight = '10px';
        keySpan.style.textAlign = 'center';
        keySpan.style.fontWeight = 'bold';
        
        const actionSpan = document.createElement('span');
        actionSpan.textContent = control.action;
        
        controlItem.appendChild(keySpan);
        controlItem.appendChild(actionSpan);
        controlsList.appendChild(controlItem);
    });
    
    introPopup.appendChild(controlsList);
    
    // Add start button
    const startButton = document.createElement('button');
    startButton.textContent = 'START GAME';
    startButton.style.backgroundColor = '#00FF00';
    startButton.style.color = 'black';
    startButton.style.border = 'none';
    startButton.style.padding = '12px 25px';
    startButton.style.fontSize = '18px';
    startButton.style.fontWeight = 'bold';
    startButton.style.borderRadius = '8px';
    startButton.style.cursor = 'pointer';
    startButton.style.transition = 'all 0.2s';
    
    startButton.onmouseover = () => {
        startButton.style.backgroundColor = '#FFFFFF';
        startButton.style.transform = 'scale(1.05)';
    };
    
    startButton.onmouseout = () => {
        startButton.style.backgroundColor = '#00FF00';
        startButton.style.transform = 'scale(1)';
    };
    
    startButton.onclick = () => {
        document.body.removeChild(introPopup);
        gameStarted = true;
    };
    
    introPopup.appendChild(startButton);
    
    // Add to document
    document.body.appendChild(introPopup);
}

// Start the game
init(); 