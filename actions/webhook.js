var request = require('request');
var openwhisk = require('openwhisk');

function main(args) {
  var req = JSON.parse(args.__ow_body);
  var wsk = openwhisk();
  
  if (req.Type == 'SubscriptionConfirmation') {
    // AWS subscribers must be confirmed first
    return new Promise(function(resolve, reject) {
      request.get(req.SubscribeURL, (err, res, body) => {
        if (err) {
          reject({statusCode: 500, body: err});
        } else {
          resolve({statusCode: 200, body: body});
        }
      });
    });
  }

  const name = args.trigger;
  const params = JSON.parse(req.Message);
  console.log('Firing ' + name + ' with ' + JSON.stringify(params));
  return wsk.triggers.invoke({name, params}).then(result => {
    return {statusCode: 200, body: result};
  }, error => {
    return {statusCode: 500, body: error};
  });
}
