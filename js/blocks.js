// Block type registry. Only a handful of blocks exist on purpose.
export const B = {
  AIR: 0, DIRT: 1, MUD: 2, RUBBLE: 3, LOG: 4, WOOD: 5, LEAVES: 6,
  STONE: 7, IRON: 8, TNT: 9, WATER: 10, BEDROCK: 11,
  SANDBAG: 12, WIRE: 13, CAMPFIRE: 14,
  FORT_WALL: 15, FORT_DOOR: 16, FORT_LAMP: 17, SUPPLY: 18,
  // Town Life
  GRASS: 19, SAND: 20, CLAY: 21, BRICK: 22, GLASS: 23, THATCH: 24, ICE: 25,
  CHARCOAL: 26, GOLD: 27, FARMLAND: 28, PATH: 29, FENCE: 30,
  SPROUT: 31, WHEAT_G: 32, WHEAT_R: 33, CARROT_G: 34, CARROT_R: 35, CABBAGE_G: 36, CABBAGE_R: 37, WILTED: 38,
  LADDER: 39,
  // War headquarters rooms
  MEDICAL: 40, ARMORY: 41, MAPTABLE: 42,
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
// ---- Town Life blocks
def(B.GRASS, { name: 'grass', tiles: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }, hard: 0.4, drop: 'dirt', color: [0.33, 0.42, 0.2] });
def(B.SAND, { name: 'sand', tiles: { top: 'sand', side: 'sand', bottom: 'sand' }, hard: 0.3, drop: 'sand', color: [0.72, 0.65, 0.46] });
def(B.CLAY, { name: 'clay', tiles: { top: 'clay', side: 'clay', bottom: 'clay' }, hard: 0.45, drop: 'clay', color: [0.55, 0.52, 0.5] });
def(B.BRICK, { name: 'brick', tiles: { top: 'brick', side: 'brick', bottom: 'brick' }, hard: 1.1, drop: 'brick', color: [0.55, 0.28, 0.2] });
// glass: see-through middle, drawn without faces between neighbouring panes
def(B.GLASS, { name: 'glass', opaque: false, render: 'glass', tiles: { top: 'glass', side: 'glass', bottom: 'glass' }, hard: 0.3, drop: 'glass', color: [0.7, 0.8, 0.82] });
def(B.THATCH, { name: 'thatch', tiles: { top: 'thatch', side: 'thatch', bottom: 'thatch' }, hard: 0.3, drop: 'thatch', color: [0.7, 0.6, 0.32] });
def(B.ICE, { name: 'ice', tiles: { top: 'ice', side: 'ice', bottom: 'ice' }, hard: 0.5, drop: null, color: [0.72, 0.84, 0.9] });
def(B.CHARCOAL, { name: 'charcoal', tiles: { top: 'charcoal', side: 'charcoal', bottom: 'charcoal' }, hard: 0.5, drop: 'charcoal', color: [0.12, 0.12, 0.12] });
// gold ore: very rare, with a faint glint
def(B.GOLD, { name: 'gold', tiles: { top: 'gold', side: 'gold', bottom: 'gold' }, hard: 1.9, drop: 'gold', glow: 0.12, color: [0.75, 0.62, 0.3] });
def(B.FARMLAND, { name: 'farmland', tiles: { top: 'farmland', side: 'dirt', bottom: 'dirt' }, hard: 0.35, drop: 'dirt', color: [0.3, 0.22, 0.15] });
def(B.PATH, { name: 'path', tiles: { top: 'path', side: 'dirt', bottom: 'dirt' }, hard: 0.4, drop: 'dirt', color: [0.45, 0.38, 0.27] });
def(B.FENCE, { name: 'fence', opaque: false, render: 'glass', tiles: { top: 'fence', side: 'fence', bottom: 'fence' }, hard: 0.6, drop: 'wood', color: [0.42, 0.32, 0.2] });
// crops: drawn as crossed sprites; growth is kept by the farm (from timestamps)
for (const [id, name] of [[B.SPROUT, 'sprout'], [B.WHEAT_G, 'wheat_g'], [B.WHEAT_R, 'wheat_r'], [B.CARROT_G, 'carrot_g'], [B.CARROT_R, 'carrot_r'], [B.CABBAGE_G, 'cabbage_g'], [B.CABBAGE_R, 'cabbage_r'], [B.WILTED, 'wilted']]) {
  def(id, { name, crop: true, solid: false, opaque: false, render: 'cross', tiles: { top: name, side: name, bottom: name }, hard: 0.05, drop: null, color: [0.4, 0.5, 0.2] });
}
// ladder: two side rails and even rungs (see-through), climbed like a trunk
def(B.MEDICAL, { name: 'medical', tiles: { top: 'med_top', side: 'med_side', bottom: 'fort_top' }, hard: Infinity, fort: true, color: [0.75, 0.75, 0.7] });
def(B.ARMORY, { name: 'armory', tiles: { top: 'planks', side: 'rack', bottom: 'planks' }, hard: Infinity, fort: true, color: [0.4, 0.32, 0.22] });
def(B.MAPTABLE, { name: 'maptable', tiles: { top: 'map_top', side: 'planks', bottom: 'planks' }, hard: Infinity, fort: true, color: [0.6, 0.55, 0.42] });
def(B.LADDER, { name: 'ladder', opaque: false, render: 'glass', climb: true, tiles: { top: 'ladder_top', side: 'ladder', bottom: 'ladder_top' }, hard: 0.8, drop: 'wood', color: [0.42, 0.32, 0.2] });
def(B.BEDROCK, { name: 'bedrock', tiles: { top: 'bedrock', side: 'bedrock', bottom: 'bedrock' }, hard: Infinity, color: [0.13, 0.13, 0.13] });

// Quick lookup tables for hot loops (mesher, physics).
export const SOLID = new Uint8Array(256);
export const OPAQUE = new Uint8Array(256);
for (const b of BLOCKS) {
  if (!b) continue;
  SOLID[b.id] = b.solid ? 1 : 0;
  OPAQUE[b.id] = b.opaque ? 1 : 0;
}
