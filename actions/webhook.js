const request = require('request');
const openwhisk = require('openwhisk');
const util = require('util');

function main(args) {
  const req = JSON.parse(args.__ow_body);
  const wsk = openwhisk();
  
  if (req.Type == 'SubscriptionConfirmation') {
    // AWS subscribers must be confirmed first
    console.log(req);
    return new Promise(function(resolve, reject) {
      request.get(req.SubscribeURL, (err, res, body) => {
        if (err) {
          reject({statusCode: 500, body: err});
        } else {
          resolve({statusCode: 200, body});
        }
      });
    });
  }

  const name = args.trigger;
  const params = parse(req);
  console.log("Firing trigger '" + name + "' with", util.inspect(params, {depth: null}));
  return wsk.triggers.invoke({name, params})
    .then(result => ({statusCode: 200, body: result}))
    .catch(error => ({statusCode: 500, body: error}));
}

function parse(req) {
  try {
    return JSON.parse(req.Message);
  } catch (e) {
    const result = {Message: req.Message};
    if (req.Subject)
      result.Subject = req.Subject;
    return result;
  }
}
