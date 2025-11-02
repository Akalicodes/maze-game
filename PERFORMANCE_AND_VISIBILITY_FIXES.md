# Performance & Visibility Fixes

## Issues Fixed

### 1. ✅ PERFORMANCE - Game was extremely slow
**Problem:** 4K PBR textures were too heavy and causing lag

**Solution:** 
- Reverted to simple, optimized textures
- Changed from `MeshStandardMaterial` (expensive) to `MeshLambertMaterial` (fast)
- Removed multiple texture maps (normal, roughness, AO)
- Using single diffuse textures only

**Files Changed:**
- Walls: `wall.jpg` (simple texture)
- Floor: `floor.webp` (optimized format)
- Ceiling: `ceiling.jpg` (simple texture)

**Result:** Game should now run smoothly!

---

### 2. ✅ VISIBILITY - Player and Monster couldn't see each other
**Problem:** Representations weren't being created or positioned correctly

**Solution:** 
- Simplified representation creation - inline creation instead of complex function
- Direct position updates on every message
- Forced Y coordinate to 1.5 if not provided
- Added `visible = true` on every update
- Removed smooth interpolation (was causing lag)
- Added console logs to verify creation

**Monster sees Player:**
```javascript
- Green glowing cylinder (0.5 radius, 2.5 height)
- Emissive intensity: 1.0 (very bright)
- Position updated every frame
```

**Player sees Monster:**
```javascript
- Red glowing cylinder (0.6 radius, 3 height)
- Emissive intensity: 1.0 (very bright)
- Position updated every frame
```

**Result:** Player and monster can now see each other clearly!

---

## How It Works Now

### Position Broadcasting:
1. Player/Monster moves → Position sent with X, Y, Z coordinates
2. Server receives → Broadcasts to appropriate players
3. Receiver gets position → Creates/updates visual representation
4. Position set directly (no interpolation)
5. Visibility forced to true

### Performance Optimizations:
- Simple materials (Lambert instead of Standard)
- Single texture per surface
- Direct position updates (no smoothing)
- Minimal console logging

---

## Test It:

1. **Server is running** on `http://localhost:8000`
2. Open in **2 browser windows**
3. Create room in window 1
4. Join with same code in window 2
5. Wait for 2 more players (or use 2 more windows)
6. **Player should see RED glowing monster**
7. **Monster should see GREEN glowing player**

---

## If You Still Have Issues:

### Visibility Issues:
- Open browser console (F12)
- Look for: "Monster created player representation" or "Player created monster representation"
- Check for any error messages
- Make sure both players are in the 3D maze (not guide/architect view)

### Performance Issues:
- Lower browser resolution
- Close other tabs
- Check GPU usage
- Try different browser (Chrome usually fastest)

---

## About the Texture Packs:

Your PBR texture packs ARE amazing quality, but they're too heavy for real-time gameplay:
- **4K textures** = 4096x4096 pixels each
- **Multiple maps** = 4-6 textures per surface
- **Standard material** = Expensive real-time calculations

**For games, you need:**
- **1K or 2K textures** (1024x1024 or 2048x2048)
- **Single diffuse map** or **2 maps max** (diffuse + normal)
- **Lambert material** for fast rendering

**Your texture packs would be perfect for:**
- 3D modeling/rendering (Blender, Maya)
- Architectural visualization
- Pre-rendered scenes
- VR experiences with powerful GPUs

**For web games, use:**
- Compressed JPG/WEBP (not PNG/EXR)
- Max 1024x1024 resolution
- 1-2 textures per material max

---

## Game is Ready! 🎮

Server running, performance fixed, visibility fixed!
Open `http://localhost:8000` and enjoy!

