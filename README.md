![Logo](admin/parser.png)
ioBroker parser adapter
=================
[![NPM version](http://img.shields.io/npm/v/iobroker.parser.svg)](https://www.npmjs.com/package/iobroker.parser)
[![Downloads](https://img.shields.io/npm/dm/iobroker.parser.svg)](https://www.npmjs.com/package/iobroker.parser)
[![Tests](https://travis-ci.org/ioBroker/ioBroker.parser.svg?branch=master)](https://travis-ci.org/ioBroker/ioBroker.parser)

[![NPM](https://nodei.co/npm/iobroker.parser.png?downloads=true)](https://nodei.co/npm/iobroker.parser/)

This adapter allows to parse the data received via URL or in files.

## Settings

### Default poll interval
This value will be used, if no poll interval for the entry specified. The interval is in milliseconds and describes how often the link or file will be read.

### Table
With plus button the new entries will be added to the table.

Table fields:

- *Name* - is the state name and may not consist spaces.
- *URL or file name* - is the URL link like *https://darksky.net/forecast/48.1371,11.5754/si24/de* for Munich weather.
- *RegEx* - regular expression, how to extract data from link. There is a good service to test regula expressions: [regex101](https://regex101.com/). E.g. *temp swip">(-?\d+)˚<* for the lin above.
- *Role* - one of the roles:
    - custom - user defines itself via *admin" the role
    - temperature - the value is temperature
    - value - the value is a number (e.g. dimmer)
    - blinds - the value is a blind position
    - switch - the value is switch position (true/false)
    - button - the value is a button
    - indicator - boolean indicator
- *Type* - type of variable. One of boolean, number, string, json.
- *Unit* - unit of the value. E.g. *°C*
- *Interval* - poll interval in ms. If not set or 0, so the default interval will be used.

## Sample settings
| Name              |      URL or file name                                |      RegEx            | Role         | Type    | Unit | Interval |
|-------------------|:-----------------------------------------------------|:----------------------|--------------|---------|------|----------|
| temperatureMunich | https://darksky.net/forecast/48.1371,11.5754/si24/de | temp swip">(-?\d+)˚<  | temperature  | number  |  °C  | 180000   |
| forumRunning      | http:///forum.iobroker.net/                          | Forum                 | indicator    | boolean |      | 60000    |
| cloudRunning      | https://iobroker.net/                                | Privacy Notice        | indicator    | boolean |      | 60000    |
| forumRunning      | http:///forum.iobroker.net/                          | Forum                 | indicator    | boolean |      | 60000    |
| cpuTemperature    | /sys/devices/virtual/thermal/thermal_zone0/temp      | (.*)                  | temperature  | number  |  °C  | 30000    |

## Changelog

### 0.0.1 (2017-01-16)
* (bluefox) initial commit