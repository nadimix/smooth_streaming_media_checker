#!/usr/bin/env node
'use strict';

const url_parser  = require('url'),
      http        = require('http'),
      cluster     = require('cluster'),
      fs          = require('fs'),
      program     = require('commander'),
      numWorkers  = require('os').cpus().length * 2,
      start_time  = Math.floor(new Date())

let urls          = [],
    urls_to_parse = 0,
    num_done      = 0

if (cluster.isMaster) {
  program
    .version('0.0.1')
    .parse(process.argv)

  if (process.argv.length < 3) {
    console.error('usage: s3ss_checker <file_with_smooth_streaming_urls_to_check>')
    process.exit(1);
  }

  let lineReader = require('readline').createInterface({
    input: require('fs').createReadStream(process.argv[2])
  })

  lineReader.on('line', (line) => { urls.push(line) })

  lineReader.on('close', () => {
    urls_to_parse = urls.length
    const num_per_worker = Math.round(urls_to_parse/numWorkers);
    console.log(`URLS to parse: ${urls_to_parse} with ${numWorkers} workers`)
    console.log(`Master cluster setting up ${numWorkers} workers...`)

    let pointer = 0
    for (let i = 0; i < numWorkers; i++) {
      let worker = cluster.fork();
      let to = pointer + num_per_worker;
      let urls_to_process = urls.slice(pointer, to);
      console.log(`from: ${pointer}, to: ${to}`);
      worker.send(urls_to_process);
      pointer += num_per_worker;
    }
  });

  cluster.on('online', (worker) => { console.log(`Worker ${worker.process.pid} is online!`) })
  cluster.on('message', (msg) =>{
    num_done++
    if(msg.status !== 200) {
      console.error(`\nfrom: ${msg.from}, url: ${msg.url}, msg: ${msg.status || msg.error}`)
    }
    if (/*msg.status !== 200 || */num_done === urls_to_parse) {
      let end_time =  Math.floor(new Date()) // timestamp in ms
      console.log(`\nStarted at: ${start_time}, Finished at: ${end_time}, Duration: ${(end_time - start_time)/1000} secs`)
      process.exit()
    }
  });
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died with code: ${code} and signal: ${signal}`)
  });
}

if (cluster.isWorker) {
  process.on('message', (urls) => {
    for (let j = 0; j < urls.length; j++) {
      let url_options = url_parser.parse(urls[j]);
      let options = {
        hostname: url_options.hostname,
        path: url_options.path,
        method: 'HEAD',
        agent: false
      }
      let req = http.request(options, (res) => {
        process.send({
          status: res.statusCode,
          url: `${url_options.hostname}${url_options.path}`,
          from: process.pid
        })
      })
      req.on('data', (data) => { console.log(data) })
      req.on('error', (e) => {
        process.send({
          error: e.message,
          url: `${url_options.hostname}${url_options.path}`,
          from: process.pid
        })
      })
      req.end()
    }
  })
}
