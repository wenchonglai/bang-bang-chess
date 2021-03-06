import aStarSearch from "../util/a-star.js";
import bfs from "../util/bfs.js";
import { Unit } from "../units/unit.js";
import { City } from "./city.js";
import MetaGeography from "./meta-geography.js";

const TERRAINS = [
  "OCEAN",      // 0
  "SEA",        // 1
  "LAKE",       // 2
  "MARSH",      // 3
  "PLAIN",      // 4
  "HILL_PLAIN", // 5
  "HILL",       // 6
  "ALPINE",     // 7
];

export default class Tile extends MetaGeography{
  static tiles = {};
  static setTile({x, y}, tile){
    if (Tile.tiles[x] === undefined) Tile.tiles[x] = {};
    Tile.tiles[x][y] = tile;
  }
  static getTile({x, y}){
    if (!Tile.tiles[x]) return undefined;
    return Tile.tiles[x][y];
  }

  constructor({x, y}, {
    terrain = 4,
    populations = {civilian: 500, military: 0}
  } = {}){
    super();

    this._x = x;
    this._y = y;
    this._terrain = terrain;
    this._improvements = new Set();
    this._city = undefined;
    this._units = new Set();
    this._connections = [];
    this._city = null;
    this._populations = {...populations};
    this._totalLaborTime = 0;
    this._trainLevel = 0;
    this._attitudes = {};
    this._food = 0;

    Tile.setTile({x, y}, this);
  }

  destruct(){
    Tile.setTile(this, null);
    
    for (let improvement of this.improvements)
      improvement?.destruct();
    
    for (let settlement of this.settlements)
      settlement?.destruct();

    for (let unit of this.units)
      unit?.destruct();
  }

  get x(){return this._x;}
  get y(){return this._y;}
  get populations(){ return this._populations; }  // total populations (civilian, military) of this tile
  get attitudes(){ return this._attitudes; }      // attitudes towards different countries
  get improvements(){ return this._improvements; }
  get city(){ return this._city; }
  get camp(){ return this._camp; }
  get units(){ return this._units; }
  get hasUnit(){ return this.units.size > 0; }
  get player(){ return this._player; }

  hasOther(gameObject){
    return this._hasCertainUnit(
      gameObject,
      unit => 
        unit.player.id !== (gameObject?.player ?? gameObject)?.id
    );
  }

  hasEnemy(gameObject){
    return this._hasCertainUnit(
      gameObject,
      unit => unit.isEnemy(gameObject)
    );
  }

  getEnemy(gameObject){
    for (let unit of Array.from(this.units))
      if (unit.isEnemy(gameObject))
        return unit;
  }

  getEuclideanDistance(tile){
    return tile ? 
      (( (this.x - tile.x) ** 2 + (this.y - tile.y) ** 2 ) ** 0.5).toFixed(4) : 
      Infinity;
  }

  getEuclideanCostDistance(tile){
    return this.getEuclideanDistance(tile) * 2;
  }

  costDistanceTo(
    destinationTile, 
    pathFunc = () => true, 
    ...args
  ){
    const path = this.aStarSearch(destinationTile, pathFunc, ...args);
    return Tile.getPathCostDistance(path);
  }

  static getPathCostDistance(path){
    if (!path) return Infinity;
    
    let distance = 0;

    for (let i = 1, len = path.length; i < len; i ++){
      distance += path[i - 1].getEuclideanCostDistance(path[i]);
    }
    
    return distance;
  }

  endTurn(){
    // change attitude
    for (let key of Object.keys(this.attitudes)){
      let currentAttitude = this.attitudes[key];

      if (currentAttitude < 0)
        this.attitudes[key] += Math.min(5, -currentAttitude)
    }
    
    // reset labor time
    this._totalLaborTime = 0;
  }
  
  // get all valid adjoining tiles
  getAdjacentTiles(){
    const tiles = [
      [0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]
    ] .map(([i, j]) => Tile.getTile({x: this.x + i, y: this.y + j}))
      .filter(tile => tile)

    return tiles;
  }

  getAdjacentTilesByDistance(distance){
    const tiles = [];
    const {x, y} = this;

    for (let j = distance; j >= -distance; j--)
      for (let i = distance; i >= -distance; i--){
        const tile = Tile.getTile({x: this.x + i, y: this.y + j});
        tile && tiles.push(tile);
      }

    return tiles.sort((a, b) => this.getEuclideanDistance(a) - this.getEuclideanDistance(b))
  }

  // assign values determined by assignFunction to surrounding tiles
  rangeAssign(range, assignFunction){
    for (let i = -range, tile; i <= range; i += 1)
      for (let j = -range; j <= range; j += 1){
        let tile = Tile.getTile({x: this.x + i, y: this.y + j});
        tile && assignFunction.call(tile, this.getEuclideanDistance(tile));
      }
  }

  // get the closest path when the destination tile is certain (fast)
  aStarSearch(destinationTile, pathFunc, {maxCostDistance = 4096} = {}){
    return aStarSearch.call(this, destinationTile, pathFunc, {maxCostDistance});
  }

  // find the closest tile meeting the findFunc criteria (slow)
  bfs(findFunc, pathFunc, ...args){
    return bfs.call(this, findFunc, pathFunc, ...args);
  }

  register(gameObject){
    gameObject.tile?.deregister(gameObject);
    gameObject._tile = this;
    
    if (gameObject instanceof Unit) this.units.add(gameObject)
    else if (gameObject instanceof City) this._city = gameObject;
  }

  deregister(gameObject){
    gameObject._tile = undefined;
    
    if (gameObject instanceof Unit) this.units.delete(gameObject)
    else if (gameObject instanceof City) delete this._city;
  }

  registerCamp(gameObject){
    gameObject.campTile?.deregisterCamp(gameObject);
    gameObject._campTile = this;

    this._camp = gameObject;
  }

  deregisterCamp(gameObject){
    gameObject._campTile = undefined;
    delete this._camp;
  }

  /* User-related */
  train(){ this._trainLevel += 1; }  
}