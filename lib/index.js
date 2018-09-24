#!/usr/bin/env node
'use strict'

const express = require('express')
const medUtils = require('openhim-mediator-utils')
const winston = require('winston')

const utils = require('./utils')
const axios = require('axios');

// Logging setup
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'info', timestamp: true, colorize: true})

// Config
let config = {} // this will vary depending on whats set in openhim-core
const apiConf = process.env.NODE_ENV === 'test' ? require('../config/test') : require('../config/config')
const mediatorConfig = require('../config/mediator')

let port = process.env.NODE_ENV === 'test' ? 7001 : mediatorConfig.endpoints[0].port

/**
 * setupApp - configures the http server for this mediator
 *
 * @return {express.App}  the configured http server
 */
function setupApp () {
  const app = express()
  app.get('/mhfr-facilities', (req, res) => {
    console.log('mediator');
    // get from the mhfr

    axios.get('http://localhost:3000/api/Facilities/fhir/location/_history').then(response => {
      console.log(response);
      var ctxObject = {};
      ctxObject['facilities'] = response.data;

      orchestrationsResults = [];
      orchestrationsResults.push({
        name: 'Get Facilities',
        request: {
          path: req.path,
          headers: req.headers,
          querystring: req.originalUrl.replace(req.path, ""),
          body: req.body,
          method: req.method,
          timestamp: new Date().getTime()
        },
        response: JSON.stringify(
          {
            status: response.statusCode,
            body: response.data,
            timestamp: new Date().getTime()
          }
        )
      });
      var urn = mediatorConfig.urn;
      var status = 'Successful';
      var response = JSON.stringify({
        status: resp.statusCode,
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(resp.body, null, 4),
        timestamp: new Date().getTime()
      });

      // construct property data to be returned - this can be anything interesting that you want to make available in core, or nothing at all
      var properties = {};

      // construct returnObject to be returned
      var returnObject = {
        "x-mediator-urn": urn,
        "status": status,
        "response": response,
        "orchestrations": orchestrationsResults,
        "properties": properties
      }
      res.set('Content-Type', 'application/json+openhim');
      res.send(returnObject);

    }).catch(error => {
      console.log(error);
    })
    // winston.info(`Processing ${req.method} request on ${req.url}`)
    // var responseBody = 'Primary Route Reached'
    // var headers = { 'content-type': 'application/json' }

    // var orchestrationResponse = { statusCode: 200, headers: headers }
    // let orchestrations = []
    // orchestrations.push(utils.buildOrchestration('Primary Route', new Date().getTime(), req.method, req.url, req.headers, req.body, orchestrationResponse, responseBody))
    // res.set('Content-Type', 'application/json+openhim')
    // var properties = { property: 'Primary Route' }
    // res.send(utils.buildReturnObject(mediatorConfig.urn, 'Successful', 200, headers, responseBody, orchestrations, properties))
  })
  return app
}

/**
 * start - starts the mediator
 *
 * @param  {Function} callback a node style callback that is called once the
 * server is started
 */
function start (callback) {
  if (apiConf.api.trustSelfSigned) { process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0' }

  if (apiConf.register) {
    medUtils.registerMediator(apiConf.api, mediatorConfig, (err) => {
      if (err) {
        winston.error('Failed to register this mediator, check your config')
        winston.error(err.stack)
        process.exit(1)
      }
      apiConf.api.urn = mediatorConfig.urn
      medUtils.fetchConfig(apiConf.api, (err, newConfig) => {
        winston.info('Received initial config:')
        winston.info(JSON.stringify(newConfig))
        config = newConfig
        if (err) {
          winston.error('Failed to fetch initial config')
          winston.error(err.stack)
          process.exit(1)
        } else {
          winston.info('Successfully registered mediator!')
          let app = setupApp()
          const server = app.listen(port, () => {
            if (apiConf.heartbeat) {
              let configEmitter = medUtils.activateHeartbeat(apiConf.api)
              configEmitter.on('config', (newConfig) => {
                winston.info('Received updated config:')
                winston.info(JSON.stringify(newConfig))
                // set new config for mediator
                config = newConfig

                // we can act on the new config received from the OpenHIM here
                winston.info(config)
              })
            }
            callback(server)
          })
        }
      })
    })
  } else {
    // default to config from mediator registration
    config = mediatorConfig.config
    let app = setupApp()
    const server = app.listen(port, () => callback(server))
  }
}
exports.start = start

if (!module.parent) {
  // if this script is run directly, start the server
  start(() => winston.info(`Listening on ${port}...`))
}