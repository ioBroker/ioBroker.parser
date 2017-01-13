![Logo](admin/parser.png)
ioBroker parser adapter
=================
[![NPM version](http://img.shields.io/npm/v/iobroker.parser.svg)](https://www.npmjs.com/package/iobroker.parser)
[![Downloads](https://img.shields.io/npm/dm/iobroker.parser.svg)](https://www.npmjs.com/package/iobroker.parser)
[![Tests](https://travis-ci.org/ioBroker/ioBroker.parser.svg?branch=master)](https://travis-ci.org/ioBroker/ioBroker.parser)

[![NPM](https://nodei.co/npm/iobroker.parser.png?downloads=true)](https://nodei.co/npm/iobroker.parser/)

Allows to access defined URLs or local files via one web server.

Specified routes will be available under ```http://ip:8082/parser.0/context/...```. Of course port, protocol, "parser.0", can variate depends on settings.

## Sample settings
| Context        |      URL                                           |      Description                                   |
|----------------|:---------------------------------------------------|:---------------------------------------------------|
| admin/         | http://localhost:8081                              | access to admin page                               |
| router/        | http://192.168.1.1                                 | access to local router                             |
| cam/           | http://user:pass@192.168.1.123                     | access to webcam (e.g. call http://ip:8082/parser.0/cam/web/snapshot.jpg) |
| dir/           | /tmp/                                              | access to local directory "/tmp/"                  |
| dir/           | tmp/                                               | access to local directory "/opt/iobroker/tmp"      |
| file.jpg       | /tmp/picture.jpg                                   | access to local file "/tmp/picture.jpg"            |

**Not all devices can be accessed via parser. 
Some devices wants to be located in the root ```http://ip/``` and cannot run under ```http://ip/parser.0/context/```.

You can read more about context [here](https://www.npmjs.com/package/http-parser-middleware#context-matching)

Additionally the user can define the route path for parser requests.

## Changelog

### 0.0.1 (2017-01-09)
* (bluefox) initial commit