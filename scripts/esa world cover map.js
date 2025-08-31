// Load ESA WorldCover 2020 dataset
var worldcover = ee.ImageCollection("ESA/WorldCover/v200").first();

// Load state boundary (example: Andhra Pradesh, India)
var gaul = ee.FeatureCollection("FAO/GAUL_SIMPLIFIED_500m/2015/level1");
var state = gaul.filter(ee.Filter.eq("ADM1_NAME", "Andhra Pradesh"));

// Clip worldcover to state
var worldcoverState = worldcover.clip(state);

// Define classes, names, and colors
var classNames = [
  "Tree cover",
  "Shrubland",
  "Grassland",
  "Cropland",
  "Built-up",
  "Bare / sparse vegetation",
  "Snow and ice",
  "Permanent water bodies",
  "Herbaceous wetland",
  "Mangroves",
  "Moss & lichen",
];

var classValues = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100];

var classColors = [
  "#006400", // 10 Tree cover
  "#ffbb22", // 20 Shrubland
  "#ffff4c", // 30 Grassland
  "#f096ff", // 40 Cropland
  "#fa0000", // 50 Built-up
  "#b4b4b4", // 60 Bare / sparse vegetation
  "#f0f0f0", // 70 Snow and ice
  "#0064c8", // 80 Permanent water bodies
  "#0096a0", // 90 Herbaceous wetland
  "#00cf75", // 95 Mangroves
  "#fae6a0", // 100 Moss & lichen
];

// Visualization parameters
var worldcoverVis = {
  min: 10,
  max: 100,
  palette: classColors,
};

// Add state boundary
Map.addLayer(state, { color: "red" }, "State Boundary");

// Add worldcover with all classes
Map.addLayer(worldcoverState, worldcoverVis, "ESA WorldCover (All Classes)");

// Center map on the state
Map.centerObject(state, 7);

// -------------------- LEGEND --------------------
var legend = ui.Panel({
  style: {
    position: "bottom-left",
    padding: "8px 15px",
  },
});

// Title
legend.add(
  ui.Label({
    value: "ESA WorldCover Legend",
    style: {
      fontWeight: "bold",
      fontSize: "14px",
      margin: "0 0 6px 0",
      padding: "0",
    },
  })
);

// Add color + label for each class
for (var i = 0; i < classNames.length; i++) {
  var colorBox = ui.Label({
    style: {
      backgroundColor: classColors[i],
      padding: "8px",
      margin: "0 0 4px 0",
    },
  });

  var description = ui.Label({
    value: classValues[i] + " - " + classNames[i],
    style: { margin: "0 0 4px 6px" },
  });

  legend.add(
    ui.Panel({
      widgets: [colorBox, description],
      layout: ui.Panel.Layout.Flow("horizontal"),
    })
  );
}

// Add legend to map
Map.add(legend);
