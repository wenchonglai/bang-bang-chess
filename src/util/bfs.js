export default function bfs(findFunc, pathFunc, {maxCostDistance = 1024} = {}){
    if (!pathFunc(this)) return;

    const queue = [this];
    const costDistanceMap = new Map([[this, 0]]);
    const parentMap = new Map();
    let destinationTile;

    while (queue.length){
      let tile = queue.shift();
      const costDistanceToTile = costDistanceMap.get(tile);

      if ( findFunc(tile) && costDistanceToTile < maxCostDistance){
        destinationTile = tile;
        maxCostDistance = costDistanceToTile;
      }

      if (costDistanceToTile >= maxCostDistance) continue;

      for (let adjacentTile of tile.getAdjacentTiles())
        if (pathFunc(adjacentTile)){
          
          let deltaCostDistance = adjacentTile.getCostDistance(tile);
          
          if ( 
            costDistanceMap.get(adjacentTile) === undefined || 
            costDistanceToTile + deltaCostDistance < 
              Math.min(maxCostDistance, costDistanceMap.get(adjacentTile))
          ) {
            costDistanceMap.set(adjacentTile, costDistanceToTile + deltaCostDistance);
            parentMap.set(adjacentTile, tile);
            queue.push(adjacentTile)
          }
        }
    }

    if (destinationTile){
      let tile = destinationTile;
      let path = [];

      while (tile){
        path.push(tile);
        tile = parentMap.get(tile);
      }

      return path.reverse();
    }
  }