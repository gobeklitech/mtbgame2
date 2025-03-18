import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

// Main game variables
let scene, camera, renderer, clock;
let terrain, bicycle, controls;
let keys = { w: false, left: false, right: false, up: false, down: false, space: false, s: false, c: false };
let gameSpeed = 0;
const MAX_SPEED = 2.0;
let isSpeedCapped = true;
let speedCap = 0.33; // One third of max speed (lowered from 1.0)
let steerAngle = 0;
let leanAngle = 0;

// Physics variables
let isJumping = false;
let jumpVelocity = 0;
const JUMP_FORCE = 0.5;
const GRAVITY = 0.02;
let isWheelieMode = false;
let wheelieAngle = 0;
const MAX_WHEELIE_ANGLE = Math.PI / 6; // 30 degrees
const BRAKE_FORCE = 1.0;

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
    
    // Create procedural terrain
    createTerrain();
    
    // Create bicycle
    createBicycle();
    
    // Setup controls
    setupControls();
    
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
    
    // Generate height map
    const vertices = geometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
        const x = vertices[i];
        const z = vertices[i + 2];
        
        // Generate height based on simplex noise
        // Different frequencies for different levels of detail
        const height = 
            20 * simplex.noise(x * 0.005, z * 0.005) + 
            8 * simplex.noise(x * 0.02, z * 0.02) +
            2 * simplex.noise(x * 0.05, z * 0.05);
        
        vertices[i + 1] = height;
    }
    
    // Need to update the normals for proper lighting
    geometry.computeVertexNormals();
    
    // Create material and mesh
    const material = new THREE.MeshStandardMaterial({
        color: 0x4CAF50,
        wireframe: false,
        flatShading: true,
    });
    
    terrain = new THREE.Mesh(geometry, material);
    terrain.receiveShadow = true;
    scene.add(terrain);
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
    
    // Disable orbit controls temporarily to reposition camera
    controls.enabled = false;
    
    camera.position.x = bicycle.position.x + offset.x;
    camera.position.y = bicycle.position.y + offset.y;
    camera.position.z = bicycle.position.z + offset.z;
    
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
    switch(event.key) {
        case 'w':
        case 'W':
            keys.w = true;
            break;
        case 's':
        case 'S':
            keys.s = true;
            break;
        case 'c':
        case 'C':
            keys.c = true;
            // Toggle speed cap
            isSpeedCapped = !isSpeedCapped;
            console.log(`Speed cap ${isSpeedCapped ? "enabled" : "disabled"}`);
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
        case 'c':
        case 'C':
            keys.c = false;
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
    }
}

// Update bicycle position and rotation
function updateBicycle(deltaTime) {
    // Calculate forward direction vector
    const moveDirection = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), bicycle.rotation.y);
    
    // Calculate slope factor by checking terrain height ahead vs current position
    const currentHeight = getTerrainHeight(bicycle.position.x, bicycle.position.z);
    const aheadPosition = new THREE.Vector3()
        .copy(bicycle.position)
        .add(moveDirection.clone().multiplyScalar(1.5)); // Check further ahead (1.5 units)
    
    const aheadHeight = getTerrainHeight(aheadPosition.x, aheadPosition.z);
    const heightDifference = aheadHeight - currentHeight;
    
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
        // Apply speed cap if enabled, and apply slope effect
        const effectiveMaxSpeed = isSpeedCapped ? speedCap : MAX_SPEED;
        const targetSpeed = effectiveMaxSpeed * slopeEffect;
        
        // Significantly slower acceleration (reduced from 0.2 to 0.05)
        const baseAcceleration = 0.05; // 4x slower acceleration than before
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
    const MAX_STEER = 0.05;
    if (keys.left) {
        steerAngle = Math.min(steerAngle + deltaTime * 0.1, MAX_STEER);
    } else if (keys.right) {
        steerAngle = Math.max(steerAngle - deltaTime * 0.1, -MAX_STEER);
    } else {
        // Return to center
        steerAngle *= 0.9;
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
    
    // Update wheelie
    if (isWheelieMode) {
        // Gradually increase wheelie angle when down arrow is pressed
        wheelieAngle = Math.min(wheelieAngle + deltaTime * 0.8, MAX_WHEELIE_ANGLE);
    } else {
        // Gradually return to normal position
        wheelieAngle = Math.max(wheelieAngle - deltaTime * 1.2, 0);
    }
    
    // Apply rotation based on steering
    bicycle.rotation.y += steerAngle * gameSpeed;
    
    // Apply tilt (rotation along z-axis)
    bicycle.rotation.z = leanAngle;
    
    // Apply wheelie (rotation along x-axis)
    bicycle.rotation.x = wheelieAngle;
    
    // Move bicycle forward based on speed and direction
    bicycle.position.add(moveDirection.multiplyScalar(gameSpeed));
    
    // Get terrain height at bicycle position
    const terrainHeight = getTerrainHeight(bicycle.position.x, bicycle.position.z);
    
    // Handle jumping
    if (isJumping) {
        // Apply gravity to jump velocity
        jumpVelocity -= GRAVITY;
        
        // Update position based on jump velocity
        bicycle.position.y += jumpVelocity;
        
        // Check if landed
        if (bicycle.position.y <= terrainHeight + 0.6 && jumpVelocity < 0) {
            isJumping = false;
            bicycle.position.y = terrainHeight + 0.6;
        }
    } else {
        // Normal terrain following when not jumping
        bicycle.position.y = terrainHeight + 0.6; // 0.6 is wheel radius
    }
    
    // Update camera to follow bicycle
    updateCameraPosition();
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
    
    // Update controls
    controls.update();
    
    // Render scene
    renderer.render(scene, camera);
}

// Start the game
init(); 