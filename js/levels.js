// Difficulty ramps linearly from level 1 to level 10.
const lerp = (a, b, t) => a + (b - a) * t;

export const LEVELS = Array.from({ length: 10 }, (_, i) => {
  const t = i / 9;
  return {
    agents: Math.min(5, 1 + Math.floor(i / 2)),           // 1,1,2,2,3,3,4,4,5,5
    fireInterval: +lerp(1.6, 1.1, t).toFixed(2),           // seconds between shots per agent
    bulletSpeed: +lerp(12, 26, t).toFixed(1),              // units / second
    burst: i < 4 ? 1 : i < 7 ? 2 : 3,                      // bullets per shot
    spread: +lerp(0, 1.6, t).toFixed(2),                   // sideways spread of burst (units at NEO)
    leadChance: +lerp(0, 0.6, t).toFixed(2),               // chance an agent aims where NEO is going
    duration: Math.round(lerp(20, 45, t)),                 // seconds to survive
    strafe: i >= 5,                                        // agents move sideways from level 6
  };
});
