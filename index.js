const program = require('commander'),
      path = require('path'),
      fs = require('fs'),
      papaparse = require('papaparse'),
      globalMercator = require('global-mercator');

const N3 = require('n3');
const { DataFactory } = N3;
const { namedNode, literal, defaultGraph, quad } = DataFactory;

let prefixes = {  onderdeel: 'https://wegenenverkeer.data.vlaanderen.be/ns/onderdeel#',
                  wgs84: 'http://www.w3.org/2003/01/geo/wgs84_pos#',
                  ex: "http://example.org/",
             		  sosa: "http://www.w3.org/ns/sosa/",
             		  locn: "http://www.w3.org/ns/locn#",
             		  geosparql: "http://www.opengis.net/ont/geosparql#",
                  time: "http://www.w3.org/2006/time#" };

const cameraCsv = fs.createWriteStream(`anpr_cameras.csv`);
let header = 'cameraId, latitude, longitude, label';
cameraCsv.write(header+"\n");
const perDayCsv = fs.createWriteStream(`anpr_summaries_perday.csv`);
const perHourCsv = fs.createWriteStream(`anpr_summaries_perhour.csv`);
const perHourCsvWithMedian = fs.createWriteStream(`anpr_summaries_perhour_with_median.csv`);
const perDayCsvWithMedian = fs.createWriteStream(`anpr_summaries_perday_with_median.csv`);

let processedCameras = {};
let summaries = {};
let averageTimeBetweenCameraPairs = {};
let dayBucketDate = null, hourBucketDate = null; // time bucket that is active
let MINIMUM = 0;
let START = new Date('01-01-1900');
let END = new Date('01-01-3000');

//// Program
console.error(`This tool summarizes ANPR data into hourly and daily SSN observations. Use --help to discover more functions.`);

program
  .option('-a, --anpr <anprfile>', 'path to ANPR file')
  .option('-m, --minimum <minimum>', 'minimum amount of vehicles')
  .option('-s, --startDate <startdate>', 'start date of report (format: YYYY-MM-DD)')
  .option('-e, --endDate <enddate>', 'end date of report (format: YYYY-MM-DD)')
  //.option('-d, --destination <destination>', 'file destination of the Linked Data export')
  .parse(process.argv);

if (!program.anpr) {
  console.error('Please provide a path to the ANPR file');
  process.exit();
}
if (program.minimum) {
  MINIMUM = program.minimum;
}

if (program.anpr) {
  createCameraMetadata();
}
if (program.startDate) {
  START = new Date(program.startDate);
}

if (program.endDate) {
  END = new Date(program.endDate);
}

/*if (program.destination) {
  DESTINATION = program.destination;
}*/

let DESTINATION = 'anpr_summaries_' 
                  + new Date(START.getTime()-(START.getTimezoneOffset()*60000)).toISOString().split("T")[0] 
                  + '_'
                  + new Date(END.getTime()-(START.getTimezoneOffset()*60000)).toISOString().split("T")[0] 
                  + '.ttl';

let anpr_summaries_destination = fs.createWriteStream(path.join(__dirname, "./" + DESTINATION));

const writer = new N3.Writer(anpr_summaries_destination);

/*writer._write = (quad, encoding, done) => {
    //data_ttl += quad.replace("\n", "");
    anpr_summaries_destination.write(quad);
    //setTimeout(done, 1000);
};*/

for (let p in prefixes) {
    writer.addPrefix(p, prefixes[p]);
}

function createCameraMetadata() {
  let s = fs.createReadStream(program.anpr);

  papaparse.parse(s, {
    download: true,
    header: true,
    step: function(row, parser) {
      processCameraMetadata(row);
      // Initialize summaries object
      const cameraId = row.data.DeviceId;
      if (!summaries[cameraId]) {
        summaries[cameraId] = {};
        summaries[cameraId].hourlyCount = 0;
        summaries[cameraId].dailyCount = 0;
      }
    },
    complete: function() {
      createSummaries();
    }
  });
}

function createSummaries(){
    // CSV exports
    // Every camera has its own column
    let header = 'timestamp';
    for (let c in processedCameras) {
        header += ("," + c);
    }
    perDayCsv.write(header+"\n");
    perHourCsv.write(header+"\n");

    let s = fs.createReadStream(program.anpr);

    papaparse.parse(s, {
        download: true,
        header: true,
        step: function(row, parser) {
            let timestamp = new Date(row.data.TimeStamp);
            if (timestamp.getTime() >= START.getTime() && timestamp.getTime() <= END.getTime()) {
              processObservation(row.data.DeviceId, row.data.TimeStamp);
            }
        },
        complete: function() {
          medianPerHour();
          //createTravelFlows();
        }
    });
}

