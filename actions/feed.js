
var AWS = require('aws-sdk');

function main(args) {
  const accessKeyId = args.accessKeyId;
  const secretAccessKey = args.secretAccessKey;
  const region = args.region;
  AWS.config.update({region, credentials: {accessKeyId, secretAccessKey}});

  var lifecycleEvent = args.lifecycleEvent;
  if (lifecycleEvent === 'CREATE') {
    console.log("Creating trigger " + args.triggerName);
    return triggerCreate(args);
  }
  if (lifecycleEvent === 'DELETE') {
    console.log("Deleting trigger " + args.triggerName);
    return triggerDelete(args);
  }
}

function triggerCreate(args) {

  if (!args.bucket) return {error: "Bucket name is required"};

  const bucket = args.bucket;
  var trigger = args.triggerName.split('/');
  trigger = trigger[trigger.length -1];
  const endpoint = endpointUrl(args.webhookAction, trigger);

  var s3 = new AWS.S3();
  var sns = new AWS.SNS();

  return new Promise(function(resolve, reject) {
    var params = {
      Name: trigger /* required */
    };
    sns.createTopic(params, function(err, data) {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        var topicArn = data.TopicArn;
        var params = {
          AttributeName: 'Policy', /* required */
          TopicArn: topicArn, /* required */
          AttributeValue: JSON.stringify({
            Version: "2008-10-17",
            Id: "s3-publish-to-sns",
            Statement: [{
              Effect: "Allow",
              Principal: { "AWS" : "*" },
              Action: [ "SNS:Publish" ],
              Resource: topicArn,
              Condition: {
                ArnLike: {
                  "aws:SourceArn": "arn:aws:s3:*:*:" + bucket
                }
              }
            }]
          })
        };
        sns.setTopicAttributes(params, function(err, data) {
          if (err) {
            console.log(err);
            reject(err);
          } else {
            var params = {
              Protocol: 'https', /* required */
              TopicArn: topicArn, /* required */
              Endpoint: endpoint
            };
            sns.subscribe(params, function(err, data) {
              if (err) {
                console.log(err);
                reject(err);
              } else {
                var params = {
                  Bucket: bucket, 
                  NotificationConfiguration: {
                    TopicConfigurations: [
                      {
                        Events: [
                          "s3:ObjectCreated:*"
                        ], 
                        TopicArn: topicArn
                      }
                    ]
                  }
                };
                s3.putBucketNotificationConfiguration(params, function(err, data) {
                  if (err) {
                    console.log(err);
                    reject(err);
                  } else resolve({bucket, trigger, topicArn, endpoint});
                });
              }
            });
          }
        });
      }
    });
  });
}

function triggerDelete(args) {
  return {};
}

function endpointUrl(webhookAction, trigger) {
  var action = process.env['__OW_ACTION_NAME'].split('/');
  action[action.length - 1] = webhookAction;
  action = action.join('/');
  return process.env['__OW_API_HOST'] + '/api/v1/web' + action + '?trigger=' + trigger;
}

exports.main = main;
