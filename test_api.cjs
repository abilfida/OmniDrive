const http = require('http');

const options = {
  hostname: 'localhost',
  port: 8080,
  path: '/api/drives/0cfcec22-2f13-40ce-9dfc-1aae9c42ecdd/folders/root',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer test'
  }
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', d => { data += d; });
  res.on('end', () => {
    console.log(`Status Code: ${res.statusCode}`);
    console.log(data);
  });
});

req.on('error', error => {
  console.error(error);
});

req.end();
