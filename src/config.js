// src/config.js
// Edit these to line up markers exactly with the printed numbers on the map.
// Use the built-in Coordinate Helper: triple-tap the colored header on the map to enable DEBUG,
// then tap on a spot to log normalized {x,y} to Metro. Paste those here.

// Use advisory labels exactly as shown in the UI:
export const ADVISORIES = ['Red Warning', 'Yellow Warning', 'Orange Warning'];

export const ADVISORY_COLORS = {
  'Red Warning':    '#F44336',
  'Yellow Warning': '#FFC107',
  'Orange Warning': '#FF9800',
};

// Seven clickable numbers only (coords/zoom preserved exactly)
export const POINTS = [
  { id: 'SV-6',  site: 'SV', num: 6,  name: 'SV Vehicle/Ped Entrance/Exit (#6)',  x: 0.28,  y: 0.40,  zoom: 2,   zoom_coordinates: { x: 0,      y: -10 } },
  { id: 'SV-10', site: 'SV', num: 10, name: 'SVP Church Gate (#10)',              x: 0,     y: 0.40,  zoom: 1.6, zoom_coordinates: { x: -10,    y: -10 } },
  { id: 'ST-2',  site: 'ST', num: 2,  name: 'ST Pedestrian Entrance/Exit (#2)',   x: 0.35,  y: 0.49,  zoom: 1.6, zoom_coordinates: { x: 0.2,    y: 0 } },
  { id: 'ST-10', site: 'ST', num: 10, name: 'OZ Vehicle/Ped Entrance/Exit (#10)', x: 0.36,  y: 0.90,  zoom: 1.6, zoom_coordinates: { x: 0.2,    y: 1 } },
  { id: 'CS-2',  site: 'CS', num: 2,  name: 'CS Vehicle/Ped Entrance/Exit (#2)',  x: 0.51,  y: 0.49,  zoom: 1.8, zoom_coordinates: { x: 0.3,    y: 0.49 } },
  { id: 'CS-3',  site: 'CS', num: 3,  name: 'CS Annex Service Gate (#3)',         x: 0.740, y: 0.50,  zoom: 1.6, zoom_coordinates: { x: 0.640,  y: 0.50 } },
  { id: 'CS-8',  site: 'CS', num: 8,  name: 'Chemistry Laboratory (#8)',          x: 0.925, y: 0.750, zoom: 1.6, zoom_coordinates: { x: 0.725,  y: 0.750 } },
];

// Optional: center tags for colored blocks (you can delete if not needed)
export const ZONES = [
  { id: 'ZONE-SV', title: 'SV', x: 0.145, y: 0.345 },
  { id: 'ZONE-ST', title: 'ST', x: 0.265, y: 0.660 },
  { id: 'ZONE-CS', title: 'CS', x: 0.705, y: 0.600 },
];

// Flood level strings per advisory/point
// Keys updated to match the new advisory labels exactly.
export const LEVELS = {
  'Yellow Warning': {
    'SV-6': 'Knee-level',
    'SV-10': 'Gutter-deep',
    'ST-2': 'Knee-level',
    'ST-10': 'Gutter-deep',
    'CS-2': 'Knee-level',
    'CS-3': 'Knee-level',
    'CS-8': 'Gutter-deep',
    'ZONE-SV': 'Knee-level',
    'ZONE-ST': 'Knee-level',
    'ZONE-CS': 'Gutter-deep',
  },
  'Orange Warning': {
    'SV-6': 'Gutter-deep',
    'SV-10': 'Half-tire',
    'ST-2': 'Gutter-deep',
    'ST-10': 'Half-tire',
    'CS-2': 'Gutter-deep',
    'CS-3': 'Half-tire',
    'CS-8': 'Half-tire',
    'ZONE-SV': 'Gutter-deep',
    'ZONE-ST': 'Half-tire',
    'ZONE-CS': 'Half-tire',
  },
  'Red Warning': {
    'SV-6': 'Half-tire',
    'SV-10': 'Half-tire',
    'ST-2': 'Half-tire',
    'ST-10': 'Half-tire',
    'CS-2': 'Half-tire',
    'CS-3': 'Half-tire',
    'CS-8': 'Half-tire',
    'ZONE-SV': 'Half-tire',
    'ZONE-ST': 'Half-tire',
    'ZONE-CS': 'Half-tire',
  },
};
