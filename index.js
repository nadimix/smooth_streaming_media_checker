#!/usr/bin/env node
'use strict';

const url_parser  = require('url'),
      http        = require('http'),
      cluster     = require('cluster'),
      fs          = require('fs'),
      xml2js      = require('xml2js'),
      numWorkers  = require('os').cpus().length,
      manifestURL = process.argv[2];

let urls        = [],
    done        = 0,
    concurrent  = 0

if (cluster.isMaster) {
  if (!manifestURL) {
    console.error('usage: node index.js <url_client_manifest>')
    process.exit(1);
  }

  httpGet(manifestURL)
  .then(
    (manifest) => {
      //console.info(manifest);
      return parseXML(manifest);
    })
  .then((json) => {})
  .catch((reason) => {
    console.error('Something went wrong', reason);
    process.exit(1);
  });

  //let manifest = downloadManifest(manifestURL)
  //console.info(manifest)
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(data);
      });
    }).on('error', (e) => {
      reject(new Error(e.message));
    });
  });
}

function parseXML(xml) {
  return new Promise((resolve, reject) => {

  })
}

/*
  let lineReader = require('readline').createInterface({
    input: require('fs').createReadStream(process.argv[2])
  })

  lineReader.on('line', (line) => { urls.push(line) })

  lineReader.on('close', () => {
    while(concurrent < urls.length && concurrent < numWorkers) {
      startWorker(urls)
    }
  });
*/

cluster.on('message', (msg) => {
  done++
  concurrent--
  // console.info(`DONE url: ${msg.url}, msg: ${msg.status || msg.error}`)
  if (done < total && total-done >= numWorkers) {
    console.log(`Processed ${done} of ${total}`)
    startWorker(urls)
  } else if (done === total || msg.status !== 200) {
    console.log(`END`)
    write_report(msg)
    process.exit()
  }
})

cluster.on('exit', (worker, code, signal) => {
  console.log(`Worker ${worker.process.pid} died with code: ${code} and signal: ${signal}`)
})


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
      req.on('data', (data) => {
        console.log(data)
        req.end()
      })
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

function startWorker(urls) {
  let worker = cluster.fork()
  concurrent++
  console.info(`Running ${concurrent} workers of ${numWorkers}.`)
  worker.send(urls.pop())
}

function write_report(msg) {
  if (msg.status !== 200) {
    console.error(`FAILED: ${msg.url} with ${msg.status}`)
    fs.writeFileSync('report.txt', `${status_msg}${duration_msg}`, 'utf8');
  } else {
    console.log(`${duration_msg}`)
    fs.writeFileSync('report.txt', `${duration_msg}`, 'utf8');
  }
}
