# ANPR metrics

ANPR Metrics is an open source Command Line Interface (CLI) and dashboard for ingesting and analysing raw ANPR data. It is capable of reading raw ANPR data and aggregating useful & privacy-protecting metrics for longterm storage and analysis. Raw data is not persisted after aggregation.

# Metrics

**https://w3id.org/cot#passedByVehiclesCount:** Total number of vehicles that is detected by a camera during a certain time interval. This can be an hourly, daily, weekly... total count.

**https://w3id.org/cot#passedByVehiclesCountInFlow:** Total number of vehicles that went from one camera to another, sometimes referred to as origin/destination data.

## CLI

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

![HTML report](https://gitlab.ilabt.imec.be/brvdvyve/anpr_metrics/-/raw/master/resources/gif.gif "Overview of the report.")


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