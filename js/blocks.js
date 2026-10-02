// Block type registry. Only a handful of blocks exist on purpose.
export const B = {
  AIR: 0, DIRT: 1, MUD: 2, RUBBLE: 3, LOG: 4, WOOD: 5, LEAVES: 6,
  STONE: 7, IRON: 8, TNT: 9, WATER: 10, BEDROCK: 11,
  SANDBAG: 12, WIRE: 13, CAMPFIRE: 14,
  FORT_WALL: 15, FORT_DOOR: 16, FORT_LAMP: 17, SUPPLY: 18,
};

export const BLOCKS = [];

function def(id, o) {
  BLOCKS[id] = Object.assign({
    id, solid: true, opaque: true, render: 'cube', hard: 1, drop: null,
    climb: false, tiles: null, fort: false, glow: 0, color: [0.4, 0.33, 0.25],
  }, o);
}

def(B.AIR, { name: 'air', solid: false, opaque: false, render: 'none', hard: 0 });
def(B.DIRT, { name: 'dirt', tiles: { top: 'dirt_top', side: 'dirt', bottom: 'dirt' }, hard: 0.35, drop: 'dirt', color: [0.36, 0.27, 0.19] });
def(B.MUD, { name: 'mud', tiles: { top: 'mud', side: 'mud', bottom: 'dirt' }, hard: 0.4, drop: 'dirt', color: [0.25, 0.19, 0.14] });
def(B.RUBBLE, { name: 'rubble', tiles: { top: 'rubble', side: 'rubble', bottom: 'dirt' }, hard: 0.6, drop: 'dirt', color: [0.4, 0.37, 0.34] });
def(B.LOG, { name: 'log', tiles: { top: 'log_top', side: 'log_side', bottom: 'log_top' }, hard: 0.9, drop: 'wood', climb: true, color: [0.24, 0.19, 0.14] });
def(B.WOOD, { name: 'wood', tiles: { top: 'planks', side: 'planks', bottom: 'planks' }, hard: 0.7, drop: 'wood', color: [0.45, 0.35, 0.24] });
def(B.LEAVES, { name: 'leaves', solid: false, opaque: false, tiles: { top: 'leaves', side: 'leaves', bottom: 'leaves' }, hard: 0.15, drop: null, render: 'leaves', color: [0.24, 0.27, 0.19] });
def(B.STONE, { name: 'stone', tiles: { top: 'stone', side: 'stone', bottom: 'stone' }, hard: 1.3, drop: 'stone', color: [0.42, 0.41, 0.4] });
def(B.IRON, { name: 'iron', tiles: { top: 'iron', side: 'iron', bottom: 'iron' }, hard: 1.8, drop: 'iron', color: [0.55, 0.45, 0.36] });
def(B.TNT, { name: 'tnt', tiles: { top: 'tnt_top', side: 'tnt_side', bottom: 'planks' }, hard: 0.6, drop: 'tnt', color: [0.45, 0.36, 0.22] });
def(B.WATER, { name: 'water', solid: false, opaque: false, render: 'water', hard: 0, tiles: { top: 'water', side: 'water', bottom: 'water' }, color: [0.24, 0.31, 0.34] });
def(B.SANDBAG, { name: 'sandbag', tiles: { top: 'sandbag_top', side: 'sandbag', bottom: 'sandbag_top' }, hard: 0.8, drop: 'sandbag', color: [0.5, 0.45, 0.32] });
// barbed wire: you can walk through it, but slowly (and it cuts enemies)
def(B.WIRE, { name: 'wire', solid: false, opaque: false, render: 'cross', tiles: { top: 'wire', side: 'wire', bottom: 'wire' }, hard: 0.5, drop: 'wire', color: [0.3, 0.3, 0.3] });
// campfire: drawn as its own animated model, not as a cube
def(B.CAMPFIRE, { name: 'campfire', solid: false, opaque: false, render: 'none', hard: 0.3, drop: null, color: [0.3, 0.22, 0.15] });
// built-in fort blocks: indestructible (also locked in the world)
def(B.FORT_WALL, { name: 'fortwall', tiles: { top: 'fort_top', side: 'fort_wall', bottom: 'fort_top' }, hard: Infinity, fort: true, color: [0.45, 0.44, 0.41] });
def(B.FORT_DOOR, { name: 'fortdoor', tiles: { top: 'fort_top', side: 'fort_door', bottom: 'fort_top' }, hard: Infinity, fort: true, color: [0.3, 0.32, 0.26] });
def(B.FORT_LAMP, { name: 'fortlamp', tiles: { top: 'fort_lamp', side: 'fort_lamp', bottom: 'fort_lamp' }, hard: Infinity, fort: true, glow: 1.3, color: [0.9, 0.7, 0.4] });
def(B.SUPPLY, { name: 'supply', tiles: { top: 'supply_top', side: 'supply', bottom: 'planks' }, hard: Infinity, fort: true, color: [0.45, 0.4, 0.28] });
def(B.BEDROCK, { name: 'bedrock', tiles: { top: 'bedrock', side: 'bedrock', bottom: 'bedrock' }, hard: Infinity, color: [0.13, 0.13, 0.13] });

// Quick lookup tables for hot loops (mesher, physics).
export const SOLID = new Uint8Array(256);
export const OPAQUE = new Uint8Array(256);
for (const b of BLOCKS) {
  if (!b) continue;
  SOLID[b.id] = b.solid ? 1 : 0;
  OPAQUE[b.id] = b.opaque ? 1 : 0;
}
