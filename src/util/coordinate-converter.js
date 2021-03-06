const ROT_X = 60;
const ROT_Z = 40;
const GRID_SIZE = 64;

import {COS_X, COS, SIN} from "../settings/map-settings.js"

export const mapToScreen = ({x, y}, {translateX = 0, translateY = 0, zoom = 1} = {}) => {
  return {
    x: translateX + zoom * GRID_SIZE * ( x * COS - y * SIN),
    y: translateY + zoom * COS_X * GRID_SIZE * (x * SIN + y * COS)
  }
};

export const screenToMap = ({x, y}, {translateX = 0, translateY = 0, zoom = 1} = {}) => {
  let dx = (x - translateX) / zoom;
  let dy = (y - translateY) / zoom;

  return {
    x: (dx * COS + dy * SIN / COS_X) / GRID_SIZE, 
    y: (dy * COS / COS_X - dx * SIN) / GRID_SIZE
  }
};

export const screenToGrid = (...args) => {
  let {x, y} = screenToMap(...args);
  return {x: x | 0, y: y | 0}
};