function medianPerHour() {
  let s = fs.createReadStream("anpr_summaries_perhour.csv");

  papaparse.parse(s, {
      header: true,
      complete: function(results) {
        for (let row in results.data) {
          let hour = new Date(results.data[row].timestamp).getHours();
          for (let c in processedCameras) {
            if(!processedCameras[c].hour) processedCameras[c].hour = [];
            if(!processedCameras[c].hour[hour]) processedCameras[c].hour[hour] = [];
            // When below the threshold, it's empty -> don't take into account

            if (parseFloat(results.data[row][c]) !== parseFloat(results.data[row][c])) {
              // NaN
            } else {
              processedCameras[c].hour[hour].push(parseFloat(results.data[row][c]));
            }
          }
        }
        // Create new CSV with medians
        // Every camera has its own column
        let header = 'timestamp';
        for (let c in processedCameras) {
            header += ("," + c + "," + c + "_median");
        }
        perHourCsvWithMedian.write(header+"\n");
        for (let row in results.data) {
            let hour = new Date(results.data[row].timestamp).getHours();
            let csvRow = `${results.data[row].timestamp}`;
            for (let c in processedCameras) {
                let observedProperty = 'http://example.org/passedByVehiclesCountMedian';
                let property = 'passedByVehiclesCountMedian';
                let observation = 'http://example.org/observation/' + c + '/' + property + '/hourly/' + new Date(results.data[row].timestamp).toISOString();

                if (processedCameras[c].hour[hour].length === 0) csvRow += `${results.data[row][c]},,`
                else {
                    let m = median(processedCameras[c].hour[hour]);
                    csvRow += `,${results.data[row][c]},${m}`;
                    let date = new Date(results.data[row].timestamp)
                    let dateString = date.toISOString();
                    let endDate = new Date(dateString);
                    endDate.setTime(endDate.getTime());
                    writeObservation(c, observation, observedProperty, dateString, endDate, m, "Hourly");
                }
            }
            perHourCsvWithMedian.write(csvRow+"\n");
        }
        
        medianPerDay();
      },
    });
}

Date.prototype.addHours = function(h) {
  this.setTime(this.getTime() + (h*60*60*1000));
  return this;
}

function medianPerDay() {
  let s = fs.createReadStream("anpr_summaries_perday.csv");

  papaparse.parse(s, {
      header: true,
      complete: function(results) {
        for (let row in results.data) {
          let day = new Date(results.data[row].timestamp).getDay();

          for (let c in processedCameras) {
            if(!processedCameras[c].day) processedCameras[c].day = [];
            if(!processedCameras[c].day[day]) processedCameras[c].day[day] = [];
            if (parseFloat(results.data[row][c]) !== parseFloat(results.data[row][c])) {
              // NaN
            } else {
              processedCameras[c].day[day].push(parseFloat(results.data[row][c]));
            }
          }
        }
        // Create new CSV with medians
        // Every camera has its own column
        let header = 'timestamp';
        for (let c in processedCameras) {
            header += ("," + c + "," + c + "_median");
        }
        perDayCsvWithMedian.write(header+"\n");
        for (let row in results.data) {
            let day = new Date(results.data[row].timestamp).getDay();
            let csvRow = `${results.data[row].timestamp}`;
            for (let c in processedCameras) {
                let observedProperty = 'http://example.org/passedByVehiclesCountMedian';
                let property = 'passedByVehiclesCountMedian';
                let observation = 'http://example.org/observation/' + c + '/' + property + '/daily/' + new Date(results.data[row].timestamp).toISOString();

                if (processedCameras[c].day[day].length === 0) csvRow += `${results.data[row][c]},,`
                else {
                    let m = median(processedCameras[c].day[day]);
                    csvRow += `,${results.data[row][c]},${m}`;
                    let date = new Date(results.data[row].timestamp)
                    let dateString = date.toISOString(); //.replace('T', ' ').replace('Z', '');
                    let endDate = new Date(dateString);
                    endDate.setTime(endDate.getTime() + 1000*60*60*23);
                    writeObservation(c, observation, observedProperty, dateString, endDate, m, "Daily");
                }
            }
            perDayCsvWithMedian.write(csvRow+"\n");
        }
        //createTravelFlows();
        calculateAverageTimeBetweenCameraPairs();
      }
    });
}

