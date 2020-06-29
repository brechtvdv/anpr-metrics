# ANPR metrics

ANPR Metrics is an open source Command Line Interface (CLI) and dashboard for ingesting and analysing raw ANPR data. It is capable of reading raw ANPR data and aggregating useful & privacy-protecting metrics for longterm storage and analysis. Raw data is not persisted after aggregation.

The CLI expects ANPR data that looks like below:

Plate | Latitude | Longitude | TimeStamp | DeviceId | Name
XXX | 50.00 | 3.00 | 2020-01-01 10:00:00.000| 1 | My street name

## Camera metrics

Following commands create a dataset that contains how many vehicles pass by each camera per day and per hour. This corresponds with the Telraam approach.

1. Remove number plates:
```
cut -d, -f1 anpr.csv --complement > anpr_without_numberplates.csv
```

2. Sort by timestamp:
```
head -1 anpr_without_numberplates.csv > anpr_sorted.csv && tail -n +2 anpr_without_numberplates.csv | sort -t, -k 3 >> anpr_sorted.csv
```

3. Generate hourly and daily metrics per camera
```
node index.js -a anpr_sorted.csv > anpr_summaries.ttl
```

The MINIMUM amount of vehicles can be configured with the environment variable `MINIMUM`. For example, when you only want to generate metrics that contain at least 10 observed vehicles, then you can run following command:
```
MINIMUM=10 node index.js -a anpr_sorted.csv > anpr_summaries.ttl
```