# ANPR metrics

ANPR Metrics is an open source Command Line Interface (CLI) and dashboard for ingesting and analysing raw ANPR data. It is capable of reading raw ANPR data and aggregating useful & privacy-protecting metrics for longterm storage and analysis. Raw data is not persisted after aggregation.

# Metrics

**https://w3id.org/cityofthings#passedByVehiclesCount:** Total number of vehicles that is detected by a camera during a certain time interval. This can be an hourly, daily, weekly... total count.

**https://w3id.org/cityofthings#passedByVehiclesInFlowCount:** Total number of vehicles that went from one camera to another, sometimes referred to as origin/destination data.

**https://w3id.org/cityofthings#AggregatedFlowCount:** Total number of vehicles that went from the origin to the destination camera in a certain number of minutes.

**https://w3id.org/cityofthings#passedByTransitVehiclesCount:** The number of vehicles that transitted the city. A vehicle is in transit when it is detected less than an hour in one day and is only detected once per camera.

**https://w3id.org/cityofthings#passedByUniqueVehiclesCount:** The number of distinct number plates that are detected.


## CLI

### Requirements

* OSX, Linux or Windows Subsystem for Linux (WSL) for Windows users
* Node.js

### Run

Install the dependencies:
```
npm install
```

The CLI is responsible for loading the raw ANPR data, running aggregation and reports, then deleting the raw cache.
The CLI expects ANPR data in CSV format that looks like below:

Plate | Latitude | Longitude | TimeStamp | DeviceId | Name
------------ | -------------  | -------------  | -------------  | -------------  | -------------
XXX | 50.00 | 3.00 | 2020-01-01 10:00:00.000| 1 | My street name

**Plate:** The number plate of a vehicle

**Latitude:** The latitude of the ANPR camera

**Longitude:** The longitude of the ANPR camera

**TimeStamp:** When the vehicle is detected

**DeviceId:** Identifier of the camera

**Name:** Label of the ANPR camera, e.g. the adjacent street name


First, the ANPR data needs to be sorted by running following command (note: replace `anpr.csv` with your filename):

```
head -1 anpr.csv > anpr_sorted.csv && tail -n +2 anpr.csv | sort -t, -k 4 >> anpr_sorted.csv
```

A CSV and Linked Data datadump (Turtle) will be generated together with a HTML report that has the Linked Data imported.

```
node index.js --anpr anpr_sorted.csv
```

### Flags

The following flags are required to run anpr-metrics.

- `--anpr`
	- path to the sorted raw ANPR data


#### Optional

- `--minimum` (short: `-m`)
	- The minimum number of vehicles that an aggregation must contain. For example, when you only want to generate metrics that contain at least 10 observed vehicles, you use `-m 10`
- `--startDate`
	- Only process ANPR observations that happen after this start date. (e.g. 2020-01-01)
- `--endDate`
	- Only process ANPR observation that happen before this end date (e.g. 2020-04-01)

## Report

The dashboard can be viewed by opening "report.html" inside the dist folder.
Example output for Kortrijk:

![HTML report](https://github.com/brechtvdv/anpr_metrics/raw/master/resources/gif.gif "Overview of the report.")

# Demo with example data

An example ANPR dataset `example.csv` is given in folder `resources`.

```
npm install
head -1 resources/example.csv > anpr_sorted.csv && tail -n +2 resources/example.csv | sort -t, -k 4 >> anpr_sorted.csv
node index.js --anpr anpr_sorted.csv  -s 2020-02-04 -e 2020-02-10
```

The dashboard is generated in folder `dist`, called `report_2020-02-04_2020-02-10.html`.



