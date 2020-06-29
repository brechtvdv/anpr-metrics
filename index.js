const program = require('commander'),
      fs = require('fs'),
      papaparse = require('papaparse'),
      globalMercator = require('global-mercator');

const N3 = require('n3');
const { DataFactory } = N3;
const { namedNode, literal, defaultGraph, quad } = DataFactory;

// RDF export
const writer = new N3.Writer(process.stdout, 
			     {end: false, 
			      prefixes: { onderdeel: 'https://wegenenverkeer.data.vlaanderen.be/ns/onderdeel#',
					  wgs84: 'http://www.w3.org/2003/01/geo/wgs84_pos#',
					  ex: "http://example.org/",
            				  sosa: "http://www.w3.org/ns/sosa/",
            				  locn: "http://www.w3.org/ns/locn#",
            				  geosparql: "http://www.opengis.net/ont/geosparql#" } });

// CSV exports
let header = '"cameraId", "timestamp", "count"';
const perDayCsv = fs.createWriteStream(`anpr_summaries_perday.csv`);
perDayCsv.write(header+"\n");
const perHourCsv = fs.createWriteStream(`anpr_summaries_perhour.csv`);
perHourCsv.write(header+"\n");

header = '"cameraId", "latitude", "longitude", "streetname"';
const cameraCsv = fs.createWriteStream(`anpr_cameras.csv`);
cameraCsv.write(header+"\n");

let processedCameras = {};
let summaries = {};
let dayBucketDate = null, hourBucketDate = null; // time bucket that is active
let MINIMUM = 0;

//// Program
console.error(`This tool summarizes ANPR data into hourly and daily SSN observations. Use --help to discover more functions.`);

program
  .option('-a, --anpr <anprfile>', 'path to ANPR file')
  .option('-m, --minimum <minimum>', 'minimum amount of vehicles')
  .parse(process.argv);

if (!program.anpr) {
  console.error('Please provide a path to the ANPR file');
  process.exit();
}
if (program.minimum) {
  MINIMUM = program.minimum;
}

if (program.anpr) {
  let s = fs.createReadStream(program.anpr);

  papaparse.parse(s, {
    download: true,
    header: true,
    step: async function(row, parser) {
      parser.pause();
      await processRow(row);			
      parser.resume();
    },
    complete: function() {
      writer.end();

      // Create link to OSM
      // createLinkToOSM();
    }
  });
}

function processRow(row) {
  processCameraMetadata(row);
  
  // Initialize summaries object
  const cameraId = row.data.DeviceId;
  if (!summaries[cameraId]) {
    summaries[cameraId] = {};
    summaries[cameraId].hourlyCount = 0;
    summaries[cameraId].dailyCount = 0;
  }

  processObservation(cameraId, row.data.TimeStamp);
}
function processCameraMetadata(row) {
  const cameraId = row.data.DeviceId;
  // If not already processed and longitude is filled in
  if (!processedCameras[cameraId] && row.data.Longitude != 0) {
    // only once for camera metadata
    let cameraURI = 'http://example.org/cameras/' + cameraId;
    let geometryURI = cameraURI + '/geometry';

    let csvRow = `"${cameraId}","${row.data.Latitude}","${row.data.Longitude}","${row.data.Name}"`;
    cameraCsv.write(csvRow+"\n");

    writer.addQuad(
      namedNode(cameraURI),
      namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      namedNode('https://wegenenverkeer.data.vlaanderen.be/ns/onderdeel#ANPRCamera'),
    );

    writer.addQuad(
      namedNode(cameraURI),
      namedNode('http://www.w3.org/ns/locn#geometry'),
      namedNode(geometryURI)
    );

    writer.addQuad(
      namedNode(geometryURI),
      namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      namedNode('http://www.w3.org/ns/locn#Geometry')
    );

    writer.addQuad(
      namedNode(geometryURI),
      namedNode('http://www.opengis.net/ont/geosparql#asWKT'),
      literal('POINT (' + row.data.Longitude + ' ' + row.data.Latitude + ')')
    );

    processedCameras[cameraId] = {};
    processedCameras[cameraId].lat = row.data.Latitude;
    processedCameras[cameraId].long = row.data.Longitude;
  }
}

function processObservation(cameraId, timestamp) {
  let date = new Date(timestamp);

  //// Round to hourly, e.g. 2020-06-10T03:00:00.000Z
  date.setMinutes(0);
  date.setSeconds(0);
  date.setMilliseconds(0);

  if (hourBucketDate === null) hourBucketDate = new Date(date.getTime());

  // The observation falls into the time bucket
  if (date.getHours() === hourBucketDate.getHours()) {
    summaries[cameraId].hourlyCount++;
  }
  else {
    // New bucket has started
    // publish all hourly counts
    for(let c in summaries) {
      if (summaries[c].hourlyCount > MINIMUM) publish(c, hourBucketDate, "perHour", summaries[c].hourlyCount);
    };
    // reset all hourly counts
    for (let c in summaries) {
      summaries[c].hourlyCount = 0;
    }
    // Initialize new bucket
    hourBucketDate = new Date(date.getTime());
    summaries[cameraId].hourlyCount++;
  }

  //// Round to daily, e.g. 2020-06-10T00:00:00.000Z
  date.setHours(1);

  if (dayBucketDate === null) dayBucketDate = new Date(date.getTime());

  if (date.getDate() === dayBucketDate.getDate()) summaries[cameraId].dailyCount++;
  else {
    // Publish previous bucket
    for(let c in summaries) {
      if (summaries[c].dailyCount > MINIMUM) publish(c, dayBucketDate, "perDay", summaries[c].dailyCount);
    };
    for (let c in summaries) {
      summaries[c].dailyCount = 0;
    }
    // New bucket starts
    dayBucketDate = new Date(date.getTime());
    summaries[cameraId].dailyCount++;
  }
}

function publish(cameraId, timestamp, property, count) {
  let dateString = new Date(timestamp).toISOString();
  let observation = 'http://example.org/observation/' + cameraId + '/' + property + '/' + dateString;
  let csvRow = `${cameraId},${dateString},${count}`;

  let observedProperty = "http://example.org/passedByCarsPerHour";
  if (property === "perDay") {
    observedProperty = "http://example.org/passedByCarsPerDay";
    perDayCsv.write(csvRow+"\n");
  } else {
    perHourCsv.write(csvRow+"\n");
  }

  writer.addQuad(
    namedNode(observation),
    namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    namedNode('http://www.w3.org/ns/sosa/Observation')
  );

  writer.addQuad(
    namedNode(observation),
    namedNode('http://www.w3.org/ns/sosa/resultTime'),
    literal(dateString)
  );

  writer.addQuad(
    namedNode(observation),
    namedNode('http://www.w3.org/ns/sosa/hasFeatureOfInterest'),
    namedNode('http://example.org/cameras/' + cameraId)
  );

  writer.addQuad(
    namedNode(observation),
    namedNode('http://www.w3.org/ns/sosa/observedProperty'),
    namedNode(observedProperty)
  );

  writer.addQuad(
    namedNode(observation),
    namedNode('http://www.w3.org/ns/sosa/hasSimpleResult'),
    literal(count)
  );
}

/*async function createLinkToOSM() {
  for (let c in processedCameras) {
  //console.log(c)
  let lat = processedCameras[c].lat;
  let long = processedCameras[c].long;
  // Fetch routable tiles tile for this point
  
  }
  }*/
