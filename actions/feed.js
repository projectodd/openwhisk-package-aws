
const AWS = require('aws-sdk');
const openwhisk = require('openwhisk');

function initAws(args) {
  const accessKeyId = args.accessKeyId;
  const secretAccessKey = args.secretAccessKey;
  const region = args.region;
  AWS.config.update({region, credentials: {accessKeyId, secretAccessKey}});
}

function main(args) {
  initAws(args);
  const wsk = openwhisk();
  const getTrigger = wsk.triggers.get({name: args.triggerName});
  
  const lifecycleEvent = args.lifecycleEvent;
  if (lifecycleEvent === 'CREATE') {
    return getTrigger.then(trigger => {
      console.log("Create trigger ", trigger);
      return triggerCreate(trigger, args)
        .then(data => {
          trigger.annotations.push({key: 'aws', value: data});
          return wsk.triggers.update({name: trigger.name, trigger: trigger})
            .then(_ => data);
        });
    });
  }
  if (lifecycleEvent === 'DELETE') {
    return getTrigger.then(trigger => {
      console.log("Delete trigger ", trigger);
      return triggerDelete(trigger, args);
    });
  }
}

function triggerCreate(trigger, args) {

  const bucket = args.bucket;
  const events = args.events;
  const endpoint = endpointUrl(args.webhookAction, trigger);

  const s3 = new AWS.S3();
  const sns = new AWS.SNS();

  const setTopicAttributes = function(topicArn) {
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
    return sns.setTopicAttributes(params).promise();
  }
  const subscribe = function(topicArn) {
    const params = {
      Protocol: 'https', /* required */
      TopicArn: topicArn, /* required */
      Endpoint: endpoint
    };
    return sns.subscribe(params).promise();
  }
  const configureBucketNotification = function(topicArn) {
    return s3.getBucketNotificationConfiguration({Bucket: bucket}).promise()
      .then(data => {
        var config = {Id: trigger.name, TopicArn: topicArn};
        config.Events = events.split(/\s*[,;|]\s*/);
        data.TopicConfigurations.push(config);
        const params = {
          Bucket: bucket,
          NotificationConfiguration: data
        };
        return s3.putBucketNotificationConfiguration(params).promise();
      });
  }

  return new Promise(function(resolve, reject) {
    s3.getBucketLocation({Bucket: bucket}).promise() // ensure bucket exists
      .then(_ => sns.createTopic({Name: trigger.name}).promise())
      .then(data => {
        const topicArn = data.TopicArn;
        return setTopicAttributes(topicArn)
          .then(_ => subscribe(topicArn))
          .then(_ => configureBucketNotification(topicArn))
          .then(_ => resolve({Bucket: bucket, TopicArn: topicArn}));
      })
      .catch(err => {
        console.log(err);
        reject(err);
      });
  });
}

function triggerDelete(trigger, args) {
  initAws(args);
  const sns = new AWS.SNS();
  const s3 = new AWS.S3();

  const aws = trigger.annotations.find(x => x.key == 'aws').value;
  const {Bucket, TopicArn} = aws;
  
  const reconfigureBucketNotification = function() {
    return s3.getBucketNotificationConfiguration({Bucket}).promise()
      .then(data => {
        data.TopicConfigurations = data.TopicConfigurations.filter(x => x.TopicArn != TopicArn);
        const params = {Bucket, NotificationConfiguration: data };
        return s3.putBucketNotificationConfiguration(params).promise();
      });
  }

  return new Promise(function(resolve, reject) {
    reconfigureBucketNotification()
      .then(_ => sns.deleteTopic({TopicArn}).promise())
      .then(_ => resolve(aws))
      .catch(err => {
        console.log(err);
        reject(err);
      });
  });
}

function endpointUrl(webhookAction, trigger) {
  var action = process.env['__OW_ACTION_NAME'].split('/');
  action[action.length - 1] = webhookAction;
  action = action.join('/');
  return process.env['__OW_API_HOST'] + '/api/v1/web' + action + '?trigger=' + trigger.name;
}

exports.main = main;
