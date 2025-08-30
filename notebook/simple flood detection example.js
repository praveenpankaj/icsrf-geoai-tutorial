// Load FAO GAUL Level 2 (districts)
var districts = ee.FeatureCollection("FAO/GAUL/2015/level2");

// Filter for a specific district in India
// Example: "Amritsar" district in "Punjab" state
var roi = districts
  .filter(ee.Filter.eq("ADM0_NAME", "India")) // Country
  .filter(ee.Filter.eq("ADM1_NAME", "Punjab")) // State
  .filter(ee.Filter.eq("ADM2_NAME", "Amritsar")) // District
  .geometry(); // get the geometry for ROI

// Center map on district
Map.centerObject(roi, 10);
Map.addLayer(roi, { color: "red" }, "Amritsar District");

// 2️⃣ Load Sentinel-1 SAR data (VV polarization)
var sentinel1 = ee
  .ImageCollection("COPERNICUS/S1_GRD")
  .filterBounds(roi)
  .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
  .filter(ee.Filter.eq("instrumentMode", "IW"))
  .select("VV");

// Center map
Map.centerObject(roi, 10);

// 3️⃣ Define pre-flood and post-flood periods (use wide enough windows)
var preFloodWindow = sentinel1.filterDate("2025-07-10", "2025-08-01");
var postFloodWindow = sentinel1.filterDate("2025-08-10", "2025-08-28");

// 4️⃣ Check if images exist
print("Pre-flood image count:", preFloodWindow.size());
print("Post-flood image count:", postFloodWindow.size());

// 5️⃣ Reduce to single images (median to combine multiple)
var preFlood = preFloodWindow.median();
var postFlood = postFloodWindow.median();

// 6️⃣ Calculate flood difference
var floodDifference = postFlood.subtract(preFlood);

// 7️⃣ Classify flood severity
// Define thresholds (adjust based on your data)
var lowThreshold = -3; // minor flood
var mediumThreshold = -10; // medium flood
var highThreshold = -20; // severe flood

// Expression to classify
var classifiedFlood = floodDifference.expression(
  "(b('VV') >= lowThreshold) ? 1" +
    ": (b('VV') >= mediumThreshold) ? 2" +
    ": 3",
  {
    lowThreshold: lowThreshold,
    mediumThreshold: mediumThreshold,
  }
);

// 8️⃣ Visualization palette
var classPalette = ["blue", "yellow", "red"]; // 1=blue, 2=yellow, 3=red

// Add classified flood layer
Map.addLayer(
  classifiedFlood.clip(roi),
  { min: 1, max: 3, palette: classPalette },
  "Flood Severity Classified"
);

// 9️⃣ Optional: Add legend
var legend = ui.Panel({
  style: { position: "bottom-left", padding: "8px 15px" },
});
var makeRow = function (color, name) {
  var colorBox = ui.Label("", {
    backgroundColor: color,
    padding: "8px",
    margin: "0 0 4px 0",
  });
  var description = ui.Label(name, { margin: "0 0 4px 6px" });
  return ui.Panel([colorBox, description], ui.Panel.Layout.Flow("horizontal"));
};
legend.add(ui.Label("Flood Severity", { fontWeight: "bold" }));
legend.add(makeRow("blue", "Low / Minor Flood"));
legend.add(makeRow("yellow", "Medium Flood"));
legend.add(makeRow("red", "High / Severe Flood"));
Map.add(legend);