function median(values){
    const arrSort = values.sort(function(a,b) {return a - b;} );
    const len = arrSort.length;
    const mid = Math.ceil(len / 2);

    return ( len % 2 == 0 ? (arrSort[mid] + arrSort[mid - 1]) / 2 : arrSort[mid - 1]);
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
      namedNode('http://www.w3.org/2000/01/rdf-schema#label'),
      literal(row.data.Name)
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
    publish(hourBucketDate, "perHour");

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
    publish(dayBucketDate, "perDay");
    for (let c in summaries) {
      summaries[c].dailyCount = 0;
    }
    // New bucket starts
    dayBucketDate = new Date(date.getTime());
    summaries[cameraId].dailyCount++;
  }
}

function publish(timestamp, property) {
  let dateString = new Date(timestamp).toISOString();
  let csvRow = `${dateString}`;
  let observedProperty = "http://example.org/passedByVehiclesCount";
  for (let c in processedCameras) {
      let observation = 'http://example.org/observation/' + c + '/' + property + '/' + new Date(timestamp).toISOString();
      if (property === "perDay") {
          if (summaries[c].dailyCount > MINIMUM) {
            csvRow += `,${summaries[c].dailyCount}`;
            // Calcalute end by adding 1 hour
            let endDate = new Date(dateString);
            endDate.setTime(endDate.getTime() + 1000*60*60*23);
            writeObservation(c, observation, observedProperty, dateString, endDate, summaries[c].dailyCount, "Daily");
          } else csvRow += `,`;
    }
    else {
          if (summaries[c].hourlyCount > MINIMUM) {
            // Calcalute end by adding 24 hours
            let endDate = new Date(dateString);
            endDate.setTime(endDate.getTime());
            csvRow += `,${summaries[c].hourlyCount}`;
            writeObservation(c, observation, observedProperty, dateString, endDate, summaries[c].hourlyCount, "Hourly");
          } else {
            csvRow += `,`;
          }
    }
  }
  if (property === "perDay") perDayCsv.write(csvRow + "\n");
  else perHourCsv.write(csvRow + "\n");
}

