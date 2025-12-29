
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  GameState, 
  Worm, 
  Projectile, 
  Vector2, 
  Particle,
  WeaponType,
  MapTheme
} from '../types';
import { 
  CANVAS_WIDTH, 
  CANVAS_HEIGHT, 
  GRAVITY, 
  WORM_RADIUS, 
  WORM_SPEED, 
  MAX_POWER, 
  TURN_TIME, 
  TEAM_COLORS,
  WIND_MAX,
  EXPLOSION_RADIUS_BAZOOKA,
  EXPLOSION_RADIUS_GRENADE,
  DAMAGE_BAZOOKA,
  DAMAGE_GRENADE,
  DAMAGE_BULLET,
  BULLET_RADIUS,
  GRENADE_TIMER,
  MINIGUN_BULLET_COUNT,
  HOOK_SPEED,
  HOOK_MAX_LENGTH,
  HOOK_ROPE_SPEED,
  HOOK_SWING_FORCE
} from '../constants';
import { isSolid, calculateNormal, reflect } from '../utils/physics';

interface GrappleState {
  active: boolean;
  anchor: Vector2 | null;
  length: number;
}

const GameView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const terrainRef = useRef<HTMLCanvasElement>(null);
  const keysPressed = useRef<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Game States
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [isPaused, setIsPaused] = useState(false);
  const [activeWormIdx, setActiveWormIdx] = useState(0);
  const [activeTeam, setActiveTeam] = useState(0);
  const [worms, setWorms] = useState<Worm[]>([]);
  const [turnTimer, setTurnTimer] = useState(TURN_TIME);
  const [wind, setWind] = useState(0);
  const [power, setPower] = useState(0);
  const [isCharging, setIsCharging] = useState(false);
  const [hasFired, setHasFired] = useState(false);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [winner, setWinner] = useState<number | null>(null);
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponType>(WeaponType.BAZOOKA);
  const [grapple, setGrapple] = useState<GrappleState>({ active: false, anchor: null, length: 0 });
  
  // Menu & Map Editor Settings
  const [mapTheme, setMapTheme] = useState<MapTheme>(MapTheme.ISLAND);
  const [team1Name, setTeam1Name] = useState('RENEGADES');
  const [team2Name, setTeam2Name] = useState('BLITZKRIEG');
  const [customTurnDuration, setCustomTurnDuration] = useState(30);
  const [customMapImage, setCustomMapImage] = useState<HTMLImageElement | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  const lastActionTime = useRef(0);
  const burstRef = useRef({ count: 0, active: false });

  const stateRef = useRef({
    gameState,
    isPaused,
    activeWormIdx,
    worms,
    projectiles,
    particles,
    wind,
    power,
    isCharging,
    selectedWeapon,
    hasFired,
    turnTimer,
    grapple,
    customTurnDuration
  });

  useEffect(() => {
    stateRef.current = {
      gameState,
      isPaused,
      activeWormIdx,
      worms,
      projectiles,
      particles,
      wind,
      power,
      isCharging,
      selectedWeapon,
      hasFired,
      turnTimer,
      grapple,
      customTurnDuration
    };
  }, [gameState, isPaused, activeWormIdx, worms, projectiles, particles, wind, power, isCharging, selectedWeapon, hasFired, turnTimer, grapple, customTurnDuration]);

  const findSafeSpawn = (tCtx: CanvasRenderingContext2D, preferredX: number): Vector2 => {
    const startY = mapTheme === MapTheme.CAVERN ? 160 : 0;
    
    for (let y = startY; y < CANVAS_HEIGHT - 20; y += 4) {
      if (isSolid(tCtx, preferredX, y)) {
        let clear = true;
        for (let checkY = y - 1; checkY > y - 20; checkY -= 2) {
          if (isSolid(tCtx, preferredX, checkY)) {
            clear = false;
            break;
          }
        }
        if (clear) {
          return { x: preferredX, y: y - 2 };
        }
      }
    }
    if (preferredX < CANVAS_WIDTH - 50) return findSafeSpawn(tCtx, preferredX + 20);
    return { x: preferredX, y: 100 };
  };

  const generateMap = (theme: MapTheme) => {
    const tCtx = terrainRef.current?.getContext('2d', { willReadFrequently: true });
    if (!tCtx) return;

    tCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    const colors = {
      [MapTheme.ISLAND]: '#4ade80',
      [MapTheme.CAVERN]: '#a16207',
      [MapTheme.PILLARS]: '#94a3b8',
      [MapTheme.WASTELAND]: '#f87171',
      [MapTheme.CUSTOM]: '#ffffff' // Placeholder
    };
    
    if (theme === MapTheme.CUSTOM && customMapImage) {
      // Process custom image: remove bright pixels (sky) and keep dark ones (terrain)
      // or respect alpha channel if it's a PNG.
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = CANVAS_WIDTH;
      tempCanvas.height = CANVAS_HEIGHT;
      const tempCtx = tempCanvas.getContext('2d')!;
      tempCtx.drawImage(customMapImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      const imgData = tempCtx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      const data = imgData.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        const a = data[i+3];
        
        // Thresholding logic: if it's very bright (sky) or already transparent, make it sky
        const brightness = (r + g + b) / 3;
        if (brightness > 235 || a < 10) {
          data[i+3] = 0; // Transparent (Sky)
        } else {
          data[i+3] = 255; // Opaque (Terrain)
        }
      }
      tCtx.putImageData(imgData, 0, 0);
      return;
    }

    tCtx.fillStyle = colors[theme];
    tCtx.beginPath();

    if (theme === MapTheme.ISLAND) {
      tCtx.moveTo(0, CANVAS_HEIGHT);
      for (let x = 0; x <= CANVAS_WIDTH; x++) {
        const edge = 150;
        const fade = x < edge ? x / edge : (x > CANVAS_WIDTH - edge ? (CANVAS_WIDTH - x) / edge : 1);
        const h = (150 + Math.sin(x * 0.01) * 60 + Math.sin(x * 0.003) * 100) * fade;
        tCtx.lineTo(x, CANVAS_HEIGHT - h);
      }
      tCtx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
      tCtx.fill();
    } else if (theme === MapTheme.CAVERN) {
      tCtx.moveTo(0, 0);
      for (let x = 0; x <= CANVAS_WIDTH; x++) {
        const h = 100 + Math.sin(x * 0.015) * 40 + Math.sin(x * 0.006) * 30;
        tCtx.lineTo(x, h);
      }
      tCtx.lineTo(CANVAS_WIDTH, 0);
      tCtx.fill();
      
      tCtx.beginPath();
      tCtx.moveTo(0, CANVAS_HEIGHT);
      for (let x = 0; x <= CANVAS_WIDTH; x++) {
        const h = 100 + Math.sin(x * 0.01) * 40 + Math.sin(x * 0.005) * 60;
        tCtx.lineTo(x, CANVAS_HEIGHT - h);
      }
      tCtx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
      tCtx.fill();

      for(let i=0; i<4; i++) {
        const cx = Math.random() * CANVAS_WIDTH;
        const cy = 200 + Math.random() * 200;
        tCtx.beginPath();
        tCtx.arc(cx, cy, 30 + Math.random() * 40, 0, Math.PI * 2);
        tCtx.fill();
      }
    } else if (theme === MapTheme.PILLARS) {
      for (let i = 0; i < 7; i++) {
        const x = 120 + i * 130 + (Math.random() - 0.5) * 60;
        const w = 70 + Math.random() * 50;
        const h = 150 + Math.random() * 250;
        tCtx.beginPath();
        tCtx.roundRect(x - w / 2, CANVAS_HEIGHT - h, w, h, [15, 15, 0, 0]);
        tCtx.fill();
      }
    } else if (theme === MapTheme.WASTELAND) {
      tCtx.moveTo(0, CANVAS_HEIGHT);
      for (let x = 0; x <= CANVAS_WIDTH; x += 20) {
        const h = 80 + Math.random() * 150;
        tCtx.lineTo(x, CANVAS_HEIGHT - h);
        tCtx.lineTo(x + 20, CANVAS_HEIGHT - h);
      }
      tCtx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
      tCtx.fill();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingImage(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setCustomMapImage(img);
        setMapTheme(MapTheme.CUSTOM);
        setIsProcessingImage(false);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const startGame = () => {
    const tCtx = terrainRef.current?.getContext('2d', { willReadFrequently: true });
    if (!tCtx) return;

    generateMap(mapTheme);
    
    const spawnX = [150, 350, 674, 874];
    const initialWorms: Worm[] = spawnX.map((sx, i) => {
      const safePos = findSafeSpawn(tCtx, sx);
      const team = i < 2 ? 0 : 1;
      return {
        id: i,
        name: i < 2 ? `${team1Name} ${i+1}` : `${team2Name} ${i-1}`,
        team,
        pos: safePos,
        hp: 100,
        angle: team === 0 ? -Math.PI / 4 : -3 * Math.PI / 4,
        facing: team === 0 ? 1 : -1,
        isFalling: true,
        isDead: false,
        velocity: { x: 0, y: 0 }
      };
    });

    setWorms(initialWorms);
    setGameState(GameState.WAITING_FOR_INPUT);
    setHasFired(false);
    setIsPaused(false);
    setActiveWormIdx(0);
    setActiveTeam(0);
    setTurnTimer(customTurnDuration);
    setWind((Math.random() - 0.5) * 2 * WIND_MAX);
    setWinner(null);
    setProjectiles([]);
    setParticles([]);
    setPower(0);
    setIsCharging(false);
    setSelectedWeapon(WeaponType.BAZOOKA);
    setGrapple({ active: false, anchor: null, length: 0 });
    keysPressed.current.clear();
    burstRef.current = { count: 0, active: false };
    lastActionTime.current = Date.now();
  };

  const initGame = useCallback(() => {
    setGameState(GameState.MENU);
  }, []);

  useEffect(() => {
    if (gameState !== GameState.WAITING_FOR_INPUT || isPaused) return;
    const interval = setInterval(() => {
      setTurnTimer(prev => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState, isPaused]);

  const createExplosion = (x: number, y: number, radius: number, maxDamage: number) => {
    const tCtx = terrainRef.current?.getContext('2d', { willReadFrequently: true });
    if (!tCtx) return;

    tCtx.globalCompositeOperation = 'destination-out';
    tCtx.beginPath();
    tCtx.arc(x, y, radius, 0, Math.PI * 2);
    tCtx.fill();
    tCtx.globalCompositeOperation = 'source-over';

    setWorms(currentWorms => currentWorms.map(w => {
      if (w.isDead) return w;
      const wormCenterX = w.pos.x;
      const wormCenterY = w.pos.y - WORM_RADIUS;
      const dist = Math.sqrt((wormCenterX - x) ** 2 + (wormCenterY - y) ** 2);
      const damageArea = radius * 1.8;
      if (dist < damageArea) {
        const falloff = 1 - (dist / damageArea);
        const damage = Math.floor(maxDamage * falloff);
        const newHp = Math.max(0, w.hp - damage);
        const angle = Math.atan2(wormCenterY - y, wormCenterX - x);
        const knockback = 5 * falloff;
        return { 
          ...w, 
          hp: newHp, 
          isDead: newHp <= 0,
          isFalling: true,
          velocity: { 
            x: Math.cos(angle) * knockback, 
            y: Math.sin(angle) * knockback - 1.5 
          }
        };
      }
      return w;
    }));

    const newParticles: Particle[] = Array.from({ length: Math.floor(radius / 1.5) }).map(() => ({
      pos: { x, y },
      velocity: { x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8 },
      life: 1.0,
      color: Math.random() > 0.5 ? '#f97316' : '#fde047'
    }));
    setParticles(prev => [...prev, ...newParticles]);
  };

  const fire = () => {
    const { worms: currentWorms, activeWormIdx: idx, power: p, selectedWeapon: weapon, hasFired: alreadyFired, grapple: currentGrapple } = stateRef.current;
    
    // If we have an active hook, fire key releases it
    if (currentGrapple.active) {
      setGrapple({ active: false, anchor: null, length: 0 });
      return;
    }

    if (alreadyFired && weapon !== WeaponType.GRAPPLING_HOOK) return;
    const activeWorm = currentWorms[idx];
    if (!activeWorm) return;

    lastActionTime.current = Date.now();
    if (weapon !== WeaponType.GRAPPLING_HOOK) setHasFired(true);

    if (weapon === WeaponType.MACHINE_GUN) {
      burstRef.current = { count: MINIGUN_BULLET_COUNT, active: true };
      setIsCharging(false);
      setPower(0);
      return;
    }

    const launchPower = weapon === WeaponType.GRAPPLING_HOOK ? HOOK_SPEED : (p / 100) * MAX_POWER + 2;
    const isGrenade = weapon === WeaponType.GRENADE;
    
    const newProj: Projectile = {
      pos: { x: activeWorm.pos.x, y: activeWorm.pos.y - WORM_RADIUS },
      velocity: {
        x: Math.cos(activeWorm.angle) * launchPower,
        y: Math.sin(activeWorm.angle) * launchPower
      },
      radius: isGrenade ? 4 : (weapon === WeaponType.GRAPPLING_HOOK ? 2 : 3),
      bounces: isGrenade ? 5 : 0,
      type: weapon,
      timer: isGrenade ? GRENADE_TIMER : undefined,
      damageRadius: isGrenade ? EXPLOSION_RADIUS_GRENADE : EXPLOSION_RADIUS_BAZOOKA,
      maxDamage: isGrenade ? DAMAGE_GRENADE : DAMAGE_BAZOOKA
    };

    setProjectiles(prev => [...prev, newProj]);
    setIsCharging(false);
    setPower(0);
  };

  useEffect(() => {
    let animationId: number;

    const update = () => {
      const ctx = canvasRef.current?.getContext('2d');
      const tCtx = terrainRef.current?.getContext('2d', { willReadFrequently: true });
      if (!ctx || !tCtx) return;

      const { gameState: currentGS, isPaused: currentPaused, projectiles: currentProjs, worms: currentWorms, wind: currentWind, particles: currentParticles, activeWormIdx: currentIdx, selectedWeapon: currentWeapon, hasFired: currentHasFired, turnTimer: currentTimer, grapple: currentGrapple, customTurnDuration } = stateRef.current;

      if (currentGS === GameState.MENU) {
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        for(let i=0; i<30; i++) {
          ctx.beginPath();
          const t = Date.now() * 0.0005;
          ctx.arc((i * 150 + t * 40) % CANVAS_WIDTH, (i * 120 + Math.sin(t + i) * 80) % CANVAS_HEIGHT, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // --- LOGIC UPDATES ---
        let nextProjs = currentProjs;
        let physicsWorms = currentWorms;

        if (!currentPaused) {
          // --- INPUT HANDLING ---
          if (currentGS === GameState.WAITING_FOR_INPUT) {
            const keys = keysPressed.current;
            let wormUpdate = false;
            let updatedWorms = [...currentWorms];
            const w = updatedWorms[currentIdx];

            if (w && !w.isDead) {
              if (!currentHasFired) {
                if (keys.has('1')) setSelectedWeapon(WeaponType.BAZOOKA);
                if (keys.has('2')) setSelectedWeapon(WeaponType.MACHINE_GUN);
                if (keys.has('3')) setSelectedWeapon(WeaponType.GRENADE);
                if (keys.has('4')) setSelectedWeapon(WeaponType.GRAPPLING_HOOK);
              }
              if (keys.has('e')) setTurnTimer(0);

              if (currentGrapple.active && currentGrapple.anchor) {
                  const dx = w.pos.x - currentGrapple.anchor.x;
                  const dy = w.pos.y - currentGrapple.anchor.y;
                  
                  let dLength = 0;
                  if (keys.has('z') || keys.has('w')) dLength = -HOOK_ROPE_SPEED;
                  if (keys.has('s')) dLength = HOOK_ROPE_SPEED;
                  
                  if (dLength !== 0) {
                      const newLength = Math.max(15, Math.min(HOOK_MAX_LENGTH, currentGrapple.length + dLength));
                      setGrapple(prev => ({ ...prev, length: newLength }));
                  }

                  if (keys.has('q') || keys.has('a')) {
                      w.velocity.x -= HOOK_SWING_FORCE;
                      wormUpdate = true;
                  }
                  if (keys.has('d')) {
                      w.velocity.x += HOOK_SWING_FORCE;
                      wormUpdate = true;
                  }

                  if (keys.has(' ')) {
                    setGrapple({ active: false, anchor: null, length: 0 });
                    keysPressed.current.delete(' ');
                  }
              } else if (!w.isFalling) {
                const prevFacing = w.facing;
                
                if (keys.has('q') || keys.has('a')) {
                  let nx = w.pos.x - WORM_SPEED;
                  let ny = w.pos.y;
                  if (isSolid(tCtx, nx, ny)) {
                    if (!isSolid(tCtx, nx, ny - 5)) while (isSolid(tCtx, nx, ny)) ny--;
                    else nx = w.pos.x;
                  }
                  w.pos = { x: nx, y: ny };
                  w.facing = -1;
                  wormUpdate = true;
                }
                if (keys.has('d')) {
                  let nx = w.pos.x + WORM_SPEED;
                  let ny = w.pos.y;
                  if (isSolid(tCtx, nx, ny)) {
                    if (!isSolid(tCtx, nx, ny - 5)) while (isSolid(tCtx, nx, ny)) ny--;
                    else nx = w.pos.x;
                  }
                  w.pos = { x: nx, y: ny };
                  w.facing = 1;
                  wormUpdate = true;
                }
                if (prevFacing !== w.facing) w.angle = -Math.PI - w.angle;

                const aimSens = 0.015;
                if (keys.has('z') || keys.has('w')) {
                  if (w.facing === 1) w.angle -= aimSens; else w.angle += aimSens;
                  wormUpdate = true;
                }
                if (keys.has('s')) {
                  if (w.facing === 1) w.angle += aimSens; else w.angle -= aimSens;
                  wormUpdate = true;
                }

                if (w.facing === 1) {
                  if (w.angle < -Math.PI/2) w.angle = -Math.PI/2;
                  if (w.angle > Math.PI/2) w.angle = Math.PI/2;
                } else {
                  if (w.angle > -Math.PI/2) w.angle = -Math.PI/2;
                  if (w.angle < -3*Math.PI/2) w.angle = -3*Math.PI/2;
                }

                if (keys.has(' ')) {
                  w.velocity = { x: w.facing * 1.5, y: -3 };
                  w.isFalling = true;
                  wormUpdate = true;
                  keysPressed.current.delete(' '); 
                }
              }

              if (keys.has('shift')) {
                if (currentWeapon === WeaponType.MACHINE_GUN) {
                  if (!burstRef.current.active) { fire(); }
                } else if (currentWeapon === WeaponType.GRAPPLING_HOOK) {
                   if (!stateRef.current.isCharging) { fire(); setIsCharging(true); }
                } else {
                  if (!stateRef.current.isCharging) setIsCharging(true);
                  setPower(prev => Math.min(100, prev + 1.1));
                }
              } else if (stateRef.current.isCharging && !keys.has('shift')) {
                if (currentWeapon !== WeaponType.GRAPPLING_HOOK) fire();
                setIsCharging(false);
              }
            }
            if (wormUpdate) setWorms(updatedWorms);
          }

          if (burstRef.current.active) {
            if (Math.random() > 0.75 && burstRef.current.count > 0) {
              const w = currentWorms[currentIdx];
              const bullet: Projectile = {
                pos: { x: w.pos.x, y: w.pos.y - WORM_RADIUS },
                velocity: {
                  x: Math.cos(w.angle) * 11 + (Math.random() - 0.5) * 0.4,
                  y: Math.sin(w.angle) * 11 + (Math.random() - 0.5) * 0.4
                },
                radius: BULLET_RADIUS, bounces: 0, type: WeaponType.MACHINE_GUN, damageRadius: 6, maxDamage: DAMAGE_BULLET
              };
              setProjectiles(prev => [...prev, bullet]);
              burstRef.current.count--;
              if (burstRef.current.count <= 0) burstRef.current.active = false;
            }
          }

          nextProjs = currentProjs.map(p => {
            p.velocity.y += (p.type === WeaponType.GRAPPLING_HOOK ? 0 : GRAVITY);
            p.velocity.x += (p.type === WeaponType.BAZOOKA || p.type === WeaponType.GRENADE ? currentWind : 0);
            const speed = Math.sqrt(p.velocity.x**2 + p.velocity.y**2);
            const steps = Math.ceil(speed / 2);
            let exploded = false;

            for (let i = 0; i < steps; i++) {
              p.pos.x += p.velocity.x / steps;
              p.pos.y += p.velocity.y / steps;
              if (p.timer !== undefined) p.timer -= 1/steps;

              if (isSolid(tCtx, p.pos.x, p.pos.y) || p.pos.y > CANVAS_HEIGHT - 10) {
                if (p.type === WeaponType.GRAPPLING_HOOK) {
                    if (p.pos.y <= CANVAS_HEIGHT - 10) {
                        const dist = Math.sqrt((p.pos.x - currentWorms[currentIdx].pos.x)**2 + (p.pos.y - (currentWorms[currentIdx].pos.y - WORM_RADIUS))**2);
                        setGrapple({ active: true, anchor: { ...p.pos }, length: dist });
                    }
                    exploded = true; break;
                }
                if (p.pos.y > CANVAS_HEIGHT - 10) { exploded = true; break; }
                if (p.type === WeaponType.BAZOOKA || p.type === WeaponType.MACHINE_GUN) {
                  createExplosion(p.pos.x, p.pos.y, p.damageRadius, p.maxDamage);
                  exploded = true; break;
                } else if (p.type === WeaponType.GRENADE) {
                  if (p.bounces > 0) {
                    const n = calculateNormal(tCtx, p.pos.x, p.pos.y);
                    p.velocity = reflect(p.velocity, n, 0.45);
                    p.bounces--;
                    p.pos.x += n.x * 2.5; p.pos.y += n.y * 2.5;
                  } else {
                    p.velocity.x *= 0.8; p.velocity.y *= 0.5;
                  }
                }
              }

              if (p.type === WeaponType.GRAPPLING_HOOK) {
                const dist = Math.sqrt((p.pos.x - currentWorms[currentIdx].pos.x)**2 + (p.pos.y - (currentWorms[currentIdx].pos.y - WORM_RADIUS))**2);
                if (dist > HOOK_MAX_LENGTH) { exploded = true; break; }
              }
            }
            if (!exploded && p.timer !== undefined && p.timer <= 0) {
              createExplosion(p.pos.x, p.pos.y, p.damageRadius, p.maxDamage);
              exploded = true;
            }
            return exploded ? null : p;
          }).filter(p => p !== null) as Projectile[];
          
          if (JSON.stringify(nextProjs) !== JSON.stringify(currentProjs)) setProjectiles(nextProjs);

          let stillMoving = false;
          physicsWorms = currentWorms.map(w => {
            if (w.isDead) return w;
            
            if (currentGrapple.active && currentGrapple.anchor && w.id === currentWorms[currentIdx].id) {
                w.velocity.y += GRAVITY;
                w.pos.x += w.velocity.x;
                w.pos.y += w.velocity.y;
                w.velocity.x *= 0.99;
                w.velocity.y *= 0.99;

                const dx = w.pos.x - currentGrapple.anchor.x;
                const dy = (w.pos.y - WORM_RADIUS) - currentGrapple.anchor.y;
                const dist = Math.sqrt(dx*dx + dy*dy);

                if (dist > currentGrapple.length) {
                    const ratio = currentGrapple.length / dist;
                    w.pos.x = currentGrapple.anchor.x + dx * ratio;
                    w.pos.y = currentGrapple.anchor.y + dy * ratio + WORM_RADIUS;

                    const nx = dx / dist;
                    const ny = dy / dist;
                    const velDot = w.velocity.x * nx + w.velocity.y * ny;
                    w.velocity.x -= velDot * nx;
                    w.velocity.y -= velDot * ny;
                }

                if (isSolid(tCtx, w.pos.x, w.pos.y)) {
                   if (w.velocity.y > 0) { 
                      while(isSolid(tCtx, w.pos.x, w.pos.y) && w.pos.y > 0) w.pos.y--;
                      w.velocity = { x: 0, y: 0 };
                      w.isFalling = false;
                   } else { 
                      w.velocity.y = 0;
                      while(isSolid(tCtx, w.pos.x, w.pos.y) && w.pos.y < CANVAS_HEIGHT) w.pos.y++;
                   }
                } else {
                   w.isFalling = true;
                }
                stillMoving = true;
            } else if (w.isFalling) {
              w.velocity.y += GRAVITY;
              w.pos.x += w.velocity.x; w.pos.y += w.velocity.y;
              w.velocity.x *= 0.98;
              if (isSolid(tCtx, w.pos.x, w.pos.y)) {
                if (w.velocity.y > 0) { 
                   while(isSolid(tCtx, w.pos.x, w.pos.y) && w.pos.y > 0) w.pos.y--;
                   w.velocity = { x: 0, y: 0 }; w.isFalling = false;
                } else { 
                   w.velocity.y = 0;
                   while(isSolid(tCtx, w.pos.x, w.pos.y) && w.pos.y < CANVAS_HEIGHT) w.pos.y++;
                }
              } else if (w.pos.y > CANVAS_HEIGHT - 10) {
                 return { ...w, hp: 0, isDead: true, isFalling: false };
              }
              stillMoving = true;
            } else if (!isSolid(tCtx, w.pos.x, w.pos.y + 1)) {
              w.isFalling = true; stillMoving = true;
            }
            return w;
          });
          if (JSON.stringify(physicsWorms) !== JSON.stringify(currentWorms)) setWorms(physicsWorms);

          if (currentParticles.length > 0) {
            setParticles(currentParticles.map(p => ({
              ...p,
              pos: { x: p.pos.x + p.velocity.x, y: p.pos.y + p.velocity.y },
              velocity: { x: p.velocity.x, y: p.velocity.y + GRAVITY * 0.4 },
              life: p.life - 0.02
            })).filter(p => p.life > 0));
            stillMoving = true;
          }

          if (currentTimer <= 0 && currentGS === GameState.WAITING_FOR_INPUT) setGameState(GameState.RESOLVING_DESTRUCTION);
          if (currentGS === GameState.RESOLVING_DESTRUCTION && !stillMoving && nextProjs.length === 0 && !burstRef.current.active) {
              setGameState(GameState.NEXT_TURN);
              setGrapple({ active: false, anchor: null, length: 0 });
          }

          if (currentGS === GameState.NEXT_TURN) {
            const alive = [ physicsWorms.some(w => w.team === 0 && !w.isDead), physicsWorms.some(w => w.team === 1 && !w.isDead) ];
            if (!alive[0] || !alive[1]) {
              setWinner(alive[0] ? 0 : 1); setGameState(GameState.GAME_OVER);
            } else {
              let next = (currentIdx + 1) % physicsWorms.length;
              while (physicsWorms[next].isDead) next = (next + 1) % physicsWorms.length;
              setActiveWormIdx(next); setActiveTeam(physicsWorms[next].team);
              setTurnTimer(customTurnDuration); setHasFired(false);
              setWind((Math.random() - 0.5) * 2 * WIND_MAX);
              setGameState(GameState.WAITING_FOR_INPUT);
              setGrapple({ active: false, anchor: null, length: 0 });
              keysPressed.current.clear(); lastActionTime.current = Date.now();
            }
          }
        }

        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
        sky.addColorStop(0, '#0f172a'); sky.addColorStop(1, '#1e293b');
        ctx.fillStyle = sky; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.drawImage(terrainRef.current!, 0, 0);
        
        currentParticles.forEach(p => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.fillRect(p.pos.x, p.pos.y, 2, 2); });
        ctx.globalAlpha = 1;

        if (currentGrapple.active && currentGrapple.anchor) {
            const activeWorm = physicsWorms[currentIdx];
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 2]);
            ctx.beginPath();
            ctx.moveTo(currentGrapple.anchor.x, currentGrapple.anchor.y);
            ctx.lineTo(activeWorm.pos.x, activeWorm.pos.y - WORM_RADIUS);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#f87171';
            ctx.beginPath();
            ctx.arc(currentGrapple.anchor.x, currentGrapple.anchor.y, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        physicsWorms.forEach((w, i) => {
          ctx.save(); ctx.translate(w.pos.x, w.pos.y);
          if (w.isDead) {
            ctx.fillStyle = '#64748b'; ctx.beginPath(); ctx.roundRect(-8, -16, 16, 16, [4, 4, 0, 0]); ctx.fill();
            ctx.strokeStyle = '#334155'; ctx.lineWidth = 1; ctx.stroke();
            ctx.fillStyle = '#1e293b'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('RIP', 0, -8); ctx.font = '6px sans-serif'; ctx.fillText(w.name, 0, -2);
          } else {
            if (i === currentIdx && currentGS === GameState.WAITING_FOR_INPUT && !currentPaused) {
              ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
              ctx.beginPath(); ctx.arc(0, -WORM_RADIUS, 12, 0, Math.PI * 2); ctx.stroke();
            }
            ctx.fillStyle = TEAM_COLORS[w.team]; ctx.beginPath(); ctx.arc(0, -WORM_RADIUS, WORM_RADIUS, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(w.facing * 3, -WORM_RADIUS - 1, 2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'black'; ctx.beginPath(); ctx.arc(w.facing * 4, -WORM_RADIUS - 1, 1, 0, Math.PI * 2); ctx.fill();

            if (i === currentIdx && currentGS === GameState.WAITING_FOR_INPUT) {
              ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath();
              ctx.moveTo(Math.cos(w.angle) * 15, -WORM_RADIUS + Math.sin(w.angle) * 15);
              ctx.lineTo(Math.cos(w.angle) * 35, -WORM_RADIUS + Math.sin(w.angle) * 35); ctx.stroke();
              ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(Math.cos(w.angle) * 35, -WORM_RADIUS + Math.sin(w.angle) * 35, 2, 0, Math.PI * 2); ctx.fill();
            }
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-10, -WORM_RADIUS - 18, 20, 3);
            ctx.fillStyle = w.hp > 40 ? '#4ade80' : '#f87171'; ctx.fillRect(-10, -WORM_RADIUS - 18, (w.hp/100) * 20, 3);
          }
          ctx.restore();
        });

        nextProjs.forEach(p => {
          ctx.save(); ctx.translate(p.pos.x, p.pos.y); ctx.rotate(Math.atan2(p.velocity.y, p.velocity.x));
          if (p.type === WeaponType.BAZOOKA) {
            ctx.fillStyle = '#6b7280'; ctx.beginPath(); ctx.roundRect(-4, -2, 8, 4, 1); ctx.fill();
            ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(4, -2); ctx.lineTo(6, 0); ctx.lineTo(4, 2); ctx.fill();
          } else if (p.type === WeaponType.GRENADE) {
            ctx.fillStyle = '#166534'; ctx.beginPath(); ctx.arc(0, 0, p.radius, 0, Math.PI * 2); ctx.fill();
            if (p.timer !== undefined) { ctx.fillStyle = 'white'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(Math.ceil(p.timer / 60).toString(), 0, -6); }
          } else if (p.type === WeaponType.GRAPPLING_HOOK) {
            ctx.strokeStyle = 'white'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(3, 0); ctx.lineTo(0, 2); ctx.stroke();
          } else { ctx.fillStyle = 'yellow'; ctx.beginPath(); ctx.arc(0, 0, p.radius, 0, Math.PI * 2); ctx.fill(); }
          ctx.restore();
          
          if (p.type === WeaponType.GRAPPLING_HOOK) {
              const activeWorm = physicsWorms[currentIdx];
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
              ctx.setLineDash([2, 2]);
              ctx.beginPath();
              ctx.moveTo(p.pos.x, p.pos.y);
              ctx.lineTo(activeWorm.pos.x, activeWorm.pos.y - WORM_RADIUS);
              ctx.stroke();
              ctx.setLineDash([]);
          }
        });

        ctx.fillStyle = 'rgba(30, 64, 175, 0.6)';
        const wave = Math.sin(Date.now() * 0.002) * 4;
        ctx.fillRect(0, CANVAS_HEIGHT - 10 + wave, CANVAS_WIDTH, 20);

        if (currentPaused) {
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          ctx.fillStyle = 'white';
          ctx.font = 'black 48px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('PAUSED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
          ctx.font = 'bold 14px sans-serif';
          ctx.fillText('PRESS ENTER TO RESUME', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
        }
      }

      animationId = requestAnimationFrame(update);
    };

    animationId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationId);
  }, [mapTheme]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { setIsPaused(p => !p); return; }
      if (e.key === 'Escape') { initGame(); return; }
      keysPressed.current.add(e.key.toLowerCase());
    };
    const up = (e: KeyboardEvent) => { keysPressed.current.delete(e.key.toLowerCase()); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [initGame]);

  if (gameState === GameState.MENU) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-slate-950 font-sans overflow-hidden">
        <canvas ref={terrainRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="hidden" />
        <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="absolute inset-0 w-full h-full" />
        
        <div className="relative z-10 w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 bg-slate-900/80 backdrop-blur-xl border border-white/10 p-8 rounded-[3rem] shadow-2xl">
          
          <div className="md:col-span-2">
            <h1 className="text-5xl font-black text-center mb-2 tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-orange-400 to-red-600">PIXEL ARTILLERY</h1>
            <p className="text-center text-slate-400 text-[10px] font-bold tracking-widest uppercase mb-6">World Engine v2.0.0 • Map Lab Integrated</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-orange-400 mb-2 uppercase">Theatre of Operations</label>
              <div className="grid grid-cols-2 gap-2">
                {[MapTheme.ISLAND, MapTheme.CAVERN, MapTheme.PILLARS, MapTheme.WASTELAND].map(t => (
                  <button 
                    key={t}
                    onClick={() => setMapTheme(t)}
                    className={`py-3 rounded-xl border-2 font-black text-[10px] transition-all uppercase ${mapTheme === t ? 'bg-orange-500 border-white text-white shadow-lg' : 'bg-black/40 border-white/5 text-slate-500 hover:border-white/20'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 bg-black/40 rounded-3xl border border-white/5">
               <label className="block text-[10px] font-black text-cyan-400 mb-3 uppercase flex justify-between items-center">
                 <span>Map Lab: Image Importer</span>
                 {isProcessingImage && <span className="animate-pulse text-white">SCANNING...</span>}
               </label>
               <input 
                 type="file" 
                 accept="image/*" 
                 ref={fileInputRef} 
                 onChange={handleImageUpload} 
                 className="hidden" 
               />
               <button 
                 onClick={() => fileInputRef.current?.click()}
                 className={`w-full py-4 px-4 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all ${mapTheme === MapTheme.CUSTOM ? 'border-cyan-500 bg-cyan-500/10' : 'border-white/10 hover:border-white/30 bg-black/20'}`}
               >
                 {customMapImage ? (
                   <div className="flex items-center gap-3">
                     <div className="w-12 h-12 rounded border border-white/20 overflow-hidden">
                       <img src={customMapImage.src} className="w-full h-full object-cover" />
                     </div>
                     <div className="text-left">
                       <div className="text-xs font-black text-white uppercase">Custom Map Loaded</div>
                       <div className="text-[9px] text-slate-500 font-bold uppercase">Click to change</div>
                     </div>
                   </div>
                 ) : (
                   <>
                     <div className="text-xl mb-1">🖼️</div>
                     <div className="text-[10px] font-black text-slate-400 uppercase">Import Photo/Map</div>
                   </>
                 )}
               </button>
               <p className="text-[9px] text-slate-600 mt-3 italic font-bold">Tip: Upload images with clear shapes. Dark areas become terrain, bright/white areas become sky.</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-purple-400 mb-2 uppercase">Combat Parameters</label>
              <div className="flex items-center gap-4 bg-black/40 p-2 rounded-xl border border-white/5">
                <button 
                  onClick={() => setCustomTurnDuration(prev => Math.max(5, prev - 5))}
                  className="w-10 h-10 bg-slate-800 rounded-lg font-black text-white hover:bg-slate-700 transition-colors"
                >
                  -
                </button>
                <div className="flex-1 text-center font-black text-white text-xl tabular-nums">
                  {customTurnDuration}s
                </div>
                <button 
                  onClick={() => setCustomTurnDuration(prev => Math.min(90, prev + 5))}
                  className="w-10 h-10 bg-slate-800 rounded-lg font-black text-white hover:bg-slate-700 transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-blue-400 mb-2 uppercase">Squad Designation</label>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-red-500 shadow-lg shadow-red-500/50" />
                  <input 
                    type="text" 
                    value={team1Name} 
                    onChange={(e) => setTeam1Name(e.target.value.toUpperCase().slice(0, 12))}
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2 text-sm font-black text-white focus:outline-none focus:border-red-500/50"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-blue-500 shadow-lg shadow-blue-500/50" />
                  <input 
                    type="text" 
                    value={team2Name} 
                    onChange={(e) => setTeam2Name(e.target.value.toUpperCase().slice(0, 12))}
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2 text-sm font-black text-white focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              </div>
            </div>

            <button 
              onClick={startGame}
              disabled={mapTheme === MapTheme.CUSTOM && !customMapImage}
              className={`w-full py-6 mt-4 rounded-2xl font-black text-white text-lg shadow-2xl transition-all uppercase tracking-widest ${mapTheme === MapTheme.CUSTOM && !customMapImage ? 'bg-slate-800 cursor-not-allowed grayscale' : 'bg-gradient-to-r from-orange-500 to-red-600 shadow-orange-500/20 hover:scale-[1.02] active:scale-[0.98]'}`}
            >
              {mapTheme === MapTheme.CUSTOM && !customMapImage ? 'Import Image to Start' : 'Engage Combat'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full select-none">
      <canvas ref={terrainRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="hidden" />
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="w-full h-full" />

      <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between font-sans">
        <div className="flex justify-between items-start">
          <div className="flex gap-4">
            {worms.slice(0, 2).map((w, i) => (
              <div key={i} className={`p-2 bg-black/60 rounded border-b-4 transition-all ${w.isDead ? 'opacity-20 border-slate-500' : 'border-red-500 shadow-lg shadow-red-500/10'}`}>
                <div className="text-[10px] font-bold text-red-400">{w.name}</div>
                <div className="text-lg font-mono leading-none">{w.hp} HP</div>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center">
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-center">
                <div className="w-16 h-1.5 bg-white/10 rounded-full relative overflow-hidden border border-white/5">
                  <div className="absolute h-full bg-sky-400/80 transition-all duration-300" 
                       style={{ 
                         width: `${Math.abs(wind / WIND_MAX) * 100}%`,
                         right: wind < 0 ? '50%' : 'auto',
                         left: wind > 0 ? '50%' : 'auto'
                       }} />
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/30" />
                </div>
                <span className="text-[8px] text-sky-400 font-black tracking-widest mt-1">WIND</span>
              </div>

              <div className="bg-slate-900/90 border-2 border-white/10 px-6 py-1 rounded-full text-center min-w-[120px] shadow-lg">
                <div className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Time Left</div>
                <div className={`text-3xl font-black tabular-nums ${turnTimer < 5 ? 'text-red-500 animate-pulse' : 'text-white'}`}>{turnTimer}</div>
              </div>

              <div className="w-16 flex flex-col items-center">
                <div className="px-2 py-1 bg-white/10 rounded border border-white/10 text-[8px] text-white/60 font-black">E</div>
                <span className="text-[8px] text-white/30 font-bold mt-1 uppercase">End Turn</span>
              </div>
            </div>

            <div className="mt-4 flex gap-4">
              {Object.values(WeaponType).map((wt, idx) => (
                <div key={wt} className={`px-4 py-1.5 rounded-lg border font-black text-[10px] transition-all flex items-center gap-2 ${selectedWeapon === wt ? 'bg-orange-500 border-white text-white shadow-lg scale-105' : 'bg-black/50 border-white/10 text-white/40'} ${hasFired && wt !== WeaponType.GRAPPLING_HOOK ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}>
                  <span className="opacity-50">{idx + 1}</span> {wt.replace('_', ' ')}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-4">
            {worms.slice(2, 4).map((w, i) => (
              <div key={i} className={`p-2 bg-black/60 rounded border-b-4 transition-all ${w.isDead ? 'opacity-20 border-slate-500' : 'border-blue-500 shadow-lg shadow-blue-500/10'}`}>
                <div className="text-[10px] font-bold text-blue-400">{w.name}</div>
                <div className="text-lg font-mono leading-none">{w.hp} HP</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-4">
          {!hasFired || selectedWeapon === WeaponType.GRAPPLING_HOOK ? (
            selectedWeapon !== WeaponType.MACHINE_GUN && selectedWeapon !== WeaponType.GRAPPLING_HOOK ? (
              <div className="w-80 h-4 bg-black/80 rounded-full border border-white/20 overflow-hidden relative shadow-inner">
                <div className="h-full bg-gradient-to-r from-orange-400 via-red-500 to-red-700 transition-all duration-75" style={{ width: `${power}%` }} />
                <div className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-white/80 tracking-widest uppercase">
                  {isCharging ? 'CHARGING LAUNCHER' : 'READY TO FIRE'}
                </div>
              </div>
            ) : (
              <div className="w-80 h-4 bg-black/30 rounded-full border border-white/5 flex items-center justify-center">
                 <span className="text-[9px] font-black text-white/20 tracking-widest uppercase italic">
                     {selectedWeapon === WeaponType.MACHINE_GUN ? 'Automatic Weapon - Instant Trigger' : (grapple.active ? 'ROPE CONTROLS ACTIVE: Z/S (CLIMB) Q/D (SWING) SPACE (RELEASE)' : 'Deploy Grapple - Aim and Press Shift')}
                 </span>
              </div>
            )
          ) : (
            <div className="w-80 h-4 bg-green-500/20 rounded-full border border-green-500/30 flex items-center justify-center">
               <span className="text-[9px] font-black text-green-400 tracking-widest uppercase italic animate-pulse">Weapon Discharged - Reposition Worm</span>
            </div>
          )}
        </div>
      </div>

      {winner !== null && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-50 backdrop-blur-md">
          <div className="text-center p-12 bg-slate-900 border-4 border-slate-700 rounded-3xl shadow-2xl">
            <h1 className="text-5xl font-black mb-2 uppercase" style={{ color: TEAM_COLORS[winner] }}>Team {winner === 0 ? team1Name : team2Name}</h1>
            <h2 className="text-2xl font-bold text-white mb-8 opacity-70">Victory</h2>
            <button onClick={initGame} className="px-10 py-4 bg-white text-black font-black rounded-xl hover:bg-slate-300 transition-colors uppercase shadow-xl">Back to HQ</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameView;
