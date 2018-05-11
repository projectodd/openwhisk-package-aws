
var openwhisk = require('openwhisk');
var AWS = require('aws-sdk');

const GATEWAY_ACTION = 'from-sns';

function main(args) {
  var wsk = openwhisk();

  const accessKeyId = args.accessKeyId;
  const secretAccessKey = args.secretAccessKey;
  const region = args.region;
  AWS.config.update({region, credentials: {accessKeyId, secretAccessKey}});

  var lifecycleEvent = args.lifecycleEvent;
  if (lifecycleEvent === 'CREATE') {
    return triggerCreate(args);
  }
  if (lifecycleEvent === 'DELETE') {
    return triggerDelete(args);
  }
}

function triggerCreate(args) {

  const bucket = args.bucket;
  if (!bucket) {
    return new Promise((resolve, reject) => {
      reject("Bucket name is a required parameter");
    });
  }
  var trigger = args.triggerName.split('/');
  trigger = trigger[trigger.length -1];

  var actionName = process.env['__OW_ACTION_NAME'].split('/');
  actionName[actionName.length - 1] = GATEWAY_ACTION;
  actionName = actionName.join('/');

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
              Endpoint: process.env['__OW_API_HOST'] + '/api/v1/web' + actionName + '?trigger=' + trigger
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
                  } else resolve({bucket, trigger, actionName, topicArn});
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

exports.main = main;
