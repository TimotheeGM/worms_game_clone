
export enum GameState {
  MENU = 'MENU',
  WAITING_FOR_INPUT = 'WAITING_FOR_INPUT',
  PROJECTILE_FLIGHT = 'PROJECTILE_FLIGHT',
  RESOLVING_DESTRUCTION = 'RESOLVING_DESTRUCTION',
  NEXT_TURN = 'NEXT_TURN',
  GAME_OVER = 'GAME_OVER'
}

export enum WeaponType {
  BAZOOKA = 'BAZOOKA',
  MACHINE_GUN = 'MACHINE_GUN',
  GRENADE = 'GRENADE',
  GRAPPLING_HOOK = 'GRAPPLING_HOOK'
}

export enum MapTheme {
  ISLAND = 'ISLAND',
  CAVERN = 'CAVERN',
  PILLARS = 'PILLARS',
  WASTELAND = 'WASTELAND',
  CUSTOM = 'CUSTOM'
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface Worm {
  id: number;
  name: string;
  team: number;
  pos: Vector2;
  hp: number;
  angle: number; // in radians
  facing: number; // 1 for right, -1 for left
  isFalling: boolean;
  isDead: boolean;
  velocity: Vector2;
}

export interface Projectile {
  pos: Vector2;
  velocity: Vector2;
  radius: number;
  bounces: number;
  type: WeaponType;
  timer?: number; // for timed explosives like grenades
  damageRadius: number;
  maxDamage: number;
}

export interface Particle {
  pos: Vector2;
  velocity: Vector2;
  life: number;
  color: string;
}
