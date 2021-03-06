import * as CityActions from "./city-actions.js";

export const REST = 'REST';
export const GUARD = 'GUARD';
export const CAMP = 'CAMP';
export const PILLAGE = 'PILLAGE';
export const BATTLE = 'BATTLE';
export const ACTION = 'ACTION';
export const ADD_MOVEPOINTS = 'ADD_MOVEPOINTS';
export const RECEIVE_CASUALTIES = 'RECEIVE_CASUALTIES';
export const RECEIVE_FOOD_CHANGE = 'RECEIVE_FOOD_CHANGE';
export const CANCEL_ACTION = 'CANCEL_ACTION';
export const SIEGE = 'SIEGE';

function destroyIfNoUnitLeft(){
  if (this.battleUnits <= 0)
    disarm.call(this);
}

export function rest(){ 
  this.saveAction({
    type: REST,
    nextCommand: {type: REST}
  });
}

export function guard(formation = [0, 0]){
  this.saveAction({
    type: GUARD, formation,
    nextCommand: {type: GUARD, formation}
  });
}

export function camp(destinationTile, formation = [0, 0], path){
  const pathToClosestHomeCity = this.calculatePathToClosestHomeCity();

  if (destinationTile === this.tile) {
    this.register({tile: destinationTile});
    this.registerCamp(destinationTile);
    this.dispatch({ type: CAMP, 
      targetTile: destinationTile,
      costDistance: 1,
      pathToClosestHomeCity: pathToClosestHomeCity,
      formation: formation,
      overallWearinessLevel: this.overallWearinessLevel
    });

    return;
  };

  path ||= this.getValidCampPath(destinationTile);

  if (!path) return;

  const targetTile = path[1];

  if (!targetTile.hasUnit){
    let costDistance = this.tile.getEuclideanCostDistance(targetTile);

    this.register({tile: targetTile});
    this.registerCamp(targetTile);
    this.dispatch({ type: CAMP, targetTile,
      costDistance,
      pathToClosestHomeCity: pathToClosestHomeCity,
      formation: targetTile === destinationTile ? 
        formation :
        this.getNaturalFormation(targetTile),
      overallWearinessLevel: this.overallWearinessLevel,
      nextCommand: { type: CAMP, destinationTile, formation }
    });
  }
}

export function pillage(){
  const {playerId} = this;
  const self = this;

  this.tile.rangeAssign(2, function(distance){
    if (this.playerId !== playerId){
      let attitude = this.attitudes[playerId] || 0;
      this.attitudes[playerId] = attitude - (3 - distance) * self.battleUnits / 65536;
    }
  });

  const isAttacked = Math.random() <= -this.tile.attitudes[playerId]
  const casualty = isAttacked ? Math.random() * 100 | 0 : 0;

  this.dispatch({
    type: PILLAGE, 
    casualty,
    yield: 0
  });
}

export function action(destinationTile, formation = [0, 0], path, args){
  if (destinationTile === this.tile) return;

  path ||= this.getValidActionPath(destinationTile); if (!path) return;

  const targetTile = path[1]; if (!targetTile) return;

  if (targetTile.city && targetTile.city.player !== this.player){
    siege.call(this, targetTile.city, formation);
    return;
  }

  if (targetTile.hasOther())
    for (let unit of targetTile.units)
      if (!unit.isEnemy(this))
        if (targetTile == destinationTile){
          this.player.declareWar(unit.player);
        } else {
          this.dispatch({type: CANCEL_ACTION});
          return;
        }

  let enemy = targetTile.getEnemy(this);

  if (targetTile === destinationTile && enemy)
    battle.call(this, enemy, formation, path, args);
  else {
    const costDistance = this.tile.getEuclideanCostDistance(targetTile);
    const foodLoads = {...this.foodLoads};

    if (this.tile === this.campTile && targetTile !== this.campTile){
      const delta = Math.min(
        this.battleUnits * 5,
        foodLoads.battleUnits + foodLoads.camp
      ) - foodLoads.battleUnits;

      foodLoads.battleUnits += delta;
      foodLoads.camp -= delta;
    } else if (this.tile !== this.campTile && targetTile === this.campTile){
      foodLoads.camp += foodLoads.battleUnits;
      foodLoads.battleUnits = 0;
    }

    this.register({tile: targetTile});
    this.dispatch({ type: ACTION,
      targetTile,
      costDistance,
      foodLoads,
      formation: formation,
      pathToClosestHomeCity: this.calculatePathToClosestHomeCity(),
      overallWearinessLevel: this.overallWearinessLevel,
      nextCommand: targetTile === destinationTile ? 
        undefined :
        { type: ACTION, destinationTile, formation }
    });
  }
}

