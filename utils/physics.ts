
import { Vector2 } from '../types';

/**
 * Checks if a pixel at (x, y) is solid in the given canvas context.
 */
export const isSolid = (ctx: CanvasRenderingContext2D, x: number, y: number): boolean => {
  if (x < 0 || x >= ctx.canvas.width || y < 0 || y >= ctx.canvas.height) return false;
  // Sampling a single pixel alpha
  const pixel = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
  return pixel[3] > 128; // Alpha > 50%
};

/**
 * Calculates the surface normal by sampling a grid around the impact point.
 */
export const calculateNormal = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number = 2): Vector2 => {
  let nx = 0;
  let ny = 0;
  const count = 0;

  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      if (isSolid(ctx, x + dx, y + dy)) {
        nx -= dx;
        ny -= dy;
      }
    }
  }

  const length = Math.sqrt(nx * nx + ny * ny);
  if (length === 0) return { x: 0, y: -1 };
  return { x: nx / length, y: ny / length };
};

/**
 * Reflects a velocity vector across a normal vector with a given restitution.
 */
export const reflect = (v: Vector2, n: Vector2, restitution: number): Vector2 => {
  const dot = v.x * n.x + v.y * n.y;
  return {
    x: (v.x - 2 * dot * n.x) * restitution,
    y: (v.y - 2 * dot * n.y) * restitution
  };
};
