/**
 * A little helper for managing the grid map and delivery‐area lookup.
 */
class MapManager {
    constructor() {
      this.map = [];                // Mutable grid copy
      this.original_map = [];       // Immutable “master” copy
      this.deliveryCoordinates = []; // [{x,y}, …] of all tiles with value === 3
      this.width = 0;
      this.height = 0;
    }
  
    /**
     * Loads a brand‐new map.
     * Clears any previous deliveryCoordinates before re‑scanning.
     *
     * @param {number[][]} newMap  A 2D array where
     *                             0 = free, 1 = wall, 2 = parcel, 3 = delivery
     */
    loadMap(newMap) {
      // Deep‑copy both the mutable and original versions
      this.map = JSON.parse(JSON.stringify(newMap));
      this.original_map = JSON.parse(JSON.stringify(newMap));
  
      // Reset the delivery list
      this.deliveryCoordinates = [];
  
      // Update dimensions
      this.width = newMap.length;
      this.height = newMap[0]?.length || 0;
  
      // Scan for delivery‐zone tiles (value === 3)
      for (let x = 0; x < this.width; x++) {
        for (let y = 0; y < this.height; y++) {
          if (newMap[x][y] === 3) {
            this.deliveryCoordinates.push({ x, y });
          }
        }
      }
    }
  
    /**
     * @returns {Array<{x:number,y:number}>}
     */
    getDeliveryCoordinates() {
      return this.deliveryCoordinates;
    }
  
    /**
     * Resets the *current* map back to the original, but only for cells
     * matching `val` (useful if you’ve been mutating this.map).
     *
     * @param {number} val
     */
    resetMapCells(val) {
      const w = this.original_map.length;
      const h = this.original_map[0]?.length || 0;
      const copy = Array.from({ length: w }, () => Array(h));
      for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
          copy[x][y] = this.map[x][y] === val
            ? this.original_map[x][y]
            : this.map[x][y];
        }
      }
      this.map = copy;
    }
  }
  
  // Export a singleton
  export const worldMap = new MapManager();
  