export function disarm(){
  const city = this.tile.city || this.closestHomeCity;
  CityActions.receiveMilitaryChange.call(this.homeCity, -this.totalUnits);
  CityActions.receiveCivilianChange.call(city, this.totalUnits);
  city.storage.food += this.totalFoodLoad;
  this.destruct();
}

function battle(enemy, formation = [0, 0], path, {city} = {}){
  const formationBonus = city ? -0.2 :
    this.calculateFormationBonus(enemy, city ? formation : [0, 0]);

  const militaryMight1 = 
    this.calculateMilitaryMight() * 
    (1 + Math.max(formationBonus, 0)) * 
    ( Math.random() * 1 + 1 ) / 1.5;
  const militaryMight2 = 
    ( Unit.calculateMilitaryMight(enemy, city) * 
      (1 + Math.max(-formationBonus, 0)) *
      ( Math.random() * 1 + 1 ) / 1.5
    ) * ( city ? 1.5 : 1);

  const tolerableCasualty1 = Math.min(
    this.calculateTolerableCasualtyRate() * 
      ((Math.random() + 1) / 1.5) *
      ( city ? 3 : 1 ),
    1
  ) * this.startingTotalUnits;

  const tolerableCasualty2 = Math.min(
    enemy.calculateTolerableCasualtyRate() *
    ((Math.random() + 1) / 1.5) *
    ( city ? 9 : 1 ),
    1
  ) * enemy.startingTotalUnits;

  let casualty1, casualty2, moralityDelta = 1;

  if (tolerableCasualty1 * militaryMight1 / militaryMight2 > tolerableCasualty2 ){
    casualty2 = Math.min(
      tolerableCasualty1 *
        (militaryMight1 / militaryMight2) ** (city ? 0.5 : 1),
      enemy.battleUnits
    ) | 0;
    
    casualty1 = Math.min(
      tolerableCasualty1,
      casualty2 * (city ? 1 : militaryMight2 / militaryMight1),
      this.battleUnits
    ) | 0;
  } else {
    casualty1 = Math.min(
      tolerableCasualty2 * militaryMight2 / militaryMight1,
      this.battleUnits
    ) | 0;
    
    casualty2 = Math.min(
      tolerableCasualty2,
      casualty1 * militaryMight1 / militaryMight2,
      enemy.battleUnits
    ) | 0;
    moralityDelta = -1;
  }
  
  moralityDelta *= (3 * Math.abs(casualty1 - casualty2) / (casualty1 + casualty2) || 0);

  this.dispatch({
    type: BATTLE, 
    casualty: casualty1, 
    morality: moralityDelta - 0.25, 
    formation, 
    tirednessLevel: 1
  });

  enemy.dispatch({
    type: BATTLE, 
    casualty: casualty2, 
    movePoints: 0, 
    tirednessLevel: Math.min(1, militaryMight1 / militaryMight2 || 0), 
    morality: -moralityDelta - 0.25
  });

  enemy.updatePaths();

  this.homeCity && CityActions.receiveMilitaryChange.call(this.homeCity, -casualty1);
  enemy.homeCity && CityActions.receiveMilitaryChange.call(enemy.homeCity, -casualty2);

  destroyIfNoUnitLeft.call(this);
  destroyIfNoUnitLeft.call(enemy);
}

function siege(city, formation, path){
  if (!city.isEnemy(this))
    this.player.declareWar(city.player);
  
  const originalBattleUnits = this.battleUnits;
  const cityMilitaryMight = 
    city.calculateMilitaryMight() * ( Math.random() * 1 + 1 ) / 1.5;
  let tolerableCasualty1 = 
    Math.min(this.calculateTolerableCasualtyRate() * 5, 0.5) * 
    this.battleUnits *
    ((Math.random() + 1) / 1.5) | 0;
  const tolerableCasualty2 = city.civilianPopulation / 10 * ((Math.random() + 1) / 1.5);

  for (let unit of city.tile.units)
    battle.call(this, unit, formation, path, {city});

  if (city.tile.units.size > 0) return;
  
  const militaryMight1 = 
    this.calculateMilitaryMight() * ( Math.random() * 1 + 1 ) / 1.5;
  
  let casualty1 = originalBattleUnits - this.battleUnits; 

  if (tolerableCasualty1 * militaryMight1 / cityMilitaryMight > tolerableCasualty2){
    casualty1 = tolerableCasualty2 * cityMilitaryMight / militaryMight1 | 0;
    CityActions.fall.call(city, this.player);
    this.dispatch({
      type: BATTLE, casualty: casualty1, morality: 10, formation, tirednessLevel: 1
    });
  } else {
    casualty1 = tolerableCasualty1;
    this.dispatch({
      type: BATTLE, casualty: casualty1, morality: -0.5, formation, tirednessLevel: 1
    });
  }

  console.log(casualty1);
};

