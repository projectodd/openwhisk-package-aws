
const AWS = require('aws-sdk');

function main(args) {
  const accessKeyId = args.accessKeyId;
  const secretAccessKey = args.secretAccessKey;
  const region = args.region;
  AWS.config.update({region, credentials: {accessKeyId, secretAccessKey}});

  const lifecycleEvent = args.lifecycleEvent;
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

  const s3 = new AWS.S3();
  const sns = new AWS.SNS();

  const setTopicAttributes = function(data) {
    const topicArn = data.TopicArn;
    const params = {
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
    return sns.setTopicAttributes(params).promise()
      .then(_ => topicArn);
  }
  const subscribe = function(topicArn) {
    const params = {
      Protocol: 'https', /* required */
      TopicArn: topicArn, /* required */
      Endpoint: endpoint
    };
    return sns.subscribe(params).promise()
      .then(_ => topicArn);
  }
  const configureBucketNotification = function(topicArn) {
    const params = {
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
    return s3.putBucketNotificationConfiguration(params).promise()
      .then(_ => topicArn);
  }

  return new Promise(function(resolve, reject) {
    s3.getBucketLocation({Bucket: bucket}).promise() // ensure bucket exists
      .then(_ => sns.createTopic({Name: trigger}).promise())
      .then(setTopicAttributes)
      .then(subscribe)
      .then(configureBucketNotification)
      .then(topicArn => resolve({bucket, trigger, topicArn, endpoint}))
      .catch(err => {
        console.log(err);
        reject(err);
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