function writeObservation(cameraId, observation, observedProperty, dateString, endDate, count, aggregationPeriod) {
    let aggrPeriod = "https://w3id.org/city_of_things#" + aggregationPeriod;

    writer.addQuad(
        namedNode(observation),
        namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        namedNode('http://www.w3.org/ns/sosa/Observation')
    );

    writer.addQuad(
        namedNode(observation),
        namedNode('https://w3id.org/city_of_things#aggregationPeriod'),
        namedNode(aggrPeriod)
    );

    /*writer.addQuad(
        namedNode(observation),
        namedNode('http://www.w3.org/ns/sosa/phenomenonTime'),
        literal(dateString)
    );*/

    writer.addQuad(
        namedNode(observation),
        namedNode('http://www.w3.org/ns/sosa/phenomenonTime'),
        writer.blank([{
          predicate: namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
          object: namedNode('http://www.w3.org/2006/time#Interval')
        },{
          predicate: namedNode('http://www.w3.org/2006/time#hasBeginning'),
          object: writer.blank([{
            predicate: namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
            object: namedNode('http://www.w3.org/2006/time#TimeInstant'),
          },{
            predicate: namedNode('http://www.w3.org/2006/time#inXSDDateTimeStamp'),
            object: literal(dateString)
          }])
        },{
          predicate: namedNode('http://www.w3.org/2006/time#hasEnd'),
          object: writer.blank([{
            predicate: namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
            object: namedNode('http://www.w3.org/2006/time#TimeInstant'),
          },{
            predicate: namedNode('http://www.w3.org/2006/time#inXSDDateTimeStamp'),
            object: literal(formatDate(endDate))
          }])
        }])
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

function updateReportTemplate() {
  anpr_summaries_destination.end();
    let reportsTemplate = fs.readFileSync(path.join(__dirname, "./templates/report.html")).toString();
    let dataSummaries = fs.readFileSync(path.join(__dirname, "./" + DESTINATION)).toString();
    reportsTemplate = reportsTemplate.split('$data$').join("`" + dataSummaries + "`");

    fs.writeFileSync(path.join(__dirname, "./dist/report_" 
                              + new Date(START.getTime()-(START.getTimezoneOffset()*60000)).toISOString().split("T")[0] 
                              + '_'
                              + new Date(END.getTime()-(START.getTimezoneOffset()*60000)).toISOString().split("T")[0]
                              + ".html"), reportsTemplate);
}

function createTravelFlows() {
  let numberPlatePreviously = {}; // number plate -> (where and when last seen)

  // Object so we can calculate the average time between camera pairs for every hour bucket
  let time = {}; // cameraId -> cameraId -> hour bucket -> time (every hour has its own average time)

  let amountOfTravelFlowsPerHour = {}; // cameraId -> cameraId -> hour -> count

  let s = fs.createReadStream(program.anpr);
  // First we need to calculate the average time it takes between every camera pair, on working days 
  papaparse.parse(s, {
    download: true,
    header: true,
    step: function(row, parser) {
      let plate = row.data['Plate'];

      if (!plate) plate = row.data['﻿Plate']; // some special character thing here
      const cameraId = row.data.DeviceId;

      //const plate = row.data.get('Plate');
      const timestamp = new Date(row.data.TimeStamp);
      if (!numberPlatePreviously[plate]) {
        numberPlatePreviously[plate] = {};
        numberPlatePreviously[plate].where = cameraId;
        numberPlatePreviously[plate].when = timestamp;
      } else {
        // This number plate has already been noticed
        // Round to the same hour bucket
        let roundedDate = new Date(timestamp);

        //// Round to hourly, e.g. 2020-06-10T03:00:00.000Z
        roundedDate.setMinutes(0);
        roundedDate.setSeconds(0);
        roundedDate.setMilliseconds(0);
        // Time in ms it took to get to the next camera
        let took = timestamp.getTime() - numberPlatePreviously[plate].when.getTime();
        // When this took less than 15 minutes more than the average time between these cameras, it's a travel flow
        let avg = averageTimeBetweenCameraPairs[numberPlatePreviously[plate].where][cameraId];
        let max = avg + 15*60*1000;
        if (took < max) {
          if (!amountOfTravelFlowsPerHour[numberPlatePreviously[plate].where]) amountOfTravelFlowsPerHour[numberPlatePreviously[plate].where] = {};
          if (!amountOfTravelFlowsPerHour[numberPlatePreviously[plate].where][cameraId]) amountOfTravelFlowsPerHour[numberPlatePreviously[plate].where][cameraId] = {};
          if (!amountOfTravelFlowsPerHour[numberPlatePreviously[plate].where][cameraId][roundedDate]) amountOfTravelFlowsPerHour[numberPlatePreviously[plate].where][cameraId][roundedDate] = 1;
          else amountOfTravelFlowsPerHour[numberPlatePreviously[plate].where][cameraId][roundedDate]++;
        }
        // Overwrite previous detection
        numberPlatePreviously[plate].where = cameraId;
        numberPlatePreviously[plate].when = timestamp;
      }     
    },
    complete: function() {
      // Output travel flows
      for (let origin in amountOfTravelFlowsPerHour) {
        for (let destination in amountOfTravelFlowsPerHour[origin]) {
          for (let timestamp in amountOfTravelFlowsPerHour[origin][destination]) {
            if (amountOfTravelFlowsPerHour[origin][destination][timestamp] > MINIMUM) {
              let observedProperty = 'http://example.org/passedByVehiclesInFlow';
              let property = 'passedByVehiclesInFlow';
              let timestampFormatted = formatDate(new Date(timestamp))
              let observation = 'http://example.org/observation/' + property + '/' + origin + '/' + destination + '?timestamp=' + timestampFormatted;

              writer.addQuad(
                namedNode(observation),
                namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
                namedNode('http://www.w3.org/ns/sosa/Observation')
              );

              writer.addQuad(
                  namedNode(observation),
                  namedNode('http://www.w3.org/ns/sosa/hasFeatureOfInterest'),
                  namedNode('http://example.org/cameras/' + origin)
              );

              writer.addQuad(
                  namedNode(observation),
                  namedNode('http://www.w3.org/ns/sosa/hasFeatureOfInterest'),
                  namedNode('http://example.org/cameras/' + destination)
              );

              writer.addQuad(
                  namedNode(observation),
                  namedNode('http://example.org/originCamera'),
                  namedNode('http://example.org/cameras/' + origin)
              );

              writer.addQuad(
                  namedNode(observation),
                  namedNode('http://example.org/destinationCamera'),
                  namedNode('http://example.org/cameras/' + destination)
              );

              writer.addQuad(
                  namedNode(observation),
                  namedNode('http://www.w3.org/ns/sosa/observedProperty'),
                  namedNode(observedProperty)
              );

              writer.addQuad(
                  namedNode(observation),
                  namedNode('http://www.w3.org/ns/sosa/hasSimpleResult'),
                  literal(amountOfTravelFlowsPerHour[origin][destination][timestamp])
              );

              // Calcalute end by adding 1 hour
              let endDate = new Date(timestamp);
              endDate.setTime(endDate.getTime() + 1000*60*60);
              writer.addQuad(
                  namedNode(observation),
                  namedNode('http://www.w3.org/ns/sosa/phenomenonTime'),
                  writer.blank([{
                    predicate: namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
                    object: namedNode('http://www.w3.org/2006/time#Interval')
                  },{
                    predicate: namedNode('http://www.w3.org/2006/time#hasBeginning'),
                    object: writer.blank([{
                      predicate: namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
                      object: namedNode('http://www.w3.org/2006/time#TimeInstant'),
                    },{
                      predicate: namedNode('http://www.w3.org/2006/time#inXSDDateTimeStamp'),
                      object: literal(timestampFormatted)
                    }])
                  },{
                    predicate: namedNode('http://www.w3.org/2006/time#hasEnd'),
                    object: writer.blank([{
                      predicate: namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
                      object: namedNode('http://www.w3.org/2006/time#TimeInstant'),
                    },{
                      predicate: namedNode('http://www.w3.org/2006/time#inXSDDateTimeStamp'),
                      object: literal(formatDate(endDate))
                    }])
                  }])
              );
            }
          }
        }
      }
      writer.end((error, result) => updateReportTemplate());
    }
  });
}

function formatDate(d) {
    let month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = d.getFullYear(),
        hour = '' + (d.getHours()),
        minute = '' + (d.getMinutes()),
        second = '' + (d.getSeconds());

    if (month.length < 2) 
        month = '0' + month;
    if (day.length < 2) 
        day = '0' + day;
    if (hour.length < 2)
        hour = '0' + hour;
    if (minute.length < 2)
        minute = '0' + minute;
    if (second.length < 2)
        second = '0' + second;
      
    return [year, month, day].join('-') + 'T' + [hour, minute, second].join(':') + '.000Z';
}

function calculateAverageTimeBetweenCameraPairs() {
  let numberPlatePreviously = {}; // number plate -> (where and when last seen)
  // Object so we can calculate the average time between camera pairs
  let timeBetweenCameraPairs = {}; // cameraId -> cameraId -> time it took (array)

  let s = fs.createReadStream(program.anpr);
  // First we need to calculate the average time it takes between every camera pair, on working days 
  papaparse.parse(s, {
    download: true,
    header: true,
    step: function(row, parser) {
      let plate = row.data['Plate'];

      if (!plate) plate = row.data['﻿Plate']; // some special character thing here
      const cameraId = row.data.DeviceId;
      const timestamp = new Date(row.data.TimeStamp);
      // Only during working days
      if (timestamp.getDay() > 0 && timestamp.getDay() < 6) {
        if (!numberPlatePreviously[plate]) {
          numberPlatePreviously[plate] = {};
          numberPlatePreviously[plate].where = cameraId;
          numberPlatePreviously[plate].when = timestamp;
        } else {
          // This number plate has already been noticed
          // Time in ms it took to get to the next camera
          let took = timestamp.getTime() - numberPlatePreviously[plate].when.getTime();
          // When this is below 1 hour, count as one flow
          if (took < 60*60*1000) {
            if (!timeBetweenCameraPairs[numberPlatePreviously[plate].where]) timeBetweenCameraPairs[numberPlatePreviously[plate].where] = {};
            if (!timeBetweenCameraPairs[numberPlatePreviously[plate].where][cameraId]) timeBetweenCameraPairs[numberPlatePreviously[plate].where][cameraId] = [];
            else timeBetweenCameraPairs[numberPlatePreviously[plate].where][cameraId].push(took);
          }
          // Overwrite previous detection
          numberPlatePreviously[plate].where = cameraId;
          numberPlatePreviously[plate].when = timestamp;
        }     
      }
    },
    complete: function() {
      // Now we can calculate the average time it takes between each camera pair
      for (let origin in timeBetweenCameraPairs) {
        for (let destination in timeBetweenCameraPairs[origin]) {
          let sum = 0;
          let count = 0;
          for (let time in timeBetweenCameraPairs[origin][destination]) {
            sum += time;
          }
          if (!averageTimeBetweenCameraPairs[origin]) averageTimeBetweenCameraPairs[origin] = {};
          averageTimeBetweenCameraPairs[origin][destination] = sum / count;
        }
      }
      createTravelFlows();
    }
  });
}