function updateMovePoints(){
  // dispatch the next action if the unit still has move points once the turn is ended
  if (this.movePoints >= 0){
    this.dispatch(this.actionQueue.shift());
    
    let {type, cancelCondition, ...args} = this.nextCommand || {};
    this[type?.toLowerCase()]?.(...Object.values(args));
  }

  // update the paths to camp/closest home city once the turn is ended
  this.weakDispatch({type: ADD_MOVEPOINTS});
}

function calculateNonBattleCasualties(){
  const {
    battleUnitHungerLevel, logisticUnitHungerLevel,
    battleUnits, logisticUnits
  } = this;

  // calculate death
  const isPandemic = Math.random() <= this.calculatePandemicPossibility();
  const baseCasualtyRate = Math.random() * (
    this.isAtHomeCity ? 0 : 
      this.tile._improvements.size > 0 ? 0.5 : 1
      + this.pandemicStage
  ) / 64;
  const battleUnitCasualtyRate = Math.min(
    baseCasualtyRate + Math.random() * (
      Math.max(battleUnitHungerLevel - 1, 0) ** 2 +
      Math.max(this.tirednessLevel / 4 - 1, 0) ** 2
    ) / 16,
    1
  );
  const logisticUnitCasualtyRate = Math.min(
    baseCasualtyRate +
    Math.random() * ( Math.max(logisticUnitHungerLevel - 1, 0) ** 2 ) / 16
  );
  const battleUnitCasualties = Math.round(
    battleUnitCasualtyRate * battleUnits
  );
  const logisticUnitCasualties = Math.round(
    logisticUnitCasualtyRate * logisticUnits
  );
  const totalCasualties = battleUnitCasualties + logisticUnitCasualties;

  this.weakDispatch({ type: RECEIVE_CASUALTIES,
    isPandemic, battleUnitCasualties, logisticUnitCasualties
  });
  
  this.homeCity?.handleCasualty(totalCasualties);

  destroyIfNoUnitLeft.call(this);
}

function calculateFoodConsumption(){
  const {
    battleUnitHungerLevel, logisticUnitHungerLevel,
    battleUnits, logisticUnits, totalUnits
  } = this;
  const isInCamp = this.campTile === this.tile;
  const foodLoads = {...this.foodLoads};

  const foodSupplyFromCity = Math.min(
    this._closestHomeCity.foodStorage,
    this.totalUnits
  );

  this._closestHomeCity.storage.food -= foodSupplyFromCity;

  const logisticUnitFoodConsumption = Math.min(
    foodSupplyFromCity,
    logisticUnits
  ) | 0;
  const battleUnitFoodSupply = foodSupplyFromCity - logisticUnitFoodConsumption;
  const battleUnitFoodConsumptionFromCity = isInCamp ?
    battleUnitFoodSupply : 0;
  const battleUnitFoodConsumptionFromSelf = Math.min(
    isInCamp ? this.foodLoads.camp : this.foodLoads.battleUnits,
    battleUnits - battleUnitFoodConsumptionFromCity
  );
    
  const battleUnitFoodConsumption = 
    battleUnitFoodConsumptionFromCity +
    battleUnitFoodConsumptionFromSelf;

  const hungers = {
    battleUnits: battleUnits * Math.max(
      Math.min(
        (battleUnitHungerLevel + 1) - battleUnitFoodConsumption / battleUnits,
        5
      ), 0
    ) | 0,
    logisticUnits: logisticUnits * Math.max(
      Math.min(
        (logisticUnitHungerLevel + 1) - logisticUnitFoodConsumption / logisticUnits,
        5
      ), 0
    ) | 0
  };

  if (!isInCamp){
    foodLoads.battleUnits -= battleUnitFoodConsumption;
    foodLoads.camp += battleUnitFoodSupply;
  } else {
    foodLoads.camp += battleUnitFoodSupply - battleUnitFoodConsumption;
  }

  this.weakDispatch({ type: RECEIVE_FOOD_CHANGE, 
    data: {hungers, foodLoads}
  });

}

export function endTurn(){
  updateMovePoints.call(this);
  calculateFoodConsumption.call(this);
  calculateNonBattleCasualties.call(this);
}