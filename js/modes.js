// Each game's own code is downloaded and started only when that game is
// played: War never loads Town Life's town, townsfolk, farm and horses, and
// Town Life never loads War's campaign, paratroops, army cars and travel
// scenes. The code both share (the world, soldiers, weapons, HUD) loads with
// the menus. M holds what has been loaded so far.
export const M = {};
let townP = null, warP = null;

export function loadTown() {
  return townP || (townP = Promise.all([import('./town.js'), import('./towngen.js'), import('./horses.js')])
    .then(([town, gen, horses]) => Object.assign(M, { TownLife: town.TownLife, SHOPS: town.SHOPS, generateTown: gen.generateTown, Horses: horses.Horses, town: true }))
    .catch((e) => { townP = null; throw e; }));
}
export function loadWar() {
  return warP || (warP = Promise.all([import('./campaign.js'), import('./paratroops.js'), import('./vehicles.js'), import('./travel.js'), import('./mapdata.js')])
    .then(([campaign, para, cars, travel, mapdata]) => Object.assign(M, {
      Campaign: campaign.Campaign, startCountry: campaign.startCountry, Paratroops: para.Paratroops, DROP_Y: para.DROP_Y,
      Vehicles: cars.Vehicles, playTravel: travel.playTravel, warDate: travel.warDate, prepareTravel: travel.prepareTravel, mapdata, war: true,
    }))
    .catch((e) => { warP = null; throw e; }));
}
export function loadMode(mode) { return mode === 'town' ? loadTown() : loadWar(); }
