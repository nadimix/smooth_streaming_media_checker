#!/usr/bin/env node
'use strict';

const url_parser = require('url');
const http = require('http');
const cluster = require('cluster');
const fs = require('fs');
const program = require('commander');
const numWorkers = require('os').cpus().length;

let urls = [];
let urls_to_parse = 0;
let num_done = 0;
const start_time = Math.floor(new Date()); // timestamp in ms

if (cluster.isMaster) {
  // Parsing arguments
  program
    .version('0.0.1')
    .parse(process.argv);

  if (process.argv.length < 3) {
    console.error('usage: s3ss_checker <file_with_smooth_streaming_urls_to_check>');
    process.exit(1);
  }

  let lineReader = require('readline').createInterface({
    input: require('fs').createReadStream(process.argv[2])
  });

  lineReader.on('line', function (line) {
    urls.push(line);
  });

  lineReader.on('close', ()=> {
    urls_to_parse = urls.length;
    const num_per_worker = Math.round(urls_to_parse/numWorkers);
    console.log(`URLS_TO_PARSE: ${urls_to_parse}`);
    // Starts workers
    console.log(`Master cluster setting up ${numWorkers} workers...`);
    console.log(`URLS to parse: ${urls_to_parse} with ${numWorkers} workers`);

    let pointer = 0;
    for (let i = 0; i < numWorkers; i++) {
      let worker = cluster.fork();
      let to = pointer + num_per_worker;
      let urls_to_process = urls.slice(pointer, to);
      console.log(`from: ${pointer}, to: ${to}`);
      worker.send(urls_to_process);
      pointer += num_per_worker;
    }
  });

  cluster.on('online', (worker) => { console.log(`Worker ${worker.process.pid} is online!`); });
  cluster.on('message', (msg)=>{
    num_done += 1;
    if(msg.status !== 200) {
      console.error(`\nfrom: ${msg.from}, url: ${msg.url}, msg: ${msg.status || msg.error}`);
    }
    if (msg.status !== 200 || num_done === urls_to_parse) {
      let end_time =  Math.floor(new Date()); // timestamp in ms
      console.log(`\nStarted at: ${start_time}, Finished at: ${end_time}, Duration: ${(end_time - start_time)/1000} secs`);
      process.exit();
    }
  });
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died with code: ${code} and signal: ${signal}`);
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
        });
      });
      req.on('error', (e) => {
        process.send({
          error: e.message,
          url: `${url_options.hostname}${url_options.path}`,
          from: process.pid
        });
      });
      req.end();
    }
  });
}
