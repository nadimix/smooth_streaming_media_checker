#!/usr/bin/env node
'use strict';

const url_parser = require('url');
const http = require('http');
const cluster = require('cluster');
const fs = require('fs');
const program = require('commander');
const numWorkers = require('os').cpus().length;

if (cluster.isMaster) {
  // Parsing arguments
  program
    .version('0.0.1')
    .parse(process.argv);

  if (process.argv.length < 3) {
    console.error('usage: s3ss_checker <file_with_smooth_streaming_urls_to_check>');
    process.exit(1);
  }

  const file = fs.readFileSync(process.argv[2], 'utf8');
  const urls = file.replace(/\s+/g, '').split(',');

  const urls_to_parse = urls.length;
  const num_per_worker = Math.round(urls_to_parse/numWorkers);
  const start_time = Math.floor(new Date()); // timestamp in ms
  let num_done = 0;

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

  cluster.on('online', (worker) => { console.log(`Worker ${worker.process.pid} is online!`); });
  cluster.on('message', (msg)=>{
    num_done += 1;
    if(msg.status !== 200) {
      console.error(`msg: ${msg.status}, from: ${msg.from}, url: ${msg.url}`);
    }
    if(msg.error) {
      console.error(`ERROR: ${msg.error}`);
    }
    if (msg.error || msg.status !== 200 || num_done === urls_to_parse) {
      let end_time =  Math.floor(new Date()); // timestamp in ms
      console.log(`Started at: ${start_time}, Finished at: ${end_time}, Duration: ${(end_time - start_time)/1000} secs`);
      process.exit();
    }
  });
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died with code: ${code} and signal: ${signal}`);
  });
}

if (cluster.isWorker) {
  console.log(`Process ${process.pid} is listening to all incoming requests`);
  process.on('message', (urls) => {
    for (let j = 0; j < urls.length; j++) {
      let url_options = url_parser.parse(urls[j]);
      let options = {
        hostname: url_options.hostname,
        path: url_options.path,
        method: 'HEAD'
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
          from: process.pid
        });
      });
      req.end();
    }
  });
}
